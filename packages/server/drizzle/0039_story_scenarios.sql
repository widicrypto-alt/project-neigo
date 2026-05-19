-- PLANBv2 — reshape stories into "scenarios as chat seeds" + social.
-- All columns back-compat (defaults provided); existing rows untouched.

-- ─── story_scenes: upgrade to "scenario" shape ──────────────────────────────
ALTER TABLE story_scenes
  ADD COLUMN IF NOT EXISTS tile_image_url     varchar(500),
  ADD COLUMN IF NOT EXISTS tile_subtitle      varchar(200),
  ADD COLUMN IF NOT EXISTS tile_order         integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS persona_prompt     text,
  ADD COLUMN IF NOT EXISTS opening_input_hint varchar(240),
  ADD COLUMN IF NOT EXISTS cast_subset        jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS story_scenes_tile_order_idx
  ON story_scenes (story_id, tile_order);

-- ─── stories: discovery + social counters ───────────────────────────────────
ALTER TABLE stories
  ADD COLUMN IF NOT EXISTS tagline          varchar(200),
  ADD COLUMN IF NOT EXISTS tags             text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS hero_carousel    jsonb  NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS total_plays      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_chats      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_likes      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_bookmarks  integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hidden_count     integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS featured_at      timestamptz;

-- Trending ranking index (weighted). Chats count 2x plays because they're
-- higher-intent engagement.
CREATE INDEX IF NOT EXISTS stories_trending_idx
  ON stories (((total_plays + total_chats * 2)) DESC)
  WHERE status IN ('published', 'featured');

CREATE INDEX IF NOT EXISTS stories_featured_idx
  ON stories (featured_at DESC NULLS LAST)
  WHERE status IN ('published', 'featured');

-- ─── story_runs: scenario state + seeded chat session link ──────────────────
ALTER TABLE story_runs
  ADD COLUMN IF NOT EXISTS active_scenario_id   varchar(36),
  ADD COLUMN IF NOT EXISTS seeded_session_id    varchar(36),
  ADD COLUMN IF NOT EXISTS scenarios_completed  text[] NOT NULL DEFAULT '{}';

-- Soft FKs (no REFERENCES to avoid circular migration complexity; nullable).
CREATE INDEX IF NOT EXISTS story_runs_seeded_session_idx
  ON story_runs (seeded_session_id);

-- ─── story_reactions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_reactions (
  user_id     varchar(36) NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  story_id    varchar(36) NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  kind        varchar(20) NOT NULL CHECK (kind IN ('like','bookmark','gift_rose')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, story_id, kind)
);

CREATE INDEX IF NOT EXISTS story_reactions_story_idx
  ON story_reactions (story_id, kind);

-- ─── story_comments ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_comments (
  id            varchar(36) PRIMARY KEY,
  story_id      varchar(36) NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  user_id       varchar(36) NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  parent_id     varchar(36) REFERENCES story_comments(id)   ON DELETE CASCADE,
  body          text NOT NULL,
  upvotes       integer NOT NULL DEFAULT 0,
  downvotes     integer NOT NULL DEFAULT 0,
  creator_flag  boolean NOT NULL DEFAULT false,
  is_deleted    boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS story_comments_story_idx
  ON story_comments (story_id, created_at DESC);

CREATE INDEX IF NOT EXISTS story_comments_parent_idx
  ON story_comments (parent_id);
