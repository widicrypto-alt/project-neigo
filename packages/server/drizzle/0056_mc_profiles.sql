-- Migration: 0056_mc_profiles.sql
-- User MC Profiles - allows users to create/manage their protagonist personas

CREATE TABLE IF NOT EXISTS user_mc_profiles (
  id VARCHAR(36) PRIMARY KEY,
  user_id VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  avatar_url VARCHAR(500),

  -- MC Persona (flexible JSONB structure for extensibility)
  persona JSONB NOT NULL DEFAULT '{}',

  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast user lookup
CREATE INDEX IF NOT EXISTS user_mc_profiles_user_idx ON user_mc_profiles (user_id);

-- Ensure only one default per user
CREATE UNIQUE INDEX IF NOT EXISTS user_mc_profiles_default_idx ON user_mc_profiles (user_id) WHERE is_default = true;

