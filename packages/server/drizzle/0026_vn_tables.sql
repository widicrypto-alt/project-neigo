-- REDESIGNv2 D4a: Visual Novel dedicated tables.
-- stories / story_scenes / story_runs / story_character_refs.
-- Completely separate from chat_sessions — no join ever required.

-- 1. stories ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stories (
  id              VARCHAR(36)   PRIMARY KEY,
  title           VARCHAR(200)  NOT NULL,
  synopsis        TEXT,
  cover_image_url VARCHAR(500),
  language        VARCHAR(8)    NOT NULL DEFAULT 'id',
  author_id       VARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 'draft' | 'published' | 'featured' | 'archived'
  status          VARCHAR(20)   NOT NULL DEFAULT 'draft',
  -- 'kinetic' (MVP) | 'branching' (future) | 'open_ended' (future)
  mode            VARCHAR(20)   NOT NULL DEFAULT 'kinetic',
  -- 'FREE' | 'PAID' | 'FOUNDER'
  required_tier   VARCHAR(20)   NOT NULL DEFAULT 'FREE',
  -- [{characterId, displayName, role}] — denormalized for fast display
  "cast"          JSONB         NOT NULL DEFAULT '[]'::JSONB,
  -- opening_scene_id FK added via ALTER below after story_scenes exists
  opening_scene_id VARCHAR(36),
  -- {tags: string[], contentWarnings: string[], estimatedMinutes: number}
  metadata        JSONB         NOT NULL DEFAULT '{}'::JSONB,
  published_at    TIMESTAMP WITH TIME ZONE,
  created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stories_author_idx       ON stories(author_id, status, created_at);
CREATE INDEX IF NOT EXISTS stories_status_lang_idx  ON stories(status, language, created_at);

-- 2. story_scenes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS story_scenes (
  id                   VARCHAR(36)  PRIMARY KEY,
  story_id             VARCHAR(36)  NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  order_index          INTEGER      NOT NULL DEFAULT 0,
  title                VARCHAR(200),
  background_image_url VARCHAR(500),
  bgm_url              VARCHAR(500),
  opening_narration    TEXT,
  -- [{characterId, position: 'left'|'center'|'right', expression: string}]
  character_cues       JSONB        NOT NULL DEFAULT '[]'::JSONB,
  -- [{speakerCharacterId: string|null, text: string}] (null = narrator)
  dialogue_lines       JSONB        NOT NULL DEFAULT '[]'::JSONB,
  -- 'narration' | 'dialogue' | 'choice' | 'ending'
  scene_type           VARCHAR(20)  NOT NULL DEFAULT 'dialogue',
  -- kinetic: linear next pointer; null = end of story
  next_scene_id        VARCHAR(36),
  -- future branching: [{label, nextSceneId, conditionKey}]
  choices              JSONB        NOT NULL DEFAULT '[]'::JSONB,
  -- when scene_type='ending'
  ending_slug          VARCHAR(40),
  created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS story_scenes_story_order_idx ON story_scenes(story_id, order_index);

-- 3. Wire circular FK: stories.opening_scene_id → story_scenes.id ─────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'stories_opening_scene_fk'
      AND table_name = 'stories'
  ) THEN
    ALTER TABLE stories
      ADD CONSTRAINT stories_opening_scene_fk
      FOREIGN KEY (opening_scene_id) REFERENCES story_scenes(id) ON DELETE SET NULL;
  END IF;
END$$;

-- 4. story_runs (per-user reading progress) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS story_runs (
  id               VARCHAR(36)  PRIMARY KEY,
  user_id          VARCHAR(36)  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  story_id         VARCHAR(36)  NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  current_scene_id VARCHAR(36)  REFERENCES story_scenes(id) ON DELETE SET NULL,
  started_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_read_at     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMP WITH TIME ZONE,
  ending_reached   VARCHAR(40),
  reading_seconds  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (user_id, story_id)
);

CREATE INDEX IF NOT EXISTS story_runs_user_idx   ON story_runs(user_id, last_read_at);
CREATE INDEX IF NOT EXISTS story_runs_story_idx  ON story_runs(story_id);

-- 5. story_character_refs (cast link table) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS story_character_refs (
  story_id     VARCHAR(36) NOT NULL REFERENCES stories(id)     ON DELETE CASCADE,
  character_id VARCHAR(36) NOT NULL REFERENCES characters(id)  ON DELETE CASCADE,
  -- 'owned' | 'public' | 'builtin'
  source       VARCHAR(20) NOT NULL DEFAULT 'owned',
  PRIMARY KEY (story_id, character_id)
);

CREATE INDEX IF NOT EXISTS story_character_refs_char_idx ON story_character_refs(character_id);
