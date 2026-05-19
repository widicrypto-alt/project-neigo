-- Migration: 0061_drop_legacy_story_social.sql
-- Drop legacy tables replaced by polymorphic reactions/comments (PLANIMPv7 cleanup)

DROP TABLE IF EXISTS story_reactions CASCADE;
DROP TABLE IF EXISTS story_comments CASCADE;
