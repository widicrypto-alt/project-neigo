import { AiProxy } from '../ai-proxy.js';
import { BasePassAgent, type EmitSse } from './BasePassAgent.js';
import type { AiMessage } from '../ai-proxy.js';
import type { ChatSession } from '@neigo/shared';

export class DirectorPassAgent extends BasePassAgent {
  public static async execute(args: {
    emit: EmitSse;
    history: AiMessage[];
    session: ChatSession;
  }) {
    const directorPrompt: AiMessage = {
      role: 'system',
      content:
        'You are a *scene director*. Emit ONE JSON object only (no prose):\n' +
        '{ "summary": "1-sentence beat", "location": "place", "timeOfDay": "morning/noon/evening/night", "atmosphere": "mood" }',
    };
    try {
      const res = await AiProxy.complete({
        model: BasePassAgent.modelSlugFor(args.session),
        messages: [...args.history, directorPrompt],
        temperature: 0.4,
        maxTokens: 200,
      });
      const match = res.content.match(/\{[\s\S]*\}/);
      if (match) {
        const json = JSON.parse(match[0]) as {
          summary?: string;
          location?: string;
          timeOfDay?: string;
          atmosphere?: string;
        };
        await args.emit({
          type: 'scene',
          summary: json.summary ?? '',
          location: json.location ?? null,
          timeOfDay: json.timeOfDay ?? null,
          atmosphere: json.atmosphere ?? null,
        });
      }
    } catch {
      /* silent */
    }
  }
}
