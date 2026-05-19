/**
 * Unit tests for session creation guards.
 *
 * Does NOT require a DB connection — tests are scoped to the validation
 * logic that runs before any persistence call.
 */
import { describe, it, expect } from 'bun:test';
import { Hono } from 'hono';
import { BETA_CHAT_MODES } from '@neigo/shared';

// ── Minimal stub app that mirrors the mode-guard in sessions.ts ──────────────

function makeApp() {
  const app = new Hono();

  app.post('/api/sessions', async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { mode?: string };
    const mode = body.mode ?? '';

    if (!BETA_CHAT_MODES.includes(mode as (typeof BETA_CHAT_MODES)[number])) {
      return c.json(
        {
          error: 'mode_not_available',
          message: `Mode ${mode} is not available.`,
          allowedModes: BETA_CHAT_MODES,
        },
        403,
      );
    }

    // Stub success — real handler would persist to DB
    return c.json({ session: { id: 'stub', mode } }, 201);
  });

  return app;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function post(app: Hono, path: string, body: unknown) {
  const req = new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return app.fetch(req);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/sessions — mode guard', () => {
  const app = makeApp();

  it('allows STORY mode', async () => {
    const res = await post(app, '/api/sessions', { mode: 'STORY' });
    expect(res.status).toBe(201);
  });

  it('rejects unknown mode with 403', async () => {
    const res = await post(app, '/api/sessions', { mode: 'UNKNOWN_MODE' });
    expect(res.status).toBe(403);
  });

  it('rejects ROLEPLAY (old name) with 403', async () => {
    const res = await post(app, '/api/sessions', { mode: 'ROLEPLAY' });
    expect(res.status).toBe(403);
  });

  it('rejects HAREM (old name) with 403', async () => {
    const res = await post(app, '/api/sessions', { mode: 'HAREM' });
    expect(res.status).toBe(403);
    const data = (await res.json()) as { error: string; allowedModes: string[] };
    expect(data.error).toBe('mode_not_available');
    expect(data.allowedModes).toEqual([...BETA_CHAT_MODES]);
  });

  it('response body includes allowedModes list for invalid mode', async () => {
    const res = await post(app, '/api/sessions', { mode: 'CAST' });
    const data = (await res.json()) as { allowedModes: string[] };
    expect(data.allowedModes).toContain('STORY');
    expect(data.allowedModes).not.toContain('CHAT');
    expect(data.allowedModes).not.toContain('HAREM');
  });
});

describe('BETA_CHAT_MODES constant', () => {
  it('contains exactly STORY', () => {
    expect(BETA_CHAT_MODES).toEqual(['STORY']);
  });

  it('does not contain deprecated modes', () => {
    const deprecated = ['HAREM', 'CHAT', 'DEBATE', 'IMMERSION', 'LEARNING', 'ROLEPLAY'];
    for (const mode of deprecated) {
      expect(BETA_CHAT_MODES).not.toContain(mode);
    }
  });
});
