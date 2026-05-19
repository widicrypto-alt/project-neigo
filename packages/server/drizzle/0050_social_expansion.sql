-- PLANIMPv7 additions: followers, story views, rating reviews, comment votes, soft-delete, moderation state.

-- Story view counter (separate from plays).
ALTER TABLE stories ADD COLUMN IF NOT EXISTS total_views integer NOT NULL DEFAULT 0;

-- Rating review text (PLANIMPv1 §4.3).
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS review_md text;
ALTER TABLE ratings ADD COLUMN IF NOT EXISTS review_html text;

-- Moderation state: flagged visibility gate (PLANIMPv7 §2).
ALTER TABLE characters ADD COLUMN IF NOT EXISTS is_flagged_for_review boolean NOT NULL DEFAULT false;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS is_flagged_for_review boolean NOT NULL DEFAULT false;

-- Soft-delete 14-day retention (PLANIMPv7 §7).
ALTER TABLE characters ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE stories ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Followers table (PLANIMPv7 §4).
CREATE TABLE IF NOT EXISTS followers (
  follower_user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_user_id varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_user_id, followed_user_id),
  CHECK (follower_user_id <> followed_user_id)
);
CREATE INDEX IF NOT EXISTS followers_followed_idx ON followers(followed_user_id);
CREATE INDEX IF NOT EXISTS followers_follower_idx ON followers(follower_user_id);

-- Derived counts on users (PLANIMPv7 §4).
ALTER TABLE users ADD COLUMN IF NOT EXISTS follower_count integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS following_count integer NOT NULL DEFAULT 0;

-- Moderation audit log (PLANIMPv7 §2.3).
CREATE TABLE IF NOT EXISTS moderation_actions (
  id varchar(36) PRIMARY KEY,
  admin_user_id varchar(36) REFERENCES users(id) ON DELETE SET NULL,
  entity_type varchar(16) NOT NULL,
  entity_id varchar(36) NOT NULL,
  action varchar(24) NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS moderation_actions_entity_idx ON moderation_actions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS moderation_actions_admin_idx ON moderation_actions(admin_user_id);
ALTER TABLE moderation_actions ALTER COLUMN admin_user_id DROP NOT NULL;

-- Story update summary view — latestVersion label for detail page.
CREATE OR REPLACE VIEW story_updates_summary AS
SELECT
  s.id AS story_id,
  COALESCE((SELECT MAX(version) FROM content_revisions WHERE entity_type = 'story' AND entity_id = s.id), 1) AS latest_version,
  COALESCE((SELECT MAX(created_at) FROM content_revisions WHERE entity_type = 'story' AND entity_id = s.id), s.updated_at) AS latest_update_at
FROM stories s;
