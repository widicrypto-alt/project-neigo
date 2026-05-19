-- PLANv3 X4.3 — Session context frontier state.
--
-- One row per chat_session tracking compaction/frontier/debt + precomputed
-- wake-up packet for fast cold-start after long idles.

CREATE TABLE IF NOT EXISTS session_context_state (
  session_id            varchar(36) PRIMARY KEY REFERENCES chat_sessions(id) ON DELETE CASCADE,
  last_compacted_turn   integer     NOT NULL DEFAULT 0,
  maintenance_debt      integer     NOT NULL DEFAULT 0,
  snapshot_fresh_at     timestamptz,
  wake_up_packet        jsonb,
  frontier_depth        integer     NOT NULL DEFAULT 0,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS session_context_state_debt_idx
  ON session_context_state (maintenance_debt DESC)
  WHERE maintenance_debt > 0;

ALTER TABLE session_context_state ENABLE ROW LEVEL SECURITY;
