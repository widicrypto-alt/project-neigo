-- Wk2 PLANv2 F4: Prompt Inspection
--
-- Captures the fully-assembled prompt (system + scaffolding + history +
-- user turn) at the moment a model call is about to fire. Used for:
--   · FOUNDER / ops post-mortem debugging
--   · future Prompt Reviewer agent (G6)
--   · regression replay
--
-- Storage pattern: one row per first-attempt turn. Retries do NOT write a
-- new row; they will update `retry_count` on the existing snapshot (service
-- layer enforces this). GC handled by `services/prompt-snapshot.ts` which
-- keeps the most recent N=50 snapshots per session.

CREATE TABLE IF NOT EXISTS prompt_snapshots (
  id              varchar(36)  PRIMARY KEY,
  session_id      varchar(36)  NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  user_id         varchar(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id    varchar(36),
  turn_id         varchar(36)  NOT NULL,
  turn_index      integer,
  model_slug      varchar(120) NOT NULL,
  messages        jsonb        NOT NULL,
  sampling        jsonb        NOT NULL DEFAULT '{}'::jsonb,
  total_chars     integer      NOT NULL DEFAULT 0,
  message_count   integer      NOT NULL DEFAULT 0,
  retry_count     integer      NOT NULL DEFAULT 0,
  created_at      timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prompt_snapshots_session_idx
  ON prompt_snapshots(session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS prompt_snapshots_session_turn_idx
  ON prompt_snapshots(session_id, turn_id);

CREATE INDEX IF NOT EXISTS prompt_snapshots_user_idx
  ON prompt_snapshots(user_id, created_at DESC);
