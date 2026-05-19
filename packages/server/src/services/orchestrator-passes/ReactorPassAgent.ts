import { nanoid } from 'nanoid';
import { PassType, type ChatSession, type Character } from '@neigo/shared';
import { db, schema } from '../../db/client.js';
import { AiProxy } from '../ai-proxy.js';
import { BasePassAgent, type EmitSse } from './BasePassAgent.js';
import { parseAndStripStats, parseAndStripEmotion, type ParsedStats } from '../stats-parser.js';
import type { AiMessage } from '../ai-proxy.js';

export class ReactorPassAgent extends BasePassAgent {
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
      content: `You are ${args.character.name}, reacting IN THE SAME SCENE. Write 1–2 brief sentences: your personal reaction to what just happened. Stay in character.`,
    };
    const msgId = nanoid();
    let buffer = '';
    for await (const chunk of AiProxy.stream({
      model: BasePassAgent.modelSlugFor(args.session),
      messages: [...args.history, prompt],
      temperature: 0.85,
      maxTokens: 200,
    })) {
      buffer += chunk;
      await args.emit({
        type: 'reactor',
        characterId: args.character.id,
        chunk,
        passType: PassType.CHARACTER_REACT,
        messageId: msgId,
      });
    }
    const { clean, updates } = parseAndStripStats(buffer);
    args.allStats.push(
      ...updates.map((u) => ({ ...u, characterId: u.characterId ?? args.character.id })),
    );
    const { clean: reactorEmClean, emotion: reactorEmotion } = parseAndStripEmotion(clean);
    if (reactorEmotion) {
      await args.emit({ type: 'emotion', emotion: reactorEmotion, characterId: args.character.id });
    }
    const finalText = BasePassAgent.applyHygiene(reactorEmClean, {
      passType: PassType.CHARACTER_REACT,
      character: args.character,
    }).text;
    await db.insert(schema.chatMessages).values({
      id: msgId,
      sessionId: args.session.id,
      turnIndex: args.session.turnCount * 2 + 3,
      role: 'ASSISTANT',
      speakerType: 'REACTOR',
      speakerId: args.character.id,
      content: finalText,
      passType: PassType.CHARACTER_REACT,
      turnId: args.turnId,
      tokenCount: 0,
    });
    args.messageIds.push(msgId);
  }
}
