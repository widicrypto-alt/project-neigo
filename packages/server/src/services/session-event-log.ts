import { nanoid } from 'nanoid';
import { db, schema } from '../db/client.js';

/**
 * Fire-and-forget analytics sink for iteration insights. Writes a row into
 * `session_events` (see drizzle/0014). Errors are swallowed — if this table
 * is down or slow, the user-facing turn must still succeed.
 *
 * Keep `eventType` short and machine-readable; keep `payload` small (< 1 KB)
 * since it's indexed by session/user only, not by jsonb fields.
 */
export interface SessionEventLogInput {
  sessionId: string;
  userId: string;
  characterId?: string | null;
  eventType: string;
  payload?: Record<string, unknown>;
  turnIndex?: number | null;
}

export function logSessionEvent(input: SessionEventLogInput): void {
  // Intentionally not awaited. Catch-and-ignore so a failing insert does not
  // propagate to the caller. Also catch any synchronous throw just in case.
  try {
    void db
      .insert(schema.sessionEvents)
      .values({
        id: nanoid(),
        sessionId: input.sessionId,
        userId: input.userId,
        characterId: input.characterId ?? null,
        eventType: input.eventType,
        payload: input.payload ?? {},
        turnIndex: input.turnIndex ?? null,
      })
      .catch(() => {});
  } catch {
    // Swallow — telemetry must never break the request path.
  }
}
