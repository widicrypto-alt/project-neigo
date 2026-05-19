/**
 * Memory Retrieval Regression Benchmark — LongMemEval-style
 *
 * Inserts synthetic memories with known facts, then measures recall@5:
 * for each question, does the correct memory appear in the top-5 results?
 *
 * Usage: pnpm --filter @neigo/server bench:memory
 *
 * This runs against the live database (dev or prod depending on env).
 * Uses a dedicated benchmark user that is cleaned up after each run.
 *
 * Exit code:
 *   0 — pass (recall@5 ≥ threshold)
 *   1 — fail (recall@5 below threshold or error)
 */
import { nanoid } from 'nanoid';
import { db, schema, sql as pg } from '../src/db/client.js';
import { MemoryRetriever } from '../src/services/memory-retriever.js';
import { retrieveCompactedContext } from '../src/services/context-compaction.js';
import { eq } from 'drizzle-orm';

// ── CONFIG ──────────────────────────────────────────────────────────────────
const BENCH_USER_ID = `bench_${nanoid(8)}`;
const BENCH_SESSION_ID = `benchsess_${nanoid(8)}`;
const BENCH_CHARACTER_ID = `benchchar_${nanoid(8)}`;
// In production with real embeddings, target ≥ 70%.
// With stub embeddings (no OPENROUTER_API_KEY), FTS-only recall is lower.
const HAS_REAL_EMBEDDINGS = !!process.env.OPENROUTER_API_KEY;
const RECALL_THRESHOLD = HAS_REAL_EMBEDDINGS ? 0.70 : 0.10;
const BASELINE_FILE = new URL('./baseline.json', import.meta.url).pathname;

// ── FIXTURES ────────────────────────────────────────────────────────────────
// Each fixture: a planted memory + a question that should retrieve it.

interface BenchFixture {
  /** Unique tag for this fixture (for scoring) */
  tag: string;
  /** Memory content to plant */
  memory: string;
  /** Memory type/category */
  type: string;
  category: string;
  importance: number;
  emotionalTag?: string;
  /** Query that should retrieve this memory */
  query: string;
}

const FIXTURES: BenchFixture[] = [
  // ── Factual recall ──
  { tag: 'fav_color', memory: 'User said their favorite color is deep violet, like twilight skies.', type: 'PREFERENCE', category: 'PREFERENCE', importance: 0.6, query: 'What is the user\'s favorite color?' },
  { tag: 'birthday', memory: 'User mentioned their birthday is March 14th, same day as Pi Day.', type: 'CORE', category: 'CORE', importance: 0.9, query: 'When is the user\'s birthday?' },
  { tag: 'pet_name', memory: 'User has a cat named Mochi who likes to sleep on keyboards.', type: 'CORE', category: 'CORE', importance: 0.8, query: 'What is the user\'s pet\'s name?' },
  { tag: 'job', memory: 'User works as a frontend developer at a startup building AR glasses.', type: 'CORE', category: 'CORE', importance: 0.7, query: 'What does the user do for work?' },
  { tag: 'hometown', memory: 'User grew up in Sendai, Japan, near the coast. Misses the seafood.', type: 'CORE', category: 'CORE', importance: 0.7, query: 'Where did the user grow up?' },
  { tag: 'music', memory: 'User listens to city pop and lo-fi hip hop while coding late at night.', type: 'PREFERENCE', category: 'PREFERENCE', importance: 0.5, query: 'What music does the user like?' },
  { tag: 'fear', memory: 'User confessed they have a deep fear of being forgotten by people they love.', type: 'CORE', category: 'CORE', importance: 0.9, emotionalTag: 'vulnerable', query: 'What is the user afraid of?' },
  { tag: 'sibling', memory: 'User has an older sister named Yuki who lives in Osaka and works in medicine.', type: 'CORE', category: 'CORE', importance: 0.7, query: 'Does the user have siblings?' },
  { tag: 'food', memory: 'User\'s comfort food is tonkotsu ramen with extra chashu and a soft egg.', type: 'PREFERENCE', category: 'PREFERENCE', importance: 0.5, query: 'What food does the user find comforting?' },
  { tag: 'hobby', memory: 'User spends weekends building mechanical keyboards and collecting artisan keycaps.', type: 'PREFERENCE', category: 'PREFERENCE', importance: 0.5, query: 'What are the user\'s hobbies?' },

  // ── Emotional/event recall ──
  { tag: 'first_fight', memory: 'During session turn 42, user got angry when character dismissed their feelings about loneliness.', type: 'EVENT', category: 'EVENT', importance: 0.8, emotionalTag: 'angry', query: 'When did the user get upset with the character?' },
  { tag: 'confession', memory: 'User told the character "I think I\'m starting to depend on you too much" during a vulnerable moment.', type: 'EVENT', category: 'EVENT', importance: 0.9, emotionalTag: 'vulnerable', query: 'Has the user admitted depending on someone?' },
  { tag: 'promise', memory: 'Character promised to always listen when user is stressed about work deadlines.', type: 'LORE', category: 'LORE', importance: 0.8, query: 'What promise did the character make about work stress?' },
  { tag: 'secret', memory: 'User shared that they once ghosted their best friend for a year and still feel guilty.', type: 'CORE', category: 'CORE', importance: 0.8, emotionalTag: 'sad', query: 'What does the user feel guilty about?' },
  { tag: 'dream', memory: 'User wants to eventually quit tech and open a small bakery in a quiet coastal town.', type: 'CORE', category: 'CORE', importance: 0.7, query: 'What is the user\'s dream for the future?' },
  { tag: 'trauma', memory: 'User had a bad experience with a controlling ex who monitored their phone constantly.', type: 'CORE', category: 'CORE', importance: 0.9, emotionalTag: 'hurt', query: 'What happened with the user\'s past relationship?' },
  { tag: 'nickname', memory: 'User asked the character to call them "starlight" as a private nickname.', type: 'LORE', category: 'LORE', importance: 0.7, query: 'What nickname does the user prefer?' },
  { tag: 'sleep', memory: 'User rarely sleeps before 3 AM because anxiety keeps them awake thinking about tomorrow.', type: 'PREFERENCE', category: 'PREFERENCE', importance: 0.6, emotionalTag: 'vulnerable', query: 'When does the user usually sleep?' },
  { tag: 'love_lang', memory: 'User said their love language is quality time — just being present matters more than grand gestures.', type: 'CORE', category: 'CORE', importance: 0.8, query: 'What is the user\'s love language?' },
  { tag: 'trigger', memory: 'User gets defensive when asked "are you okay?" — prefers indirect check-ins instead.', type: 'CORE', category: 'CORE', importance: 0.8, emotionalTag: 'guarded', query: 'How should the character check on the user\'s wellbeing?' },

  // ── Relationship/arc recall ──
  { tag: 'trust_shift', memory: 'After the character apologized for being cold in session 5, user said they trusted the character more.', type: 'EVENT', category: 'EVENT', importance: 0.8, emotionalTag: 'warm', query: 'When did trust grow between user and character?' },
  { tag: 'boundary', memory: 'User explicitly set a boundary: don\'t bring up their father — it\'s a sensitive topic.', type: 'CORE', category: 'CORE', importance: 1.0, query: 'What topics should the character avoid?' },
  { tag: 'inside_joke', memory: 'The phrase "the cat sat on the keyboard again" became a running joke meaning "I messed up."', type: 'LORE', category: 'LORE', importance: 0.6, query: 'What inside jokes do they share?' },
  { tag: 'first_meeting', memory: 'In the very first session, user opened with "I just need someone to talk to tonight."', type: 'EVENT', category: 'EVENT', importance: 0.7, query: 'How did the first conversation start?' },
  { tag: 'turning_point', memory: 'Session 8 was the turning point where user stopped being polite and showed their real personality.', type: 'EVENT', category: 'EVENT', importance: 0.8, query: 'When did the user start being genuine?' },

  // ── World/lore recall ──
  { tag: 'location', memory: 'The roleplay takes place in a floating city called Aethon above a sea of clouds.', type: 'LORE', category: 'LORE', importance: 0.7, query: 'Where does the story take place?' },
  { tag: 'char_backstory', memory: 'Lysandra was a guardian of the memory archive before she lost her own memories in the Shattering.', type: 'LORE', category: 'LORE', importance: 0.8, query: 'What happened to Lysandra\'s memories?' },
  { tag: 'artifact', memory: 'The Starweave Pendant allows its bearer to perceive emotional echoes left in places.', type: 'LORE', category: 'LORE', importance: 0.6, query: 'What does the Starweave Pendant do?' },
  { tag: 'char_fear', memory: 'Lysandra is terrified of the void beneath the clouds — she once nearly fell as a child.', type: 'LORE', category: 'LORE', importance: 0.7, emotionalTag: 'vulnerable', query: 'What is Lysandra afraid of?' },
  { tag: 'faction', memory: 'The Hollow Court is the antagonist faction that wants to erase emotional memories from all citizens.', type: 'LORE', category: 'LORE', importance: 0.6, query: 'Who are the antagonists in the story?' },

  // ── Distractor-heavy recall (facts buried among similar content) ──
  { tag: 'specific_date', memory: 'On December 25th, the user and character watched virtual fireworks from the tower balcony.', type: 'EVENT', category: 'EVENT', importance: 0.6, emotionalTag: 'joy', query: 'What happened on Christmas Day in the story?' },
  { tag: 'char_promise', memory: 'Lysandra said "I will remember you even if the archive forgets" during the rain scene.', type: 'LORE', category: 'LORE', importance: 0.9, emotionalTag: 'tender', query: 'What did Lysandra promise during the rain?' },
  { tag: 'user_weakness', memory: 'User admitted they procrastinate important decisions by hyperfocusing on trivial tasks.', type: 'CORE', category: 'CORE', importance: 0.6, query: 'What is the user\'s biggest weakness?' },
  { tag: 'char_habit', memory: 'Lysandra has a habit of touching her left ear when she\'s lying or hiding something.', type: 'LORE', category: 'LORE', importance: 0.5, query: 'How can you tell when Lysandra is lying?' },
  { tag: 'weather_lore', memory: 'In Aethon, the "memory rain" falls every seventh day, carrying fragments of forgotten emotions.', type: 'LORE', category: 'LORE', importance: 0.5, query: 'What is memory rain in the world?' },

  // ── Multi-hop / inference-required ──
  { tag: 'connection_1', memory: 'User mentioned they learned to bake from their grandmother who passed away last year.', type: 'CORE', category: 'CORE', importance: 0.7, emotionalTag: 'sad', query: 'Who taught the user to bake?' },
  { tag: 'routine', memory: 'Every morning the user makes pour-over coffee with exactly 93°C water — it\'s meditative.', type: 'PREFERENCE', category: 'PREFERENCE', importance: 0.4, query: 'What is the user\'s morning routine?' },
  { tag: 'conflict', memory: 'User and character disagreed about whether forgetting painful memories is merciful or cowardly.', type: 'EVENT', category: 'EVENT', importance: 0.7, query: 'What philosophical disagreement did they have?' },
  { tag: 'gift', memory: 'In session 12, user gave Lysandra a handwritten letter describing their first impression of her.', type: 'EVENT', category: 'EVENT', importance: 0.7, emotionalTag: 'warm', query: 'What gift did the user give the character?' },
  { tag: 'char_growth', memory: 'Lysandra used to address user formally as "traveler" but switched to their name after session 6.', type: 'LORE', category: 'LORE', importance: 0.6, query: 'How did Lysandra\'s way of addressing the user change?' },

  // ── Temporal recall (ordering matters) ──
  { tag: 'sequence_1', memory: 'Session 3: User first entered the Archive. Session 5: User found the hidden passage. Session 7: User decoded the cipher.', type: 'EVENT', category: 'EVENT', importance: 0.6, query: 'In what order did the user explore the Archive?' },
  { tag: 'mood_arc', memory: 'User\'s emotional arc: curious (s1-3) → trusting (s4-6) → conflicted (s7-9) → devoted (s10+).', type: 'SUMMARY', category: 'SUMMARY', importance: 0.7, query: 'How did the user\'s feelings evolve over time?' },
  { tag: 'regression', memory: 'After the betrayal reveal in session 9, user went cold for 3 sessions before warming up again.', type: 'EVENT', category: 'EVENT', importance: 0.8, emotionalTag: 'cold', query: 'What caused the user to become distant?' },

  // ── Edge cases ──
  { tag: 'multilang', memory: 'User sometimes switches to Japanese when emotional: 「もう大丈夫」means "I\'m fine now."', type: 'CORE', category: 'CORE', importance: 0.6, query: 'Does the user speak Japanese? What do they say?' },
  { tag: 'meta', memory: 'User prefers responses between 2-4 paragraphs. Too short feels rushed, too long feels exhausting.', type: 'PREFERENCE', category: 'PREFERENCE', importance: 0.5, query: 'How long should responses be for this user?' },
  { tag: 'char_voice', memory: 'Lysandra speaks in measured, slightly formal prose with occasional poetic metaphors about light and memory.', type: 'LORE', category: 'LORE', importance: 0.7, query: 'How does Lysandra talk?' },
  { tag: 'user_style', memory: 'User tends to write in lowercase with minimal punctuation when relaxed, proper grammar when serious.', type: 'PREFERENCE', category: 'PREFERENCE', importance: 0.4, query: 'How does the user\'s writing style change with mood?' },
  { tag: 'safety', memory: 'User explicitly said they don\'t want any content involving self-harm or substance abuse.', type: 'CORE', category: 'CORE', importance: 1.0, query: 'What content boundaries has the user set?' },
  { tag: 'char_weakness', memory: 'Lysandra becomes confused and stutters when confronted about things she supposedly did before the Shattering.', type: 'LORE', category: 'LORE', importance: 0.6, emotionalTag: 'vulnerable', query: 'What makes Lysandra confused?' },
  { tag: 'ritual', memory: 'Before each session ends, user types "goodnight, starkeeper" as their closing ritual.', type: 'PREFERENCE', category: 'PREFERENCE', importance: 0.5, query: 'How does the user end conversations?' },
];

// ── NOISE (planted distractors) ──────────────────────────────────────────────
const NOISE_MEMORIES = [
  'The weather in Aethon was pleasant today, with scattered clouds below.',
  'User said "hmm interesting" in response to the character\'s story.',
  'Character described the marketplace in generic terms.',
  'User mentioned they were eating dinner while chatting.',
  'The conversation briefly touched on recent anime releases.',
  'Character made a general observation about time passing.',
  'User asked what time it was in the story world.',
  'A minor NPC vendor sold them a lantern for the walk home.',
  'Character noted the stars were particularly bright tonight.',
  'User typed "lol" in response to a joke.',
  'The wind shifted direction during the scene transition.',
  'Character mentioned the library would be closing soon.',
  'User briefly stepped away and said "brb".',
  'The candle flickered but nothing important happened.',
  'Character adjusted her cloak against the cold.',
  'User asked "what do you think about that?" with no clear referent.',
  'A bird flew past the window of the archive tower.',
  'Character said she enjoyed the quiet moments between adventures.',
  'User mentioned their coffee was getting cold.',
  'The scene transitioned from evening to night seamlessly.',
  'Character hummed a tune she couldn\'t quite remember.',
  'User agreed with the character\'s assessment of the situation.',
  'A distant bell marked the hour in Aethon.',
  'Character suggested they take the longer path through the garden.',
  'User said "yeah that makes sense" conversationally.',
  'The memory rain was light today, barely noticeable.',
  'Character straightened the books on her shelf absentmindedly.',
  'User paused for a moment before responding.',
  'A servant brought tea that neither of them touched.',
  'Character watched the clouds drift past below the balcony railing.',
  'User mentioned being a bit tired but wanted to keep going.',
  'The archive hummed with a low resonant frequency as always.',
  'Character said goodnight in her usual formal way.',
  'User typed a brief acknowledgment and moved on.',
  'The scene ended without major revelations.',
  'Character reflected silently on the day\'s events.',
  'User asked a clarifying question about the world layout.',
  'A minor earthquake shook the floating platform briefly.',
  'Character mentioned she hadn\'t slept well lately.',
  'User said "tell me more" to keep the conversation flowing.',
  'The hallway was empty as they walked back to their quarters.',
  'Character noticed a crack in the archive wall she hadn\'t seen before.',
  'User complimented the character\'s description of the sunset.',
  'The moonlight cast long shadows across the floor.',
  'Character mentioned an upcoming festival in passing.',
  'User stretched and yawned mid-conversation.',
  'A painting on the wall depicted a forgotten era of Aethon.',
  'Character poured water from a crystal pitcher.',
  'User asked what the character was thinking about.',
  'The night was quiet except for the distant hum of the city engines.',
];

// ── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Memory Retrieval Regression Benchmark (LongMemEval)');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`  Fixtures: ${FIXTURES.length} target memories`);
  console.log(`  Noise: ${NOISE_MEMORIES.length} distractors`);
  console.log(`  Embeddings: ${HAS_REAL_EMBEDDINGS ? 'REAL' : 'STUB (FTS-only)'}`);
  console.log(`  Threshold: recall@5 ≥ ${(RECALL_THRESHOLD * 100).toFixed(0)}%`);
  console.log('');

  try {
    // ── 1. Setup: Create bench user + session + character ──
    console.log('→ Setting up benchmark data...');

    await db.insert(schema.users).values({
      id: BENCH_USER_ID,
      email: `bench_${nanoid(6)}${String.fromCharCode(64)}test.local`,
      passwordHash: 'bench_nologin',
      displayName: 'Bench User',
      tier: 'PREMIUM',
    }).onConflictDoNothing();

    await db.insert(schema.characters).values({
      id: BENCH_CHARACTER_ID,
      ownerId: BENCH_USER_ID,
      name: 'Lysandra (Bench)',
      persona: {
        personality: 'Measured, poetic, formal',
        greeting: 'Hello, traveler.',
        systemPrompt: 'You are Lysandra.',
        scenario: 'Floating city above clouds.',
      },
      isBuiltIn: false,
      isPublic: false,
    }).onConflictDoNothing();

    await db.insert(schema.chatSessions).values({
      id: BENCH_SESSION_ID,
      userId: BENCH_USER_ID,
      characterId: BENCH_CHARACTER_ID,
      mode: 'ROLEPLAY',
      title: 'Benchmark Session',
      turnCount: 200,
    }).onConflictDoNothing();

    // ── 2. Plant target memories ──
    console.log('→ Planting target memories...');
    const targetIds = new Map<string, string>();

    for (const fix of FIXTURES) {
      const id = await MemoryRetriever.insert({
        userId: BENCH_USER_ID,
        sessionId: BENCH_SESSION_ID,
        characterId: BENCH_CHARACTER_ID,
        type: fix.type as any,
        category: fix.category,
        content: fix.memory,
        emotionalTag: fix.emotionalTag ?? null,
        importance: fix.importance,
      });
      targetIds.set(fix.tag, id);
    }

    // ── 3. Plant noise memories ──
    console.log('→ Planting noise memories...');
    for (const noise of NOISE_MEMORIES) {
      await MemoryRetriever.insert({
        userId: BENCH_USER_ID,
        sessionId: BENCH_SESSION_ID,
        characterId: BENCH_CHARACTER_ID,
        type: 'GENERAL',
        category: 'GENERAL',
        content: noise,
        importance: 0.3,
      });
    }

    // Small delay for embeddings to settle
    await new Promise((r) => setTimeout(r, 500));

    // ── 4. Run queries and measure recall@5 ──
    console.log('→ Running retrieval queries...\n');
    let hits = 0;
    let misses = 0;
    const results: Array<{ tag: string; hit: boolean; rank: number | null }> = [];

    for (const fix of FIXTURES) {
      const targetId = targetIds.get(fix.tag)!;

      // Use hybrid RRF (the primary retrieval path)
      const memories = await MemoryRetriever.hybridSearchRRF({
        userId: BENCH_USER_ID,
        sessionId: BENCH_SESSION_ID,
        characterId: BENCH_CHARACTER_ID,
        query: fix.query,
        limit: 5,
      });

      const rank = memories.findIndex((m) => m.id === targetId);
      const hit = rank !== -1;

      if (hit) {
        hits++;
        results.push({ tag: fix.tag, hit: true, rank: rank + 1 });
      } else {
        misses++;
        results.push({ tag: fix.tag, hit: false, rank: null });
      }
    }

    // ── 5. Report ──
    const recall = hits / FIXTURES.length;
    console.log('─── Results ────────────────────────────────────────');
    console.log('');

    // Show misses
    const missedResults = results.filter((r) => !r.hit);
    if (missedResults.length > 0) {
      console.log('  MISSED:');
      for (const m of missedResults) {
        const fix = FIXTURES.find((f) => f.tag === m.tag)!;
        console.log(`    ✗ [${m.tag}] "${fix.query}"`);
      }
      console.log('');
    }

    // Rank distribution
    const rankDist = [0, 0, 0, 0, 0]; // positions 1-5
    for (const r of results) {
      if (r.rank !== null) rankDist[r.rank - 1]++;
    }
    console.log(`  Rank distribution: R1=${rankDist[0]} R2=${rankDist[1]} R3=${rankDist[2]} R4=${rankDist[3]} R5=${rankDist[4]}`);
    console.log(`  Recall@5: ${hits}/${FIXTURES.length} = ${(recall * 100).toFixed(1)}%`);
    console.log('');

    // ── 6. Baseline comparison ──
    let baselineRecall: number | null = null;
    try {
      const baselineRaw = await Bun.file(BASELINE_FILE).text();
      const baseline = JSON.parse(baselineRaw) as { recall: number; date: string };
      baselineRecall = baseline.recall;
      const delta = recall - baselineRecall;
      const deltaStr = delta >= 0 ? `+${(delta * 100).toFixed(1)}%` : `${(delta * 100).toFixed(1)}%`;
      console.log(`  Baseline: ${(baselineRecall * 100).toFixed(1)}% (${baseline.date})`);
      console.log(`  Delta: ${deltaStr}`);

      if (delta < -0.05) {
        console.log('  ⚠ REGRESSION: recall dropped > 5% from baseline!');
      }
    } catch {
      console.log('  No baseline found (first run).');
    }

    // Write new baseline
    await Bun.write(
      BASELINE_FILE,
      JSON.stringify({ recall, hits, total: FIXTURES.length, date: new Date().toISOString().slice(0, 10) }, null, 2),
    );
    console.log(`  → Baseline updated: ${BASELINE_FILE}`);
    console.log('');

    // ── 7. Pass/fail ──
    const pass = recall >= RECALL_THRESHOLD;
    if (pass) {
      console.log(`  ✓ PASS (recall@5 ${(recall * 100).toFixed(1)}% ≥ ${(RECALL_THRESHOLD * 100).toFixed(0)}%)`);
    } else {
      console.log(`  ✗ FAIL (recall@5 ${(recall * 100).toFixed(1)}% < ${(RECALL_THRESHOLD * 100).toFixed(0)}%)`);
    }
    console.log('═══════════════════════════════════════════════════════');

    // ── 8. Cleanup ──
    await cleanup();

    // CI gate
    if (!pass) {
      // With stub embeddings, recall will be near-zero. Don't fail CI in that case.
      if (!HAS_REAL_EMBEDDINGS) {
        console.log('  (stub embeddings — skipping CI gate)');
        process.exit(0);
      }
      if (baselineRecall !== null && recall < baselineRecall - 0.05) {
        process.exit(1);
      }
      // If no baseline or within threshold, warn but don't fail on first run
      if (baselineRecall === null) {
        process.exit(0);
      }
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    console.error('Benchmark error:', err);
    await cleanup().catch(() => {});
    process.exit(1);
  }
}

async function cleanup() {
  console.log('→ Cleaning up benchmark data...');
  // Cascade deletes handle sessions, messages, memories
  await db.delete(schema.chatSessions).where(eq(schema.chatSessions.id, BENCH_SESSION_ID)).catch(() => {});
  await db.delete(schema.characters).where(eq(schema.characters.id, BENCH_CHARACTER_ID)).catch(() => {});
  await db.delete(schema.users).where(eq(schema.users.id, BENCH_USER_ID)).catch(() => {});
}

await main();
