-- Full-text search index on chat_messages.content
-- Uses a GIN index on to_tsvector for efficient text search across transcripts.
-- Supports both English and Indonesian via 'simple' config (language-agnostic tokenization).

CREATE INDEX CONCURRENTLY IF NOT EXISTS messages_content_fts_idx
  ON chat_messages
  USING GIN (to_tsvector('simple', content));
