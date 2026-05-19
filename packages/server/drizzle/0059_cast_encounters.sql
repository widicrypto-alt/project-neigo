-- Migration: 0059_cast_encounters.sql
-- Detailed encounter tracking for each cast member

CREATE TABLE IF NOT EXISTS story_cast_encounters (
  id VARCHAR(36) PRIMARY KEY,
  progress_id VARCHAR(36) NOT NULL REFERENCES story_cast_progress(id) ON DELETE CASCADE,
  character_id VARCHAR(36) NOT NULL REFERENCES characters(id) ON DELETE CASCADE,

  -- Encounter details
  first_met_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  encounter_count INT NOT NULL DEFAULT 1,
  last_interaction_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Relationship at first meeting
  first_impression VARCHAR(50),

  -- Cumulative stats from this character
  trust_delta INT NOT NULL DEFAULT 0,
  affection_delta INT NOT NULL DEFAULT 0,
  tension_delta INT NOT NULL DEFAULT 0,

  -- Scene context of first meeting
  first_meeting_scene TEXT,
  first_meeting_mood VARCHAR(50),

  -- Notes (user can add personal notes about this character)
  user_notes TEXT,

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One encounter record per character per progress
  UNIQUE(progress_id, character_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS story_cast_encounters_progress_idx ON story_cast_encounters (progress_id);
CREATE INDEX IF NOT EXISTS story_cast_encounters_character_idx ON story_cast_encounters (character_id);
CREATE UNIQUE INDEX IF NOT EXISTS story_cast_encounters_unique_idx ON story_cast_encounters (progress_id, character_id);

