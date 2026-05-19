-- PLANv3 X4.5 (post-batch Track B.4) — Typed memory graph.
--
-- Session-scoped first (per PLANv3 §X12 #2): nodes are tagged with
-- the owning session via metadata.sessionId; promotion to user-scope
-- happens via explicit pins after validation.
--
-- `kind` enumerates entity classes the extractor can recognise.
-- Predicate strings are free-form to avoid premature ontology commit;
-- the ops UI will surface most-common predicates for governance.

CREATE TABLE IF NOT EXISTS memory_graph_nodes (
  id              varchar(36)  PRIMARY KEY,
  user_id         varchar(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind            varchar(32)  NOT NULL,
  canonical_name  text         NOT NULL,
  metadata        jsonb        NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT memory_graph_nodes_kind_chk
    CHECK (kind IN ('user','character','location','item','event','promise','mistake'))
);

CREATE INDEX IF NOT EXISTS memory_graph_nodes_user_kind_idx
  ON memory_graph_nodes (user_id, kind);

-- Dedupe by case-insensitive canonical name within a user+kind.
CREATE UNIQUE INDEX IF NOT EXISTS memory_graph_nodes_user_kind_name_uniq
  ON memory_graph_nodes (user_id, kind, lower(canonical_name));

CREATE TABLE IF NOT EXISTS memory_graph_edges (
  id                  varchar(36)  PRIMARY KEY,
  from_node_id        varchar(36)  NOT NULL REFERENCES memory_graph_nodes(id) ON DELETE CASCADE,
  to_node_id          varchar(36)  NOT NULL REFERENCES memory_graph_nodes(id) ON DELETE CASCADE,
  predicate           varchar(64)  NOT NULL,
  valid_from          timestamptz,
  valid_to            timestamptz,
  confidence          real         NOT NULL DEFAULT 1.0,
  source_message_id   varchar(36)  REFERENCES chat_messages(id) ON DELETE SET NULL,
  created_at          timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_graph_edges_from_idx
  ON memory_graph_edges (from_node_id, predicate);
CREATE INDEX IF NOT EXISTS memory_graph_edges_to_idx
  ON memory_graph_edges (to_node_id, predicate);

ALTER TABLE memory_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_graph_edges ENABLE ROW LEVEL SECURITY;
