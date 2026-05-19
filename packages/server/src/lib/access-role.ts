import type { Tier } from '@neigo/shared';

export const FOUNDER_EMAILS = new Set<string>([
  'admin@neigo.my.id',
]);

export type AccessRole = 'FOUNDER' | 'FOUNDING_USER' | 'USER';

export function isFounderEmail(email?: string | null): boolean {
  if (!email) return false;
  return FOUNDER_EMAILS.has(email.trim().toLowerCase());
}

export function resolveAccessRole(args: {
  email?: string | null;
  isFoundingReader?: boolean | null;
}): AccessRole {
  if (isFounderEmail(args.email)) return 'FOUNDER';
  if (args.isFoundingReader) return 'FOUNDING_USER';
  return 'USER';
}

export function resolveEffectiveTier(args: {
  email?: string | null;
  storedTier?: Tier | null;
}): Tier {
  if (isFounderEmail(args.email)) return 'ENTERPRISE';
  return (args.storedTier ?? 'FREE') as Tier;
}
