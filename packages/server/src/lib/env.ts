import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgres://postgres:postgres@localhost:5432/neigo'),
  /** Optional non-pooled Postgres URL used only for migrations (drizzle-kit). */
  DIRECT_URL: z.string().optional(),
  /** Supabase project URL (PostgREST / Data API base). */
  SUPABASE_URL: z.string().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  REDIS_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32).refine(
    (v) => !v.includes('change-me') && !v.includes('placeholder') && !v.includes('secret'),
    { message: 'JWT_SECRET must be a cryptographically random string — not a placeholder' },
  ),
  COOKIE_DOMAIN: z.string().default('localhost'),
  OPENROUTER_API_KEY: z.string().optional(),
  NOUS_API_KEY: z.string().optional(),
  AI_API_KEY: z.string().optional(),
  /** Optional light-model API key (e.g. Hermes-4-70B). Falls back to NOUS_API_KEY. */
  NOUS_LIGHT_API_KEY: z.string().optional(),
  /** 32-byte hex key for AES-256-GCM encryption of user BYOK keys. Generate with: openssl rand -hex 32 */
  BYOK_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/).optional(),
  AI_MODEL: z.string().default('Hermes-4-405B'),
  /** Light model used for small-model tail calls (CYOA, summaries). */
  AI_LIGHT_MODEL: z.string().default('Hermes-4-70B'),
  AI_BASE_URL: z.string().default('https://inference-api.nousresearch.com/v1'),
  AI_USER_DAILY_CAP_CENTS: z.coerce.number().int().positive().default(50),
  AI_GLOBAL_DAILY_CAP_CENTS: z.coerce.number().int().positive().default(2000),
  OPS_API_KEY: z.string().optional(),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  ENABLE_PUSH_NOTIFICATIONS: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  ENABLE_LEARNER_ROUTES: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  // Web Push VAPID keys. Generate with: node -e "require('web-push').generateVAPIDKeys()"
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().default('mailto:admin@neigo.local'),
  // ── M1 Feature Flags ──────────────────────────────────────────────
  MISTAKES_REGISTRY_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  MEMORY_HYBRID_RRF_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  CHARACTER_DIARY_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  // ── M2 Feature Flags ──────────────────────────────────────────────
  CONTEXT_DAG_CONDENSE_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  LCM_ESCALATION_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  // ── M3 Feature Flags ──────────────────────────────────────────────
  MEMORY_MULTI_FACTOR_SCORE_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  SESSION_SNAPSHOT_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  CHARACTER_FACTS_GRAPH_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  // Wk2 PLANv2 F4 — prompt snapshot capture (FOUNDER-first debug tool).
  PROMPT_SNAPSHOTS_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  // Wk5 PLANv2 F3 — CYOA choice chips via Hermes-4-70B tail call.
  CYOA_CHOICES_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  // ── PLANv3 X-series feature flags ────────────────────────────────
  // X2.1 — wrap prompt sections in XML envelopes (Claude/OpenRouter citation accuracy).
  PROMPT_XML_WRAP_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  // X2.2 — enable BYOK connection test-ping endpoint.
  BYOK_TEST_PING_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  // X2.3 — advanced CBS macros (setvar/getvar/if/calc/comment/br).
  MACRO_ADVANCED_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  // X2.5 — regex scripts 4-mode (edit_input/output/process/display).
  REGEX_SCRIPTS_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  // X2.6 — lorebook @@decorators parser + recursive scan.
  LOREBOOK_DECORATORS_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  LOREBOOK_RECURSIVE_SCAN_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  // X2.7 — agent pipeline framework (shadow + live gating).
  AGENT_PIPELINE_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  AGENT_PIPELINE_SHADOW: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  // X2.4 — marker-based reorderable preset mode.
  PROMPT_PRESET_MARKER_MODE: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  // X3.2 — auto-continue on incomplete sentence.
  AUTO_CONTINUE_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  // X4.6 — smart memory recall/save heuristic policy.
  SMART_RECALL_POLICY_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  // X4.4 — transcript recall via context-retrieval.expandQuery, fires only
  // when user message matches isRecallQuery patterns and session is
  // past the warm-up window. Off by default; flip on after shadow A/B.
  TRANSCRIPT_RECALL_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('false')
    .transform((v) => v === 'true'),
  // PLANBv4 X4.5 — memory graph upsert wiring + prompt retrieval slot.
  MEMORY_GRAPH_WRITE_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  MEMORY_GRAPH_PROMPT_ENABLED: z
    .union([z.literal('true'), z.literal('false')])
    .default('true')
    .transform((v) => v === 'true'),
  // BACKLOG B2.14 — comma-separated list of host suffixes allowed for <img src>
  // in user-rendered markdown. Empty / unset = pass-through (legacy behaviour).
  // Example: "r2.neigo.app,images.unsplash.com,cdn.discordapp.com".
  R2_PUBLIC_DOMAINS: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean),
    ),
});

export const env = schema.parse(process.env);
export type Env = typeof env;
