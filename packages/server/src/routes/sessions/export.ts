import { Hono } from 'hono';
import { and, asc, desc, eq } from 'drizzle-orm';
import { db, schema } from '../../db/client.js';
import { type AuthVars } from '../../middleware/auth.js';
import { canExport, type TierVars } from '../../middleware/tier.js';

export const exportRouter = new Hono<{ Variables: AuthVars & TierVars }>();

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// GET /api/sessions/:id/export?from=<turnIndex>&to=<turnIndex>
exportRouter.get('/:id/export', async (c) => {
  const { userId } = c.get('user');
  const tier = c.get('tier');
  if (!canExport(tier)) {
    return c.json({ error: 'tier_limit', message: 'Export is not available on your tier.' }, 403);
  }
  const id = c.req.param('id');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const character = await db.query.characters.findFirst({
    where: eq(schema.characters.id, session.characterId),
  });
  const charName = character?.name ?? 'Character';

  const fromIdx = Number(c.req.query('from') ?? 0);
  const toIdx = Number(c.req.query('to') ?? 999999);

  const rows = await db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.sessionId, id))
    .orderBy(schema.chatMessages.turnIndex);

  const messages = rows.filter(
    (r) => r.turnIndex >= fromIdx && r.turnIndex <= toIdx,
  );

  const lines = messages.map((m) => {
    const isUser = m.speakerType === 'USER';
    const isNarrator = m.speakerType === 'NARRATOR';
    const speaker = isUser ? 'You' : isNarrator ? '' : charName;
    const textColor = isUser ? '#94a3b8' : isNarrator ? '#64748b' : '#e2e8f0';
    const style = isNarrator ? 'font-style:italic;' : '';
    const label = speaker
      ? `<div style="font-size:12px;color:#475569;margin-bottom:2px;font-weight:600">${escapeHtml(speaker)}</div>`
      : '';
    return `<div style="margin-bottom:16px;${style}">${label}<div style="color:${textColor};font-size:15px;line-height:1.6">${escapeHtml(m.content)}</div></div>`;
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:32px;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px">
${lines.join('\n')}
<div style="margin-top:24px;text-align:left;color:#1e293b;font-size:11px;opacity:0.1;font-weight:700">neigo</div>
</body></html>`;

  return c.html(html);
});

// GET /api/sessions/:id/export.md
exportRouter.get('/:id/export.md', async (c) => {
  const { userId } = c.get('user');
  const tier = c.get('tier');
  if (!canExport(tier)) {
    return c.json({ error: 'tier_limit', message: 'Export is not available on your tier.' }, 403);
  }
  const id = c.req.param('id');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const character = await db.query.characters.findFirst({
    where: eq(schema.characters.id, session.characterId),
  });
  const charName = character?.name ?? 'Character';

  const messages = await db
    .select()
    .from(schema.chatMessages)
    .where(eq(schema.chatMessages.sessionId, id))
    .orderBy(asc(schema.chatMessages.turnIndex));

  const pinned = await db.query.memories.findMany({
    where: and(
      eq(schema.memories.sessionId, id),
      eq(schema.memories.type, 'PINNED'),
    ),
  });
  const pinnedSet = new Set(
    pinned.map((p) => p.content.trim().slice(0, 80)),
  );

  const lines: string[] = [];
  lines.push(`# ${session.title ?? `${charName} — ${session.mode}`}`);
  lines.push('');
  lines.push(`- **Character**: ${charName}`);
  lines.push(`- **Mode**: ${session.mode}`);
  lines.push(`- **Model**: ${session.aiModel}`);
  const scene = (session.sceneCard ?? {}) as Record<string, string>;
  if (scene.location) lines.push(`- **Scene**: ${scene.location}${scene.time ? `, ${scene.time}` : ''}`);
  if (scene.mood) lines.push(`- **Mood**: ${scene.mood}`);
  lines.push(`- **Turns**: ${session.turnCount}`);
  lines.push(`- **Started**: ${session.createdAt.toISOString()}`);
  lines.push('');
  if (pinned.length > 0) {
    lines.push(`> 📌 ${pinned.length} pinned moment${pinned.length === 1 ? '' : 's'} in this session.`);
    lines.push('');
  }
  lines.push('---');
  lines.push('');

  let lastTurnIdx = -1;
  for (const m of messages) {
    const turnNum = Math.floor(m.turnIndex / 2) + 1;
    if (turnNum !== lastTurnIdx) {
      lines.push('');
      lines.push(`## Turn ${turnNum}`);
      lines.push('');
      lastTurnIdx = turnNum;
    }
    const isUser = m.speakerType === 'USER';
    const isNarrator = m.speakerType === 'NARRATOR';
    const speaker = isUser ? 'You' : isNarrator ? '_narrator_' : charName;
    const isPinned = pinnedSet.has(m.content.trim().slice(0, 80));
    const badge = isPinned ? ' 📌' : '';
    if (isNarrator) {
      lines.push(`_${m.content.replace(/\n+/g, ' ')}_${badge}`);
    } else {
      lines.push(`**${speaker}**${badge}`);
      lines.push('');
      lines.push(m.content);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`_Exported from neigo on ${new Date().toISOString()}_`);

  const body = lines.join('\n');
  const safeName = (session.title ?? `${charName}-${session.mode}`)
    .replace(/[^a-zA-Z0-9\- _]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'session';
  c.header('Content-Type', 'text/markdown; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="${safeName}.md"`);
  return c.body(body);
});

// ── Section B: Timeline ────────────────────────────────────────────────
exportRouter.get('/:id/timeline', async (c) => {
  const { userId } = c.get('user');
  const id = c.req.param('id');
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(schema.chatSessions.id, id), eq(schema.chatSessions.userId, userId)),
  });
  if (!session) return c.json({ error: 'not_found' }, 404);

  const rows = await db
    .select()
    .from(schema.sessionEvents)
    .where(eq(schema.sessionEvents.sessionId, id))
    .orderBy(desc(schema.sessionEvents.createdAt))
    .limit(200);

  return c.json({
    events: rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      payload: r.payload,
      turnIndex: r.turnIndex,
      characterId: r.characterId,
      createdAt: r.createdAt,
    })),
  });
});
