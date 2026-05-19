-- Migration: 0058_story_cast_progress.sql
-- Track user's progress through story cast discovery

CREATE TABLE IF NOT EXISTS story_cast_progress (
  id VARCHAR(36) PRIMARY KEY,
  story_id VARCHAR(36) NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(36) REFERENCES chat_sessions(id) ON DELETE SET NULL,

  -- MC Profile used for this story
  mc_profile_id VARCHAR(36),

  -- Which cast members have been met (stored as JSONB array for fast lookup)
  met_character_ids JSONB NOT NULL DEFAULT '[]',
  total_cast_count INT NOT NULL DEFAULT 0,
  met_count INT NOT NULL DEFAULT 0,

  -- First encounter tracking
  first_met_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Discovery metadata
  metadata JSONB NOT NULL DEFAULT '{}',

  -- Completion status
  is_complete BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One progress record per user per story
  UNIQUE(story_id, user_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS story_cast_progress_user_idx ON story_cast_progress (user_id);
CREATE INDEX IF NOT EXISTS story_cast_progress_story_idx ON story_cast_progress (story_id);
CREATE UNIQUE INDEX IF NOT EXISTS story_cast_progress_unique_idx ON story_cast_progress (story_id, user_id);
CREATE INDEX IF NOT EXISTS story_cast_progress_session_idx ON story_cast_progress (session_id) WHERE session_id IS NOT NULL;

