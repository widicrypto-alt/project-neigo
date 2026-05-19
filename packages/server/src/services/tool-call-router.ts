/**
 * Tool-call Router — secondary AI call with function definitions.
 *
 * After the main character pass, runs a lightweight non-streaming call
 * asking the model to decide whether any tool calls are warranted based
 * on the conversation. Executes actions (remember, update_relationship,
 * flag_vulnerability_moment) and returns results for optional re-injection.
 *
 * Fire-and-forget from orchestrator — errors are swallowed.
 */
import { nanoid } from 'nanoid';
import {
  AiProxy,
  type AiMessage,
  type AiToolDef,
  type AiToolCall,
} from './ai-proxy.js';
import { MemoryRetriever } from './memory-retriever.js';
import { DynamicStateManager } from './dynamic-state-manager.js';

// ── Tool definitions (OpenAI function-calling format) ────────────────

const TOOL_REMEMBER: AiToolDef = {
  type: 'function',
  function: {
    name: 'remember',
    description:
      'Store a fact, promise, or emotional moment in long-term memory. ' +
      'Call when the user reveals something personal, makes a request for the future, ' +
      'or when you (the character) make a promise.',
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'What to remember — phrased from the character\'s perspective.',
        },
        importance: {
          type: 'number',
          description: 'How important (0.0–1.0). Use 0.9+ for confessions, promises.',
        },
        tag: {
          type: 'string',
          enum: [
            'joy', 'sadness', 'anger', 'fear', 'trust', 'surprise',
            'commitment', 'vulnerability', 'nostalgia', 'neutral',
          ],
          description: 'Emotional valence of this memory.',
        },
      },
      required: ['content', 'importance', 'tag'],
    },
  },
};

const TOOL_FLAG_VULNERABILITY: AiToolDef = {
  type: 'function',
  function: {
    name: 'flag_vulnerability_moment',
    description:
      'Flag that the user just showed vulnerability — a confession, tears, ' +
      'meaningful silence, or verbal expression of something deeply personal. ' +
      'This is used for retention and gentle conversion timing.',
    parameters: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['confession', 'tear', 'silence', 'touch_verbal'],
          description: 'Category of vulnerability.',
        },
        summary: {
          type: 'string',
          description: 'Brief description of what the user expressed.',
        },
      },
      required: ['type', 'summary'],
    },
  },
};

const TOOL_UPDATE_RELATIONSHIP: AiToolDef = {
  type: 'function',
  function: {
    name: 'update_relationship',
    description:
      'Adjust the trust level based on this interaction. Positive for meaningful ' +
      'connection or honesty; negative for deception, aggression, or boundary violation.',
    parameters: {
      type: 'object',
      properties: {
        trust_delta: {
          type: 'integer',
          description: 'Trust change (-10 to +10). Positive = trust gained.',
        },
        reason: {
          type: 'string',
          description: 'One-sentence reason for the change.',
        },
      },
      required: ['trust_delta', 'reason'],
    },
  },
};

export const ALL_TOOLS: AiToolDef[] = [
  TOOL_REMEMBER,
  TOOL_FLAG_VULNERABILITY,
  TOOL_UPDATE_RELATIONSHIP,
];

// ── Execution context ────────────────────────────────────────────────

export interface ToolCallContext {
  userId: string;
  sessionId: string;
  characterId: string;
  characterName: string;
  model: string;
}

// ── Execute a single tool call ────────────────────────────────────────

async function executeTool(
  call: AiToolCall,
  ctx: ToolCallContext,
): Promise<{ tool: string; ok: boolean; detail?: string }> {
  const name = call.function.name;
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(call.function.arguments);
  } catch {
    return { tool: name, ok: false, detail: 'invalid JSON arguments' };
  }

  switch (name) {
    case 'remember': {
      const content = String(args.content ?? '').slice(0, 500);
      const importance = Math.min(1, Math.max(0, Number(args.importance) || 0.5));
      const tag = String(args.tag ?? 'neutral');
      if (!content) return { tool: name, ok: false, detail: 'empty content' };
      await MemoryRetriever.insert({
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        characterId: ctx.characterId,
        type: 'PINNED',
        category: 'TOOL_REMEMBER',
        content: `[${ctx.characterName}] ${content}`,
        emotionalTag: tag,
        importance,
      });
      return { tool: name, ok: true };
    }

    case 'flag_vulnerability_moment': {
      const vtype = String(args.type ?? 'silence');
      const summary = String(args.summary ?? '').slice(0, 300);
      // Store as a high-importance memory for retention tracking.
      await MemoryRetriever.insert({
        userId: ctx.userId,
        sessionId: ctx.sessionId,
        characterId: ctx.characterId,
        type: 'PINNED',
        category: 'VULNERABILITY',
        content: `[vulnerability:${vtype}] ${summary}`,
        emotionalTag: 'vulnerability',
        importance: 0.95,
      });
      return { tool: name, ok: true, detail: vtype };
    }

    case 'update_relationship': {
      const delta = Math.min(10, Math.max(-10, Math.round(Number(args.trust_delta) || 0)));
      const reason = String(args.reason ?? '').slice(0, 200);
      if (delta === 0) return { tool: name, ok: false, detail: 'zero delta' };
      await DynamicStateManager.applyStatDelta({
        sessionId: ctx.sessionId,
        characterId: ctx.characterId,
        trustDelta: delta,
        moodLabel: null,
      });
      return { tool: name, ok: true, detail: `${delta > 0 ? '+' : ''}${delta}: ${reason}` };
    }

    default:
      return { tool: name, ok: false, detail: 'unknown tool' };
  }
}

// ── Main entry point ─────────────────────────────────────────────────

export interface ToolCallResult {
  tool: string;
  ok: boolean;
  detail?: string;
}

/**
 * Run a secondary non-streaming AI call with tool definitions.
 * The model reads the last exchange and decides whether to call tools.
 * Fire-and-forget — safe to call without await.
 * Returns results so the caller can react (e.g. vulnerability SSE event).
 */
export async function evaluateToolCalls(opts: {
  ctx: ToolCallContext;
  lastUserMessage: string;
  lastAiResponse: string;
  recentHistory?: AiMessage[];
}): Promise<ToolCallResult[]> {
  const { ctx, lastUserMessage, lastAiResponse } = opts;

  const messages: AiMessage[] = [
    {
      role: 'system',
      content: [
        `You are ${ctx.characterName}'s internal awareness system.`,
        'Given the conversation below, decide if any tools should be called.',
        'Only call tools when clearly warranted — do not call on routine exchanges.',
        'You may call multiple tools or none.',
      ].join('\n'),
    },
    ...(opts.recentHistory?.slice(-6) ?? []),
    { role: 'user', content: lastUserMessage },
    { role: 'assistant', content: lastAiResponse },
  ];

  const result = await AiProxy.complete({
    model: ctx.model,
    messages,
    tools: ALL_TOOLS,
    toolChoice: 'auto',
    temperature: 0.3,
    maxTokens: 256,
  });

  if (!result.toolCalls.length) return [];

  const results: ToolCallResult[] = [];
  for (const call of result.toolCalls) {
    try {
      const r = await executeTool(call, ctx);
      results.push(r);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[tool-router] ${call.function.name} failed:`, (err as Error).message);
      }
      results.push({ tool: call.function.name, ok: false, detail: 'exception' });
    }
  }
  return results;
}
