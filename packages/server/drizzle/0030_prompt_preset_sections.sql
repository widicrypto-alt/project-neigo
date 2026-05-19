-- PLANv3 X2.4 — Prompt preset sections (marker-based reorderable preset).
--
-- Adds a `sections` jsonb array to prompt_presets so users can reorder /
-- enable / disable prompt sections without source changes. Each section
-- entry shape:
--   {
--     "identifier": "character",
--     "role": "system",
--     "enabled": true,
--     "wrap": "xml"|"markdown"|"none",
--     "isMarker": true,
--     "markerConfig": { "type": "character", ... },
--     "content": "..."   // only when isMarker=false
--   }

ALTER TABLE prompt_presets
  ADD COLUMN IF NOT EXISTS sections jsonb NOT NULL DEFAULT '[]'::jsonb;

-- preset_mode: 'legacy' (systemPrelude + authorsNote only) vs 'marker'
-- (sections array drives assembly). Legacy rows keep working by default.
ALTER TABLE prompt_presets
  ADD COLUMN IF NOT EXISTS preset_mode varchar(16) NOT NULL DEFAULT 'legacy';

-- Idempotent CHECK constraint add (Postgres has no ADD CONSTRAINT IF NOT EXISTS).
-- Required because migrate.ts re-runs every .sql file on each invocation.
DO $$
BEGIN
  ALTER TABLE prompt_presets
    ADD CONSTRAINT prompt_presets_mode_chk
    CHECK (preset_mode IN ('legacy','marker'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
