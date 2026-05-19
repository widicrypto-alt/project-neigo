-- Security hardening: RLS policies + extension schema
--
-- Fixes two Supabase linter warnings:
--   1. rls_enabled_no_policy  – 17 tables had RLS enabled but zero policies
--   2. extension_in_public    – vector extension was installed in public schema
--
-- Design notes:
--   • All server queries run as the `postgres` role (superuser), which bypasses
--     RLS by default (FORCE ROW LEVEL SECURITY is intentionally NOT set).
--   • The `characters_public_read` policy (in 0002_rls.sql) stays as-is.
--   • These RESTRICTIVE backend_only policies fire for any non-superuser role,
--     making the intent to deny direct external access explicit and machine-
--     readable.  They do not affect the running server.
--
-- Idempotent: safe to re-run.

-- ── 1. Move vector extension to extensions schema ─────────────────────────────

CREATE SCHEMA IF NOT EXISTS extensions;

-- Only execute the ALTER if vector is still in the public schema.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   pg_extension   e
    JOIN   pg_namespace   n ON n.oid = e.extnamespace
    WHERE  e.extname = 'vector'
    AND    n.nspname  = 'public'
  ) THEN
    EXECUTE 'ALTER EXTENSION vector SET SCHEMA extensions';
    RAISE NOTICE 'vector extension moved to extensions schema';
  ELSE
    RAISE NOTICE 'vector extension already in correct schema, skipping';
  END IF;
END $$;

-- Set a persistent database-level default so all future connections resolve
-- the vector type without explicit schema qualification.
ALTER DATABASE postgres SET search_path TO "$user", public, extensions;

-- ── 2. Backend-only RESTRICTIVE policies for the 17 policy-less tables ────────
--
-- AS RESTRICTIVE means the condition is ANDed with any permissive policies.
-- USING (false) ensures no row passes for non-superuser roles.
-- postgres / service_role bypass RLS entirely (no FORCE RLS), so these
-- policies have zero impact on the running server.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'api_usage',
    'cast_relationships',
    'character_dynamic_states',
    'character_mode_profiles',
    'chat_messages',
    'chat_sessions',
    'group_activities',
    'harem_stats',
    'learner_profiles',
    'learning_materials',
    'memories',
    'mistake_logs',
    'scene_templates',
    'story_arcs',
    'subscriptions',
    'users',
    'world_bible_entries'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE  table_schema = 'public'
      AND    table_name   = t
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS backend_only ON public.%I', t);
      EXECUTE format(
        $p$
          CREATE POLICY backend_only
            ON public.%I
            AS RESTRICTIVE
            FOR ALL
            TO public
            USING (false)
            WITH CHECK (false)
        $p$,
        t
      );
      RAISE NOTICE 'backend_only policy applied to %', t;
    ELSE
      RAISE NOTICE 'table % not found, skipping', t;
    END IF;
  END LOOP;
END $$;
