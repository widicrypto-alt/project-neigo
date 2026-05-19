-- Wk11 PLANv2 G2 — prompt preset system.
--
-- A prompt preset is a user-authored, reusable block of system-prompt
-- overrides: a name, free-form prelude text, optional author's-note text,
-- plus a few sampling overrides (temperature, top_p) that the orchestrator
-- may apply when the preset is active. Presets are attached to sessions
-- via chat_sessions.active_preset_id (ON DELETE SET NULL).
--
-- Exactly zero or one preset per user can be flagged default (enforced
-- via partial unique index, mirroring personas).

CREATE TABLE IF NOT EXISTS prompt_presets (
  id                 varchar(36) PRIMARY KEY,
  user_id            varchar(36) NOT NULL
                      REFERENCES users(id) ON DELETE CASCADE,
  name               varchar(80) NOT NULL,
  description        text NOT NULL DEFAULT '',
  system_prelude     text NOT NULL DEFAULT '',
  authors_note       text NOT NULL DEFAULT '',
  temperature        real,
  top_p              real,
  is_default         boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prompt_presets_user_idx
  ON prompt_presets(user_id, is_default, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS prompt_presets_one_default_per_user
  ON prompt_presets(user_id) WHERE is_default = true;

-- Session <-> preset link. SET NULL on preset delete so sessions never
-- break; downstream orchestrator falls back to "no preset".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_sessions' AND column_name = 'active_preset_id'
  ) THEN
    ALTER TABLE chat_sessions
      ADD COLUMN active_preset_id varchar(36)
        REFERENCES prompt_presets(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS chat_sessions_preset_idx
  ON chat_sessions(active_preset_id);
