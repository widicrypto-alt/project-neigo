import jwt from 'jsonwebtoken';
import { env } from './env.js';

export interface JwtPayload {
  userId: string;
  email: string;
}

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '30d' });
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const result = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    return result;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'neigo_session';
