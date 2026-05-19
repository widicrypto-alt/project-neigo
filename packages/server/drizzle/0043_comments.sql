-- PLANIMPv1 §4.2 — polymorphic threaded comments (character | story).
CREATE TABLE IF NOT EXISTS comments (
  id              VARCHAR(36) PRIMARY KEY,
  entity_type     VARCHAR(16) NOT NULL,
  entity_id       VARCHAR(36) NOT NULL,
  parent_id       VARCHAR(36) REFERENCES comments(id) ON DELETE CASCADE,
  author_id       VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body_md         TEXT NOT NULL,
  body_html       TEXT NOT NULL DEFAULT '',
  edited_at       TIMESTAMPTZ,
  deleted_at      TIMESTAMPTZ,
  upvotes         INTEGER NOT NULL DEFAULT 0,
  downvotes       INTEGER NOT NULL DEFAULT 0,
  pinned_by_owner BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS comments_entity_idx
  ON comments(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_parent_idx    ON comments(parent_id);
CREATE INDEX IF NOT EXISTS comments_author_idx    ON comments(author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comment_votes (
  comment_id VARCHAR(36) NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
  user_id    VARCHAR(36) NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  vote       SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (comment_id, user_id)
);

ALTER TABLE comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_votes  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comments_public_read ON comments;
CREATE POLICY comments_public_read ON comments
  FOR SELECT USING (deleted_at IS NULL);
DROP POLICY IF EXISTS comments_author_write ON comments;
CREATE POLICY comments_author_write ON comments
  FOR ALL USING (author_id = current_setting('app.user_id', true)::varchar);
DROP POLICY IF EXISTS comment_votes_own ON comment_votes;
CREATE POLICY comment_votes_own ON comment_votes
  FOR ALL USING (user_id = current_setting('app.user_id', true)::varchar);
