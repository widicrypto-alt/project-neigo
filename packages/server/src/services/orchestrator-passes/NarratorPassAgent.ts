import { nanoid } from 'nanoid';
import { PassType, type ChatSession } from '@neigo/shared';
import { db, schema } from '../../db/client.js';
import { AiProxy } from '../ai-proxy.js';
import { BasePassAgent, type EmitSse } from './BasePassAgent.js';
import type { AiMessage } from '../ai-proxy.js';

export class NarratorPassAgent extends BasePassAgent {
  public static async execute(args: {
    emit: EmitSse;
    history: AiMessage[];
    session: ChatSession;
    turnId: string;
    messageIds: string[];
  }) {
    const narratorPrompt: AiMessage = {
      role: 'system',
      content: `You are an omniscient narrator (voice: ${args.session.narratorVoice}). Write 1–3 sentences of atmospheric prose setting the scene. No dialogue. Third person past tense.`,
    };
    const msgId = nanoid();
    let buffer = '';
    for await (const chunk of AiProxy.stream({
      model: BasePassAgent.modelSlugFor(args.session),
      messages: [...args.history, narratorPrompt],
      temperature: Math.max(0.6, BasePassAgent.scheduledTemp(args.session) - 0.1),
      maxTokens: 200,
    })) {
      buffer += chunk;
      await args.emit({
        type: 'narrator',
        characterId: null,
        chunk,
        passType: PassType.NARRATOR,
        messageId: msgId,
      });
    }
    const narratorClean = BasePassAgent.applyHygiene(buffer, { passType: PassType.NARRATOR }).text;
    await db.insert(schema.chatMessages).values({
      id: msgId,
      sessionId: args.session.id,
      turnIndex: args.session.turnCount * 2 + 1,
      role: 'ASSISTANT',
      speakerType: 'NARRATOR',
      speakerId: null,
      content: narratorClean,
      passType: PassType.NARRATOR,
      turnId: args.turnId,
      tokenCount: 0,
    });
    args.messageIds.push(msgId);
  }
}
