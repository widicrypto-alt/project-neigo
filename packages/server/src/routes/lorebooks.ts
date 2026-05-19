import { Hono } from 'hono';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { requireAuth, type AuthVars } from '../middleware/auth.js';

export const lorebooksRouter = new Hono<{ Variables: AuthVars }>();
lorebooksRouter.use('*', requireAuth);

lorebooksRouter.get('/', async (c) => {
  const { userId } = c.get('user');
  const rows = await db
    .select()
    .from(schema.lorebooks)
    .where(eq(schema.lorebooks.userId, userId))
    .orderBy(desc(schema.lorebooks.updatedAt))
    .limit(200);
  return c.json({ lorebooks: rows });
});