-- PLANv3 X4.1 (post-batch Track B.1) — Context blob externalization.
--
-- Large tool outputs / scene artifacts (>8KB) are offloaded to object
-- storage and represented in-graph as a small digest + blob pointer.
-- Reduces prompt size for long sessions carrying attachments or
-- tool-generated payloads.
--
-- Note: R2/S3 wiring is deferred. This migration only lands the
-- storage-agnostic schema (content_ref is an opaque key — the service
-- layer chooses the backing store). A follow-up PR will add the actual
-- storageProvider adapter.

CREATE TABLE IF NOT EXISTS context_blobs (
  id           varchar(36)  PRIMARY KEY,
  session_id   varchar(36)  NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  mime_type    varchar(128) NOT NULL DEFAULT 'text/plain',
  size_bytes   integer      NOT NULL,
  content_ref  text         NOT NULL,
  digest       text         NOT NULL,
  created_at   timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS context_blobs_session_idx
  ON context_blobs (session_id, created_at DESC);

-- Link context_nodes → context_blobs (many-to-one). A compacted node
-- whose source was large enough to externalise keeps `summary` small
-- and stores the full payload via `blob_ref`.
ALTER TABLE context_nodes
  ADD COLUMN IF NOT EXISTS blob_ref varchar(36)
  REFERENCES context_blobs(id) ON DELETE SET NULL;

ALTER TABLE context_blobs ENABLE ROW LEVEL SECURITY;
-- Owner-role bypass matches 0002_rls.sql pattern.
