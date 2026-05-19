> ✅ **STATUS (apr 2026): IMPLEMENTED.** Reducer + adapter + replay harness all live — see `packages/web/src/lib/presence.ts` and `presence-replay.ts`. Phases 1–2 shipped; Phase 3 external sprite adapter parked (see [BACKLOG.md](BACKLOG.md) P3).

---

# Presence Contract v1

Status: Locked for Implementation
Effective Date: 2026-04-18
Owner: Product + Engineering
Applies To: packages/shared, packages/server, packages/web

## 1) Purpose

Define a deterministic visual-presence system for roleplay chat.
This contract standardizes how UI state changes (thinking/typing/speaking/error/etc.) are generated, prioritized, timed, and rendered.

If implementation notes conflict, this document wins.

## 2) Product Scope

### In Scope

- Real-time visual feedback only (no speech output dependency)
- Deterministic state transitions driven by chat/runtime events
- Anti-flicker behavior through debounce, hold, and cooldown rules
- Desktop and mobile behavior parity

### Out of Scope (v1)

- TTS playback and lip-sync
- 3D avatar runtime
- Complex per-character animation trees
- LLM-driven direct animation control

## 3) Core Principles

1. Single source of truth for active presence state.
2. No direct UI mutation from raw token events.
3. Every state transition must pass priority + timing guards.
4. Unknown or conflicting input must gracefully fallback to idle.
5. Presence behavior must be testable with deterministic event replay.

## 4) State Model

Presence is composed of two axes:

1. Activity State (required)
2. Affect State (optional overlay)

### 4.1 Activity State Enum

- idle
- listening
- typing
- thinking
- speaking
- success
- alert
- error

### 4.2 Affect State Enum

- neutral
- curious
- empathetic
- confident
- vulnerable
- conflicted
- playful
- guarded

### 4.3 Render State Shape

```ts
type PresenceActivity =
  | 'idle'
  | 'listening'
  | 'typing'
  | 'thinking'
  | 'speaking'
  | 'success'
  | 'alert'
  | 'error';

type PresenceAffect =
  | 'neutral'
  | 'curious'
  | 'empathetic'
  | 'confident'
  | 'vulnerable'
  | 'conflicted'
  | 'playful'
  | 'guarded';

interface PresenceRenderState {
  sessionId: string;
  activity: PresenceActivity;
  affect: PresenceAffect;
  intensity: number; // 0..1
  source: 'user' | 'model' | 'system';
  updatedAt: number; // epoch ms
}
```

## 5) Event Contract

Presence engine consumes semantic events, not raw UI events.

### 5.1 Required Event Types

- USER_INPUT_FOCUS
- USER_INPUT_TYPING
- USER_SUBMIT
- MODEL_STREAM_START
- MODEL_STREAM_CHUNK
- MODEL_STREAM_DONE
- MODEL_STREAM_ERROR
- TURN_SUCCESS
- TURN_ERROR
- RELATIONSHIP_STAGE_CHANGED
- VULNERABILITY_MOMENT
- CONFLICT_MOMENT
- IDLE_TIMEOUT
- RETRY_TRIGGERED

### 5.2 Event Shape

```ts
interface PresenceEvent {
  type:
    | 'USER_INPUT_FOCUS'
    | 'USER_INPUT_TYPING'
    | 'USER_SUBMIT'
    | 'MODEL_STREAM_START'
    | 'MODEL_STREAM_CHUNK'
    | 'MODEL_STREAM_DONE'
    | 'MODEL_STREAM_ERROR'
    | 'TURN_SUCCESS'
    | 'TURN_ERROR'
    | 'RELATIONSHIP_STAGE_CHANGED'
    | 'VULNERABILITY_MOMENT'
    | 'CONFLICT_MOMENT'
    | 'IDLE_TIMEOUT'
    | 'RETRY_TRIGGERED';
  sessionId: string;
  ts: number;
  payload?: Record<string, unknown>;
}
```

## 6) Priority Matrix

When multiple candidate activity states arrive in overlap windows, higher priority wins.

| Priority | Activity |
|---|---|
| 100 | error |
| 90 | alert |
| 80 | speaking |
| 70 | thinking |
| 60 | typing |
| 50 | listening |
| 40 | success |
| 10 | idle |

## 7) Timing Constants

Defaults for v1:

- debounceMs = 150
- sameStateCooldownMs = 250
- settleToIdleMs = 400

Minimum hold duration per state:

- idle: 300
- listening: 350
- typing: 450
- thinking: 700
- speaking: 900
- success: 650
- alert: 1000
- error: 1200

## 8) Transition Rules

### 8.1 Activity Mapping

- USER_INPUT_FOCUS -> listening
- USER_INPUT_TYPING -> typing
- USER_SUBMIT -> thinking
- MODEL_STREAM_START -> speaking
- MODEL_STREAM_CHUNK -> speaking
- MODEL_STREAM_DONE -> success (then idle after settleToIdleMs)
- MODEL_STREAM_ERROR -> error
- TURN_SUCCESS -> success (only if speaking not active)
- TURN_ERROR -> error
- IDLE_TIMEOUT -> idle (if no stronger state active)
- RETRY_TRIGGERED -> thinking

### 8.2 Affect Mapping

- default: neutral
- RELATIONSHIP_STAGE_CHANGED:
  - STRANGER / ACQUAINTANCE -> guarded
  - FRIEND / CLOSE -> confident
  - INTIMATE / BONDED -> playful or vulnerable (context-dependent)
- VULNERABILITY_MOMENT -> vulnerable
- CONFLICT_MOMENT -> conflicted

### 8.3 Hysteresis

State replacement is blocked if:

1. Current state min hold not satisfied, and
2. Incoming state priority is not strictly higher.

### 8.4 Error Safety

- If stream ends without MODEL_STREAM_DONE, emit TURN_ERROR.
- If TURN_ERROR occurs during speaking, force transition to error.

## 9) Deterministic Reducer Contract

Reducer must be pure and side-effect free:

```ts
function reducePresence(
  prev: PresenceRenderState,
  event: PresenceEvent,
  now: number,
): PresenceRenderState
```

Side effects (timers, animation dispatch, adapter calls) must run in orchestrator, not reducer.

## 10) Adapter Contract

The UI adapter may target:

- local React component runtime, or
- external sprite service endpoint

Required adapter API:

```ts
interface PresenceAdapter {
  apply(state: PresenceRenderState): void | Promise<void>;
}
```

Adapter failures must not break chat flow; they are non-fatal.

## 11) Telemetry Contract

Capture at least:

- presence_transition_count
- presence_state_dwell_ms
- presence_flicker_count (state lifetime < 400ms)
- presence_event_to_render_ms
- presence_error_count

## 12) Acceptance Tests (Minimum)

### Scenario A: Normal turn stream

Given USER_SUBMIT then MODEL_STREAM_START/chunks then MODEL_STREAM_DONE
Then activity progression is:
thinking -> speaking -> success -> idle
And no intermediate state is displayed below its min hold.

### Scenario B: Stream abort

Given USER_SUBMIT then MODEL_STREAM_START then transport failure
Then activity becomes error within 300ms after failure detection.

### Scenario C: Rapid typing + model response race

Given USER_INPUT_TYPING and MODEL_STREAM_START in close proximity
Then speaking wins by priority and remains stable for min hold.

### Scenario D: Retry flow

Given TURN_ERROR then RETRY_TRIGGERED then MODEL_STREAM_START
Then activity progression is:
error -> thinking -> speaking

### Scenario E: Idle fallback

Given no events for IDLE_TIMEOUT window
Then state eventually settles to idle.

### Scenario F: Affect continuity

Given RELATIONSHIP_STAGE_CHANGED and no affect-critical event
Then affect does not oscillate faster than one change per 2 seconds.

## 13) Implementation Layers (Repo Mapping)

### Shared Layer

- Add presence enums and event schemas in shared package.

### Server Layer

- Emit semantic presence events from chat/session orchestration points.

### Web Layer

- Implement reducer + orchestrator + adapter in chat UI runtime.
- Ensure mobile and desktop parity.

## 14) Rollout Plan

### Phase 1

- Activity-only implementation
- No affect overlay
- No external sprite server dependency

### Phase 2

- Add affect overlay mapping
- Add telemetry counters and replay harness

### Phase 3

- Optional external adapter integration
- Fine-tune timing constants using replay traces

## 15) Change Rules

Any update to this contract must include:

1. Date
2. Owner
3. Changed section
4. Reason
5. Impact on current implementation

## 16) Revision Log

- 2026-04-18: v1 created with deterministic reducer model, priority matrix, timing constants, and acceptance scenarios.
