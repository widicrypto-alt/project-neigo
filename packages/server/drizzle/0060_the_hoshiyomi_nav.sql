DO $$ BEGIN
 ALTER TABLE "chat_sessions" ADD COLUMN "is_pinned" boolean DEFAULT false NOT NULL;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;

DO $$ BEGIN
 ALTER TABLE "users" ADD COLUMN "ui_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
