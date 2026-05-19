import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { and, desc, eq, or } from 'drizzle-orm';
import { db, schema } from '../../db/client.js';
import { type AuthVars } from '../../middleware/auth.js';
import { type TierVars } from '../../middleware/tier.js';
import { AiProxy } from '../../services/ai-proxy.js';
import { isFounderEmail } from '../../lib/access-role.js';
import { listPromptSnapshots, getPromptSnapshot } from '../../services/prompt-snapshot.js';
import { generateIllustratorPrompt } from '../../services/illustrator.js';
import { retrieveActiveLore } from '../../services/lorebook/retriever.js';
import { DEFAULT_AI_MODEL, AI_MODEL_CONFIG } from '@neigo/shared';

export const toolsRouter = new Hono<{ Variables: AuthVars & TierVars }>();

const zSuggestScene = z.object({
  characterId: z.string().min(1),
  premise: z.string().max(400).optional(),
  mode: z.string().optional(),
});

// POST /api/sessions/suggest-scene
toolsRouter.post('/suggest-scene', zValidator('json', zSuggestScene), async (c) => {
  const { userId } = c.get('user');
  const { characterId, premise, mode } = c.req.valid('json');

  const char = await db.query.characters.findFirst({
    where: and(
      eq(schema.characters.id, characterId),
      or(eq(schema.characters.ownerId, userId), eq(schema.characters.isPublic, true)),
    ),
  });
  if (!char) return c.json({ error: 'not_found' }, 404);

  const personaObj = (char.persona ?? {}) as Record<string, unknown>;
  const personaText = [
    personaObj.personality,
    personaObj.speechStyle,
    personaObj.worldInfo,
    personaObj.background,
  ]
    .filter((v) => typeof v === 'string' && (v as string).length > 0)
    .map((v) => v as string)
    .join('\n')
    .slice(0, 800);

  const systemPrompt = `You are a creative writing assistant. Generate a brief scene setup for a ${mode ?? 'STORY'} session with a character named "${char.name}".
Respond ONLY with valid JSON matching this exact schema:
{"location":"string","time":"string","weather":"string","mood":"string","userRole":"string","language":"string"}
- location: a specific place (e.g. "Rain-soaked rooftop garden")
- time: time of day/night (e.g. "Late midnight")
- weather: weather condition (e.g. "Light drizzle")
- mood: emotional atmosphere (e.g. "Tense but tender")
- userRole: who the user plays (e.g. "A colleague she barely trusts yet")
- language: language for the scene (e.g. "Indonesian" or "English")
Keep each field to 1-6 words. Match the character's tone and world.`;

  const userMsg = premise
    ? `Character persona: ${personaText}\n\nPremise: ${premise}\n\nGenerate a scene setup that fits this premise and character.`
    : `Character persona: ${personaText}\n\nGenerate a scene setup that suits this character's personality and setting.`;

  try {
    const result = await AiProxy.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.85,
      maxTokens: 200,
      model: AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug,
    });

    const raw = result.content.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    let scene: Record<string, string>;
    try {
      scene = JSON.parse(raw) as Record<string, string>;
    } catch {
      const match = raw.match(/\{[^}]+\}/s);
      scene = match ? (JSON.parse(match[0]) as Record<string, string>) : {};
    }

    return c.json({
      location: String(scene.location ?? ''),
      time: String(scene.time ?? ''),
      weather: String(scene.weather ?? ''),
      mood: String(scene.mood ?? ''),
      userRole: String(scene.userRole ?? ''),
      language: String(scene.language ?? ''),
    });
  } catch (err) {
    console.error('[suggest-scene] AI error:', err);
    return c.json({ error: 'ai_failed' }, 500);
  }
});

// ── MARINARA H2 — World Info Inspector ───────────────────────────────
toolsRouter.get('/:id/active-lore', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
    columns: { id: true, turnCount: true },
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const recent = await db
    .select({ content: schema.chatMessages.content })
    .from(schema.chatMessages)
    .where(
      and(
        eq(schema.chatMessages.sessionId, id),
        eq(schema.chatMessages.isActive, true),
      ),
    )
    .orderBy(desc(schema.chatMessages.createdAt))
    .limit(8);
  const scanText = recent.map((r) => r.content).reverse().join('\n\n');

  const result = await retrieveActiveLore({
    sessionId: id,
    userId,
    scanText: scanText || '(empty)',
    turnCount: session.turnCount,
  });
  return c.json(result);
});

// ── MARINARA H8 — Illustrator prompt generator ───────────────────────
toolsRouter.post('/:id/messages/:messageId/illustrator-prompt', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const messageId = c.req.param('messageId');

  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const message = await db.query.chatMessages.findFirst({
    where: and(eq(schema.chatMessages.id, messageId), eq(schema.chatMessages.sessionId, id)),
  });
  if (!message) return c.json({ error: 'not_found' }, 404);
  if (message.speakerType === 'USER') {
    return c.json({ error: 'cannot_illustrate_user_message' }, 400);
  }

  const existingMeta = (message.metadata ?? {}) as Record<string, unknown>;
  const cached = existingMeta.illustratorPrompt as string | undefined;
  if (cached && !c.req.query('regenerate')) {
    return c.json({ prompt: cached, cached: true });
  }

  const character = session.characterId
    ? await db.query.characters.findFirst({
        where: eq(schema.characters.id, session.characterId),
      })
    : null;
  if (!character) return c.json({ error: 'character_missing' }, 400);

  const sessionMeta = (session.metadata ?? {}) as Record<string, unknown>;
  const persona = (character.persona ?? {}) as Record<string, unknown>;
  const descriptionBits = [
    typeof persona.appearance === 'string' ? persona.appearance : null,
    typeof persona.personality === 'string' ? persona.personality : null,
  ].filter(Boolean) as string[];
  const result = await generateIllustratorPrompt(
    {
      characterName: character.name,
      characterDescription: descriptionBits.join('. ') || undefined,
      sceneState: sessionMeta.sceneState as Record<string, string> | undefined,
      narrativeHint: message.content.slice(0, 400),
    },
    { userId },
  );
  if (!result) return c.json({ error: 'generation_failed' }, 502);

  await db
    .update(schema.chatMessages)
    .set({
      metadata: { ...existingMeta, illustratorPrompt: result.prompt },
    })
    .where(eq(schema.chatMessages.id, messageId));

  return c.json({ prompt: result.prompt, cached: false, modelUsed: result.modelUsed });
});

// ─── Wk2 F4 Prompt Snapshots (FOUNDER-only, owner-scoped) ────────────────

toolsRouter.get('/:id/prompt-snapshots', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const limitRaw = Number(c.req.query('limit') ?? 20);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.trunc(limitRaw))) : 20;

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { email: true },
  });
  if (!isFounderEmail(user?.email)) {
    return c.json({ error: 'forbidden', message: 'founder_only' }, 403);
  }

  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
    columns: { id: true },
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const snapshots = await listPromptSnapshots(id, limit);
  return c.json({ sessionId: id, count: snapshots.length, snapshots });
});

toolsRouter.get('/:id/prompt-snapshots/:snapshotId', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const snapshotId = c.req.param('snapshotId');

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { email: true },
  });
  if (!isFounderEmail(user?.email)) {
    return c.json({ error: 'forbidden', message: 'founder_only' }, 403);
  }

  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
    columns: { id: true },
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const snap = await getPromptSnapshot(snapshotId);
  if (!snap || snap.sessionId !== id) {
    return c.json({ error: 'snapshot_not_found' }, 404);
  }
  return c.json(snap);
});

// ─── Wk12 PLANv2 G6 — Prompt Reviewer (PAID) ──────────────────────────────
toolsRouter.post('/:id/prompt-snapshots/:snapshotId/review', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const snapshotId = c.req.param('snapshotId');

  const user = await db.query.users.findFirst({
    where: eq(schema.users.id, userId),
    columns: { email: true, tier: true },
  });
  const isPaid =
    isFounderEmail(user?.email) || (user?.tier && user.tier !== 'FREE');
  if (!isPaid) {
    return c.json(
      {
        error: 'tier_upgrade_required',
        message: 'Prompt Reviewer is a paid feature.',
      },
      403,
    );
  }

  const session = await db.query.chatSessions.findFirst({
    where: and(
      eq(schema.chatSessions.id, id),
      eq(schema.chatSessions.userId, userId),
    ),
    columns: { id: true },
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const { reviewPromptSnapshot } = await import('../../services/prompt-reviewer.js');
  const result = await reviewPromptSnapshot({ snapshotId, userId });
  if (!result) return c.json({ error: 'snapshot_not_found' }, 404);
  return c.json(result);
});
