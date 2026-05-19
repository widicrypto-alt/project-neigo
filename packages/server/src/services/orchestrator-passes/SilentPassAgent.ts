import { nanoid } from 'nanoid';
import { PassType, type ChatSession, type Character } from '@neigo/shared';
import { db, schema } from '../../db/client.js';
import { AiProxy } from '../ai-proxy.js';
import { BasePassAgent, type EmitSse } from './BasePassAgent.js';
import type { AiMessage } from '../ai-proxy.js';

export class SilentPassAgent extends BasePassAgent {
  public static async execute(args: {
    emit: EmitSse;
    history: AiMessage[];
    session: ChatSession;
    character: Character;
    turnId: string;
    messageIds: string[];
  }) {
    const prompt: AiMessage = {
      role: 'system',
      content: `You are ${args.character.name}. Emit ONE italic line in third person describing a silent body-language reaction (no dialogue). Max 20 words.`,
    };
    const res = await AiProxy.complete({
      model: BasePassAgent.modelSlugFor(args.session),
      messages: [...args.history, prompt],
      temperature: 0.75,
      maxTokens: 80,
    });
    const text = BasePassAgent.applyHygiene(res.content, {
      passType: PassType.SILENT_REACT,
      character: args.character,
    }).text;
    const msgId = nanoid();
    await args.emit({
      type: 'silent',
      characterId: args.character.id,
      text,
      messageId: msgId,
    });
    await db.insert(schema.chatMessages).values({
      id: msgId,
      sessionId: args.session.id,
      turnIndex: args.session.turnCount * 2 + 4,
      role: 'ASSISTANT',
      speakerType: 'SILENT',
      speakerId: args.character.id,
      content: text,
      passType: PassType.SILENT_REACT,
      turnId: args.turnId,
      tokenCount: 0,
    });
    args.messageIds.push(msgId);
  }
}
