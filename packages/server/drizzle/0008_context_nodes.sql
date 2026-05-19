-- Context nodes: hierarchical transcript compaction (LCM-inspired Phase 1)
CREATE TABLE IF NOT EXISTS context_nodes (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id VARCHAR(36) NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  parent_id VARCHAR(36),
  depth INTEGER NOT NULL DEFAULT 0,
  turn_start INTEGER NOT NULL,
  turn_end INTEGER NOT NULL,
  summary TEXT NOT NULL,
  salience REAL NOT NULL DEFAULT 0.5,
  token_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS context_nodes_session_idx ON context_nodes(session_id, depth);
CREATE INDEX IF NOT EXISTS context_nodes_turn_range_idx ON context_nodes(session_id, turn_start, turn_end);
CREATE INDEX IF NOT EXISTS context_nodes_parent_idx ON context_nodes(parent_id);
