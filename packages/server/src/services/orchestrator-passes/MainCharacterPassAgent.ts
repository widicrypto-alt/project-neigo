import { nanoid } from 'nanoid';
import { PassType, type ChatSession, type Character } from '@neigo/shared';
import { db, schema } from '../../db/client.js';
import { AiProxy } from '../ai-proxy.js';
import { BasePassAgent, type EmitSse } from './BasePassAgent.js';
import { parseAndStripStats, parseAndStripEmotion, type ParsedStats } from '../stats-parser.js';
import { detectRepetition } from '../repetition-detector.js';
import type { AiMessage } from '../ai-proxy.js';

export class MainCharacterPassAgent extends BasePassAgent {
  public static async execute(args: {
    emit: EmitSse;
    history: AiMessage[];
    session: ChatSession;
    character: Character;
    turnId: string;
    messageIds: string[];
    allStats: ParsedStats[];
  }) {
    const prompt: AiMessage = {
      role: 'system',
      content: `Continue as ${args.character.name} with full prose — dialogue, actions, internal thoughts. 3–8 sentences.`,
    };
    const recent = await BasePassAgent.recentAssistantContents(args.session.id, 5);
    const MAX_RETRIES = 2;
    let buffer = '';
    let finalText = '';
    let tempBoost = 0;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const msgId = nanoid();
      buffer = '';
      for await (const chunk of AiProxy.stream({
        model: BasePassAgent.modelSlugFor(args.session),
        messages: [...args.history, prompt],
        temperature: BasePassAgent.scheduledTemp(args.session) + tempBoost,
      })) {
        buffer += chunk;
        if (attempt === 0) {
          await args.emit({
            type: 'character',
            characterId: args.character.id,
            chunk,
            passType: PassType.CHARACTER_MAIN,
            messageId: msgId,
          });
        }
      }
      const { clean, updates } = parseAndStripStats(buffer);
      args.allStats.push(
        ...updates.map((u) => ({ ...u, characterId: u.characterId ?? args.character.id })),
      );
      const { clean: emClean, emotion: emEmotion } = parseAndStripEmotion(clean);
      if (emEmotion) {
        await args.emit({ type: 'emotion', emotion: emEmotion, characterId: args.character.id });
      }
      finalText = BasePassAgent.applyHygiene(emClean, {
        passType: PassType.CHARACTER_MAIN,
        character: args.character,
        knownNouns: [args.character.name],
      }).text;
      const rep = detectRepetition(finalText, recent);
      if (!rep.shouldReject || attempt === MAX_RETRIES) {
        // Accept this output. If we retried silently, re-emit the final text.
        if (attempt > 0) {
          await args.emit({
            type: 'character',
            characterId: args.character.id,
            chunk: finalText,
            passType: PassType.CHARACTER_MAIN,
            messageId: msgId,
          });
        }
        await db.insert(schema.chatMessages).values({
          id: msgId,
          sessionId: args.session.id,
          turnIndex: args.session.turnCount * 2 + 2,
          role: 'ASSISTANT',
          speakerType: 'CHARACTER',
          speakerId: args.character.id,
          content: finalText,
          passType: PassType.CHARACTER_MAIN,
          turnId: args.turnId,
          tokenCount: 0,
        });
        args.messageIds.push(msgId);
        break;
      }
      // Rejected — bump temperature and retry
      tempBoost += 0.15;
    }
  }
}
