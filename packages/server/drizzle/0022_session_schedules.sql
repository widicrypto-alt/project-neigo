-- Wk14 PLANv2 H7 — user-configured scheduled autonomous messages.
--
-- A "session schedule" is a one-shot or recurring rule that, when it
-- fires, asks the nudge/return generator to emit an in-character message
-- as if the character decided to reach out. Not a cron expression — we
-- keep it simple: an absolute `fire_at` for one-shots and a `cadence`
-- enum for loose "daily at X" patterns. The worker re-enqueues the next
-- occurrence after firing recurring rules.

CREATE TABLE IF NOT EXISTS session_schedules (
  id            varchar(36) PRIMARY KEY,
  user_id       varchar(36) NOT NULL
                 REFERENCES users(id) ON DELETE CASCADE,
  session_id    varchar(36) NOT NULL
                 REFERENCES chat_sessions(id) ON DELETE CASCADE,
  -- 'once' | 'daily' | 'weekly'
  cadence       varchar(12) NOT NULL DEFAULT 'once',
  -- Next wall-clock time to fire (UTC). Updated after each recurring fire.
  fire_at       timestamptz NOT NULL,
  -- Optional authored prompt that the nudge planner incorporates.
  note          text NOT NULL DEFAULT '',
  -- User-local timezone used to compute the next occurrence for recurring.
  tz            varchar(64) NOT NULL DEFAULT 'UTC',
  -- User-local hour (0-23) and minute (0-59) for recurring cadences.
  hour          integer,
  minute        integer,
  -- A schedule can be paused without being deleted.
  enabled       boolean NOT NULL DEFAULT true,
  last_fired_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_schedules_user_idx
  ON session_schedules(user_id, enabled, fire_at);

CREATE INDEX IF NOT EXISTS session_schedules_session_idx
  ON session_schedules(session_id, enabled);
