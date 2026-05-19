-- T4.3: Character Diary — per-scene emotional reflection from character's perspective
CREATE TABLE IF NOT EXISTS character_diary (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id VARCHAR(36) NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  character_id VARCHAR(36) NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  turn_range_start INT NOT NULL,
  turn_range_end INT NOT NULL,
  entry TEXT NOT NULL,           -- 1-2 paragraph 1st-person reflection
  mood TEXT,                     -- dominant emotion while writing
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS character_diary_session_idx ON character_diary (session_id, turn_range_end DESC);
CREATE INDEX IF NOT EXISTS character_diary_char_user_idx ON character_diary (character_id, user_id, created_at DESC);
