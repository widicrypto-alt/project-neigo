-- T4.9: Temporal fact graph for character arc tracking
CREATE TABLE IF NOT EXISTS character_facts (
  id VARCHAR(36) PRIMARY KEY,
  session_id VARCHAR(36) NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  character_id VARCHAR(36) NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to TIMESTAMPTZ,
  version_of VARCHAR(36) REFERENCES character_facts(id),
  source_message_id VARCHAR(36) REFERENCES chat_messages(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS character_facts_current_idx ON character_facts (session_id, subject, predicate) WHERE valid_to IS NULL;
CREATE INDEX IF NOT EXISTS character_facts_timeline_idx ON character_facts (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS character_facts_character_idx ON character_facts (character_id, session_id);
