-- Enable pgvector extension and add embedding column to memories.
-- Run after `drizzle-kit push` so the base schema exists.
-- Idempotent.

CREATE EXTENSION IF NOT EXISTS vector;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'memories' AND column_name = 'embedding'
  ) THEN
    ALTER TABLE memories ADD COLUMN embedding vector(1536);
  END IF;
END $$;

-- IVFFlat index (cosine). Requires at least some data for good lists.
-- We use 100 lists as a reasonable default; tune later.
CREATE INDEX IF NOT EXISTS memories_embedding_cosine_idx
  ON memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
