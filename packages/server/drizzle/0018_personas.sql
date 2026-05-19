-- Wk8 PLANv2 G1a — Personas (user-authored {{user}} profiles).
-- Each user can own multiple personas and flag one as `is_default`. A
-- session may pin a specific persona via chat_sessions.active_persona_id;
-- when null, the resolver falls back to users.display_name (see G2 macros).

CREATE TABLE IF NOT EXISTS "personas" (
    "id" varchar(36) PRIMARY KEY NOT NULL,
    "user_id" varchar(36) NOT NULL,
    "name" varchar(80) NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "avatar_url" varchar(500),
    "is_default" boolean NOT NULL DEFAULT false,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "personas_user_fk" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "personas_user_idx"
    ON "personas" ("user_id", "is_default" DESC, "created_at" DESC);

-- Enforce one default per user (partial unique index, NULL rows ignored).
CREATE UNIQUE INDEX IF NOT EXISTS "personas_one_default_per_user"
    ON "personas" ("user_id")
    WHERE "is_default" = true;

ALTER TABLE "chat_sessions"
    ADD COLUMN IF NOT EXISTS "active_persona_id" varchar(36);

-- Keep the FK loose with ON DELETE SET NULL so deleting a persona never
-- takes its sessions with it.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chat_sessions_active_persona_fk'
    ) THEN
        ALTER TABLE "chat_sessions"
            ADD CONSTRAINT "chat_sessions_active_persona_fk"
            FOREIGN KEY ("active_persona_id")
            REFERENCES "personas"("id")
            ON DELETE SET NULL;
    END IF;
END$$;

CREATE INDEX IF NOT EXISTS "chat_sessions_persona_idx"
    ON "chat_sessions" ("active_persona_id");
