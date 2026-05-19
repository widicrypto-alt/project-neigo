/**
 * Embeddings provider (OpenAI-compatible).
 * Uses `OPENROUTER_API_KEY` by default; override with `EMBEDDING_BASE_URL` + `EMBEDDING_MODEL`.
 *
 * When no key is set, falls back to a deterministic hash-based pseudo embedding
 * so RAG remains functional for local/dev (useless for similarity but keeps code paths live).
 */
import { env } from '../lib/env.js';

const DIM = 1536;
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'openai/text-embedding-3-small';
const EMBEDDING_BASE_URL = process.env.EMBEDDING_BASE_URL ?? env.AI_BASE_URL;

export class Embeddings {
  static async embed(text: string): Promise<number[]> {
    if (!env.OPENROUTER_API_KEY) return stubEmbed(text);
    try {
      const res = await fetch(`${EMBEDDING_BASE_URL}/embeddings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: text.slice(0, 8000),
        }),
      });
      if (!res.ok) return stubEmbed(text);
      const data = (await res.json()) as {
        data?: Array<{ embedding: number[] }>;
      };
      const vec = data.data?.[0]?.embedding;
      if (!vec || vec.length === 0) return stubEmbed(text);
      // Ensure correct dimension (pad or truncate).
      if (vec.length === DIM) return vec;
      const out = new Array<number>(DIM).fill(0);
      for (let i = 0; i < Math.min(DIM, vec.length); i++) out[i] = vec[i] ?? 0;
      return out;
    } catch {
      return stubEmbed(text);
    }
  }

  static async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }

  static toPgLiteral(v: number[]): string {
    return `[${v.join(',')}]`;
  }
}

function stubEmbed(text: string): number[] {
  // Deterministic pseudo-random vector from FNV-1a hash of tokens.
  const vec = new Array<number>(DIM).fill(0);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  for (let i = 0; i < DIM; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    vec[i] = ((h >>> 0) % 2001) / 1000 - 1; // [-1, 1]
  }
  // Normalize for cosine similarity usefulness.
  let norm = 0;
  for (const x of vec) norm += x * x;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < DIM; i++) vec[i] = (vec[i] ?? 0) / norm;
  return vec;
}
