/**
 * Type-safe Hono RPC client (P2.2).
 * Migration paused — AppType not yet exported from @neigo/server.
 * TODO: uncomment once AppType is exported.
 */
// import { hc } from 'hono/client';
// import type { AppType } from '@neigo/server';

// const API_BASE =
//   typeof window === 'undefined'
//     ? (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000')
//     : '';

// export const honoClient = hc<AppType>(API_BASE, {
//   init: {
//     credentials: 'include',
//     cache: 'no-store',
//   },
// });

// export type HonoClient = typeof honoClient;
