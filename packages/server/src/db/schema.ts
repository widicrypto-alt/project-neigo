import {
  pgTable,
  text,
  varchar,
  integer,
  real,
  bigint,
  boolean,
  timestamp,
  date,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

const id = () => varchar('id', { length: 36 }).primaryKey();
const fk = (name: string) => varchar(name, { length: 36 }).notNull();

// 1. users
export const users = pgTable(
  'users',
  {
    id: id(),
    email: varchar('email', { length: 255 }).notNull(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    displayName: varchar('display_name', { length: 100 }).notNull(),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    profileAge: integer('profile_age'),
    profileGender: varchar('profile_gender', { length: 30 }),
    profilePronouns: varchar('profile_pronouns', { length: 40 }),
    profileBio: text('profile_bio'),
    tier: varchar('tier', { length: 20 }).notNull().default('FREE'),
    tierExpiresAt: timestamp('tier_expires_at', { withTimezone: true }),
    stripeCustomerId: varchar('stripe_customer_id', { length: 255 }),
    nsfwEnabled: boolean('nsfw_enabled').notNull().default(false),
    ageConfirmed: boolean('age_confirmed').notNull().default(false),
    ageConfirmedAt: timestamp('age_confirmed_at', { withTimezone: true }),
    // v7 Founding Reader badge (#15) — granted to all users during closed alpha.
    // Stripe/post-alpha users register with this false and upgrade separately.
    isFoundingReader: boolean('is_founding_reader').notNull().default(true),
    // Push notification opt-out (permanent when set true).
    pushOptOut: boolean('push_opt_out').notNull().default(false),
    // Timestamp of the last push notification sent (throttle: max 1/day).
    lastPushSentAt: timestamp('last_push_sent_at', { withTimezone: true }),
    // BYOK: user's own OpenRouter key, AES-256-GCM encrypted (hex: iv:authTag:ciphertext).
    byokOrKeyEnc: text('byok_or_key_enc'),
    // BYOK: OpenRouter model slug chosen by user (e.g. 'anthropic/claude-sonnet-4-5').
    byokModel: varchar('byok_model', { length: 120 }),
    // UI preferences for navigation layout and haptics
    uiPreferences: jsonb('ui_preferences').notNull().default(sql`'{}'::jsonb`),
    // Flexible flag bag: onboardingCompleted, featureFlags, UI hints, etc.
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    // PLANIMPv7 §4 — follower counts.
    followerCount: integer('follower_count').notNull().default(0),
    followingCount: integer('following_count').notNull().default(0),
    // REDESIGNv2 D3 — public creator profile.
    handle: varchar('handle', { length: 40 }),
    profileIsPublic: boolean('profile_is_public').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
    handleIdx: uniqueIndex('users_handle_idx').on(t.handle),
  }),
);

// 2. subscriptions
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    tier: varchar('tier', { length: 20 }).notNull(),
    stripeSubscriptionId: varchar('stripe_subscription_id', { length: 255 }),
    status: varchar('status', { length: 20 }).notNull(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('subscriptions_user_id_idx').on(t.userId),
  }),
);

// 3. characters
export const characters = pgTable(
  'characters',
  {
    id: id(),
    ownerId: varchar('owner_id', { length: 36 }).references(() => users.id, {
      onDelete: 'cascade',
    }),
    name: varchar('name', { length: 200 }).notNull(),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    persona: jsonb('persona').notNull(), // Full Character persona fields (30+)
    tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
    folder: varchar('folder', { length: 120 }),
    tonePreset: varchar('tone_preset', { length: 30 }).notNull().default('NONE'),
    isBuiltIn: boolean('is_built_in').notNull().default(false),
    isPublic: boolean('is_public').notNull().default(false),
    // Discover chapter metadata (null = not featured).
    chapter: integer('chapter'),
    gender: varchar('gender', { length: 1 }), // 'F' | 'M'
    age: integer('age'),
    discoverOrder: integer('discover_order'),
    // Multi-language + beta curation (migration 0024).
    language: varchar('language', { length: 8 }).notNull().default('id'),
    languagesSpoken: jsonb('languages_spoken').notNull().default(sql`'["id"]'::jsonb`),
    isRetired: boolean('is_retired').notNull().default(false),
    allowInStories: boolean('allow_in_stories').notNull().default(true),
    // PLANIMPv2 (migration 0047) — public detail page fields.
    slug: varchar('slug', { length: 120 }),
    tagline: varchar('tagline', { length: 200 }),
    descriptionMd: text('description_md'),
    descriptionHtml: text('description_html'),
    loreSectionsMd: jsonb('lore_sections_md').notNull().default(sql`'[]'::jsonb`),
    exampleDialogMd: text('example_dialog_md'),
    exampleDialogHtml: text('example_dialog_html'),
    isSecretPromptHidden: boolean('is_secret_prompt_hidden').notNull().default(false),
    // PLANIMPv2 migration 0051 — semantic persona projection (nullable).
    personaMd: jsonb('persona_md').$type<{
      physicalDescription?: string | null;
      coreIdentity?: string | null;
      mannerisms?: string | null;
      history?: string | null;
      role?: string | null;
      classRole?: string | null;
    } | null>(),
    tokenCountCache: jsonb('token_count_cache').notNull().default(sql`'{}'::jsonb`).$type<{
      description?: number;
      exampleDialog?: number;
      total?: number;
      computedAt?: string;
    }>(),
    totalViews: integer('total_views').notNull().default(0),
    totalChats: integer('total_chats').notNull().default(0),
    totalLikes: integer('total_likes').notNull().default(0),
    totalBookmarks: integer('total_bookmarks').notNull().default(0),
    totalRatings: integer('total_ratings').notNull().default(0),
    avgStars: real('avg_stars').notNull().default(0),
    totalComments: integer('total_comments').notNull().default(0),
    totalRoses: integer('total_roses').notNull().default(0),
    isFlaggedForReview: boolean('is_flagged_for_review').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    updatedPublicAt: timestamp('updated_public_at', { withTimezone: true }),
    // BACKLOG B2.6 — set when isPublic=true is requested but primary avatar
    // is still pending moderation; cleared on auto-publish at approval.
    queuedForPublish: boolean('queued_for_publish').notNull().default(false),
    // PLANCHATv3 §4.6 — Content rating for session creation filtering.
    contentRating: varchar('content_rating', { length: 10 }).notNull().default('SFW'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('characters_owner_idx').on(t.ownerId),
    publicIdx: index('characters_public_idx').on(t.isPublic),
    chapterIdx: index('characters_chapter_idx').on(t.chapter, t.gender, t.isPublic),
    languageIdx: index('characters_language_idx').on(t.language),
    retiredIdx: index('characters_is_retired_idx').on(t.isRetired),
  }),
);

// PLANBv3 H4 — Character gallery images.
export const characterImages = pgTable(
  'character_images',
  {
    id: id(),
    characterId: varchar('character_id', { length: 36 })
      .notNull()
      .references(() => characters.id, { onDelete: 'cascade' }),
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 16 }).notNull().default('portrait'),
    r2Key: varchar('r2_key', { length: 256 }).notNull(),
    url: varchar('url', { length: 500 }).notNull(),
    width: integer('width').notNull().default(0),
    height: integer('height').notNull().default(0),
    bytes: integer('bytes').notNull().default(0),
    mime: varchar('mime', { length: 32 }).notNull().default('image/webp'),
    alt: varchar('alt', { length: 500 }),
    caption: varchar('caption', { length: 500 }),
    nsfw: boolean('nsfw').notNull().default(false),
    moderationStatus: varchar('moderation_status', { length: 16 }).notNull().default('pending'),
    moderationReason: varchar('moderation_reason', { length: 500 }),
    moderationScores: jsonb('moderation_scores').notNull().default(sql`'{}'::jsonb`),
    perceptualHash: varchar('perceptual_hash', { length: 64 }),
    orderIndex: integer('order_index').notNull().default(0),
    isPrimary: boolean('is_primary').notNull().default(false),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    charOrderIdx: index('character_images_char_order_idx').on(t.characterId, t.orderIndex),
    primaryIdx: uniqueIndex('character_images_primary_idx')
      .on(t.characterId)
      .where(sql`is_primary = true`),
    moderationIdx: index('character_images_moderation_idx').on(t.moderationStatus),
    userIdx: index('character_images_user_idx').on(t.userId, t.createdAt),
  }),
);

export const characterImageQuota = pgTable(
  'character_image_quota',
  {
    userId: varchar('user_id', { length: 36 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    bytesUsed: bigint('bytes_used', { mode: 'number' }).notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.day] }),
  }),
);

// 4. chat_sessions
export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    characterId: fk('character_id').references(() => characters.id, { onDelete: 'restrict' }),
    isPinned: boolean('is_pinned').notNull().default(false),
    mode: varchar('mode', { length: 20 }).notNull(),
    title: varchar('title', { length: 300 }).notNull().default(''),
    sceneCard: jsonb('scene_card').notNull().default(sql`'{}'::jsonb`),
    castCharacterIds: jsonb('cast_character_ids').notNull().default(sql`'[]'::jsonb`),
    arcId: varchar('arc_id', { length: 36 }),
    autoMoodEnabled: boolean('auto_mood_enabled').notNull().default(true),
    turnCount: integer('turn_count').notNull().default(0),
    dramaIntensity: integer('drama_intensity').notNull().default(1),
    lastContextTokens: integer('last_context_tokens').notNull().default(0),
    moodState: varchar('mood_state', { length: 30 }).notNull().default('NEUTRAL'),
    narratorVoice: varchar('narrator_voice', { length: 30 }).notNull().default('CINEMATIC'),
    ragEnabled: boolean('rag_enabled').notNull().default(true),
    sessionDate: varchar('session_date', { length: 20 }),
    sessionTime: varchar('session_time', { length: 20 }),
    debatePhase: varchar('debate_phase', { length: 20 }).notNull().default('OPENING'),
    chatProgressionMode: varchar('chat_progression_mode', { length: 30 })
      .notNull()
      .default('APPROACH'),
    aiModel: varchar('ai_model', { length: 120 }).notNull().default('HERMES_4_405B'),
    unresolvedBeat: text('unresolved_beat'),
    latentQuestion: text('latent_question'),
    callbackCandidate: text('callback_candidate'),
    moodNoise: real('mood_noise').notNull().default(0),
    /** Wk8 G1a — optional persona pin. Null = fall back to users.displayName. */
    activePersonaId: varchar('active_persona_id', { length: 36 }),
    /** Wk11 G2 — optional prompt preset pin. Null = no preset. */
    activePresetId: varchar('active_preset_id', { length: 36 }),
    /** Wk13 H1 — optional folder link. Null = "All chats". */
    folderId: varchar('folder_id', { length: 36 }),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('sessions_user_idx').on(t.userId),
    updatedIdx: index('sessions_updated_idx').on(t.lastMessageAt),
    charIdx: index('chat_sessions_character_id_idx').on(t.characterId),
  }),
);

// 5. chat_messages
export const chatMessages = pgTable(
  'chat_messages',
  {
    id: id(),
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    turnIndex: integer('turn_index').notNull(),
    role: varchar('role', { length: 20 }).notNull(),
    speakerType: varchar('speaker_type', { length: 20 }).notNull(),
    speakerId: varchar('speaker_id', { length: 36 }),
    content: text('content').notNull(),
    passType: varchar('pass_type', { length: 30 }),
    passIndex: integer('pass_index'),
    reaction: varchar('reaction', { length: 50 }),
    isStarred: boolean('is_starred').notNull().default(false),
    isInstant: boolean('is_instant').notNull().default(false),
    tokenCount: integer('token_count').notNull().default(0),
    replyToMessageId: varchar('reply_to_message_id', { length: 36 }),
    turnId: varchar('turn_id', { length: 36 }),
    feedbackTag: varchar('feedback_tag', { length: 50 }),
    /** Wk10 G3a — swipe family root (id of first sibling; null = self). */
    swipeRoot: varchar('swipe_root', { length: 36 }),
    /** Wk10 G3a — 0-based rank within the swipe family. */
    swipeIndex: integer('swipe_index').notNull().default(0),
    /** Wk10 G3a — exactly one row per swipe family is active. */
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('messages_session_idx').on(t.sessionId, t.turnIndex),
    turnIdx: index('messages_turn_idx').on(t.turnId),
  }),
);

// 6. memories (with pgvector embedding - column added via raw SQL migration)
export const memories = pgTable(
  'memories',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    characterId: varchar('character_id', { length: 36 }).references(() => characters.id, {
      onDelete: 'set null',
    }),
    sessionId: varchar('session_id', { length: 36 }).references(() => chatSessions.id, {
      onDelete: 'cascade',
    }),
    type: varchar('type', { length: 30 }).notNull(),
    category: varchar('category', { length: 30 }).notNull().default('GENERAL'),
    content: text('content').notNull(),
    emotionalTag: varchar('emotional_tag', { length: 50 }),
    scopeCharacterId: varchar('scope_character_id', { length: 36 }),
    isMilestone: boolean('is_milestone').notNull().default(false),
    isEpisodic: boolean('is_episodic').notNull().default(false),
    chatMode: varchar('chat_mode', { length: 20 }),
    importance: real('importance').notNull().default(0.5),
    accessCount: integer('access_count').notNull().default(0),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    // embedding vector(1536) — added via SQL migration when pgvector is enabled
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('memories_user_id_idx').on(t.userId),
    sessionIdx: index('memories_session_idx').on(t.sessionId),
    characterIdx: index('memories_character_idx').on(t.characterId),
  }),
);

// 7. character_dynamic_states
export const characterDynamicStates = pgTable(
  'character_dynamic_states',
  {
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    characterId: fk('character_id').references(() => characters.id, { onDelete: 'cascade' }),
    mood: varchar('mood', { length: 30 }).notNull().default('NEUTRAL'),
    stagnation: integer('stagnation').notNull().default(0),
    jealousy: integer('jealousy').notNull().default(0),
    driftScore: real('drift_score').notNull().default(0),
    trustScore: integer('trust_score').notNull().default(0),
    lastRelationshipStage: varchar('last_relationship_stage', { length: 30 })
      .notNull()
      .default('STRANGER'),
    repetitionScore: real('repetition_score').notNull().default(0),
    toneDrift: real('tone_drift').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sessionId, t.characterId] }),
    charIdx: index('character_dynamic_states_character_id_idx').on(t.characterId),
  }),
);

// 8. character_mode_profiles
export const characterModeProfiles = pgTable(
  'character_mode_profiles',
  {
    characterId: fk('character_id').references(() => characters.id, { onDelete: 'cascade' }),
    mode: varchar('mode', { length: 20 }).notNull(),
    personalityOverride: jsonb('personality_override').notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.characterId, t.mode] }),
  }),
);

// 9. harem_stats
export const haremStats = pgTable(
  'harem_stats',
  {
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    characterId: fk('character_id').references(() => characters.id, { onDelete: 'cascade' }),
    affection: integer('affection').notNull().default(500),
    loyalty: integer('loyalty').notNull().default(500),
    jealousy: integer('jealousy').notNull().default(0),
    voiceScore: real('voice_score').notNull().default(0.5),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sessionId, t.characterId] }),
    charIdx: index('harem_stats_character_id_idx').on(t.characterId),
  }),
);

// 10. cast_relationships
export const castRelationships = pgTable(
  'cast_relationships',
  {
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    charAId: fk('char_a_id').references(() => characters.id, { onDelete: 'cascade' }),
    charBId: fk('char_b_id').references(() => characters.id, { onDelete: 'cascade' }),
    relationshipType: varchar('relationship_type', { length: 50 }).notNull(),
    affinity: integer('affinity').notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sessionId, t.charAId, t.charBId] }),
    charAIdx: index('cast_relationships_char_a_id_idx').on(t.charAId),
    charBIdx: index('cast_relationships_char_b_id_idx').on(t.charBId),
  }),
);

// 11. group_activities
export const groupActivities = pgTable(
  'group_activities',
  {
    id: id(),
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    activityType: varchar('activity_type', { length: 50 }).notNull(),
    participants: jsonb('participants').notNull(),
    outcome: text('outcome').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('group_activities_session_id_idx').on(t.sessionId),
  }),
);

// 12. story_arcs
export const storyArcs = pgTable(
  'story_arcs',
  {
    id: id(),
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    stage: varchar('stage', { length: 50 }).notNull(),
    triggers: jsonb('triggers').notNull().default(sql`'{}'::jsonb`),
    progress: real('progress').notNull().default(0),
  },
  (t) => ({
    sessionIdx: index('story_arcs_session_id_idx').on(t.sessionId),
  }),
);

// 13. scene_templates
export const sceneTemplates = pgTable(
  'scene_templates',
  {
    id: id(),
    ownerId: varchar('owner_id', { length: 36 }).references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 200 }).notNull(),
    setup: jsonb('setup').notNull(),
    isPublic: boolean('is_public').notNull().default(false),
  },
  (t) => ({
    ownerIdx: index('scene_templates_owner_id_idx').on(t.ownerId),
  }),
);

// 14. world_bible_entries
export const worldBibleEntries = pgTable(
  'world_bible_entries',
  {
    id: id(),
    ownerId: fk('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    content: text('content').notNull(),
    tags: jsonb('tags').notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('world_bible_entries_owner_id_idx').on(t.ownerId),
  }),
);

// 15. learner_profiles
export const learnerProfiles = pgTable('learner_profiles', {
  userId: fk('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  targetLanguage: varchar('target_language', { length: 30 }).notNull(),
  level: varchar('level', { length: 20 }).notNull(),
  goals: jsonb('goals').notNull().default(sql`'{}'::jsonb`),
});

// 16. learning_materials
export const learningMaterials = pgTable(
  'learning_materials',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    topic: varchar('topic', { length: 200 }).notNull(),
    content: jsonb('content').notNull(),
  },
  (t) => ({
    userIdx: index('learning_materials_user_id_idx').on(t.userId),
  }),
);

// 17. mistake_logs
export const mistakeLogs = pgTable(
  'mistake_logs',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    sessionId: varchar('session_id', { length: 36 }).references(() => chatSessions.id, {
      onDelete: 'set null',
    }),
    mistake: text('mistake').notNull(),
    correction: text('correction').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('mistake_logs_user_id_idx').on(t.userId),
    sessionIdx: index('mistake_logs_session_id_idx').on(t.sessionId),
  }),
);

// 18. api_usage
// 19. push_subscriptions
// Web Push subscriptions. One user can have multiple devices.
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('push_subscriptions_user_id_idx').on(t.userId),
    endpointIdx: uniqueIndex('push_subscriptions_endpoint_idx').on(t.endpoint),
  }),
);

export const apiUsage = pgTable(
  'api_usage',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    model: varchar('model', { length: 100 }).notNull(),
    promptTokens: integer('prompt_tokens').notNull(),
    completionTokens: integer('completion_tokens').notNull(),
    totalTokens: integer('total_tokens').notNull(),
    costCents: integer('cost_cents').notNull(),
    endpoint: varchar('endpoint', { length: 100 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('api_usage_user_id_idx').on(t.userId),
  }),
);

// 20. context_nodes — hierarchical transcript compaction (LCM-inspired)
// Leaf nodes summarize a range of chat_messages; parent nodes summarize child nodes.
export const contextNodes = pgTable(
  'context_nodes',
  {
    id: id(),
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    parentId: varchar('parent_id', { length: 36 }),
    depth: integer('depth').notNull().default(0), // 0 = leaf, 1+ = parent
    turnStart: integer('turn_start').notNull(), // first turnIndex covered
    turnEnd: integer('turn_end').notNull(), // last turnIndex covered
    summary: text('summary').notNull(),
    salience: real('salience').notNull().default(0.5), // 0-1, higher = more important
    tokenCount: integer('token_count').notNull().default(0),
    // PLANv3 X4.1 (post-batch) — pointer to context_blobs when a node's
    // source payload was externalised. Nullable for legacy rows.
    blobRef: varchar('blob_ref', { length: 36 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('context_nodes_session_idx').on(t.sessionId, t.depth),
    turnRangeIdx: index('context_nodes_turn_range_idx').on(t.sessionId, t.turnStart, t.turnEnd),
    parentIdx: index('context_nodes_parent_idx').on(t.parentId),
  }),
);

// 21. session_mistakes — records validator drift per session for prompt-level awareness
export const sessionMistakes = pgTable(
  'session_mistakes',
  {
    id: id(),
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    turnIndex: integer('turn_index').notNull(),
    kind: text('kind').notNull(), // tone_drift | pov_drift | format_drift | repetition | refusal | continuity
    excerpt: text('excerpt').notNull(),
    correction: text('correction').notNull(),
    resolvedInTurn: integer('resolved_in_turn'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionKindIdx: index('session_mistakes_session_kind_idx').on(t.sessionId, t.kind),
    sessionRecentIdx: index('session_mistakes_session_recent_idx').on(t.sessionId, t.createdAt),
  }),
);

// 22. character_diary — 1st-person emotional reflections from the character
export const characterDiary = pgTable(
  'character_diary',
  {
    id: id(),
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    characterId: fk('character_id').references(() => characters.id, { onDelete: 'cascade' }),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    turnRangeStart: integer('turn_range_start').notNull(),
    turnRangeEnd: integer('turn_range_end').notNull(),
    entry: text('entry').notNull(),
    mood: text('mood'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('character_diary_session_idx').on(t.sessionId, t.turnRangeEnd),
    charUserIdx: index('character_diary_char_user_idx').on(t.characterId, t.userId, t.createdAt),
  }),
);

// 23. character_facts — temporal fact graph (T4.9)
export const characterFacts = pgTable(
  'character_facts',
  {
    id: id(),
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    characterId: fk('character_id').references(() => characters.id, { onDelete: 'cascade' }),
    subject: text('subject').notNull(),
    predicate: text('predicate').notNull(),
    object: text('object').notNull(),
    confidence: real('confidence').notNull().default(1.0),
    validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
    validTo: timestamp('valid_to', { withTimezone: true }),
    versionOf: varchar('version_of', { length: 36 }),
    sourceMessageId: varchar('source_message_id', { length: 36 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    currentIdx: index('character_facts_current_idx').on(t.sessionId, t.subject, t.predicate),
    timelineIdx: index('character_facts_timeline_idx').on(t.sessionId, t.createdAt),
    characterIdx: index('character_facts_character_idx').on(t.characterId, t.sessionId),
  }),
);

// 24. session_events — persistent timeline (Section B: session quality)
export const sessionEvents = pgTable(
  'session_events',
  {
    id: id(),
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    characterId: varchar('character_id', { length: 36 }),
    eventType: varchar('event_type', { length: 30 }).notNull(),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    turnIndex: integer('turn_index'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('session_events_session_idx').on(t.sessionId, t.createdAt),
    userIdx: index('session_events_user_idx').on(t.userId, t.createdAt),
  }),
);

// 25. prompt_snapshots — Wk2 PLANv2 F4 (Prompt Inspection, FOUNDER-first).
// Captures the fully-assembled prompt sent to the model at turn start.
// One row per first attempt; retries bump `retryCount` on the same row.
export const promptSnapshots = pgTable(
  'prompt_snapshots',
  {
    id: id(),
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    characterId: varchar('character_id', { length: 36 }),
    turnId: varchar('turn_id', { length: 36 }).notNull(),
    turnIndex: integer('turn_index'),
    modelSlug: varchar('model_slug', { length: 120 }).notNull(),
    /** Array<{ role: 'system'|'user'|'assistant', content: string }>. */
    messages: jsonb('messages')
      .$type<Array<{ role: 'system' | 'user' | 'assistant'; content: string }>>()
      .notNull(),
    /** Sampling params: temperature, topP, maxTokens, frequencyPenalty, stop. */
    sampling: jsonb('sampling')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    totalChars: integer('total_chars').notNull().default(0),
    messageCount: integer('message_count').notNull().default(0),
    retryCount: integer('retry_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('prompt_snapshots_session_idx').on(t.sessionId, t.createdAt),
    sessionTurnIdx: index('prompt_snapshots_session_turn_idx').on(t.sessionId, t.turnId),
    userIdx: index('prompt_snapshots_user_idx').on(t.userId, t.createdAt),
  }),
);

// 25. lorebooks — Wk3 PLANv2 F1 (keyword-triggered world entries).
// Defers pgvector embedding column to wk5 (F1b chunked RAG).
export const lorebooks = pgTable(
  'lorebooks',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 120 }).notNull(),
    description: text('description'),
    /**
     * 'USER'    — auto-attached to every new session by default.
     * 'SESSION' — active only when explicitly linked via sessionLorebookLinks.
     */
    scope: varchar('scope', { length: 20 }).notNull().default('USER'),
    isEnabled: boolean('is_enabled').notNull().default(true),
    /** Soft per-book token budget used by the retriever when packing entries. */
    tokenBudget: integer('token_budget').notNull().default(1500),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('lorebooks_user_idx').on(t.userId, t.scope, t.createdAt),
  }),
);

// 26. lorebook_entries
export const lorebookEntries = pgTable(
  'lorebook_entries',
  {
    id: id(),
    lorebookId: fk('lorebook_id').references(() => lorebooks.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 200 }).notNull(),
    content: text('content').notNull(),
    /** Matching keywords / keyphrases. Case-insensitive whole-word scan. */
    keywords: text('keywords').array().notNull().default(sql`ARRAY[]::text[]`),
    /** Higher priority wins tie-breaks during token packing (0..100). */
    priority: integer('priority').notNull().default(50),
    /** Injection depth: 1 = right before last user msg, 2 = system tail. */
    depth: integer('depth').notNull().default(2),
    enabled: boolean('enabled').notNull().default(true),
    tokenEstimate: integer('token_estimate').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    bookIdx: index('lorebook_entries_book_idx').on(t.lorebookId, t.enabled, t.priority),
  }),
);

// 27. session_lorebook_links — many-to-many join for SESSION-scope books.
export const sessionLorebookLinks = pgTable(
  'session_lorebook_links',
  {
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    lorebookId: fk('lorebook_id').references(() => lorebooks.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.sessionId, t.lorebookId] }),
    bookIdx: index('session_lorebook_links_book_idx').on(t.lorebookId),
  }),
);

// 28. personas — Wk8 PLANv2 G1a. User-authored {{user}} profiles.
// At most one row per user may have is_default=true (enforced via partial
// unique index in migration 0018). chat_sessions.active_persona_id optionally
// pins a persona to a session; null falls back to users.display_name.
export const personas = pgTable(
  'personas',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    description: text('description').notNull().default(''),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('personas_user_idx').on(t.userId, t.isDefault, t.createdAt),
  }),
);

// 29. prompt_presets — Wk11 PLANv2 G2. Reusable system-prompt overrides.
// A preset carries free-form prelude text (appended to the system prompt)
// + optional author's-note (injected close to the latest user turn) plus
// sampling overrides. At most one default row per user (partial unique
// index in migration 0020).
export const promptPresets = pgTable(
  'prompt_presets',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    description: text('description').notNull().default(''),
    systemPrelude: text('system_prelude').notNull().default(''),
    authorsNote: text('authors_note').notNull().default(''),
    temperature: real('temperature'),
    topP: real('top_p'),
    isDefault: boolean('is_default').notNull().default(false),
    // PLANv3 X2.4 — marker-based reorderable sections (migration 0030).
    sections: jsonb('sections').notNull().default(sql`'[]'::jsonb`),
    presetMode: varchar('preset_mode', { length: 16 }).notNull().default('legacy'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('prompt_presets_user_idx').on(t.userId, t.isDefault, t.createdAt),
  }),
);

// 30. chat_folders — Wk13 PLANv2 H1. User-owned, flat (non-nested) taxonomy.
// chat_sessions.folder_id links sessions in; NULL = "All chats".
export const chatFolders = pgTable(
  'chat_folders',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 80 }).notNull(),
    color: varchar('color', { length: 16 }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('chat_folders_user_idx').on(t.userId, t.sortOrder, t.createdAt),
  }),
);

// 31. session_schedules — Wk14 PLANv2 H7. User-configured scheduled
// autonomous messages (quiet-hours-aware; BullMQ `session-schedule` queue
// fires jobs when fire_at elapses).
export const sessionSchedules = pgTable(
  'session_schedules',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    cadence: varchar('cadence', { length: 12 }).notNull().default('once'),
    fireAt: timestamp('fire_at', { withTimezone: true }).notNull(),
    note: text('note').notNull().default(''),
    tz: varchar('tz', { length: 64 }).notNull().default('UTC'),
    hour: integer('hour'),
    minute: integer('minute'),
    enabled: boolean('enabled').notNull().default(true),
    lastFiredAt: timestamp('last_fired_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('session_schedules_user_idx').on(t.userId, t.enabled, t.fireAt),
    sessionIdx: index('session_schedules_session_idx').on(t.sessionId, t.enabled),
  }),
);


// 34. stories — REDESIGNv2 D4a VN. Berdiri sendiri, tidak terkait chat_sessions.
export const stories = pgTable(
  'stories',
  {
    id: id(),
    title: varchar('title', { length: 200 }).notNull(),
    synopsis: text('synopsis'),
    coverImageUrl: varchar('cover_image_url', { length: 500 }),
    language: varchar('language', { length: 8 }).notNull().default('id'),
    authorId: fk('author_id').references(() => users.id, { onDelete: 'cascade' }),
    // 'draft' | 'published' | 'featured' | 'archived'
    status: varchar('status', { length: 20 }).notNull().default('draft'),
    // 'kinetic' (MVP) | 'branching' (future) | 'open_ended' (future)
    mode: varchar('mode', { length: 20 }).notNull().default('kinetic'),
    // 'FREE' | 'PAID' | 'FOUNDER'
    requiredTier: varchar('required_tier', { length: 20 }).notNull().default('FREE'),
    // [{characterId, displayName, role}] — denormalized display cache
    cast: jsonb('cast').notNull().default(sql`'[]'::jsonb`).$type<Array<{ characterId: string; displayName: string; role: string }>>(),
    // FK to story_scenes(id) — circular; constraint added via raw SQL migration
    openingSceneId: varchar('opening_scene_id', { length: 36 }),
    // {tags: string[], contentWarnings: string[], estimatedMinutes: number}
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`).$type<{ tags?: string[]; contentWarnings?: string[]; estimatedMinutes?: number }>(),
    // PLANBv2 — IsekaiZero-style discovery + social counters.
    tagline: varchar('tagline', { length: 200 }),
    tags: text('tags').array().notNull().default(sql`ARRAY[]::text[]`),
    heroCarousel: jsonb('hero_carousel').notNull().default(sql`'[]'::jsonb`).$type<Array<{ url: string; caption?: string }>>(),
    totalPlays: integer('total_plays').notNull().default(0),
    totalChats: integer('total_chats').notNull().default(0),
    totalViews: integer('total_views').notNull().default(0),
    totalLikes: integer('total_likes').notNull().default(0),
    totalBookmarks: integer('total_bookmarks').notNull().default(0),
    hiddenCount: integer('hidden_count').notNull().default(0),
    featuredAt: timestamp('featured_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    // PLANIMPv3 (migration 0048) — rich plot & detail-page fields.
    slug: varchar('slug', { length: 120 }),
    plotMd: text('plot_md'),
    plotHtml: text('plot_html'),
    aiPlotMd: text('ai_plot_md'),
    aiPlotHtml: text('ai_plot_html'),
    aiGuidelinesMd: text('ai_guidelines_md'),
    aiReminderMd: text('ai_reminder_md'),
    outputReminderMd: text('output_reminder_md'),
    isAdvancedMode: boolean('is_advanced_mode').notNull().default(false),
    isSecretMode: boolean('is_secret_mode').notNull().default(false),
    isAdult18plus: boolean('is_adult_18plus').notNull().default(false),
    containsMinors: boolean('contains_minors').notNull().default(false),
    playAsCharacterId: varchar('play_as_character_id', { length: 36 }),
    dungeonMindEnabled: boolean('dungeon_mind_enabled').notNull().default(false),
    openingQuote: varchar('opening_quote', { length: 280 }),
    openingQuoteBy: varchar('opening_quote_by', { length: 120 }),
    totalComments: integer('total_comments').notNull().default(0),
    totalRatings: integer('total_ratings').notNull().default(0),
    avgStars: real('avg_stars').notNull().default(0),
    totalRoses: integer('total_roses').notNull().default(0),
    vnFgCount: integer('vn_fg_count').notNull().default(0),
    vnBgCount: integer('vn_bg_count').notNull().default(0),
    vnReadinessPct: real('vn_readiness_pct').notNull().default(0),
    isFlaggedForReview: boolean('is_flagged_for_review').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    updatedPublicAt: timestamp('updated_public_at', { withTimezone: true }),
    // PLANIMPv3 migration 0051 — cached token counts for detail page.
    tokenCountCache: jsonb('token_count_cache').notNull().default(sql`'{}'::jsonb`).$type<{
      plot?: number;
      characters?: number;
      scenarios?: number;
      total?: number;
      computedAt?: string;
    }>(),
    // 0057 — MC slot + discovery mode fields
    hasMcSlot: boolean('has_mc_slot').notNull().default(true),
    mcSlotDisplayName: varchar('mc_slot_display_name', { length: 100 }),
    discoveryMode: boolean('discovery_mode').notNull().default(true),
    discoveryIntroMd: text('discovery_intro_md'),
    discoveryHintMd: text('discovery_hint_md'),
    showCastList: boolean('show_cast_list').notNull().default(true),
    castPreviewCount: integer('cast_preview_count').notNull().default(3),
    requiresMcReplacement: boolean('requires_mc_replacement').notNull().default(false),
    replacementCharacterId: varchar('replacement_character_id', { length: 36 }).references(() => characters.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    authorIdx: index('stories_author_idx').on(t.authorId, t.status, t.createdAt),
    statusLangIdx: index('stories_status_lang_idx').on(t.status, t.language, t.createdAt),
  }),
);

// 35. story_scenes — individual scenes within a story.
export const storyScenes = pgTable(
  'story_scenes',
  {
    id: id(),
    storyId: fk('story_id').references(() => stories.id, { onDelete: 'cascade' }),
    orderIndex: integer('order_index').notNull().default(0),
    title: varchar('title', { length: 200 }),
    backgroundImageUrl: varchar('background_image_url', { length: 500 }),
    bgmUrl: varchar('bgm_url', { length: 500 }),
    openingNarration: text('opening_narration'),
    // [{characterId, position: 'left'|'center'|'right', expression: string}]
    characterCues: jsonb('character_cues').notNull().default(sql`'[]'::jsonb`).$type<Array<{ characterId: string; position: string; expression: string }>>(),
    // [{speakerCharacterId: string|null, text: string}] (null = narrator)
    dialogueLines: jsonb('dialogue_lines').notNull().default(sql`'[]'::jsonb`).$type<Array<{ speakerCharacterId: string | null; text: string }>>(),
    // 'narration' | 'dialogue' | 'choice' | 'ending'
    sceneType: varchar('scene_type', { length: 20 }).notNull().default('dialogue'),
    // kinetic: linear pointer; null = end
    nextSceneId: varchar('next_scene_id', { length: 36 }),
    // future: [{label, nextSceneId, conditionKey}]
    choices: jsonb('choices').notNull().default(sql`'[]'::jsonb`).$type<Array<Record<string, unknown>>>(),
    endingSlug: varchar('ending_slug', { length: 40 }),
    // PLANBv2 — each story_scenes row doubles as a "scenario" (chat seed).
    tileImageUrl: varchar('tile_image_url', { length: 500 }),
    tileSubtitle: varchar('tile_subtitle', { length: 200 }),
    tileOrder: integer('tile_order').notNull().default(0),
    personaPrompt: text('persona_prompt'),
    openingInputHint: varchar('opening_input_hint', { length: 240 }),
    castSubset: jsonb('cast_subset').notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
    // PLANIMPv3 — rich scenario fields (migration 0048).
    tokenCount: integer('token_count').notNull().default(0),
    openingMd: text('opening_md'),
    openingHtml: text('opening_html'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    storyOrderIdx: index('story_scenes_story_order_idx').on(t.storyId, t.orderIndex),
    tileOrderIdx: index('story_scenes_tile_order_idx').on(t.storyId, t.tileOrder),
  }),
);

// 36. story_runs — per-user reading progress per story.
export const storyRuns = pgTable(
  'story_runs',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    storyId: fk('story_id').references(() => stories.id, { onDelete: 'cascade' }),
    currentSceneId: varchar('current_scene_id', { length: 36 }),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    endingReached: varchar('ending_reached', { length: 40 }),
    readingSeconds: integer('reading_seconds').notNull().default(0),
    // PLANBv2 — scenario progression + seeded chat session link.
    activeScenarioId: varchar('active_scenario_id', { length: 36 }),
    seededSessionId: varchar('seeded_session_id', { length: 36 }),
    scenariosCompleted: text('scenarios_completed').array().notNull().default(sql`ARRAY[]::text[]`),
  },
  (t) => ({
    userIdx: index('story_runs_user_idx').on(t.userId, t.lastReadAt),
    storyIdx: index('story_runs_story_idx').on(t.storyId),
    uniqueUserStory: uniqueIndex('story_runs_user_story_idx').on(t.userId, t.storyId),
    seededSessionIdx: index('story_runs_seeded_session_idx').on(t.seededSessionId),
  }),
);

// 37. story_character_refs — cast link table.
export const storyCharacterRefs = pgTable(
  'story_character_refs',
  {
    storyId: fk('story_id').references(() => stories.id, { onDelete: 'cascade' }),
    characterId: fk('character_id').references(() => characters.id, { onDelete: 'cascade' }),
    // 'owned' | 'public' | 'builtin'
    source: varchar('source', { length: 20 }).notNull().default('owned'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.storyId, t.characterId] }),
    charIdx: index('story_character_refs_char_idx').on(t.characterId),
  }),
);

// 33. handoff_tokens (migration 0023) — single-use QR device handoff.
export const handoffTokens = pgTable(
  'handoff_tokens',
  {
    token: varchar('token', { length: 48 }).primaryKey(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    sessionId: varchar('session_id', { length: 36 }).references(() => chatSessions.id, {
      onDelete: 'set null',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('handoff_tokens_user_idx').on(t.userId, t.expiresAt),
  }),
);

// PLANv3 X2.5 — regex_scripts (migration 0029).
export const regexScripts = pgTable(
  'regex_scripts',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    // 'character' | 'preset' | 'user'
    scope: varchar('scope', { length: 16 }).notNull(),
    scopeId: varchar('scope_id', { length: 36 }),
    name: varchar('name', { length: 200 }).notNull(),
    findRegex: text('find_regex').notNull(),
    replaceString: text('replace_string').notNull().default(''),
    trimStrings: jsonb('trim_strings').notNull().default(sql`'[]'::jsonb`),
    // 'edit_input' | 'edit_output' | 'edit_process' | 'edit_display'
    placement: varchar('placement', { length: 20 }).notNull(),
    flags: varchar('flags', { length: 8 }).notNull().default('g'),
    promptOnly: boolean('prompt_only').notNull().default(false),
    orderIndex: integer('order_index').notNull().default(0),
    minDepth: integer('min_depth'),
    maxDepth: integer('max_depth'),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    scopeIdx: index('regex_scripts_scope_idx').on(
      t.userId,
      t.scope,
      t.scopeId,
      t.placement,
      t.orderIndex,
    ),
  }),
);

// PLANv3 X2.7 — agent_configs + agent_runs (migration 0028).
export const agentConfigs = pgTable(
  'agent_configs',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 64 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    // 'pre_generation' | 'parallel' | 'post_processing'
    phase: varchar('phase', { length: 24 }).notNull(),
    enabled: boolean('enabled').notNull().default(true),
    connectionId: varchar('connection_id', { length: 36 }),
    promptTemplate: text('prompt_template').notNull().default(''),
    settings: jsonb('settings').notNull().default(sql`'{}'::jsonb`),
    tools: jsonb('tools').notNull().default(sql`'[]'::jsonb`),
    isBuiltin: boolean('is_builtin').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userPhaseIdx: index('agent_configs_user_phase_idx').on(t.userId, t.phase, t.enabled),
  }),
);

export const agentRuns = pgTable(
  'agent_runs',
  {
    id: id(),
    agentConfigId: fk('agent_config_id').references(() => agentConfigs.id, { onDelete: 'cascade' }),
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    turnIndex: integer('turn_index').notNull(),
    // 'pass' | 'retry' | 'block' | 'error'
    outcome: varchar('outcome', { length: 16 }).notNull().default('pass'),
    resultData: jsonb('result_data').notNull().default(sql`'{}'::jsonb`),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    latencyMs: integer('latency_ms'),
    shadow: boolean('shadow').notNull().default(false),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('agent_runs_session_idx').on(t.sessionId, t.turnIndex),
    configCreatedIdx: index('agent_runs_config_created_idx').on(t.agentConfigId, t.createdAt),
    // PLANv3 audit P0 — dedupe shadow hook firing inside retry loop.
    sessionTurnConfigUniq: uniqueIndex('agent_runs_session_turn_config_uniq').on(
      t.sessionId,
      t.turnIndex,
      t.agentConfigId,
    ),
  }),
);

// PLANv3 X4.3 — session_context_state frontier (migration 0032).
export const sessionContextState = pgTable(
  'session_context_state',
  {
    sessionId: varchar('session_id', { length: 36 })
      .primaryKey()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    lastCompactedTurn: integer('last_compacted_turn').notNull().default(0),
    maintenanceDebt: integer('maintenance_debt').notNull().default(0),
    snapshotFreshAt: timestamp('snapshot_fresh_at', { withTimezone: true }),
    wakeUpPacket: jsonb('wake_up_packet'),
    frontierDepth: integer('frontier_depth').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    debtIdx: index('session_context_state_debt_idx').on(t.maintenanceDebt),
  }),
);

// PLANv3 X4.1 (post-batch) — context_blobs externalization (migration 0036).
export const contextBlobs = pgTable(
  'context_blobs',
  {
    id: id(),
    sessionId: fk('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
    mimeType: varchar('mime_type', { length: 128 }).notNull().default('text/plain'),
    sizeBytes: integer('size_bytes').notNull(),
    contentRef: text('content_ref').notNull(),
    digest: text('digest').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionIdx: index('context_blobs_session_idx').on(t.sessionId, t.createdAt),
  }),
);

// PLANv3 X4.2 (post-batch) — context_node_sources lineage (migration 0037).
export const contextNodeSources = pgTable(
  'context_node_sources',
  {
    contextNodeId: varchar('context_node_id', { length: 36 })
      .notNull()
      .references(() => contextNodes.id, { onDelete: 'cascade' }),
    // 'message' | 'node' | 'blob'
    sourceType: varchar('source_type', { length: 16 }).notNull(),
    sourceId: varchar('source_id', { length: 36 }).notNull(),
    rangeStart: integer('range_start'),
    rangeEnd: integer('range_end'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.contextNodeId, t.sourceType, t.sourceId] }),
    sourceIdx: index('context_node_sources_source_idx').on(t.sourceType, t.sourceId),
  }),
);

// PLANv3 X4.5 (post-batch) — typed memory graph nodes (migration 0038).
export const memoryGraphNodes = pgTable(
  'memory_graph_nodes',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    // 'user' | 'character' | 'location' | 'item' | 'event' | 'promise' | 'mistake'
    kind: varchar('kind', { length: 32 }).notNull(),
    canonicalName: text('canonical_name').notNull(),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userKindIdx: index('memory_graph_nodes_user_kind_idx').on(t.userId, t.kind),
  }),
);

// PLANv3 X4.5 (post-batch) — typed memory graph edges (migration 0038).
export const memoryGraphEdges = pgTable(
  'memory_graph_edges',
  {
    id: id(),
    fromNodeId: fk('from_node_id').references(() => memoryGraphNodes.id, { onDelete: 'cascade' }),
    toNodeId: fk('to_node_id').references(() => memoryGraphNodes.id, { onDelete: 'cascade' }),
    predicate: varchar('predicate', { length: 64 }).notNull(),
    validFrom: timestamp('valid_from', { withTimezone: true }),
    validTo: timestamp('valid_to', { withTimezone: true }),
    confidence: real('confidence').notNull().default(1.0),
    sourceMessageId: varchar('source_message_id', { length: 36 }).references(
      () => chatMessages.id,
      { onDelete: 'set null' },
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    fromIdx: index('memory_graph_edges_from_idx').on(t.fromNodeId, t.predicate),
    toIdx: index('memory_graph_edges_to_idx').on(t.toNodeId, t.predicate),
  }),
);

// ─── PLANIMPv1 Phase A ────────────────────────────────────────────────────────

// 0042 — content_revisions: append-only field history for rich-text fields.
export const contentRevisions = pgTable(
  'content_revisions',
  {
    id: id(),
    entityType: varchar('entity_type', { length: 16 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    fieldKey: varchar('field_key', { length: 40 }).notNull(),
    version: integer('version').notNull().default(1),
    authorId: fk('author_id').references(() => users.id, { onDelete: 'cascade' }),
    summary: varchar('summary', { length: 200 }),
    contentMd: text('content_md').notNull(),
    contentHtml: text('content_html').notNull().default(''),
    tokenCount: integer('token_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index('content_revisions_entity_idx').on(t.entityType, t.entityId, t.fieldKey, t.version),
    authorIdx: index('content_revisions_author_idx').on(t.authorId, t.createdAt),
  }),
);

// 0043 — comments: polymorphic threaded comments for characters & stories.
export const comments = pgTable(
  'comments',
  {
    id: id(),
    entityType: varchar('entity_type', { length: 16 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    parentId: varchar('parent_id', { length: 36 }),
    authorId: fk('author_id').references(() => users.id, { onDelete: 'cascade' }),
    bodyMd: text('body_md').notNull(),
    bodyHtml: text('body_html').notNull().default(''),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    upvotes: integer('upvotes').notNull().default(0),
    downvotes: integer('downvotes').notNull().default(0),
    pinnedByOwner: boolean('pinned_by_owner').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index('comments_entity_idx').on(t.entityType, t.entityId, t.createdAt),
    parentIdx: index('comments_parent_idx').on(t.parentId),
    authorIdx: index('comments_author_idx').on(t.authorId, t.createdAt),
  }),
);

export const commentVotes = pgTable(
  'comment_votes',
  {
    commentId: fk('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    vote: integer('vote').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.commentId, t.userId] }),
  }),
);

// 0044 — ratings: 5-star rating per (user, entity).
export const ratings = pgTable(
  'ratings',
  {
    entityType: varchar('entity_type', { length: 16 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    stars: integer('stars').notNull(),
    reviewMd: text('review_md'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.entityType, t.entityId, t.userId] }),
    entityIdx: index('ratings_entity_idx').on(t.entityType, t.entityId),
  }),
);

// 0045 — content_translations: cached translations per (entity, field, lang).
export const contentTranslations = pgTable(
  'content_translations',
  {
    id: id(),
    entityType: varchar('entity_type', { length: 16 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    fieldKey: varchar('field_key', { length: 40 }).notNull(),
    sourceLang: varchar('source_lang', { length: 8 }).notNull(),
    targetLang: varchar('target_lang', { length: 8 }).notNull(),
    // BACKLOG B1.2 — sha1 of the source markdown at translation time. When
    // the source field changes the cache is considered stale and refetched.
    sourceHash: varchar('source_hash', { length: 40 }).notNull().default(''),
    contentMd: text('content_md').notNull(),
    contentHtml: text('content_html').notNull().default(''),
    costUsd: real('cost_usd').notNull().default(0),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index('content_translations_entity_idx').on(t.entityType, t.entityId),
    uniqueTranslation: uniqueIndex('content_translations_unique_idx').on(
      t.entityType, t.entityId, t.fieldKey, t.targetLang,
    ),
  }),
);

// 0046 — reactions: polymorphic like/bookmark/rose for characters.
export const reactions = pgTable(
  'reactions',
  {
    entityType: varchar('entity_type', { length: 16 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 20 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.entityType, t.entityId, t.userId, t.kind] }),
    entityIdx: index('reactions_entity_idx').on(t.entityType, t.entityId, t.kind),
  }),
);

// 0049 — content_reports: user-submitted moderation reports.
export const contentReports = pgTable(
  'content_reports',
  {
    id: id(),
    entityType: varchar('entity_type', { length: 16 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    reporterId: fk('reporter_id').references(() => users.id, { onDelete: 'cascade' }),
    category: varchar('category', { length: 32 }).notNull(),
    detail: varchar('detail', { length: 1000 }),
    status: varchar('status', { length: 16 }).notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewerId: varchar('reviewer_id', { length: 36 }),
  },
  (t) => ({
    entityIdx: index('content_reports_entity_idx').on(t.entityType, t.entityId, t.status),
    statusIdx: index('content_reports_status_idx').on(t.status, t.createdAt),
  }),
);

// Analytics events (30-day retention).
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: id(),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    userId: varchar('user_id', { length: 36 }),
    entityType: varchar('entity_type', { length: 16 }),
    entityId: varchar('entity_id', { length: 36 }),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index('analytics_events_entity_idx').on(t.entityType, t.entityId, t.createdAt),
    typeIdx: index('analytics_events_type_idx').on(t.eventType, t.createdAt),
  }),
);

// Discover trending scores cache.
export const discoverScores = pgTable(
  'discover_scores',
  {
    entityType: varchar('entity_type', { length: 16 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    score: real('score').notNull().default(0),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.entityType, t.entityId] }),
  }),
);

// 0050 — followers (PLANIMPv7 §4).
export const followers = pgTable(
  'followers',
  {
    followerUserId: fk('follower_user_id').references(() => users.id, { onDelete: 'cascade' }),
    followedUserId: fk('followed_user_id').references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.followerUserId, t.followedUserId] }),
    followedIdx: index('followers_followed_idx').on(t.followedUserId),
    followerIdx: index('followers_follower_idx').on(t.followerUserId),
  }),
);

// 0050 — moderation_actions (PLANIMPv7 §2.3).
export const moderationActions = pgTable(
  'moderation_actions',
  {
    id: id(),
    adminUserId: varchar('admin_user_id', { length: 36 }).references(() => users.id, { onDelete: 'set null' }),
    entityType: varchar('entity_type', { length: 16 }).notNull(),
    entityId: varchar('entity_id', { length: 36 }).notNull(),
    action: varchar('action', { length: 24 }).notNull(),
    reason: text('reason'),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entityIdx: index('moderation_actions_entity_idx').on(t.entityType, t.entityId),
    adminIdx: index('moderation_actions_admin_idx').on(t.adminUserId),
  }),
);

// =============================================================================
// 0056 — user_mc_profiles (MC System)
// =============================================================================

/**
 * User MC Profiles - allows users to create and manage their protagonist personas
 * for story discovery mode.
 */
export const userMcProfiles = pgTable(
  'user_mc_profiles',
  {
    id: id(),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    // MC Persona - flexible JSONB structure
    // Schema: { age, gender, personality, appearance, background, speechStyle, customFields }
    persona: jsonb('persona').notNull().default(sql`'{}'::jsonb`).$type<{
      age?: number | null;
      gender?: string | null;
      personality: string;
      appearance?: string | null;
      background?: string | null;
      speechStyle?: string | null;
      customFields?: Record<string, unknown>;
    }>(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('user_mc_profiles_user_idx').on(t.userId),
    defaultIdx: uniqueIndex('user_mc_profiles_default_idx').on(t.userId).where(sql`is_default = true`),
  }),
);

// =============================================================================
// 0058 — story_cast_progress (Cast Discovery Tracking)
// =============================================================================

/**
 * Story Cast Progress - tracks user's discovery progress through story cast members
 * in story discovery mode (soft goal: meet all cast).
 */
export const storyCastProgress = pgTable(
  'story_cast_progress',
  {
    id: id(),
    storyId: fk('story_id').references(() => stories.id, { onDelete: 'cascade' }),
    userId: fk('user_id').references(() => users.id, { onDelete: 'cascade' }),
    sessionId: varchar('session_id', { length: 36 }),
    // MC Profile used for this story
    mcProfileId: varchar('mc_profile_id', { length: 36 }),
    // Which cast members have been met (UUID array for fast lookup)
    metCharacterIds: jsonb('met_character_ids').notNull().default(sql`'[]'::jsonb`).$type<string[]>(),
    totalCastCount: integer('total_cast_count').notNull().default(0),
    metCount: integer('met_count').notNull().default(0),
    // First encounter tracking
    firstMetAt: timestamp('first_met_at', { withTimezone: true }),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }).notNull().defaultNow(),
    // Discovery metadata
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`).$type<{
      favoriteCast?: string | null;
      discoveryPace?: 'fast' | 'slow' | 'balanced';
      notes?: string;
      encounterOrder?: string[];
      totalTurns?: number;
      avgTurnsPerEncounter?: number;
    }>(),
    // Completion status (soft goal - not enforced)
    isComplete: boolean('is_complete').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index('story_cast_progress_user_idx').on(t.userId),
    storyIdx: index('story_cast_progress_story_idx').on(t.storyId),
    uniqueIdx: uniqueIndex('story_cast_progress_unique_idx').on(t.storyId, t.userId),
    sessionIdx: index('story_cast_progress_session_idx').on(t.sessionId),
  }),
);

// =============================================================================
// 0059 — story_cast_encounters (Detailed Encounter Tracking)
// =============================================================================

/**
 * Story Cast Encounters - detailed tracking for each cast member encounter
 * including first impression, relationship stats, and notes.
 */
export const storyCastEncounters = pgTable(
  'story_cast_encounters',
  {
    id: id(),
    progressId: fk('progress_id').references(() => storyCastProgress.id, { onDelete: 'cascade' }),
    characterId: fk('character_id').references(() => characters.id, { onDelete: 'cascade' }),
    // Encounter details
    firstMetAt: timestamp('first_met_at', { withTimezone: true }).notNull().defaultNow(),
    encounterCount: integer('encounter_count').notNull().default(1),
    lastInteractionAt: timestamp('last_interaction_at', { withTimezone: true }).notNull().defaultNow(),
    // First impression
    firstImpression: varchar('first_impression', { length: 50 }),
    // Cumulative relationship stats
    trustDelta: integer('trust_delta').notNull().default(0),
    affectionDelta: integer('affection_delta').notNull().default(0),
    tensionDelta: integer('tension_delta').notNull().default(0),
    // Scene context
    firstMeetingScene: text('first_meeting_scene'),
    firstMeetingMood: varchar('first_meeting_mood', { length: 50 }),
    // User notes
    userNotes: text('user_notes'),
    // Metadata
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    progressIdx: index('story_cast_encounters_progress_idx').on(t.progressId),
    characterIdx: index('story_cast_encounters_character_idx').on(t.characterId),
    uniqueIdx: uniqueIndex('story_cast_encounters_unique_idx').on(t.progressId, t.characterId),
  }),
);
