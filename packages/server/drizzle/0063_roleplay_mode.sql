-- 0063_roleplay_mode.sql
-- 1. Delete STORY sessions that were created without a storyId
--    (these were character-only roleplay sessions mislabeled as STORY).
DELETE FROM chat_sessions
WHERE mode = 'STORY'
  AND (metadata IS NULL OR metadata->>'storyId' IS NULL OR metadata->>'storyId' = '');

-- 2. Fix characters stuck as private due to pending avatar moderation.
--    Moderation is disabled — publish all characters that were queued.
UPDATE characters
SET is_public = true,
    queued_for_publish = false,
    published_at = COALESCE(published_at, NOW()),
    updated_public_at = NOW()
WHERE queued_for_publish = true;
