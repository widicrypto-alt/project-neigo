-- Add covering indexes for every foreign key column that lacked one.
--
-- Unindexed FK columns cause Postgres to do sequential scans of the child
-- table when the parent row is updated or deleted (ON DELETE CASCADE / RESTRICT
-- checks), and slow down any query that joins on those columns.
--
-- All statements use CREATE INDEX IF NOT EXISTS, so this file is safe to
-- re-run (idempotent).

-- api_usage
CREATE INDEX IF NOT EXISTS api_usage_user_id_idx
  ON public.api_usage (user_id);

-- cast_relationships
CREATE INDEX IF NOT EXISTS cast_relationships_char_a_id_idx
  ON public.cast_relationships (char_a_id);

CREATE INDEX IF NOT EXISTS cast_relationships_char_b_id_idx
  ON public.cast_relationships (char_b_id);

-- character_dynamic_states  (session_id is leading PK column; character_id is not)
CREATE INDEX IF NOT EXISTS character_dynamic_states_character_id_idx
  ON public.character_dynamic_states (character_id);

-- chat_sessions
CREATE INDEX IF NOT EXISTS chat_sessions_character_id_idx
  ON public.chat_sessions (character_id);

-- group_activities
CREATE INDEX IF NOT EXISTS group_activities_session_id_idx
  ON public.group_activities (session_id);

-- harem_stats  (session_id is leading PK column; character_id is not)
CREATE INDEX IF NOT EXISTS harem_stats_character_id_idx
  ON public.harem_stats (character_id);

-- learning_materials
CREATE INDEX IF NOT EXISTS learning_materials_user_id_idx
  ON public.learning_materials (user_id);

-- memories
CREATE INDEX IF NOT EXISTS memories_user_id_idx
  ON public.memories (user_id);

-- mistake_logs
CREATE INDEX IF NOT EXISTS mistake_logs_user_id_idx
  ON public.mistake_logs (user_id);

CREATE INDEX IF NOT EXISTS mistake_logs_session_id_idx
  ON public.mistake_logs (session_id);

-- scene_templates
CREATE INDEX IF NOT EXISTS scene_templates_owner_id_idx
  ON public.scene_templates (owner_id);

-- story_arcs
CREATE INDEX IF NOT EXISTS story_arcs_session_id_idx
  ON public.story_arcs (session_id);

-- subscriptions
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx
  ON public.subscriptions (user_id);

-- world_bible_entries
CREATE INDEX IF NOT EXISTS world_bible_entries_owner_id_idx
  ON public.world_bible_entries (owner_id);
