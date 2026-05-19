import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { SESSION_COOKIE, verifyJwt, type JwtPayload } from '../lib/jwt.js';

export type AuthVars = {
  user: JwtPayload;
};

export async function requireAuth(c: Context<{ Variables: AuthVars }>, next: Next) {
  const token = getCookie(c, SESSION_COOKIE) ?? c.req.header('authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'unauthorized' }, 401);
  const payload = verifyJwt(token);
  if (!payload) return c.json({ error: 'invalid_token' }, 401);
  c.set('user', payload);
  await next();
}

export async function optionalAuth(c: Context<{ Variables: Partial<AuthVars> }>, next: Next) {
  const token = getCookie(c, SESSION_COOKIE) ?? c.req.header('authorization')?.replace('Bearer ', '');
  if (token) {
    const payload = verifyJwt(token);
    if (payload) c.set('user', payload);
  }
  await next();
}
