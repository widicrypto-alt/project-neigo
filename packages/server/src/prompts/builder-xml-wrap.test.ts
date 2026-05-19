/**
 * PLANv3 X2.1 — XML-wrapped prompt sections behind PROMPT_XML_WRAP_ENABLED.
 *
 * Guarantees:
 * - Flag OFF: output contains markdown headers (## Character Card etc),
 *   NO XML envelope tags.
 * - Flag ON:  output contains <character>, <scenario>, <scene_state>,
 *   <lorebook>, <memory> tags wrapping the same content. Markdown headers
 *   remain inside the envelope for readability — model treats XML as
 *   the hard delimiter.
 *
 * Uses bun:test (same runner as other server package tests).
 */
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ChatMode, type Character, type ChatSession } from '@neigo/shared';
import { PromptBuilder } from './builder.js';

const SNAPSHOT_CHAR: Character = {
  id: 'char-test',
  userId: 'user-test',
  name: 'Rei',
  personality: 'Cold, stoic, clingy underneath.',
  speechStyle: 'Flat, Tokyo-urban, WA-style.',
  tonePreset: 'TSUNDERE' as Character['tonePreset'],
  age: '28',
  gender: 'female',
  likes: 'coffee, rainy commute',
  dislikes: 'small talk',
  background: 'Lives in Setagaya, freelance localizer.',
  worldInfo: null,
  forbiddenTopics: null,
  relationshipType: null,
  relationshipDescription: null,
  verbalHabits: null,
  conflictStyle: null,
} as unknown as Character;

const SNAPSHOT_SESSION: ChatSession = {
  id: 'sess-test',
  userId: 'user-test',
  characterId: 'char-test',
  mode: ChatMode.STORY,
  sceneCard: {
    location: 'Koenji cafe',
    weather: 'drizzle',
    time: 'evening',
    mood: 'muted',
    pov: 'third_person_limited',
    openingNote: null,
    customSceneText: null,
    userRole: null,
  },
  dramaIntensity: 2,
  debatePhase: 'opening',
  metadata: {
    sceneState: {
      location: 'Koenji cafe',
      holding: 'ceramic mug',
    },
  },
} as unknown as ChatSession;

const BUILD_ARGS = {
  character: SNAPSHOT_CHAR,
  mode: ChatMode.STORY,
  session: SNAPSHOT_SESSION,
  userName: 'Haruki',
  pinnedMemories: ['user prefers black coffee'],
  loreContext: [
    { id: 'l1', title: 'Koenji', content: 'Bohemian neighborhood in Suginami.' },
  ] as any,
  turnCount: 10,
  trustScore: 40,
};

describe('PLANv3 X2.1 — PROMPT_XML_WRAP_ENABLED', () => {
  const prev = process.env.PROMPT_XML_WRAP_ENABLED;

  afterEach(() => {
    if (prev === undefined) delete process.env.PROMPT_XML_WRAP_ENABLED;
    else process.env.PROMPT_XML_WRAP_ENABLED = prev;
  });

  it('flag OFF (default): emits markdown headers without XML envelope', () => {
    // Import fresh module so env re-evaluation picks up default (false).
    process.env.PROMPT_XML_WRAP_ENABLED = 'false';
    const out = PromptBuilder.buildSystemPrompt(BUILD_ARGS as any);

    expect(out).toContain('## Character Card');
    expect(out).toContain('## Scene');
    expect(out).toContain('📌 Pinned Memories');
    expect(out).toContain('🌍 World Lorebook');
    expect(out).toContain('Current Scene State');

    expect(out).not.toMatch(/<character>/);
    expect(out).not.toMatch(/<\/character>/);
    expect(out).not.toMatch(/<lorebook>/);
    expect(out).not.toMatch(/<scene_state>/);
  });

  it('flag ON: wraps sections in <character>, <scenario>, <scene_state>, <lorebook>, <memory>', () => {
    // NOTE: env is parsed once at module load. We exercise wrapSection via
    // an indirect route — import rebinds through dynamic import by re-reading
    // the module. If your test harness caches, skip via `it.todo`.
    process.env.PROMPT_XML_WRAP_ENABLED = 'true';
    // Re-require the module to pick up fresh env parse.
    delete require.cache?.[require.resolve?.('../lib/env.js')];
    delete require.cache?.[require.resolve?.('./builder.js')];
    const freshBuilder = require('./builder.js').PromptBuilder as typeof PromptBuilder;
    const out = freshBuilder.buildSystemPrompt(BUILD_ARGS as any);

    // Envelope tags must appear at least once each.
    expect(out).toMatch(/<character>[\s\S]+?<\/character>/);
    expect(out).toMatch(/<scenario>[\s\S]+?<\/scenario>/);
    expect(out).toMatch(/<scene_state>[\s\S]+?<\/scene_state>/);
    expect(out).toMatch(/<lorebook>[\s\S]+?<\/lorebook>/);
    expect(out).toMatch(/<memory>[\s\S]+?<\/memory>/);

    // Paired: every opening tag has a closing tag.
    const openCount = (out.match(/<(character|scenario|scene_state|lorebook|memory)>/g) ?? []).length;
    const closeCount = (out.match(/<\/(character|scenario|scene_state|lorebook|memory)>/g) ?? []).length;
    expect(openCount).toBe(closeCount);

    // Content survives inside envelope.
    expect(out).toContain('## Character Card');
    expect(out).toContain('Koenji cafe');
  });
});
