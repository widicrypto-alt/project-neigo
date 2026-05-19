/**
 * MARINARA H8 — Illustrator prompt generator.
 *
 * Turns the current scene state into a short comma-separated prompt
 * suitable for pasting into Midjourney / SD / NAI. Runs on the cheap
 * light model so cost-per-turn stays negligible; failure is swallowed
 * non-fatally so a bad upstream never poisons the chat surface.
 *
 * Storage: the caller writes the returned string to
 * `chatMessages.metadata.illustratorPrompt` so the FE can render a
 * copy button on the corresponding bubble.
 */

import { AiProxy } from './ai-proxy.js';
import { env } from '../lib/env.js';

export interface IllustratorSceneInput {
  characterName: string;
  characterDescription?: string;
  sceneState?: Record<string, string>;
  /** Last line or two of narration to anchor the visual moment. */
  narrativeHint?: string;
}

export interface IllustratorResult {
  prompt: string;
  modelUsed: string;
}

const MAX_TOKENS = 120;
const SYSTEM_PROMPT =
  'You turn roleplay scenes into short image-gen prompts for Midjourney/SD/NovelAI. ' +
  'Output ONE line, comma-separated descriptors, 60–80 tokens, no quotes, no explanations. ' +
  'Include: subject (1 person unless scene is clearly group), outfit, expression, pose, ' +
  'location, lighting, mood, art style. NEVER include sexual/minor/real-person tokens.';

function buildUserMessage(input: IllustratorSceneInput): string {
  const lines: string[] = [`Character: ${input.characterName}`];
  if (input.characterDescription) {
    lines.push(`Appearance: ${input.characterDescription.slice(0, 400)}`);
  }
  if (input.sceneState && Object.keys(input.sceneState).length > 0) {
    const pairs = Object.entries(input.sceneState).map(([k, v]) => `${k}=${v}`);
    lines.push(`Scene state: ${pairs.join(', ')}`);
  }
  if (input.narrativeHint) {
    lines.push(`Moment: ${input.narrativeHint.slice(0, 300)}`);
  }
  lines.push('', 'Output only the comma-separated prompt line.');
  return lines.join('\n');
}

/**
 * Generate an illustrator prompt. Returns null on failure so the caller
 * can decide whether to retry or skip; never throws.
 */
export async function generateIllustratorPrompt(
  input: IllustratorSceneInput,
  opts: { userId?: string } = {},
): Promise<IllustratorResult | null> {
  try {
    const res = await AiProxy.complete({
      model: env.AI_LIGHT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(input) },
      ],
      maxTokens: MAX_TOKENS,
      temperature: 0.6,
      userId: opts.userId,
    });
    // Normalise: first non-empty line, stripped.
    const first = res.content
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.length > 0);
    if (!first) return null;
    return { prompt: first, modelUsed: res.model };
  } catch (err) {
    console.warn('[illustrator] generation failed:', err);
    return null;
  }
}
