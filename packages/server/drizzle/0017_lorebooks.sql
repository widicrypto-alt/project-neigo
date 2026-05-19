-- Wk3 PLANv2 §4 F1 — Lorebooks v1 (keyword-triggered world entries).
-- Defers pgvector embedding column to wk5 (F1b chunked RAG).

CREATE TABLE IF NOT EXISTS "lorebooks" (
    "id" varchar(36) PRIMARY KEY NOT NULL,
    "user_id" varchar(36) NOT NULL,
    "name" varchar(120) NOT NULL,
    "description" text,
    -- 'USER' = auto-attached to every new session by default (user-owned world);
    -- 'SESSION' = only active when explicitly linked via session_lorebook_links.
    "scope" varchar(20) NOT NULL DEFAULT 'USER',
    "is_enabled" boolean NOT NULL DEFAULT true,
    -- Soft per-book token budget used by the retriever when packing entries.
    "token_budget" integer NOT NULL DEFAULT 1500,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "lorebooks_user_fk" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "lorebooks_user_idx"
    ON "lorebooks" ("user_id", "scope", "created_at" DESC);

CREATE TABLE IF NOT EXISTS "lorebook_entries" (
    "id" varchar(36) PRIMARY KEY NOT NULL,
    "lorebook_id" varchar(36) NOT NULL,
    "title" varchar(200) NOT NULL,
    "content" text NOT NULL,
    -- Matching keywords / keyphrases. Case-insensitive whole-word scan.
    "keywords" text[] NOT NULL DEFAULT ARRAY[]::text[],
    -- Higher priority wins tie-breaks during token packing (0..100).
    "priority" integer NOT NULL DEFAULT 50,
    -- Injection depth: 1 = right before last user msg, 2 = system tail, etc.
    "depth" integer NOT NULL DEFAULT 2,
    "enabled" boolean NOT NULL DEFAULT true,
    "token_estimate" integer NOT NULL DEFAULT 0,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "lorebook_entries_book_fk" FOREIGN KEY ("lorebook_id")
        REFERENCES "lorebooks"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "lorebook_entries_book_idx"
    ON "lorebook_entries" ("lorebook_id", "enabled", "priority" DESC);

-- Per-session attached lorebooks (many-to-many). Session-scope books are
-- attached here; user-scope books load automatically via user_id lookup.
CREATE TABLE IF NOT EXISTS "session_lorebook_links" (
    "session_id" varchar(36) NOT NULL,
    "lorebook_id" varchar(36) NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "session_lorebook_links_pk" PRIMARY KEY ("session_id", "lorebook_id"),
    CONSTRAINT "session_lorebook_links_session_fk" FOREIGN KEY ("session_id")
        REFERENCES "chat_sessions"("id") ON DELETE CASCADE,
    CONSTRAINT "session_lorebook_links_book_fk" FOREIGN KEY ("lorebook_id")
        REFERENCES "lorebooks"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "session_lorebook_links_book_idx"
    ON "session_lorebook_links" ("lorebook_id");
