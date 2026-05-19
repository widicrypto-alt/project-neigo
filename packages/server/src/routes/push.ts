/**
 * Push Notification Routes
 *
 * POST /api/push/subscribe    — register a Web Push subscription
 * DELETE /api/push/subscribe  — remove a subscription
 * POST /api/push/opt-out      — permanent opt-out (removes all subscriptions)
 * GET  /api/push/vapid-key    — public VAPID key for client-side PushManager.subscribe()
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireAuth, type AuthVars } from '../middleware/auth.js';
import { env } from '../lib/env.js';
import {
  vapidPublicKey,
  savePushSubscription,
  removePushSubscription,
  setPushOptOut,
} from '../services/push-notif.js';

export const pushRouter = new Hono<{ Variables: AuthVars }>();

// Feature-flag gate — returns 404 for all push endpoints when disabled.
pushRouter.use('*', async (c, next) => {
  if (!env.ENABLE_PUSH_NOTIFICATIONS) {
    return c.json({ error: 'not_available_in_beta' }, 404);
  }
  return next();
});

// Public: return VAPID public key so the client can subscribe.
pushRouter.get('/vapid-key', (c) => {
  const key = vapidPublicKey();
  if (!key) return c.json({ error: 'push_not_configured' }, 503);
  return c.json({ publicKey: key });
});

pushRouter.use('*', requireAuth);

const zSubscribe = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

pushRouter.post('/subscribe', zValidator('json', zSubscribe), async (c) => {
  const { userId } = c.get('user');
  const body = c.req.valid('json');
  await savePushSubscription(userId, body);
  return c.json({ ok: true });
});

const zUnsubscribe = z.object({ endpoint: z.string().url() });

pushRouter.delete('/subscribe', zValidator('json', zUnsubscribe), async (c) => {
  const { userId } = c.get('user');
  const { endpoint } = c.req.valid('json');
  await removePushSubscription(userId, endpoint);
  return c.json({ ok: true });
});

pushRouter.post('/opt-out', async (c) => {
  const { userId } = c.get('user');
  await setPushOptOut(userId);
  return c.json({ ok: true });
});
