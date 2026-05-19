-- Migration: 0057_story_cast_roles.sql
-- Extend stories table with MC slot and discovery mode support

-- MC Slot configuration
ALTER TABLE stories ADD COLUMN IF NOT EXISTS has_mc_slot BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS mc_slot_display_name VARCHAR(100);

-- Discovery Mode settings
ALTER TABLE stories ADD COLUMN IF NOT EXISTS discovery_mode BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS discovery_intro_md TEXT;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS discovery_hint_md TEXT;

-- Cast visibility settings
ALTER TABLE stories ADD COLUMN IF NOT EXISTS show_cast_list BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS cast_preview_count INT NOT NULL DEFAULT 3;

-- MC replacement mode (if story has predefined MC character)
ALTER TABLE stories ADD COLUMN IF NOT EXISTS requires_mc_replacement BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS replacement_character_id VARCHAR(36) REFERENCES characters(id);

