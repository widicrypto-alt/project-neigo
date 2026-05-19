-- Sprint 1: CIM v1 — Hybrid Lore Search & Importance Scoring

-- 1. Add embedding column to lorebook_entries for vector search
-- Drizzle-kit doesn't support vector(N) natively, so we add it via raw SQL.
ALTER TABLE "lorebook_entries" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);

-- 2. Create index for vector search on lorebook entries
CREATE INDEX IF NOT EXISTS "lorebook_entries_embedding_idx" 
ON "lorebook_entries" USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 3. Ensure importance column in memories matches existing schema/usage
-- The schema already has 'importance: real().default(0.5)', so we just ensure
-- it's usable for weighted retrieval.
DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='memories' AND column_name='importance') THEN
    ALTER TABLE "memories" ADD COLUMN "importance" real DEFAULT 0.5;
  END IF;
END $$;
