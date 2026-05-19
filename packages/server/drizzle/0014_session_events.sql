-- Section B: session quality
-- Stores persistent, queryable events emitted by the orchestrator
-- (milestone, relationship, mood, branch, export) so the relationship
-- timeline side-panel can render them across reloads. Events are
-- scoped to a session and cascade-delete with it.

CREATE TABLE IF NOT EXISTS session_events (
  id            varchar(36) PRIMARY KEY,
  session_id    varchar(36) NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id       varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id  varchar(36),
  event_type    varchar(30) NOT NULL,
  payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  turn_index    integer,
  created_at    timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS session_events_session_idx
  ON session_events (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS session_events_user_idx
  ON session_events (user_id, created_at DESC);
