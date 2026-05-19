-- PLANv3 X4.2 (post-batch Track B.2) — Context node lineage.
--
-- For every context_nodes row, track which raw sources (messages, child
-- nodes, or externalised blobs) were folded into its summary. Needed
-- for:
--   - Ops UI "expand lineage" debug view.
--   - Future re-derivation when summariser models change.
--   - Evidence when the orchestrator surfaces node content back to
--     the user (e.g. "kamu bilang waktu itu…").

CREATE TABLE IF NOT EXISTS context_node_sources (
  context_node_id  varchar(36)  NOT NULL REFERENCES context_nodes(id) ON DELETE CASCADE,
  source_type      varchar(16)  NOT NULL,
  source_id        varchar(36)  NOT NULL,
  range_start      integer,
  range_end        integer,
  PRIMARY KEY (context_node_id, source_type, source_id),
  CONSTRAINT context_node_sources_type_chk
    CHECK (source_type IN ('message','node','blob'))
);

CREATE INDEX IF NOT EXISTS context_node_sources_source_idx
  ON context_node_sources (source_type, source_id);

ALTER TABLE context_node_sources ENABLE ROW LEVEL SECURITY;
