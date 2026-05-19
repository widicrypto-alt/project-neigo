# Architecture Review

## 1. Server Architecture

### Framework & Infrastructure
- **Runtime**: Hono.js (lightweight web framework similar to Express/Fastify)
- **Database**: Drizzle ORM with PostgreSQL (configured via `DIRECT_URL` / `DATABASE_URL`)
- **Background Jobs**: BullMQ for session nudge (20s) and return (12h) scheduling
- **Caching**: Redis for SSE frame buffering (stream resume/reconnection support)

### Route Structure (`packages/server/src/routes/`)
| Route File | Purpose |
|------------|---------|
| `auth.ts` | User authentication |
| `chat.ts` | Core chat operations (turn, regenerate, open, continue, nudge, trigger) |
| `sessions.ts` | Session CRUD, branching, undo, export, timeline, arcs |
| `characters.ts` | Character CRUD and discovery |
| `memories.ts` | Memory/prompt injection management |
| `lorebooks.ts` | World info / lorebook entries |
| `personas.ts` | User persona profiles |
| `presets.ts` | Prompt presets with sampling overrides |
| `stories.ts` | Visual novel / kinetic story management |
| `sprite-manifest.ts` | Character sprite asset management (R2 storage) |
| `uploads.ts` | File/image uploads |

### Services (`packages/server/src/services/`)
The orchestrator service owns the turn execution pipeline:
- **Orchestrator** (`orchestrator.ts`) — Central LLM orchestration pipeline (main entry point for AI generation)
- **Cast-Turn-Selector** (`cast-turn-selector.ts`) — Routes turns across multi-character cast based on scene dynamics
- **Cast-Stats-Repo** (`cast-stats-repo.ts`) — Tracks and updates character relationship statistics
- **Arc-Manager** (`arc-manager.ts`) — Manages story arc progression and chapter transitions
- **Story-Runner** (`story-runner.ts`) — Executes visual novel / kinetic novel mode sessions
- **Stats-Parser** (`stats-parser.ts`) — Parses and applies LLM-returned stat changes
- **Arc-Manager** (`arc-manager.ts`) — Story arc progression

### SSE Event Types
```
character → narrator → emotion → relationship → milestone → mood → vulnerability → done
```

---

## 2. Web Architecture

### Framework & Stack
- **Framework**: Next.js 15 (App Router)
- **State Management**: React Query (TanStack Query) + local React state
- **Streaming**: Server-Sent Events via `lib/sse.ts` / `lib/streaming-buffer.ts`
- **Styling**: Tailwind CSS + CSS custom properties for theming
- **Icons**: Lucide React

### Component Hierarchy

```
page.tsx (ChatSessionPage)
├── SceneBackground
├── WeatherOverlay  
├── TrackerBar
├── CastRoster
├── MessageList
│   ├── BubbleView (per bubble)
│   └── ...
├── VNMode (overlay)
├── Composer
│   ├── PersonaSwitcher
│   └── ...
├── PresenceStrip
├── SpritePanel
├── ArcCheckpoint
├── TimelinePanel
├── AgentDebugPanel
├── CyoaChips
├── WaifuStage
├── PromptInfoModal
├── ConversationPrelude
└── ToastStack
```

### Component Relationships

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ChatSessionPage (page.tsx)                         │
│  ┌─────────────────────────────────────────────────────────────────────┐  │
│  │                     Core Chat State                                 │  │
│  │  bubbles[], sending, mood, spriteManifest, activeSpeakerId,        │  │
│  │  cyoaChoices, vnModeActive                                          │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
│                                    │                                      │
│         ┌──────────────────────────┼──────────────────────────┐         │
│         │                          │                          │         │
│         ▼                          ▼                          ▼         │
│  ┌─────────────┐          ┌───────────────┐          ┌─────────────┐     │
│  │MessageList  │          │  Composer    │          │SpritePanel  │     │
│  │             │          │              │          │             │     │
│  │ BubbleView  │          │ PersonaSwitch│          │ Emotion     │     │
│  │ BubbleView  │◄────────►│ InputBar     │◄────────►│ display     │     │
│  │   ...      │          │ TokenChip    │          │ Mood ring   │     │
│  └─────────────┘          └───────────────┘          └─────────────┘     │
│         │                                                           │     │
│         ▼                                                           ▼     │
│  ┌─────────────┐                                             ┌──────────┐ │
│  │VNMode      │                                             │CastRoster│ │
│  │(overlay)   │                                             │(multi-char)│
│  └─────────────┘                                             └──────────┘ │
│                                                                         │
│  ┌─────────────────────┐  ┌──────────────┐  ┌───────────────────────┐ │
│  │PresenceStrip        │  │ToastStack    │  │TimelinePanel           │ │
│  │(model state)       │  │(notifications)│  │(session history)      │ │
│  └─────────────────────┘  └──────────────┘  └───────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘

                         Data Flow
                         ─────────

┌──────────┐    POST /turn     ┌──────────┐    SSE events    ┌──────────┐
│Composer  │ ────────────────► │  Server  │ ────────────────► │MessageList│
│          │                  │(orchestrator)│             │          │
│          │ ◄─────────────── │             │               │ BubbleView│
└──────────┘   SSE stream     └──────────┘                  └──────────┘
                                                                  │
                                                                  ▼
                                                          ┌─────────────┐
                                                          │SpritePanel  │
                                                          │(emotion)    │
                                                          └─────────────┘

API Layer (React Query)
┌─────────────────┐
│ useQuery/useMutation │
│                      │
│ ['session', id]     │──► /api/sessions/:id
│ ['messages', id]    │──► /api/sessions/:id/messages
│ ['character', id]   │──► /api/characters/:id
│ ['personas']        │──► /api/personas
│ ['arcs', sessionId]│──► /api/sessions/:id/arcs
└─────────────────┘
```

### Key State Flows

**1. Turn Submission:**
```
Composer.submit() → POST /api/chat/:sessionId/turn → SSE stream
                                                      │
                                                      ▼
                                               setBubbles([...bubble])
                                                      │
                                                      ▼
                                               applyEmotion(emotion)
                                                      │
                                                      ▼
                                               SpritePanel.update()
```

**2. Emotion Detection:**
```
LLM text output → detectEmotion() → setDetectedEmotion()
                                              │
                                              ▼
                                     setRecentEmotions([...])
                                              │
                                              ▼
                                     SpritePanel.galleryStrip
```

**3. VN Mode (Visual Novel Overlay):**
```
vnModeActive = true → VNMode overlay renders
                     │
                     ▼
              BubblePage (reading bubbles one at a time)
                     │
                     ▼
              setVnReadIndex(i) → Next bubble
```

---

## 3. API Patterns

### REST Endpoints
```
POST /api/chat/:sessionId/turn          — Submit user message
POST /api/chat/:sessionId/regenerate    — Regenerate last assistant turn
POST /api/chat/:sessionId/continue     — Continue narration
POST /api/chat/:sessionId/trigger       — Trigger CBS event
GET  /api/sessions                      — List user sessions
POST /api/sessions/:id/branch           — Branch session
POST /api/sessions/:id/undo             — Undo last turn
GET  /api/sessions/:id/arcs             — Story arcs for session
```

### SSE Event Protocol
```typescript
type SseEvent = 
  | { type: 'character'; messageId: string; characterId: string; chunk: string }
  | { type: 'narrator'; messageId: string; chunk: string }
  | { type: 'emotion'; emotion: string }
  | { type: 'mood'; moodState: string }
  | { type: 'relationship'; newStage: string }
  | { type: 'milestone'; message: string }
  | { type: 'done' }
  | { type: 'error'; message: string }
```

---

## 4. Database Schema

### Core Tables
- **sessions** — Chat sessions with metadata, turn count, scene state
- **messages** — Individual chat messages (with swipe/versioning support)
- **characters** — Character definitions (name, avatar, sprite, stats)
- **users** — User accounts with auth metadata
- **personas** — User-created MC personas
- **memories** — Injected memory entries per character/session
- **lorebooks** — World-building entries
- **story_arcs** — Story progression tracking

### Key Indexes
- FTS on messages (full-text search)
- RLS policies for user isolation
- FK cascades for cascade deletes

---

## 5. Shared Types (`packages/shared/src/domain/index.ts`)

```typescript
interface Character {
  id: string;
  name: string;
  avatarUrl: string | null;
  spriteSheetUrl: string | null;
  // ... stats, metadata
}

interface ChatSession {
  id: string;
  characterId: string;
  turnCount: number;
  metadata: Record<string, unknown>;
}

interface ChatMessage {
  id: string;
  sessionId: string;
  speakerType: 'USER' | 'CHARACTER' | 'NARRATOR' | 'WHISPER';
  speakerId: string | null;
  content: string;
  turnIndex: number;
  swipeCount: number;
  swipeIndex: number;
}

interface SseEvent {
  type: string;
  // ... type-specific fields
}

const BYOK_MODEL_CATALOG = [
  { id: 'anthropic/claude-3-5-sonnet', label: 'Claude 3.5 Sonnet' },
  // ... more models
];

const moodMeta = (mood: string) => ({
  label: string,
  icon: string,
});
```

---

## 6. Presence & Telemetry

Uses `lib/presence.ts` for tracking:
- Model streaming state (start, chunk, done, error)
- User submit actions
- Relationship stage changes
- Milestone signals
- Conflict moments

```typescript
dispatchPresence({ type: 'MODEL_STREAM_START', source: 'model' });
dispatchPresence({ type: 'USER_SUBMIT', source: 'user' });
dispatchPresence({ type: 'TURN_SUCCESS', source: 'model' });
```

---

## 7. Token Budgeting

Per PLANCHATv3 §5:
- **Input budget**: 32k tokens (context window minus output reserve)
- **Output reserve**: 2k tokens minimum
- **Character block**: ~1.5k tokens (personality, appearance, lore)
- **Message budget**: ~7k tokens (~80 messages worth of history)
- **Memory block**: 2k tokens injected from DB
- **Persona block**: ~200 tokens per persona message

---

## 8. Key Files Reference

### Server Entry
- `packages/server/src/index.ts` — Hono app initialization

### Routes
- `packages/server/src/routes/chat.ts` — Chat operations
- `packages/server/src/routes/sessions.ts` — Session management
- `packages/server/src/routes/characters.ts` — Character CRUD

### Services
- `packages/server/src/services/orchestrator.ts` — Main LLM pipeline
- `packages/server/src/services/cast-turn-selector.ts` — Multi-char routing
- `packages/server/src/services/arc-manager.ts` — Arc progression

### Web
- `packages/web/src/app/chat/[sessionId]/page.tsx` — Main chat page
- `packages/web/src/app/chat/[sessionId]/_components/MessageList.tsx` — Bubble list
- `packages/web/src/app/chat/[sessionId]/_components/Composer.tsx` — Input composer
- `packages/web/src/app/chat/[sessionId]/_components/SpritePanel.tsx` — Sprite display
- `packages/web/src/app/chat/[sessionId]/_components/VNMode.tsx` — VN overlay

### Utilities
- `packages/web/src/lib/sse.ts` — SSE client helper
- `packages/web/src/lib/streaming-buffer.ts` — Streaming buffer management
- `packages/web/src/lib/content-detect.ts` — Emotion detection from text
