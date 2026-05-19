-- Automatic Row Level Security.
--
-- Supabase Data API (PostgREST) is enabled on this project. Our server
-- connects as the table owner (`postgres` role), which bypasses RLS. External
-- access through the anon/authenticated roles would be default-deny here,
-- because we enable RLS on every table WITHOUT any policies. Policies can be
-- added incrementally per table as features ship.
--
-- FORCE ROW LEVEL SECURITY is intentionally NOT set, so the owning role keeps
-- its bypass and server writes continue to work unchanged.
--
-- Safe to re-run: `ENABLE ROW LEVEL SECURITY` is idempotent.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'users',
    'subscriptions',
    'characters',
    'chat_sessions',
    'chat_messages',
    'memories',
    'character_dynamic_states',
    'character_mode_profiles',
    'harem_stats',
    'cast_relationships',
    'group_activities',
    'story_arcs',
    'scene_templates',
    'world_bible_entries',
    'learner_profiles',
    'learning_materials',
    'mistake_logs',
    'api_usage'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

-- Revoke any broad PostgREST grants that may have been created automatically.
-- Specific per-table grants are added explicitly below.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
  END IF;
END $$;

-- ── Public character browsing via PostgREST ──────────────────────────────────
-- Allow anonymous PostgREST callers to SELECT rows from `characters` where
-- is_public = true. The server role bypasses this (no FORCE RLS), so internal
-- writes are unaffected.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    -- Grant is idempotent.
    EXECUTE 'GRANT SELECT ON public.characters TO anon';
  END IF;
END $$;

-- Policy is idempotent via DROP IF EXISTS + recreate.
DROP POLICY IF EXISTS characters_public_read ON public.characters;
CREATE POLICY characters_public_read
  ON public.characters
  FOR SELECT
  TO anon
  USING (is_public = true);
