# TODO: Chat Experience & Story Discovery Mode

## Overview
Implementasi sistem Chat Experience dan Story Discovery Mode untuk meningkatkan interaksi dengan karakter VN-style.

---

## Completed Implementation ✅

### Database Schema (Migration 0054-0057)
- [x] **0054** - `user_mc_profiles` table
- [x] **0056** - `story_cast_progress` table
- [x] **0057** - `story_cast_encounters` table
- [x] Schema updated in `packages/server/src/db/schema.ts`

### Backend Services
- [x] `mc-service.ts` - MC Profile CRUD operations
  - Create, read, update, delete MC profiles
  - Default profile management
  - Profile validation with Zod schemas
  - MC context builder for prompt injection
- [x] `cast-tracker.ts` - Cast Discovery tracking
  - Initialize cast progress
  - Record cast encounters
  - Update relationship stats
  - Generate discovery hints
  - Full cast status for UI

### Prompt Templates
- [x] `prompts/story-discovery.md` - Discovery mode system prompt
  - MC role definition (AI is NOT the MC)
  - Cast discovery mechanics
  - Meeting detection markers
  - Stats & emotion tracking
  - Writing style guidelines

### Frontend Components
- [x] `McProfileEditor.tsx` - MC profile creation/editing modal
  - Tabbed interface (Basic/Appearance/Advanced)
  - Avatar URL support
  - Default profile toggle
- [x] `McProfileSelector.tsx` - Profile & Character selection
  - **NEW:** Tabbed interface for MC Profiles & User's Characters
  - Quick start (anonymous) option
  - Profile list with avatars
  - **NEW:** User's characters displayed as MC options
  - Story start modal with MC selection
- [x] `CastTracker.tsx` - Cast progress tracking UI
  - Progress bar
  - Met/Unmet member lists
  - Role-based categorization (MC, Harem, NPC, Supporting)
  - Compact indicator variant
- [x] `index.ts` - Barrel exports

---

## Features Implemented

### MC Selection Options (User can choose):
1. **Custom MC Profiles** - User-created protagonist personas
2. **User's Characters** - Character cards can be used as MC
3. **Anonymous** - Quick start without profile

### Storylines with MC:
- [x] Checkbox to mark storylines with MC
- [x] MC slot configuration in stories table
- [x] User must select MC before starting MC-required stories
- [x] Soft goal completion (cast discovery)

### Cast Role System:
- `mc` - Main Character (user's avatar)
- `harem` - Romance targets
- `npc` - Non-player characters
- `supporting` - Background characters

---

## Pending Tasks

### High Priority
- [ ] Install shadcn/ui components (button, card, dialog, badge, avatar, progress, tooltip, tabs, input, textarea)
- [ ] Create API routes for MC profile CRUD
- [ ] Create API routes for cast tracker
- [ ] Connect frontend to backend APIs

### Medium Priority
- [ ] MC Profile management page in user settings
- [ ] Discovery hints generation (AI-powered)
- [ ] First impression capture UI
- [ ] Relationship stats visualization

### Low Priority
- [ ] MC profile import/export
- [ ] MC profile templates/presets
- [ ] Achievement badges for cast discovery

---

## Technical Notes

### MC Profile Schema
```typescript
interface McProfile {
  id: string;
  userId: string;
  name: string;
  avatarUrl: string | null;
  persona: {
    age?: number | null;
    gender?: string | null;
    personality: string;
    appearance?: string | null;
    background?: string | null;
    speechStyle?: string | null;
  };
  isDefault: boolean;
}
```

### Character as MC Interface
```typescript
interface CharacterAsMcOption {
  id: string;
  name: string;
  avatarUrl: string | null;
  tagline?: string | null;
  persona: Record<string, unknown>;
  isBuiltIn: boolean;
}
```

### Cast Encounter Tracking
- Soft completion goal (no enforcement)
- Trust/Affection/Tension deltas per encounter
- First meeting scene & mood capture
- User notes per character

### Discovery Mode Flow
1. User selects story → StoryStartModal appears
2. User selects MC from profiles OR characters tab
3. User can create new MC profile inline
4. Chat session created with MC context
5. Cast progress initialized
6. First encounters tracked automatically
7. User can view progress via CastTracker component

---

## Files Created/Modified

### New Files
- `packages/server/src/services/mc-service.ts`
- `packages/server/src/services/cast-tracker.ts`
- `packages/web/src/components/mc/McProfileEditor.tsx`
- `packages/web/src/components/mc/McProfileSelector.tsx` (updated with character support)
- `packages/web/src/components/mc/CastTracker.tsx`
- `packages/web/src/components/mc/index.ts`
- `prompts/story-discovery.md`

### Modified Files
- `packages/server/src/db/schema.ts` (added MC system tables)
- `packages/server/drizzle/0054_mc_profiles.sql`
- `packages/server/drizzle/0056_story_cast_progress.sql`
- `packages/server/drizzle/0057_cast_encounters.sql`

---

## Next Steps

1. Install shadcn/ui components
2. Create API routes in `packages/server/src/routes/`
3. Add hooks for MC profiles in `packages/web/src/hooks/`
4. Update story detail page to use StoryStartModal
5. Add CastTracker to chat sidebar
6. Test full discovery flow
