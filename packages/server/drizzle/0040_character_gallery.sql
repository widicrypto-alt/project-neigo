-- PLANBv3 H4 — Character galleries.
-- Multi-image gallery per character with R2-backed uploads and
-- moderation gate. See PLANBv3.md §3.

CREATE TABLE IF NOT EXISTS character_images (
  id                varchar(36) PRIMARY KEY,
  character_id      varchar(36) NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  user_id           varchar(36) NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
  kind              varchar(16) NOT NULL DEFAULT 'portrait'
                    CHECK (kind IN ('avatar','portrait','scene','expression','ref')),
  r2_key            varchar(256) NOT NULL,
  url               varchar(500) NOT NULL,
  width             integer NOT NULL DEFAULT 0,
  height            integer NOT NULL DEFAULT 0,
  bytes             integer NOT NULL DEFAULT 0,
  mime              varchar(32) NOT NULL DEFAULT 'image/webp',
  alt               varchar(500),
  caption           varchar(500),
  nsfw              boolean NOT NULL DEFAULT false,
  moderation_status varchar(16) NOT NULL DEFAULT 'pending'
                    CHECK (moderation_status IN ('pending','approved','rejected','needs_review')),
  moderation_reason varchar(500),
  moderation_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  perceptual_hash   varchar(64),
  order_index       integer NOT NULL DEFAULT 0,
  is_primary        boolean NOT NULL DEFAULT false,
  metadata          jsonb  NOT NULL DEFAULT '{}'::jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS character_images_char_order_idx
  ON character_images(character_id, order_index);
CREATE UNIQUE INDEX IF NOT EXISTS character_images_primary_idx
  ON character_images(character_id)
  WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS character_images_moderation_idx
  ON character_images(moderation_status);
CREATE INDEX IF NOT EXISTS character_images_user_idx
  ON character_images(user_id, created_at DESC);

-- Rate-limit helper: daily byte quota per user.
CREATE TABLE IF NOT EXISTS character_image_quota (
  user_id   varchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day       date        NOT NULL,
  bytes_used bigint     NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);
