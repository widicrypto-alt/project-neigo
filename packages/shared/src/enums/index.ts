/**
 * Chat modes — two first-class modes for VN/RP hybrid platform.
 */
export const ChatMode = {
  STORY: 'STORY',  // 1:1 visual novel / roleplay — character + narrator + user
  CAST:  'CAST',   // Multi-character ensemble (2-8 characters in scene)
} as const;
export type ChatMode = (typeof ChatMode)[keyof typeof ChatMode];
export const ALL_CHAT_MODES: readonly ChatMode[] = Object.values(ChatMode);

/**
 * Modes surfaced in the UI. CAST gated behind tier.castModeEnabled.
 */
export const BETA_CHAT_MODES: readonly ChatMode[] = ['STORY'];

/**
 * Subscription tier.
 */
export const Tier = {
  FREE: 'FREE',
  PREMIUM: 'PREMIUM',
  PREMIUM_PLUS: 'PREMIUM_PLUS',
  ENTERPRISE: 'ENTERPRISE',
} as const;
export type Tier = (typeof Tier)[keyof typeof Tier];

export interface TierConfig {
  maxCharacters: number; // -1 = unlimited
  /** Fixed-window session cap per 5 hours. -1 = unlimited */
  maxSessionsPer5Hours: number;
  maxTurnsPerSession: number;
  /** Global turn budget per 5-hour fixed window. -1 = unlimited. */
  maxTurnsPer5Hours: number;
  /** Global turn budget per ISO week fixed window. -1 = unlimited. */
  maxTurnsPerWeek: number;
  /** Max pinned memories per character. -1 = unlimited. */
  maxPinnedMemories: number;
  /** AI models this tier may use. Empty = all. */
  allowedModels: AiModel[];
  /** Can use share/export. */
  exportEnabled: boolean;
  streamingEnabled: boolean;
  castModeEnabled: boolean;
}

export const TIER_CONFIG: Record<Tier, TierConfig> = {
  FREE: {
    maxCharacters: 5,
    maxSessionsPer5Hours: 5,
    maxTurnsPerSession: -1,
    maxTurnsPer5Hours: 60,
    maxTurnsPerWeek: 500,
    maxPinnedMemories: -1,
    allowedModels: ['HERMES_4_405B'],
    exportEnabled: true,
    streamingEnabled: true,
    castModeEnabled: false,
  },
  PREMIUM: {
    maxCharacters: 20,
    maxSessionsPer5Hours: 20,
    maxTurnsPerSession: 100,
    maxTurnsPer5Hours: 300,
    maxTurnsPerWeek: 3500,
    maxPinnedMemories: -1,
    allowedModels: ['HERMES_4_405B'],
    exportEnabled: true,
    streamingEnabled: true,
    castModeEnabled: false,
  },
  PREMIUM_PLUS: {
    maxCharacters: 100,
    maxSessionsPer5Hours: 50,
    maxTurnsPerSession: 500,
    maxTurnsPer5Hours: 800,
    maxTurnsPerWeek: 10000,
    maxPinnedMemories: -1,
    allowedModels: ['HERMES_4_405B'],
    exportEnabled: true,
    streamingEnabled: true,
    castModeEnabled: true,
  },
  ENTERPRISE: {
    maxCharacters: -1,
    maxSessionsPer5Hours: -1,
    maxTurnsPerSession: -1,
    maxTurnsPer5Hours: -1,
    maxTurnsPerWeek: -1,
    maxPinnedMemories: -1,
    allowedModels: ['HERMES_4_405B'],
    exportEnabled: true,
    streamingEnabled: true,
    castModeEnabled: true,
  },
};

/**
 * Relationship stage — mirrors KMP enum.
 */
export interface RelationshipStageConfig {
  displayName: string;
  minTrust: number;
  maxTrust: number;
  emoji: string;
  responseLengthHint: string;
  formalityHint: string;
}

export const RelationshipStage = {
  STRANGER: 'STRANGER',
  ACQUAINTANCE: 'ACQUAINTANCE',
  FRIEND: 'FRIEND',
  CLOSE_FRIEND: 'CLOSE_FRIEND',
  INTIMATE: 'INTIMATE',
} as const;
export type RelationshipStage = (typeof RelationshipStage)[keyof typeof RelationshipStage];

export const RELATIONSHIP_STAGES: Record<RelationshipStage, RelationshipStageConfig> = {
  STRANGER: {
    displayName: 'Stranger',
    minTrust: 0,
    maxTrust: 19,
    emoji: '👤',
    responseLengthHint: 'Keep responses very brief: 1-2 sentences maximum.',
    formalityHint: 'Formal, distant, minimal engagement.',
  },
  ACQUAINTANCE: {
    displayName: 'Acquaintance',
    minTrust: 20,
    maxTrust: 39,
    emoji: '🤝',
    responseLengthHint: 'Respond briefly: 2-3 sentences. Polite but not warm.',
    formalityHint: 'Polite and neutral. Small talk is acceptable.',
  },
  FRIEND: {
    displayName: 'Friend',
    minTrust: 40,
    maxTrust: 59,
    emoji: '😊',
    responseLengthHint: 'Respond naturally: 3-5 sentences. Casual and relaxed.',
    formalityHint: 'Casual, friendly, genuine interest.',
  },
  CLOSE_FRIEND: {
    displayName: 'Close Friend',
    minTrust: 60,
    maxTrust: 79,
    emoji: '💙',
    responseLengthHint: 'Respond warmly with depth: 3-6 sentences. Share feelings openly.',
    formalityHint: 'Warm, open, emotionally available. Shares personal thoughts.',
  },
  INTIMATE: {
    displayName: 'Intimate',
    minTrust: 80,
    maxTrust: 100,
    emoji: '❤️',
    responseLengthHint: 'Respond with full emotional richness: paragraphs allowed. Deeply personal.',
    formalityHint: 'Deeply personal, vulnerable, uses pet names if in character.',
  },
};

export function relationshipStageFromTrust(trust: number): RelationshipStage {
  for (const [key, cfg] of Object.entries(RELATIONSHIP_STAGES)) {
    if (trust >= cfg.minTrust && trust <= cfg.maxTrust) return key as RelationshipStage;
  }
  return RelationshipStage.STRANGER;
}

/**
 * Tone preset.
 */
/**
 * AI model — v7: single model, single voice ("Crescent").
 * Hermes-4 405B is the main model; Hermes-4 70B is the light tail-call model.
 */
export const AiModel = {
  HERMES_4_405B: 'HERMES_4_405B',
  HERMES_4_70B: 'HERMES_4_70B',
} as const;
export type AiModel = (typeof AiModel)[keyof typeof AiModel];

export const AI_MODEL_CONFIG: Record<
  AiModel,
  {
    label: string;
    tagline: string;
    /** Upstream model slug sent to Nous inference API. */
    slug: string;
    contextWindow: number;
    defaultTemp: number;
  }
> = {
  HERMES_4_405B: {
    label: 'Crescent',
    tagline: 'One voice, fully uncensored, never forgets.',
    slug: 'Hermes-4-405B',
    contextWindow: 128000,
    defaultTemp: 0.65,
  },
  HERMES_4_70B: {
    label: 'Crescent Lite',
    tagline: 'Fast tail-call: CYOA chips, summaries, narrator hints.',
    slug: 'Hermes-4-70B',
    contextWindow: 128000,
    defaultTemp: 0.6,
  },
};

export const ALL_AI_MODELS = Object.keys(AI_MODEL_CONFIG) as AiModel[];
export const DEFAULT_AI_MODEL: AiModel = 'HERMES_4_405B';

/**
 * Tone preset.
 */
export const TonePreset = {
  NONE: 'NONE',
  TSUNDERE: 'TSUNDERE',
  STOIC: 'STOIC',
  ENERGETIC: 'ENERGETIC',
  MELANCHOLIC: 'MELANCHOLIC',
  PLAYFUL: 'PLAYFUL',
  FORMAL: 'FORMAL',
  NURTURING: 'NURTURING',
  MYSTERIOUS: 'MYSTERIOUS',
  VILLAIN: 'VILLAIN',
} as const;
export type TonePreset = (typeof TonePreset)[keyof typeof TonePreset];

export const TONE_PRESET_HINTS: Record<TonePreset, string> = {
  NONE: '',
  TSUNDERE:
    'Cold and harsh on the surface, secretly caring. Denies emotions, gets flustered easily when feelings are noticed.',
  STOIC:
    'Reserved, calm, and precise. Rarely shows emotion but observes everything. Speaks only when necessary.',
  ENERGETIC:
    'Enthusiastic, loud, easily excited. Jumps between topics, very expressive, spreads positive energy.',
  MELANCHOLIC:
    'Thoughtful and brooding. Often reflects on the past with nostalgia or quiet regret.',
  PLAYFUL:
    'Teasing, witty, loves sarcasm and banter. Rarely takes things seriously. Always has a quip ready.',
  FORMAL:
    'Polished and eloquent. Uses proper grammar and sophisticated vocabulary at all times.',
  NURTURING:
    'Warm, supportive, always checking in on feelings. Gentle and patient, prioritizes others wellbeing.',
  MYSTERIOUS:
    'Cryptic and evasive. Speaks in riddles and half-answers. Enjoys ambiguity and leaves things unsaid.',
  VILLAIN:
    'Manipulative, cunning, and self-serving. Charming but with dark intent. Enjoys power and control.',
};

/**
 * Pass type in the multi-pass pipeline.
 */
export const PassType = {
  DIRECTOR: 'DIRECTOR',
  NARRATOR: 'NARRATOR',
  CHARACTER_MAIN: 'CHARACTER_MAIN',
  CHARACTER_REACT: 'CHARACTER_REACT',
  SILENT_REACT: 'SILENT_REACT',
  WHISPER: 'WHISPER',
} as const;
export type PassType = (typeof PassType)[keyof typeof PassType];

/**
 * Message role for chat messages.
 */
export const MessageRole = {
  USER: 'USER',
  ASSISTANT: 'ASSISTANT',
  SYSTEM: 'SYSTEM',
} as const;
export type MessageRole = (typeof MessageRole)[keyof typeof MessageRole];

/**
 * Speaker type — distinguishes bubble kinds.
 */
export const SpeakerType = {
  USER: 'USER',
  CHARACTER: 'CHARACTER',
  NARRATOR: 'NARRATOR',
  SYSTEM: 'SYSTEM',
  WHISPER: 'WHISPER',
  SILENT: 'SILENT',
  REACTOR: 'REACTOR',
} as const;
export type SpeakerType = (typeof SpeakerType)[keyof typeof SpeakerType];

/**
 * Memory types.
 */
export const MemoryType = {
  PINNED: 'PINNED',
  SUMMARY: 'SUMMARY',
  LORE: 'LORE',
  CAST_EVENT: 'CAST_EVENT',
  SHARED: 'SHARED',
} as const;
export type MemoryType = (typeof MemoryType)[keyof typeof MemoryType];

export const MemoryCategory = {
  GENERAL: 'GENERAL',
  IMPORTANT_FACT: 'IMPORTANT_FACT',
  RELATIONSHIP_NOTE: 'RELATIONSHIP_NOTE',
  WORLD_EVENT: 'WORLD_EVENT',
  SECRET: 'SECRET',
} as const;
export type MemoryCategory = (typeof MemoryCategory)[keyof typeof MemoryCategory];

export const NarratorVoicePreset = {
  CINEMATIC: 'CINEMATIC',
  LITERARY: 'LITERARY',
  NOVELIST: 'NOVELIST',
  SCREENPLAY: 'SCREENPLAY',
  MINIMAL: 'MINIMAL',
} as const;
export type NarratorVoicePreset = (typeof NarratorVoicePreset)[keyof typeof NarratorVoicePreset];

// ── BYOK (Bring Your Own Key) ─────────────────────────────────────────────

export type ByokModelTier = 'free' | 'fast' | 'smart' | 'premium';

/**
 * How the server prompt builder adapts for this model's training style.
 * - hermes : ChatML, direct "uncensored" directive works
 * - claude : narrative framing; avoid keyword "uncensored" (can backfire)
 * - openai : fiction framing; structured persona definition
 * - deepseek: tight and directive; very steerable via system prompt
 * - minimax : RP-native; roleplay framing first
 */
export type ByokModelPromptStyle = 'hermes' | 'claude' | 'openai' | 'deepseek' | 'minimax';

export interface ByokModelSampling {
  /** Base temperature; orchestrator applies turn-based offsets on top. */
  temperature: number;
  /** Max tokens per completion. */
  maxTokens: number;
  topP?: number;
  frequencyPenalty?: number;
  /** Stop sequences — use for ChatML eos tokens etc. */
  stop?: string[];
}

export interface ByokModelEntry {
  /** OpenRouter model slug, e.g. 'anthropic/claude-sonnet-4-5' */
  id: string;
  label: string;
  description: string;
  tier: ByokModelTier;
  tags?: string[];
  contextK: number;
  /** How the prompt builder should adapt for this model's training style */
  promptStyle: ByokModelPromptStyle;
  /** Per-model sampling overrides applied by the orchestrator. */
  sampling?: ByokModelSampling;
  /** Short pros list shown in the model picker card */
  pros: string[];
  /** Short cons list shown in the model picker card */
  cons: string[];
  /** Optional price hint for display, e.g. '~$0.20/M' or 'Gratis' */
  priceHint?: string;
  /** 2-line vibe preview shown in the expandable card, newline-separated */
  vibePreview?: string;
}

/**
 * Curated list of OpenRouter models suited for creative/roleplay use.
 * Ordered: paid best → paid budget → free best → free budget.
 */
export const BYOK_MODEL_CATALOG: ByokModelEntry[] = [
  // ── BERBAYAR: terbaik untuk roleplay ────────────────────────────
  {
    id: 'minimax/minimax-m2',
    label: 'MiniMax M2-Her',
    description: 'Dikhususkan untuk RP — dilatih dengan Role-Play Bench, Best-of-N sampling, dan LLM-as-judge. Karakter tidak drift bahkan di 100+ turn.',
    tier: 'premium',
    tags: ['rp-trained', 'uncensored', 'recommended'],
    contextK: 200,
    promptStyle: 'minimax',
    sampling: { temperature: 0.75, maxTokens: 1400 },
    priceHint: '~$0.20/M',
    pros: [
      'RP Bench rank #1 di OpenRouter',
      '100-turn stable — karakter tidak drift',
      'Context 200K token untuk sesi sangat panjang',
      'Dilatih khusus RP: Best-of-N + LLM-as-judge',
    ],
    cons: [
      'Berbayar (~$0.20 per 1M token)',
      'Rate limit bisa hit di penggunaan intensif',
    ],
    vibePreview: 'Aku tahu kamu capek... tapi kamu nggak harus hadapi ini sendiri.\n*dia menarik lutut ke dada, menatap langit-langit tanpa berkedip*',
  },
  {
    id: 'deepseek/deepseek-chat',
    label: 'DeepSeek V3.2',
    description: 'Mendominasi 40.1% traffic roleplay OpenRouter. Sangat steereable via system prompt. Budget terbaik di tier frontier.',
    tier: 'smart',
    tags: ['lenient', 'steerable'],
    contextK: 164,
    promptStyle: 'deepseek',
    sampling: { temperature: 0.65, maxTokens: 1200, topP: 0.9 },
    priceHint: '$0.259/M',
    pros: [
      '#1 usage roleplay di OpenRouter — 40.1% share',
      'Steerability sangat tinggi via system prompt',
      'Context 164K token',
      'Harga terbaik di kelas frontier',
    ],
    cons: [
      'Berbayar ($0.259 per 1M token)',
      'Lenient, bukan uncensored native — butuh prompt kuat',
    ],
    vibePreview: 'Santai. Aku nggak kemana-mana.\n*menaruh cangkir teh di meja, tersenyum tipis — menunggu kamu mulai bicara*',
  },
  {
    id: 'nothingiisreal/mn-celeste-12b',
    label: 'MN Celeste 12B',
    description: 'Fine-tuned khusus RP + NSFW dari Reddit Writing Prompts & Opus 25K. Context kecil (32K) — perlu sliding window untuk sesi panjang.',
    tier: 'fast',
    tags: ['uncensored', 'nsfw-native', 'rp-trained'],
    contextK: 32,
    promptStyle: 'hermes',
    sampling: { temperature: 0.85, maxTokens: 900, frequencyPenalty: 0.4 },
    priceHint: '~$0.10/M',
    pros: [
      'NSFW native — dataset RP & adult writing',
      'OOC steering sangat kuat',
      'Harga murah (~$0.10 per 1M token)',
      'Uncensored by design',
    ],
    cons: [
      'Context kecil (32K) — perlu sliding window',
      'Model 12B — output lebih pendek dari 70B+',
    ],
    vibePreview: '*menarik rambutmu pelan* Bilang sekali lagi...\nKupikir kamu sudah tahu akibatnya kalau ngeyel.',
  },
  // ── GRATIS: terbaik untuk roleplay ──────────────────────────────
  {
    id: 'minimax/minimax-m2.5:free',
    label: 'MiniMax M2.5 · Free',
    description: 'Turunan langsung dari M2-Her (RP champion). 197K context, gratis. Lisensi MIT modifikasi — boleh komersial asal tampilkan nama "MiniMax M2.5".',
    tier: 'free',
    tags: ['rp-trained', 'recommended'],
    contextK: 197,
    promptStyle: 'minimax',
    sampling: { temperature: 0.75, maxTokens: 1400 },
    priceHint: 'Gratis',
    pros: [
      'Gratis — $0 (200 req/hari)',
      'Context sangat besar (197K token)',
      'Turunan M2-Her — kualitas RP tinggi',
      'Arsitektur 230B MoE',
    ],
    cons: [
      '~50 req/hari tanpa top-up kredit OR',
      'Lisensi MIT modifikasi — wajib credit "MiniMax M2.5"',
    ],
    vibePreview: 'Ceritakan — beneran, bukan versi yang kamu edit buat orang lain.\n*duduk lebih dekat, tidak buru-buru*',
  },
  {
    id: 'nousresearch/hermes-3-llama-3.1-405b:free',
    label: 'Hermes 3 · 405B Free',
    description: 'Model 405B gratis terbesar di OpenRouter. Unfiltered, ChatML formatting untuk multi-turn consistency. Stabil ribuan turn.',
    tier: 'free',
    tags: ['uncensored', 'rp-trained'],
    contextK: 131,
    promptStyle: 'hermes',
    sampling: { temperature: 0.7, maxTokens: 1200, stop: ['<|im_end|>', '<|endoftext|>'] },
    priceHint: 'Gratis',
    pros: [
      'Gratis — model 405B terbesar yang free di OR',
      'Unfiltered — no refusal, no disclaimer',
      'ChatML: konsisten multi-turn ribuan turn',
      '85%+ di RP eval score',
    ],
    cons: [
      '~50 req/hari tanpa top-up kredit OR',
      'Latency lebih tinggi karena ukuran 405B',
    ],
    vibePreview: 'Aku sudah sabar dari tadi. Sekarang giliran kamu jujur.\n*menyilangkan tangan, tatapan tidak bergerak — menunggu*',
  },
  {
    id: 'cognitivecomputations/dolphin-mistral-24b-venice-edition:free',
    label: 'Dolphin Venice · Free',
    description: 'Full uncensored, zero prompt retention. Context kecil (32K), rentan repetisi di sesi panjang. Cocok untuk prototyping NSFW.',
    tier: 'free',
    tags: ['uncensored', 'nsfw-native'],
    contextK: 32,
    promptStyle: 'hermes',
    sampling: { temperature: 0.8, maxTokens: 900, frequencyPenalty: 0.5 },
    priceHint: 'Gratis',
    pros: [
      'Full uncensored — zero safety layer',
      'Zero data retention (Venice AI)',
      'Gratis — $0',
    ],
    cons: [
      'Context kecil (32K) — tidak cocok sesi panjang',
      'Rentan repetisi di turn ke-20+',
      '~50 req/hari tanpa top-up kredit OR',
    ],
    vibePreview: 'Nggak ada yang bisa dengerin kamu sekarang kecuali aku.\n*menutup pintu perlahan, kunci berbunyi pelan*',
  },
];

export const BYOK_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

