-- Wk13 PLANv2 H1 — chat folders.
--
-- Simple one-level folder taxonomy (no nesting; mirrors Marinara's
-- behaviour per §2 bucket "folder/gallery"). Sessions link via an
-- optional folder_id on chat_sessions (ON DELETE SET NULL so a folder
-- delete never cascades to sessions).

CREATE TABLE IF NOT EXISTS chat_folders (
  id          varchar(36) PRIMARY KEY,
  user_id     varchar(36) NOT NULL
               REFERENCES users(id) ON DELETE CASCADE,
  name        varchar(80) NOT NULL,
  color       varchar(16),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS chat_folders_user_idx
  ON chat_folders(user_id, sort_order, created_at);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'chat_sessions' AND column_name = 'folder_id'
  ) THEN
    ALTER TABLE chat_sessions
      ADD COLUMN folder_id varchar(36)
        REFERENCES chat_folders(id) ON DELETE SET NULL;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS chat_sessions_folder_idx
  ON chat_sessions(folder_id);
