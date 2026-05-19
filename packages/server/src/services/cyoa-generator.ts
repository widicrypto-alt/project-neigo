/**
 * Wk5 PLANv2 F3 — CYOA Choices (Choose Your Own Adventure chips).
 *
 * After the main response completes, this module makes a tail call to
 * Hermes-4-70B ("Crescent Lite") to produce 2–4 short, in-character
 * action suggestions the user can tap to reply instantly.
 *
 * Design goals:
 *   - Never blocks the main stream: invoked after `done` is emitted.
 *   - Cheap: small model, tight max_tokens, no streaming.
 *   - Safe to fail: a parse/upstream error yields an empty array (no event).
 *   - In-character: first-person user actions matching the scene tone,
 *     not meta-questions or shallow "what should I do?".
 */

import { z } from 'zod';
import { AiProxy, type AiMessage } from './ai-proxy.js';
import { env } from '../lib/env.js';

export interface CyoaChoice {
  /** Short chip label rendered in the UI (≤ 32 chars). */
  label: string;
  /** Full user-authored text posted when tapped (≤ 240 chars). */
  sendText: string;
}

export interface GenerateCyoaInput {
  characterName: string;
  userName: string;
  /** Last assistant (character) reply — the thing we're offering responses to. */
  lastCharacterText: string;
  /** Recent turns as plain lines, oldest → newest. Small tail only. */
  recentHistory: Array<{ role: 'USER' | 'CHARACTER'; text: string }>;
  /** Optional tone preset to flavor the suggestions. */
  tonePreset?: string | null;
  /** 0–100, used only to gate intimate suggestions. */
  trustScore?: number;
  /** Attribution target for cost accounting. */
  userId?: string;
}

const choiceSchema = z
  .object({
    label: z.string().trim().min(1).max(32),
    sendText: z.string().trim().min(1).max(240),
  })
  .strict();

const listSchema = z.array(choiceSchema).min(2);

function buildPrompt(input: GenerateCyoaInput): AiMessage[] {
  const history = input.recentHistory
    .slice(-6)
    .map((m) => `${m.role === 'USER' ? input.userName : input.characterName}: ${m.text}`)
    .join('\n');

  const trust = input.trustScore ?? 0;
  const intimacyGate =
    trust >= 60
      ? 'Intimate/affectionate suggestions are allowed when they fit naturally.'
      : 'Keep suggestions emotionally measured — trust is not yet high enough for intimate overtures.';

  const tone = input.tonePreset && input.tonePreset !== 'NONE'
    ? `Tone preset: ${input.tonePreset}.`
    : '';

  const system = [
    `You generate 2–4 short first-person reply options for the user, as if they were picking what to say next to ${input.characterName}.`,
    `Write in the user's voice ("aku"/"I"), not the character's. Each option is ONE natural thing the user could say or do next — a reply, a question, a small action. Not meta-advice.`,
    `Rules:`,
    `- 2 to 4 options, all distinct intents (no paraphrases).`,
    `- "label": ≤ 32 chars, plain text, Title case or short phrase — what fits on a chip.`,
    `- "sendText": ≤ 240 chars, the actual message/action the user would send, first-person. May include a brief action in *asterisks*.`,
    `- Match the scene's language (Indonesian if recent turns are Indonesian, English if English, else mirror the last character line).`,
    `- No emoji. No system/meta commentary. No roleplay stage directions referring to ${input.characterName}.`,
    `- ${intimacyGate}`,
    tone,
    `Output JSON ONLY, no prose, no markdown fence:`,
    `{"choices":[{"label":"...","sendText":"..."}, ...]}`,
  ]
    .filter(Boolean)
    .join('\n');

  const user = [
    history ? `Recent turns:\n${history}` : null,
    `\n${input.characterName}'s latest line:\n${input.lastCharacterText.trim()}`,
    `\nGenerate the chip options now.`,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function tryParse(raw: string): CyoaChoice[] {
  if (!raw) return [];
  // Strip accidental code fences.
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n?/, '').replace(/```\s*$/, '').trim();
  }
  let parsed: unknown;
  const tryJson = (s: string): unknown | undefined => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  parsed = tryJson(cleaned);
  if (parsed === undefined) {
    // Extract the first balanced object/array block from surrounding prose.
    // Prefer arrays when both kinds of brackets appear.
    const firstSq = cleaned.indexOf('[');
    const lastSq = cleaned.lastIndexOf(']');
    const firstCu = cleaned.indexOf('{');
    const lastCu = cleaned.lastIndexOf('}');
    if (firstSq >= 0 && lastSq > firstSq) {
      parsed = tryJson(cleaned.slice(firstSq, lastSq + 1));
    }
    if (parsed === undefined && firstCu >= 0 && lastCu > firstCu) {
      parsed = tryJson(cleaned.slice(firstCu, lastCu + 1));
    }
    if (parsed === undefined) return [];
  }
  const root = parsed as { choices?: unknown };
  const candidates = Array.isArray(root?.choices) ? root.choices : parsed;
  const result = listSchema.safeParse(candidates);
  if (!result.success) return [];
  // Dedupe by sendText casefold.
  const seen = new Set<string>();
  const unique: CyoaChoice[] = [];
  for (const c of result.data) {
    const key = c.sendText.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(c);
    if (unique.length >= 4) break;
  }
  return unique.length >= 2 ? unique : [];
}

/**
 * Produce CYOA chips. Returns `[]` on any failure — callers should treat
 * an empty array as "skip emitting the event".
 */
export async function generateCyoaChoices(input: GenerateCyoaInput): Promise<CyoaChoice[]> {
  if (!input.lastCharacterText.trim()) return [];
  try {
    const result = await AiProxy.complete({
      model: env.AI_LIGHT_MODEL,
      messages: buildPrompt(input),
      temperature: 0.7,
      maxTokens: 280,
      userId: input.userId,
    });
    return tryParse(result.content);
  } catch (err) {
    // Never let CYOA failures surface — it's a best-effort enhancement.
    console.warn('[cyoa] generation failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/** Exposed for unit tests. */
export const _internal = { buildPrompt, tryParse };
