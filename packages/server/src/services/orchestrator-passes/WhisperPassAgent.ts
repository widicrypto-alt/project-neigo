import { nanoid } from 'nanoid';
import { PassType, type ChatSession, type Character } from '@neigo/shared';
import { db, schema } from '../../db/client.js';
import { AiProxy } from '../ai-proxy.js';
import { BasePassAgent, type EmitSse } from './BasePassAgent.js';
import type { AiMessage } from '../ai-proxy.js';

export class WhisperPassAgent extends BasePassAgent {
  public static async execute(args: {
    emit: EmitSse;
    history: AiMessage[];
    session: ChatSession;
    charA: Character;
    charB: Character;
    turnId: string;
    messageIds: string[];
  }) {
    const prompt: AiMessage = {
      role: 'system',
      content: `${args.charA.name} and ${args.charB.name} exchange a SHORT whisper (2–5 lines), unheard by others. Format each line as "A: ..." or "B: ...". Reveal private jealousy/alliance/rivalry beats. Do NOT include stats tags.`,
    };
    const res = await AiProxy.complete({
      model: BasePassAgent.modelSlugFor(args.session),
      messages: [...args.history, prompt],
      temperature: 0.9,
      maxTokens: 250,
    });
    const text = BasePassAgent.applyHygiene(res.content, {
      passType: PassType.WHISPER,
      character: args.charA,
    }).text;
    const msgId = nanoid();
    await args.emit({
      type: 'whisper',
      characterId: args.charA.id,
      text,
      messageId: msgId,
    });
    await db.insert(schema.chatMessages).values({
      id: msgId,
      sessionId: args.session.id,
      turnIndex: args.session.turnCount * 2 + 5,
      role: 'ASSISTANT',
      speakerType: 'WHISPER',
      speakerId: args.charA.id,
      content: text,
      passType: PassType.WHISPER,
      turnId: args.turnId,
      tokenCount: 0,
    });
    args.messageIds.push(msgId);
  }
}
