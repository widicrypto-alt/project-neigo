-- T4.1: Mistakes Registry — records drift patterns per session for prompt injection
CREATE TABLE IF NOT EXISTS session_mistakes (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id VARCHAR(36) NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  turn_index INT NOT NULL,
  kind TEXT NOT NULL,            -- 'tone_drift'|'pov_drift'|'format_drift'|'repetition'|'refusal'|'continuity'
  excerpt TEXT NOT NULL,         -- truncated problematic text (≤ 240 chars)
  correction TEXT NOT NULL,      -- corrective instruction that fixed it
  resolved_in_turn INT,          -- null if still pending; set when retry succeeded
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_mistakes_session_kind_idx ON session_mistakes (session_id, kind);
CREATE INDEX IF NOT EXISTS session_mistakes_session_recent_idx ON session_mistakes (session_id, created_at DESC);

-- T4.2: Hybrid RRF — add access_count + last_accessed_at to memories for multi-factor scoring
ALTER TABLE memories ADD COLUMN IF NOT EXISTS access_count INT DEFAULT 0;
ALTER TABLE memories ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;
