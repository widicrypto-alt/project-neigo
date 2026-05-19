CREATE TABLE "agent_configs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"type" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"phase" varchar(24) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"connection_id" varchar(36),
	"prompt_template" text DEFAULT '' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_builtin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"agent_config_id" varchar(36) NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"turn_index" integer NOT NULL,
	"outcome" varchar(16) DEFAULT 'pass' NOT NULL,
	"result_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tokens_in" integer,
	"tokens_out" integer,
	"latency_ms" integer,
	"shadow" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"user_id" varchar(36),
	"entity_type" varchar(16),
	"entity_id" varchar(36),
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_usage" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"model" varchar(100) NOT NULL,
	"prompt_tokens" integer NOT NULL,
	"completion_tokens" integer NOT NULL,
	"total_tokens" integer NOT NULL,
	"cost_cents" integer NOT NULL,
	"endpoint" varchar(100),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cast_relationships" (
	"session_id" varchar(36) NOT NULL,
	"char_a_id" varchar(36) NOT NULL,
	"char_b_id" varchar(36) NOT NULL,
	"relationship_type" varchar(50) NOT NULL,
	"affinity" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "cast_relationships_session_id_char_a_id_char_b_id_pk" PRIMARY KEY("session_id","char_a_id","char_b_id")
);
--> statement-breakpoint
CREATE TABLE "character_diary" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"character_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"turn_range_start" integer NOT NULL,
	"turn_range_end" integer NOT NULL,
	"entry" text NOT NULL,
	"mood" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_dynamic_states" (
	"session_id" varchar(36) NOT NULL,
	"character_id" varchar(36) NOT NULL,
	"mood" varchar(30) DEFAULT 'NEUTRAL' NOT NULL,
	"stagnation" integer DEFAULT 0 NOT NULL,
	"jealousy" integer DEFAULT 0 NOT NULL,
	"drift_score" real DEFAULT 0 NOT NULL,
	"trust_score" integer DEFAULT 0 NOT NULL,
	"last_relationship_stage" varchar(30) DEFAULT 'STRANGER' NOT NULL,
	"repetition_score" real DEFAULT 0 NOT NULL,
	"tone_drift" real DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "character_dynamic_states_session_id_character_id_pk" PRIMARY KEY("session_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "character_facts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"character_id" varchar(36) NOT NULL,
	"subject" text NOT NULL,
	"predicate" text NOT NULL,
	"object" text NOT NULL,
	"confidence" real DEFAULT 1 NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_to" timestamp with time zone,
	"version_of" varchar(36),
	"source_message_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_image_quota" (
	"user_id" varchar(36) NOT NULL,
	"day" date NOT NULL,
	"bytes_used" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "character_image_quota_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
CREATE TABLE "character_images" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"character_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"kind" varchar(16) DEFAULT 'portrait' NOT NULL,
	"r2_key" varchar(256) NOT NULL,
	"url" varchar(500) NOT NULL,
	"width" integer DEFAULT 0 NOT NULL,
	"height" integer DEFAULT 0 NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"mime" varchar(32) DEFAULT 'image/webp' NOT NULL,
	"alt" varchar(500),
	"caption" varchar(500),
	"nsfw" boolean DEFAULT false NOT NULL,
	"moderation_status" varchar(16) DEFAULT 'pending' NOT NULL,
	"moderation_reason" varchar(500),
	"moderation_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"perceptual_hash" varchar(64),
	"order_index" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_mode_profiles" (
	"character_id" varchar(36) NOT NULL,
	"mode" varchar(20) NOT NULL,
	"personality_override" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "character_mode_profiles_character_id_mode_pk" PRIMARY KEY("character_id","mode")
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"owner_id" varchar(36),
	"name" varchar(200) NOT NULL,
	"avatar_url" varchar(500),
	"persona" jsonb NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"folder" varchar(120),
	"tone_preset" varchar(30) DEFAULT 'NONE' NOT NULL,
	"is_built_in" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"chapter" integer,
	"gender" varchar(1),
	"age" integer,
	"discover_order" integer,
	"language" varchar(8) DEFAULT 'id' NOT NULL,
	"languages_spoken" jsonb DEFAULT '["id"]'::jsonb NOT NULL,
	"is_retired" boolean DEFAULT false NOT NULL,
	"allow_in_stories" boolean DEFAULT true NOT NULL,
	"slug" varchar(120),
	"tagline" varchar(200),
	"description_md" text,
	"description_html" text,
	"lore_sections_md" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"example_dialog_md" text,
	"example_dialog_html" text,
	"is_secret_prompt_hidden" boolean DEFAULT false NOT NULL,
	"persona_md" jsonb,
	"token_count_cache" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_views" integer DEFAULT 0 NOT NULL,
	"total_chats" integer DEFAULT 0 NOT NULL,
	"total_likes" integer DEFAULT 0 NOT NULL,
	"total_bookmarks" integer DEFAULT 0 NOT NULL,
	"total_ratings" integer DEFAULT 0 NOT NULL,
	"avg_stars" real DEFAULT 0 NOT NULL,
	"total_comments" integer DEFAULT 0 NOT NULL,
	"total_roses" integer DEFAULT 0 NOT NULL,
	"is_flagged_for_review" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"updated_public_at" timestamp with time zone,
	"queued_for_publish" boolean DEFAULT false NOT NULL,
	"content_rating" varchar(10) DEFAULT 'SFW' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_folders" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" varchar(80) NOT NULL,
	"color" varchar(16),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"turn_index" integer NOT NULL,
	"role" varchar(20) NOT NULL,
	"speaker_type" varchar(20) NOT NULL,
	"speaker_id" varchar(36),
	"content" text NOT NULL,
	"pass_type" varchar(30),
	"pass_index" integer,
	"reaction" varchar(50),
	"is_starred" boolean DEFAULT false NOT NULL,
	"is_instant" boolean DEFAULT false NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"reply_to_message_id" varchar(36),
	"turn_id" varchar(36),
	"feedback_tag" varchar(50),
	"swipe_root" varchar(36),
	"swipe_index" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"character_id" varchar(36) NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"mode" varchar(20) NOT NULL,
	"title" varchar(300) DEFAULT '' NOT NULL,
	"scene_card" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cast_character_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"arc_id" varchar(36),
	"auto_mood_enabled" boolean DEFAULT true NOT NULL,
	"turn_count" integer DEFAULT 0 NOT NULL,
	"drama_intensity" integer DEFAULT 1 NOT NULL,
	"last_context_tokens" integer DEFAULT 0 NOT NULL,
	"mood_state" varchar(30) DEFAULT 'NEUTRAL' NOT NULL,
	"narrator_voice" varchar(30) DEFAULT 'CINEMATIC' NOT NULL,
	"rag_enabled" boolean DEFAULT true NOT NULL,
	"session_date" varchar(20),
	"session_time" varchar(20),
	"debate_phase" varchar(20) DEFAULT 'OPENING' NOT NULL,
	"chat_progression_mode" varchar(30) DEFAULT 'APPROACH' NOT NULL,
	"ai_model" varchar(120) DEFAULT 'HERMES_4_405B' NOT NULL,
	"unresolved_beat" text,
	"latent_question" text,
	"callback_candidate" text,
	"mood_noise" real DEFAULT 0 NOT NULL,
	"active_persona_id" varchar(36),
	"active_preset_id" varchar(36),
	"folder_id" varchar(36),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comment_votes" (
	"comment_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"vote" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_votes_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"entity_type" varchar(16) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"parent_id" varchar(36),
	"author_id" varchar(36) NOT NULL,
	"body_md" text NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"pinned_by_owner" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_reports" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"entity_type" varchar(16) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"reporter_id" varchar(36) NOT NULL,
	"category" varchar(32) NOT NULL,
	"detail" varchar(1000),
	"status" varchar(16) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewer_id" varchar(36)
);
--> statement-breakpoint
CREATE TABLE "content_revisions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"entity_type" varchar(16) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"field_key" varchar(40) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"author_id" varchar(36) NOT NULL,
	"summary" varchar(200),
	"content_md" text NOT NULL,
	"content_html" text DEFAULT '' NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_translations" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"entity_type" varchar(16) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"field_key" varchar(40) NOT NULL,
	"source_lang" varchar(8) NOT NULL,
	"target_lang" varchar(8) NOT NULL,
	"source_hash" varchar(40) DEFAULT '' NOT NULL,
	"content_md" text NOT NULL,
	"content_html" text DEFAULT '' NOT NULL,
	"cost_usd" real DEFAULT 0 NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_blobs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"mime_type" varchar(128) DEFAULT 'text/plain' NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_ref" text NOT NULL,
	"digest" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_node_sources" (
	"context_node_id" varchar(36) NOT NULL,
	"source_type" varchar(16) NOT NULL,
	"source_id" varchar(36) NOT NULL,
	"range_start" integer,
	"range_end" integer,
	CONSTRAINT "context_node_sources_context_node_id_source_type_source_id_pk" PRIMARY KEY("context_node_id","source_type","source_id")
);
--> statement-breakpoint
CREATE TABLE "context_nodes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"parent_id" varchar(36),
	"depth" integer DEFAULT 0 NOT NULL,
	"turn_start" integer NOT NULL,
	"turn_end" integer NOT NULL,
	"summary" text NOT NULL,
	"salience" real DEFAULT 0.5 NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"blob_ref" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discover_scores" (
	"entity_type" varchar(16) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"score" real DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "discover_scores_entity_type_entity_id_pk" PRIMARY KEY("entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "followers" (
	"follower_user_id" varchar(36) NOT NULL,
	"followed_user_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "followers_follower_user_id_followed_user_id_pk" PRIMARY KEY("follower_user_id","followed_user_id")
);
--> statement-breakpoint
CREATE TABLE "group_activities" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"activity_type" varchar(50) NOT NULL,
	"participants" jsonb NOT NULL,
	"outcome" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "handoff_tokens" (
	"token" varchar(48) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"session_id" varchar(36),
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "harem_stats" (
	"session_id" varchar(36) NOT NULL,
	"character_id" varchar(36) NOT NULL,
	"affection" integer DEFAULT 500 NOT NULL,
	"loyalty" integer DEFAULT 500 NOT NULL,
	"jealousy" integer DEFAULT 0 NOT NULL,
	"voice_score" real DEFAULT 0.5 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "harem_stats_session_id_character_id_pk" PRIMARY KEY("session_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "learner_profiles" (
	"user_id" varchar(36) PRIMARY KEY NOT NULL,
	"target_language" varchar(30) NOT NULL,
	"level" varchar(20) NOT NULL,
	"goals" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_materials" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"topic" varchar(200) NOT NULL,
	"content" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "letters" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"character_id" varchar(36) NOT NULL,
	"user_text" text NOT NULL,
	"reply_text" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deliver_at" timestamp with time zone NOT NULL,
	"delivered_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lorebook_entries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"lorebook_id" varchar(36) NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"keywords" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"priority" integer DEFAULT 50 NOT NULL,
	"depth" integer DEFAULT 2 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"token_estimate" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lorebooks" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"scope" varchar(20) DEFAULT 'USER' NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"token_budget" integer DEFAULT 1500 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"character_id" varchar(36),
	"session_id" varchar(36),
	"type" varchar(30) NOT NULL,
	"category" varchar(30) DEFAULT 'GENERAL' NOT NULL,
	"content" text NOT NULL,
	"emotional_tag" varchar(50),
	"scope_character_id" varchar(36),
	"is_milestone" boolean DEFAULT false NOT NULL,
	"is_episodic" boolean DEFAULT false NOT NULL,
	"chat_mode" varchar(20),
	"importance" real DEFAULT 0.5 NOT NULL,
	"access_count" integer DEFAULT 0 NOT NULL,
	"last_accessed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_graph_edges" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"from_node_id" varchar(36) NOT NULL,
	"to_node_id" varchar(36) NOT NULL,
	"predicate" varchar(64) NOT NULL,
	"valid_from" timestamp with time zone,
	"valid_to" timestamp with time zone,
	"confidence" real DEFAULT 1 NOT NULL,
	"source_message_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_graph_nodes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"kind" varchar(32) NOT NULL,
	"canonical_name" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mistake_logs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"session_id" varchar(36),
	"mistake" text NOT NULL,
	"correction" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "moderation_actions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"admin_user_id" varchar(36),
	"entity_type" varchar(16) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"action" varchar(24) NOT NULL,
	"reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"avatar_url" varchar(500),
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_presets" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"system_prelude" text DEFAULT '' NOT NULL,
	"authors_note" text DEFAULT '' NOT NULL,
	"temperature" real,
	"top_p" real,
	"is_default" boolean DEFAULT false NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"preset_mode" varchar(16) DEFAULT 'legacy' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "prompt_snapshots" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"character_id" varchar(36),
	"turn_id" varchar(36) NOT NULL,
	"turn_index" integer,
	"model_slug" varchar(120) NOT NULL,
	"messages" jsonb NOT NULL,
	"sampling" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"total_chars" integer DEFAULT 0 NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"entity_type" varchar(16) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"stars" integer NOT NULL,
	"review_md" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_entity_type_entity_id_user_id_pk" PRIMARY KEY("entity_type","entity_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "reactions" (
	"entity_type" varchar(16) NOT NULL,
	"entity_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_entity_type_entity_id_user_id_kind_pk" PRIMARY KEY("entity_type","entity_id","user_id","kind")
);
--> statement-breakpoint
CREATE TABLE "regex_scripts" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"scope" varchar(16) NOT NULL,
	"scope_id" varchar(36),
	"name" varchar(200) NOT NULL,
	"find_regex" text NOT NULL,
	"replace_string" text DEFAULT '' NOT NULL,
	"trim_strings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"placement" varchar(20) NOT NULL,
	"flags" varchar(8) DEFAULT 'g' NOT NULL,
	"prompt_only" boolean DEFAULT false NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"min_depth" integer,
	"max_depth" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scene_templates" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"owner_id" varchar(36),
	"name" varchar(200) NOT NULL,
	"setup" jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_context_state" (
	"session_id" varchar(36) PRIMARY KEY NOT NULL,
	"last_compacted_turn" integer DEFAULT 0 NOT NULL,
	"maintenance_debt" integer DEFAULT 0 NOT NULL,
	"snapshot_fresh_at" timestamp with time zone,
	"wake_up_packet" jsonb,
	"frontier_depth" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_events" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"character_id" varchar(36),
	"event_type" varchar(30) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"turn_index" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_lorebook_links" (
	"session_id" varchar(36) NOT NULL,
	"lorebook_id" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_lorebook_links_session_id_lorebook_id_pk" PRIMARY KEY("session_id","lorebook_id")
);
--> statement-breakpoint
CREATE TABLE "session_mistakes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"turn_index" integer NOT NULL,
	"kind" text NOT NULL,
	"excerpt" text NOT NULL,
	"correction" text NOT NULL,
	"resolved_in_turn" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_schedules" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"cadence" varchar(12) DEFAULT 'once' NOT NULL,
	"fire_at" timestamp with time zone NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"tz" varchar(64) DEFAULT 'UTC' NOT NULL,
	"hour" integer,
	"minute" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_fired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stories" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"title" varchar(200) NOT NULL,
	"synopsis" text,
	"cover_image_url" varchar(500),
	"language" varchar(8) DEFAULT 'id' NOT NULL,
	"author_id" varchar(36) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"mode" varchar(20) DEFAULT 'kinetic' NOT NULL,
	"required_tier" varchar(20) DEFAULT 'FREE' NOT NULL,
	"cast" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"opening_scene_id" varchar(36),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tagline" varchar(200),
	"tags" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"hero_carousel" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_plays" integer DEFAULT 0 NOT NULL,
	"total_chats" integer DEFAULT 0 NOT NULL,
	"total_views" integer DEFAULT 0 NOT NULL,
	"total_likes" integer DEFAULT 0 NOT NULL,
	"total_bookmarks" integer DEFAULT 0 NOT NULL,
	"hidden_count" integer DEFAULT 0 NOT NULL,
	"featured_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"slug" varchar(120),
	"plot_md" text,
	"plot_html" text,
	"ai_plot_md" text,
	"ai_plot_html" text,
	"ai_guidelines_md" text,
	"ai_reminder_md" text,
	"output_reminder_md" text,
	"is_advanced_mode" boolean DEFAULT false NOT NULL,
	"is_secret_mode" boolean DEFAULT false NOT NULL,
	"is_adult_18plus" boolean DEFAULT false NOT NULL,
	"contains_minors" boolean DEFAULT false NOT NULL,
	"play_as_character_id" varchar(36),
	"dungeon_mind_enabled" boolean DEFAULT false NOT NULL,
	"opening_quote" varchar(280),
	"opening_quote_by" varchar(120),
	"total_comments" integer DEFAULT 0 NOT NULL,
	"total_ratings" integer DEFAULT 0 NOT NULL,
	"avg_stars" real DEFAULT 0 NOT NULL,
	"total_roses" integer DEFAULT 0 NOT NULL,
	"vn_fg_count" integer DEFAULT 0 NOT NULL,
	"vn_bg_count" integer DEFAULT 0 NOT NULL,
	"vn_readiness_pct" real DEFAULT 0 NOT NULL,
	"is_flagged_for_review" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_public_at" timestamp with time zone,
	"token_count_cache" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"has_mc_slot" boolean DEFAULT true NOT NULL,
	"mc_slot_display_name" varchar(100),
	"discovery_mode" boolean DEFAULT true NOT NULL,
	"discovery_intro_md" text,
	"discovery_hint_md" text,
	"show_cast_list" boolean DEFAULT true NOT NULL,
	"cast_preview_count" integer DEFAULT 3 NOT NULL,
	"requires_mc_replacement" boolean DEFAULT false NOT NULL,
	"replacement_character_id" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_arcs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"session_id" varchar(36) NOT NULL,
	"name" varchar(200) NOT NULL,
	"stage" varchar(50) NOT NULL,
	"triggers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"progress" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_cast_encounters" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"progress_id" varchar(36) NOT NULL,
	"character_id" varchar(36) NOT NULL,
	"first_met_at" timestamp with time zone DEFAULT now() NOT NULL,
	"encounter_count" integer DEFAULT 1 NOT NULL,
	"last_interaction_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_impression" varchar(50),
	"trust_delta" integer DEFAULT 0 NOT NULL,
	"affection_delta" integer DEFAULT 0 NOT NULL,
	"tension_delta" integer DEFAULT 0 NOT NULL,
	"first_meeting_scene" text,
	"first_meeting_mood" varchar(50),
	"user_notes" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_cast_progress" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"story_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"session_id" varchar(36),
	"mc_profile_id" varchar(36),
	"met_character_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"total_cast_count" integer DEFAULT 0 NOT NULL,
	"met_count" integer DEFAULT 0 NOT NULL,
	"first_met_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_complete" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_character_refs" (
	"story_id" varchar(36) NOT NULL,
	"character_id" varchar(36) NOT NULL,
	"source" varchar(20) DEFAULT 'owned' NOT NULL,
	CONSTRAINT "story_character_refs_story_id_character_id_pk" PRIMARY KEY("story_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "story_comments" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"story_id" varchar(36) NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"parent_id" varchar(36),
	"body" text NOT NULL,
	"upvotes" integer DEFAULT 0 NOT NULL,
	"downvotes" integer DEFAULT 0 NOT NULL,
	"creator_flag" boolean DEFAULT false NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_reactions" (
	"user_id" varchar(36) NOT NULL,
	"story_id" varchar(36) NOT NULL,
	"kind" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "story_reactions_user_id_story_id_kind_pk" PRIMARY KEY("user_id","story_id","kind")
);
--> statement-breakpoint
CREATE TABLE "story_runs" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"story_id" varchar(36) NOT NULL,
	"current_scene_id" varchar(36),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"ending_reached" varchar(40),
	"reading_seconds" integer DEFAULT 0 NOT NULL,
	"active_scenario_id" varchar(36),
	"seeded_session_id" varchar(36),
	"scenarios_completed" text[] DEFAULT ARRAY[]::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_scenes" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"story_id" varchar(36) NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"title" varchar(200),
	"background_image_url" varchar(500),
	"bgm_url" varchar(500),
	"opening_narration" text,
	"character_cues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dialogue_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"scene_type" varchar(20) DEFAULT 'dialogue' NOT NULL,
	"next_scene_id" varchar(36),
	"choices" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ending_slug" varchar(40),
	"tile_image_url" varchar(500),
	"tile_subtitle" varchar(200),
	"tile_order" integer DEFAULT 0 NOT NULL,
	"persona_prompt" text,
	"opening_input_hint" varchar(240),
	"cast_subset" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"token_count" integer DEFAULT 0 NOT NULL,
	"opening_md" text,
	"opening_html" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"tier" varchar(20) NOT NULL,
	"stripe_subscription_id" varchar(255),
	"status" varchar(20) NOT NULL,
	"current_period_start" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_mc_profiles" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"name" varchar(100) NOT NULL,
	"avatar_url" varchar(500),
	"persona" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"display_name" varchar(100) NOT NULL,
	"avatar_url" varchar(500),
	"profile_age" integer,
	"profile_gender" varchar(30),
	"profile_pronouns" varchar(40),
	"profile_bio" text,
	"tier" varchar(20) DEFAULT 'FREE' NOT NULL,
	"tier_expires_at" timestamp with time zone,
	"stripe_customer_id" varchar(255),
	"nsfw_enabled" boolean DEFAULT false NOT NULL,
	"age_confirmed" boolean DEFAULT false NOT NULL,
	"age_confirmed_at" timestamp with time zone,
	"is_founding_reader" boolean DEFAULT true NOT NULL,
	"push_opt_out" boolean DEFAULT false NOT NULL,
	"last_push_sent_at" timestamp with time zone,
	"byok_or_key_enc" text,
	"byok_model" varchar(120),
	"ui_preferences" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"follower_count" integer DEFAULT 0 NOT NULL,
	"following_count" integer DEFAULT 0 NOT NULL,
	"handle" varchar(40),
	"profile_is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "world_bible_entries" (
	"id" varchar(36) PRIMARY KEY NOT NULL,
	"owner_id" varchar(36) NOT NULL,
	"title" varchar(200) NOT NULL,
	"content" text NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_configs" ADD CONSTRAINT "agent_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_agent_config_id_agent_configs_id_fk" FOREIGN KEY ("agent_config_id") REFERENCES "public"."agent_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cast_relationships" ADD CONSTRAINT "cast_relationships_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cast_relationships" ADD CONSTRAINT "cast_relationships_char_a_id_characters_id_fk" FOREIGN KEY ("char_a_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cast_relationships" ADD CONSTRAINT "cast_relationships_char_b_id_characters_id_fk" FOREIGN KEY ("char_b_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_diary" ADD CONSTRAINT "character_diary_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_diary" ADD CONSTRAINT "character_diary_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_diary" ADD CONSTRAINT "character_diary_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_dynamic_states" ADD CONSTRAINT "character_dynamic_states_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_dynamic_states" ADD CONSTRAINT "character_dynamic_states_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_facts" ADD CONSTRAINT "character_facts_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_facts" ADD CONSTRAINT "character_facts_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_image_quota" ADD CONSTRAINT "character_image_quota_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_images" ADD CONSTRAINT "character_images_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_images" ADD CONSTRAINT "character_images_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_mode_profiles" ADD CONSTRAINT "character_mode_profiles_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_folders" ADD CONSTRAINT "chat_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_revisions" ADD CONSTRAINT "content_revisions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_blobs" ADD CONSTRAINT "context_blobs_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_node_sources" ADD CONSTRAINT "context_node_sources_context_node_id_context_nodes_id_fk" FOREIGN KEY ("context_node_id") REFERENCES "public"."context_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_nodes" ADD CONSTRAINT "context_nodes_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followers" ADD CONSTRAINT "followers_follower_user_id_users_id_fk" FOREIGN KEY ("follower_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followers" ADD CONSTRAINT "followers_followed_user_id_users_id_fk" FOREIGN KEY ("followed_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_activities" ADD CONSTRAINT "group_activities_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_tokens" ADD CONSTRAINT "handoff_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoff_tokens" ADD CONSTRAINT "handoff_tokens_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harem_stats" ADD CONSTRAINT "harem_stats_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harem_stats" ADD CONSTRAINT "harem_stats_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_profiles" ADD CONSTRAINT "learner_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_materials" ADD CONSTRAINT "learning_materials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "letters" ADD CONSTRAINT "letters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lorebook_entries" ADD CONSTRAINT "lorebook_entries_lorebook_id_lorebooks_id_fk" FOREIGN KEY ("lorebook_id") REFERENCES "public"."lorebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lorebooks" ADD CONSTRAINT "lorebooks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_graph_edges" ADD CONSTRAINT "memory_graph_edges_from_node_id_memory_graph_nodes_id_fk" FOREIGN KEY ("from_node_id") REFERENCES "public"."memory_graph_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_graph_edges" ADD CONSTRAINT "memory_graph_edges_to_node_id_memory_graph_nodes_id_fk" FOREIGN KEY ("to_node_id") REFERENCES "public"."memory_graph_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_graph_edges" ADD CONSTRAINT "memory_graph_edges_source_message_id_chat_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."chat_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_graph_nodes" ADD CONSTRAINT "memory_graph_nodes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mistake_logs" ADD CONSTRAINT "mistake_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mistake_logs" ADD CONSTRAINT "mistake_logs_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "moderation_actions" ADD CONSTRAINT "moderation_actions_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personas" ADD CONSTRAINT "personas_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_presets" ADD CONSTRAINT "prompt_presets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_snapshots" ADD CONSTRAINT "prompt_snapshots_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_snapshots" ADD CONSTRAINT "prompt_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reactions" ADD CONSTRAINT "reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "regex_scripts" ADD CONSTRAINT "regex_scripts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scene_templates" ADD CONSTRAINT "scene_templates_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_context_state" ADD CONSTRAINT "session_context_state_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_lorebook_links" ADD CONSTRAINT "session_lorebook_links_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_lorebook_links" ADD CONSTRAINT "session_lorebook_links_lorebook_id_lorebooks_id_fk" FOREIGN KEY ("lorebook_id") REFERENCES "public"."lorebooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_mistakes" ADD CONSTRAINT "session_mistakes_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_schedules" ADD CONSTRAINT "session_schedules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_schedules" ADD CONSTRAINT "session_schedules_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stories" ADD CONSTRAINT "stories_replacement_character_id_characters_id_fk" FOREIGN KEY ("replacement_character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_arcs" ADD CONSTRAINT "story_arcs_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_cast_encounters" ADD CONSTRAINT "story_cast_encounters_progress_id_story_cast_progress_id_fk" FOREIGN KEY ("progress_id") REFERENCES "public"."story_cast_progress"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_cast_encounters" ADD CONSTRAINT "story_cast_encounters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_cast_progress" ADD CONSTRAINT "story_cast_progress_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_cast_progress" ADD CONSTRAINT "story_cast_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_character_refs" ADD CONSTRAINT "story_character_refs_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_character_refs" ADD CONSTRAINT "story_character_refs_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_comments" ADD CONSTRAINT "story_comments_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_comments" ADD CONSTRAINT "story_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_reactions" ADD CONSTRAINT "story_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_reactions" ADD CONSTRAINT "story_reactions_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_runs" ADD CONSTRAINT "story_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_runs" ADD CONSTRAINT "story_runs_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_scenes" ADD CONSTRAINT "story_scenes_story_id_stories_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."stories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_mc_profiles" ADD CONSTRAINT "user_mc_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_bible_entries" ADD CONSTRAINT "world_bible_entries_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_configs_user_phase_idx" ON "agent_configs" USING btree ("user_id","phase","enabled");--> statement-breakpoint
CREATE INDEX "agent_runs_session_idx" ON "agent_runs" USING btree ("session_id","turn_index");--> statement-breakpoint
CREATE INDEX "agent_runs_config_created_idx" ON "agent_runs" USING btree ("agent_config_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_runs_session_turn_config_uniq" ON "agent_runs" USING btree ("session_id","turn_index","agent_config_id");--> statement-breakpoint
CREATE INDEX "analytics_events_entity_idx" ON "analytics_events" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "analytics_events_type_idx" ON "analytics_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "api_usage_user_id_idx" ON "api_usage" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cast_relationships_char_a_id_idx" ON "cast_relationships" USING btree ("char_a_id");--> statement-breakpoint
CREATE INDEX "cast_relationships_char_b_id_idx" ON "cast_relationships" USING btree ("char_b_id");--> statement-breakpoint
CREATE INDEX "character_diary_session_idx" ON "character_diary" USING btree ("session_id","turn_range_end");--> statement-breakpoint
CREATE INDEX "character_diary_char_user_idx" ON "character_diary" USING btree ("character_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "character_dynamic_states_character_id_idx" ON "character_dynamic_states" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "character_facts_current_idx" ON "character_facts" USING btree ("session_id","subject","predicate");--> statement-breakpoint
CREATE INDEX "character_facts_timeline_idx" ON "character_facts" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "character_facts_character_idx" ON "character_facts" USING btree ("character_id","session_id");--> statement-breakpoint
CREATE INDEX "character_images_char_order_idx" ON "character_images" USING btree ("character_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "character_images_primary_idx" ON "character_images" USING btree ("character_id") WHERE is_primary = true;--> statement-breakpoint
CREATE INDEX "character_images_moderation_idx" ON "character_images" USING btree ("moderation_status");--> statement-breakpoint
CREATE INDEX "character_images_user_idx" ON "character_images" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "characters_owner_idx" ON "characters" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "characters_public_idx" ON "characters" USING btree ("is_public");--> statement-breakpoint
CREATE INDEX "characters_chapter_idx" ON "characters" USING btree ("chapter","gender","is_public");--> statement-breakpoint
CREATE INDEX "characters_language_idx" ON "characters" USING btree ("language");--> statement-breakpoint
CREATE INDEX "characters_is_retired_idx" ON "characters" USING btree ("is_retired");--> statement-breakpoint
CREATE INDEX "chat_folders_user_idx" ON "chat_folders" USING btree ("user_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "messages_session_idx" ON "chat_messages" USING btree ("session_id","turn_index");--> statement-breakpoint
CREATE INDEX "messages_turn_idx" ON "chat_messages" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "chat_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_updated_idx" ON "chat_sessions" USING btree ("last_message_at");--> statement-breakpoint
CREATE INDEX "chat_sessions_character_id_idx" ON "chat_sessions" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "comments_entity_idx" ON "comments" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "comments_author_idx" ON "comments" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "content_reports_entity_idx" ON "content_reports" USING btree ("entity_type","entity_id","status");--> statement-breakpoint
CREATE INDEX "content_reports_status_idx" ON "content_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "content_revisions_entity_idx" ON "content_revisions" USING btree ("entity_type","entity_id","field_key","version");--> statement-breakpoint
CREATE INDEX "content_revisions_author_idx" ON "content_revisions" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "content_translations_entity_idx" ON "content_translations" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_translations_unique_idx" ON "content_translations" USING btree ("entity_type","entity_id","field_key","target_lang");--> statement-breakpoint
CREATE INDEX "context_blobs_session_idx" ON "context_blobs" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "context_node_sources_source_idx" ON "context_node_sources" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "context_nodes_session_idx" ON "context_nodes" USING btree ("session_id","depth");--> statement-breakpoint
CREATE INDEX "context_nodes_turn_range_idx" ON "context_nodes" USING btree ("session_id","turn_start","turn_end");--> statement-breakpoint
CREATE INDEX "context_nodes_parent_idx" ON "context_nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "followers_followed_idx" ON "followers" USING btree ("followed_user_id");--> statement-breakpoint
CREATE INDEX "followers_follower_idx" ON "followers" USING btree ("follower_user_id");--> statement-breakpoint
CREATE INDEX "group_activities_session_id_idx" ON "group_activities" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "handoff_tokens_user_idx" ON "handoff_tokens" USING btree ("user_id","expires_at");--> statement-breakpoint
CREATE INDEX "harem_stats_character_id_idx" ON "harem_stats" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "learning_materials_user_id_idx" ON "learning_materials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "letters_user_deliver_idx" ON "letters" USING btree ("user_id","deliver_at");--> statement-breakpoint
CREATE INDEX "letters_deliver_idx" ON "letters" USING btree ("deliver_at");--> statement-breakpoint
CREATE INDEX "lorebook_entries_book_idx" ON "lorebook_entries" USING btree ("lorebook_id","enabled","priority");--> statement-breakpoint
CREATE INDEX "lorebooks_user_idx" ON "lorebooks" USING btree ("user_id","scope","created_at");--> statement-breakpoint
CREATE INDEX "memories_user_id_idx" ON "memories" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "memories_session_idx" ON "memories" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "memories_character_idx" ON "memories" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "memory_graph_edges_from_idx" ON "memory_graph_edges" USING btree ("from_node_id","predicate");--> statement-breakpoint
CREATE INDEX "memory_graph_edges_to_idx" ON "memory_graph_edges" USING btree ("to_node_id","predicate");--> statement-breakpoint
CREATE INDEX "memory_graph_nodes_user_kind_idx" ON "memory_graph_nodes" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "mistake_logs_user_id_idx" ON "mistake_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mistake_logs_session_id_idx" ON "mistake_logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "moderation_actions_entity_idx" ON "moderation_actions" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "moderation_actions_admin_idx" ON "moderation_actions" USING btree ("admin_user_id");--> statement-breakpoint
CREATE INDEX "personas_user_idx" ON "personas" USING btree ("user_id","is_default","created_at");--> statement-breakpoint
CREATE INDEX "prompt_presets_user_idx" ON "prompt_presets" USING btree ("user_id","is_default","created_at");--> statement-breakpoint
CREATE INDEX "prompt_snapshots_session_idx" ON "prompt_snapshots" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "prompt_snapshots_session_turn_idx" ON "prompt_snapshots" USING btree ("session_id","turn_id");--> statement-breakpoint
CREATE INDEX "prompt_snapshots_user_idx" ON "prompt_snapshots" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_endpoint_idx" ON "push_subscriptions" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "ratings_entity_idx" ON "ratings" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "reactions_entity_idx" ON "reactions" USING btree ("entity_type","entity_id","kind");--> statement-breakpoint
CREATE INDEX "regex_scripts_scope_idx" ON "regex_scripts" USING btree ("user_id","scope","scope_id","placement","order_index");--> statement-breakpoint
CREATE INDEX "scene_templates_owner_id_idx" ON "scene_templates" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "session_context_state_debt_idx" ON "session_context_state" USING btree ("maintenance_debt");--> statement-breakpoint
CREATE INDEX "session_events_session_idx" ON "session_events" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "session_events_user_idx" ON "session_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "session_lorebook_links_book_idx" ON "session_lorebook_links" USING btree ("lorebook_id");--> statement-breakpoint
CREATE INDEX "session_mistakes_session_kind_idx" ON "session_mistakes" USING btree ("session_id","kind");--> statement-breakpoint
CREATE INDEX "session_mistakes_session_recent_idx" ON "session_mistakes" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "session_schedules_user_idx" ON "session_schedules" USING btree ("user_id","enabled","fire_at");--> statement-breakpoint
CREATE INDEX "session_schedules_session_idx" ON "session_schedules" USING btree ("session_id","enabled");--> statement-breakpoint
CREATE INDEX "stories_author_idx" ON "stories" USING btree ("author_id","status","created_at");--> statement-breakpoint
CREATE INDEX "stories_status_lang_idx" ON "stories" USING btree ("status","language","created_at");--> statement-breakpoint
CREATE INDEX "story_arcs_session_id_idx" ON "story_arcs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "story_cast_encounters_progress_idx" ON "story_cast_encounters" USING btree ("progress_id");--> statement-breakpoint
CREATE INDEX "story_cast_encounters_character_idx" ON "story_cast_encounters" USING btree ("character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_cast_encounters_unique_idx" ON "story_cast_encounters" USING btree ("progress_id","character_id");--> statement-breakpoint
CREATE INDEX "story_cast_progress_user_idx" ON "story_cast_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "story_cast_progress_story_idx" ON "story_cast_progress" USING btree ("story_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_cast_progress_unique_idx" ON "story_cast_progress" USING btree ("story_id","user_id");--> statement-breakpoint
CREATE INDEX "story_cast_progress_session_idx" ON "story_cast_progress" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "story_character_refs_char_idx" ON "story_character_refs" USING btree ("character_id");--> statement-breakpoint
CREATE INDEX "story_comments_story_idx" ON "story_comments" USING btree ("story_id","created_at");--> statement-breakpoint
CREATE INDEX "story_comments_parent_idx" ON "story_comments" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "story_reactions_story_idx" ON "story_reactions" USING btree ("story_id","kind");--> statement-breakpoint
CREATE INDEX "story_runs_user_idx" ON "story_runs" USING btree ("user_id","last_read_at");--> statement-breakpoint
CREATE INDEX "story_runs_story_idx" ON "story_runs" USING btree ("story_id");--> statement-breakpoint
CREATE UNIQUE INDEX "story_runs_user_story_idx" ON "story_runs" USING btree ("user_id","story_id");--> statement-breakpoint
CREATE INDEX "story_runs_seeded_session_idx" ON "story_runs" USING btree ("seeded_session_id");--> statement-breakpoint
CREATE INDEX "story_scenes_story_order_idx" ON "story_scenes" USING btree ("story_id","order_index");--> statement-breakpoint
CREATE INDEX "story_scenes_tile_order_idx" ON "story_scenes" USING btree ("story_id","tile_order");--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_mc_profiles_user_idx" ON "user_mc_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_mc_profiles_default_idx" ON "user_mc_profiles" USING btree ("user_id") WHERE is_default = true;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "users_handle_idx" ON "users" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "world_bible_entries_owner_id_idx" ON "world_bible_entries" USING btree ("owner_id");