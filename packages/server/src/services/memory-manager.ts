/**
 * Summary / session memory helpers.
 * Lightweight port of MemoryManager.kt — trigger + prompt builder.
 * Full retrieval/consolidation logic will land with Phase 5 RAG work.
 */
import { z } from 'zod';

export const SUMMARIZE_EVERY = 7;
export const SUMMARY_FETCH_LIMIT = 40;
export const MAX_SUMMARIES_PER_CHARACTER = 20;
export const CONSOLIDATION_THRESHOLD = 15;
export const CONSOLIDATION_BATCH_SIZE = 10;
export const MAX_RELEVANT_SUMMARIES = 8;
export const MAX_RELEVANT_LORE = 10;

/**
 * Early crystallization fires at turn 4 to capture the initial scene setup
 * before the raw history window starts dropping messages.
 */
export const EARLY_CRYSTALLIZE_TURN = 4;

export function shouldSummarize(messageCount: number): boolean {
  return messageCount > 0 && (messageCount % SUMMARIZE_EVERY === 0 || messageCount === EARLY_CRYSTALLIZE_TURN);
}

export function buildSummaryPrompt(transcript: string, characterName: string): string {
  return `Summarize the following conversation between ${characterName} and the user in 3-5 sentences.
Focus on emotional beats, decisions taken, and factual developments. Keep it narrative, in past tense.
Transcript:
${transcript}
Summary:`;
}

export function buildLoreExtractionPrompt(transcript: string): string {
  return `Extract up to 5 durable world/lore facts from the following transcript.
Output bullet points starting with "- ". Facts must be confirmed within the conversation.
If no facts, reply with "NONE".
Transcript:
${transcript}
Facts:`;
}

/**
 * v7 Bet A — Structured memory crystallization.
 *
 * Instead of free-form summary text, ask the model to crystallize a window of
 * conversation into a strict JSON payload. This lets us (a) index each beat
 * with typed salience/emotion metadata, (b) filter by type downstream, and
 * (c) validate before write — any malformed output is discarded early.
 */
export const MEMORY_CATEGORIES = [
  'emotional_beat',
  'factual',
  'promise',
  'relationship_shift',
  'scene_anchor',
  'lore',
] as const;
export type MemoryCategoryKey = (typeof MEMORY_CATEGORIES)[number];

export const zCrystallizedMemory = z.object({
  type: z.enum(MEMORY_CATEGORIES),
  content: z.string().min(4).max(280),
  /** 0.0 = forgettable, 1.0 = cornerstone. Floats allowed. */
  salience: z.number().min(0).max(1),
  /** Short mood label (e.g. "tender", "tense", "playful"). Optional. */
  emotion: z.string().max(24).optional(),
  /** Turn index this beat refers to, if the model can locate it. */
  turnRef: z.number().int().nonnegative().optional(),
});
export type CrystallizedMemory = z.infer<typeof zCrystallizedMemory>;

export const zCrystallizationResult = z.object({
  memories: z.array(zCrystallizedMemory).max(8),
});
export type CrystallizationResult = z.infer<typeof zCrystallizationResult>;

export function buildCrystallizationPrompt(
  transcript: string,
  characterName: string,
): string {
  return `You are crystallizing the following conversation between ${characterName} and the user into durable memory beats.

Return STRICT JSON matching this TypeScript type — no prose, no markdown fences:

{
  "memories": Array<{
    "type": "emotional_beat" | "factual" | "promise" | "relationship_shift" | "scene_anchor" | "lore",
    "content": string,            // 1 sentence, past tense, third-person about the user or ${characterName}
    "salience": number,           // 0.0 – 1.0; 1.0 = unforgettable turning point
    "emotion"?: string,           // optional mood label, 1-2 words
    "turnRef"?: number            // optional turn index from the transcript
  }>
}

Rules:
- Max 8 memories. Prefer fewer, higher-salience items.
- Never invent facts. Only what the transcript confirms.
- "promise" = something ${characterName} or the user committed to future-tense.
- "relationship_shift" = a detectable change in trust, intimacy, or alliance.
- If nothing durable happened, return {"memories": []}.

Transcript:
${transcript}

JSON:`;
}

/**
 * Parse the model's raw text into a validated CrystallizationResult.
 * Tolerates ```json fences and leading/trailing prose. Throws on invalid JSON
 * or schema mismatch; the caller decides whether to swallow or surface.
 */
export function parseCrystallizationResponse(raw: string): CrystallizationResult {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? raw).trim();
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error('crystallization: no JSON object found in response');
  }
  const json = candidate.slice(firstBrace, lastBrace + 1);
  const parsed = JSON.parse(json) as unknown;
  return zCrystallizationResult.parse(parsed);
}
