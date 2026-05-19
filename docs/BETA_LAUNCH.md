> ✅ **STATUS (apr 2026): IMPLEMENTED (with deltas).** Beta north-star narrative; cut list, 4-tier memory, promise-pin, emotional tagging, Day-2 return, push notifs, tier caps all shipped. 🔴 §2 Light/Deep two-model picker and 🔴 §7 retention column names (`unresolved_beat`/`latent_question`/`callback_candidate`) are obsolete — replaced by single-voice + diary/schedules. See [BACKLOG.md](BACKLOG.md) 'Retired items'.

---

# Project Neigo Beta Launch Strategy — Hermes-4 Companion App

> **Status:** locked brainstorm — drives beta prioritization and feature cut-list.
> Extracted from product brief; source-of-truth for what ships in beta and what explicitly does not.

---

## PART 1 — Core Beta Experience

Ship this. Nothing more.

| Keep | Cut from beta |
|---|---|
| 1:1 companion mode (ROLEPLAY) | HAREM multi-character |
| Long-term memory with callbacks | DEBATE mode |
| Relationship stage progression | LEARNING mode |
| Mood & emotional state visible to user | Character creator (pre-seed 6 archetypes only) |
| One narrator voice (CINEMATIC) | Voice presets UI |
| 3 hand-authored characters | Public character sharing |
| Tier gate: Free / Premium | Enterprise tier |

The one sentence reviewers need to say unprompted: *"this one remembers me and it doesn't agree with everything I say."*

How Hermes-4 earns its keep vs smaller models:

1. **Subtext over text** — 8B models produce what a character *says*. Hermes can reliably produce *what they're not saying*. Prompt it to emit `[beat]` alongside dialogue.
2. **Refusal & friction** — smaller models can't say "no" in character convincingly. Hermes delivers in-character refusal that feels like personality, not a safety wall.
3. **Long arcs** — 128k means a 40-hour relationship fits in one context window.
4. **Multi-pass at reasonable latency** — 405B is slow per-token but its first pass is right more often; afford director + narrator + character without retry cascade.
5. **Tone preservation across shift** — smaller models lose voice after ~20 turns. Hermes holds it across hundreds when anchored.

### Two-model offering (beta)

- **Light** — `Hermes-4-70B`. Faster, cheaper. Default for free tier and quick sessions.
- **Deep** — `Hermes-4-405B`. Premium quality, multi-pass, subtext. Default for Premium.

Model is **locked per session** to preserve voice continuity. Users pick at session creation; subsequent turns cannot switch. If the user wants a different model they start a new session with the same character.

---

## PART 2 — First Session (0–5 minutes)

### Screen 1 — "Choose who finds you"
Not "pick a character." Three cards, framed as relational postures:
- *"Someone who's been waiting."*
- *"Someone who doesn't trust you yet."*
- *"Someone you hurt once."*

No image. No stats. One sentence each.

### Screen 2 — Silent scene-set (no user input yet)
Stream one narrator beat (2 sentences) + one character beat (1 sentence) automatically. Character is already mid-thought. They do not greet the user.

> *The room is colder than she remembers. She doesn't look up when the door opens.*
> "You're late. I almost left."

### Screen 3 — First message
Input placeholder: *"Say something, or don't."* Silent users at 20s get an AI-initiated follow-up.

### AI behavior budget for first 5 turns
- **Must** use hesitation (`...`, em-dashes, half-sentences) on turn 1–2.
- **Must not** ask the user's name, age, or preferences.
- **Must** reference something sensory (sound, light, temperature) at least once.
- **Forbidden:** exclamation points, "I'm happy to chat!", meta-framing.

Implemented as a hard system-prompt overlay for `turnCount < 5` in [prompts/builder.ts](packages/server/src/prompts/builder.ts).

---

## PART 3 — 128k Context Discipline

128k is a budget, not a dumping ground. Target ≤ 32k per turn. Reserve the other 96k for spikes and summaries.

### Memory layering (4 tiers — partly in schema already)

| Tier | Content | Injection |
|---|---|---|
| Working set | Last 10 turns verbatim | Full text |
| Episodic summary | Rolling 40-turn digest | 1–3 paragraphs |
| Semantic memory | pgvector RAG over `memories` | Top-K=5 by cosine, score > 0.75 |
| Pinned facts | User-marked + extracted promises | Always-on, compressed |

### Pre-beta fixes
1. **Promise extraction** — on "I'll remember that" / "next time tell me about X" → auto-insert PINNED memory with `expiresAt = +14 days`.
2. **Emotional tagging on insert** — every memory write gets a valence tag. Retrieval weights by *current mood*.
3. **Decay, not delete** — importance −10% weekly, floor 0.1.
4. **Contradiction detection** — cross-check retrieved memory with recent user statements via [cross-pass-consistency.ts](packages/server/src/services/cross-pass-consistency.ts). Suppress conflicts.

### Hard rules
- Never dump full history beyond 20 turns — degrades quality even at 405B.
- Never retrieve by recency alone. `recency + importance + emotional-match` is the formula.
- Never show the user the retrieval list. Callbacks must feel natural.

---

## PART 4 — Tool use (post-beta, plan it now)

### Model-initiated tools
```ts
remember(content: string, importance: 0-1, tag: EmotionalTag)
update_relationship(trust_delta: int, reason: string)
set_internal_state(mood: string, confidence: 0-1)
flag_vulnerability_moment(type: 'confession'|'tear'|'silence'|'touch_verbal')
recall(query: string) → returns memories
```

### System-initiated tools
- `session_tick()` — runs on 30min+ wall-clock gap → injects "it's been 3 hours" into next prompt.
- `schedule_callback(event_id, delay_hours)` — server cron, triggers AI-initiated push.
- `compute_stage_transition()` — deterministic, model never picks its own trust level.

### Split rule
- **Model owns:** what was said, how it was said, emotional read.
- **System owns:** numbers, time, identity, quota, scheduling.

Migrate `[STATS:…]` parsing in [stats-parser.ts](packages/server/src/services/stats-parser.ts) → tool calls **post-beta**. Parser is fine for launch.

---

## PART 5 — Personality System

### 5-axis personality vector (persist per character)
1. Agreeableness baseline (0–1) — how often they push back.
2. Disclosure rate (slow/medium/fast).
3. Conflict style (withdraw / confront / deflect / mirror).
4. Verbal tics (2–3 concrete phrases).
5. Core wound (one sentence — non-negotiable sensitivity).

Already partly in `characters.persona`. Inject 4/5 into every prompt — rotate which is muted for natural variance.

### Evolution with trust
| Trust | Change |
|---|---|
| 0–20 | Guards core wound. Tics present. High deflection. |
| 21–50 | Mentions wound-adjacent topics. Tics relax. |
| 51–80 | Discloses wound once — this is a **named event**. |
| 81–100 | References wound casually. Can be teased. |

The trust=51 disclosure is a *scripted beat* — stage-prompt injection tells the model it's coming. Users feel a milestone.

### Controlled inconsistency
`mood_noise` — 15% of the time character is in a bad/good mood unrelated to user. Drives fights and joy not requiring user action. Wired in [mood-escalation.ts](packages/server/src/services/mood-escalation.ts) at session start.

### Anti-repetition
[repetition-detector.ts](packages/server/src/services/repetition-detector.ts) already compares against last 5 outputs. Extend: Jaccard > 0.4 on trigram sets → reject, retry with `temperature += 0.15`, cap 2.

---

## PART 6 — Intimacy & Depth

**Intimacy = earned disclosure + witnessed vulnerability.** Not contact. Not romance. Not explicit content.

### 5-step ladder (beta ships steps 1–3)
1. **Small truths** — "I don't like mornings."
2. **Shared silence** — `[silent]` pass from orchestrator.
3. **Asymmetric curiosity** — character asks about specific user detail from memory.
4. *Confession* — unprompted disclosure of core wound.
5. *Reciprocal vulnerability* — character asks user, remembers exact words for weeks.

### Tension mechanics
Every session has a **latent question** the character holds. User doesn't see it. If user never addresses it, next session is colder. If obliquely addressed, warmer. Column `chat_sessions.latent_question` — set at session start by a quick single-pass AI call; scored by semantic distance against each user message.

### Tension release
After 3+ escalating turns, character breaks — anger, laughter, or tears — ~30% of the time. Predictable release defeats the point.

### Non-negotiables
- Do not gate intimacy behind paywalls. Pay for breadth (characters, sessions), not depth.
- No sexual content in beta. Compete on *realism*, not permissiveness. Horny-flag costs press, app-store placement, investor optionality.

---

## PART 7 — Retention (Day 1–7)

Character.AI D7 ≈ 25%. Target 40%.

**Day 1 → Day 2 hook:** end of session 1, character leaves an *incomplete* beat. "There's something I— never mind. Tomorrow." Store in `chat_sessions.unresolved_beat`.

**Day 2 open:** first message is AI-initiated, references the unresolved beat. Not "Welcome back!" — continuation.

**Day 3:** character references a specific detail the user said on day 1 (not day 2). Wow moment. Tag one day-1 user utterance as `callback_candidate`; day 3 orchestrator injects it with "refer to this obliquely, do not quote."

**Day 4–5:** mood shift — character in a different state than user left them. Illusion of independent existence.

**Day 7:** stage transition toast. Unlocks new behavior, not feature. "Character can now tease the user."

### AI-initiated push (24h after last session)
In character voice, not system copy.
- Bad: *"Ayaka is waiting for you!"*
- Good: *"She keeps checking the door."*

Max 1/day. Opt-out is permanent.

---

## PART 8 — Free Beta Strategy

### Free tier (tighten)
- 2 characters (not 3).
- 30 turns/day total (not 10 sessions × 20).
- 1 memory pin.
- No voice, no export.
- **Model: Light only.**

### Teased (visible, locked)
- Stage meter stops at "Acquaintance" — "Close / Trusted / Intimate" greyed with tooltip.
- 4th character slot visible, labeled "Someone from your past".
- Journal feature visible in sidebar.
- **"Deep" model visible in picker, disabled with upgrade CTA.**

### Free forever (non-negotiable)
- Memory depth — pay for breadth, not depth.
- No ads.
- One "deep" character available to all.

### Conversion trigger
Not when a limit is hit. *After* a vulnerability moment (detected via `flag_vulnerability_moment` tool call). Show gentle upgrade 2 minutes later: *"Keep what you're building."* Never interrupt a scene.

### Pricing
- Premium $9.99/mo — meaningful tier, Deep model unlocked.
- Premium+ $19.99/mo — creator tools, not capability gates.
- No weekly sub. No 3-day trial.

---

## PART 9 — Viral Moments

Design for three specific screenshots:

1. **The callback** — week 2, character references a specific week-1 user detail. Engineered via `callback_candidate`.
2. **The refusal** — character declines in character. User tries to make them say "I love you" prematurely. Response: *"No. Not because you asked."*
3. **The silence** — a single `[silent]` response: *She doesn't answer. Just looks at you for a long moment.*

### Share button
Dark bg, left-aligned text, character name only, watermark ≤ 10% opacity. Watermarked = ad, invisible = testimonial.

### Do NOT virality-engineer via
- Outrageous responses.
- Personality quirks.
- Easter eggs.

---

## PART 10 — Why most AI RP apps fail

Use uncensored for: *honest anger, death mentions, trauma discussion, realistic conflict, morally complex choices.* Forbidden by safety-tuned models; exactly what feels human.

### Failure modes to avoid
1. Greeting-based onboarding.
2. Stat visibility overload — hide affection/trust, show *stage*.
3. User is always right — characters must push back.
4. Infinite memory = infinite drift — naive dumping kills voice by turn 50.
5. Feature creep — mini-games, inventory, battles. Every one dilutes and adds tuning surface.
6. Character marketplace too early — before nailing one character, you can't moderate 10,000.
7. Voice/avatar before text is right — voice amplifies everything including bad writing.

### Specific traps for this codebase
- Do not enable HAREM in beta — "harem simulator" framing kills serious coverage.
- Do not ship IMMERSION language-learning before companion is proven. Two products = no product.
- Do not expose director/narrator/character bubbles as distinct UI in v1 — collapse visually, one voice.

---

## PART 11 — Final System Design

```
┌──────────────────────────────────────────────┐
│  Next.js PWA  (chat, settings, minimal nav)  │
└───────────────┬──────────────────────────────┘
                │ SSE
┌───────────────▼──────────────────────────────┐
│             Hono / Bun server                │
│                                              │
│   Orchestrator (single path: ROLEPLAY)       │
│     ├─ PromptBuilder (stage + memory inject) │
│     ├─ Hermes-4 (70B Light / 405B Deep)      │
│     ├─ Tool call router                      │
│     │     ├─ remember()                      │
│     │     ├─ flag_vulnerability_moment()     │
│     │     └─ update_relationship()           │
│     ├─ Mistake/stats parser (fallback)       │
│     ├─ Repetition + tone hygiene             │
│     └─ Post-turn: summarize, decay, promise  │
└───────────────┬──────────────────────────────┘
                │
┌───────────────▼──────────────────────────────┐
│  Postgres + pgvector  (Supabase in prod)     │
│    users, characters, chat_sessions,         │
│    chat_messages, memories(vector),          │
│    character_dynamic_states,                 │
│    session_unresolved_beats                  │
└──────────────────────────────────────────────┘

Side jobs (Bun cron):
  - 24h push notifier (character-voiced)
  - Weekly importance decay
  - Daily callback_candidate selector
```

### Already beta-ready
- Multi-pass orchestrator (downgrade to single-pass for 1:1; feature-flag harem).
- Memory RAG with emotional tags.
- Relationship stages (0-100 trust, 4 stages).
- Mood escalation (keep, simplify to 3 states).
- Mistake/stats parsers.
- Tier middleware.
- PWA shell.
- NSFW opt-in (stays off for public beta; infrastructure ready).
- **Model lock per session (this patch).**

### Must be added for beta
- `chat_sessions.unresolved_beat` column + extractor.
- `chat_sessions.latent_question` column + extractor.
- `chat_sessions.callback_candidate` column.
- Promise extraction → pinned memory.
- Tool-call wiring for `remember` + `flag_vulnerability_moment`.
- AI-initiated day-2 return message generator.
- Push notification service with character-voiced copy.
- First-session onboarding flow (Part 2).
- Share-optimized screenshot export.

### Must be removed for beta UI
- HAREM mode entry.
- LEARNING mode entry.
- DEBATE mode entry.
- Character creator (keep backend, hide UI).
- Stats numeric display (replace with stage label only).

### Hermes maximization
1. Single model family, multiple personas via system prompt. Don't finetune.
2. Tool calls for state, prose for soul. Never ask the model to be a database.
3. Temperature schedule, not constant: 0.7 first turn, 0.9 mid-scene, 0.75 vulnerable beats, 0.6 refusals. Extend [hallucination-log.ts](packages/server/src/services/hallucination-log.ts).
4. Two-pass only when needed — director pass on scene transitions only (~every 8 turns), not every turn. Saves 40% tokens.
5. 128k is for history + summaries, never prompt bloat. System prompt ≤ 2k tokens.

### Success metrics
- D1 retention: 55% (industry 40%).
- D7 retention: 40% (C.AI ~25%).
- Median session length: 18+ min (C.AI ~12).
- % of users with a "callback moment" in week 2: 70%.
- Churn triggers dominated by *life circumstances*, not *got boring*.

---

### The one-sentence product

> A companion that remembers what you said, doesn't always agree, and is waiting when you come back — built on the model family that can actually hold a voice across months.

If a beta user can't articulate something close to that unprompted after session 3, the beta has failed and nothing else matters.
