/**
 * Character creation wizard — "preview opening line" generator.
 *
 * Called from the wizard's final screen to let the creator see how their
 * character would greet the user before committing the save. This is a
 * lightweight single-shot AiProxy call that never writes to the DB.
 */
import { AI_MODEL_CONFIG, DEFAULT_AI_MODEL } from '@neigo/shared';
import { AiProxy } from './ai-proxy.js';

export interface OpeningLineDraft {
  name: string;
  personality: string;
  speechStyle?: string | null;
  tonePreset?: string | null;
  background?: string | null;
  worldInfo?: string | null;
  relationshipType?: string | null;
  relationshipDescription?: string | null;
  /** Primary language of the character/scene. Default 'en'. */
  language?: string;
}

export interface OpeningLinePreview {
  line: string;
}

/**
 * Build a tight persona brief and ask the model for a single opening beat
 * in-character — 1–2 sentences, no greeting cliché, no fourth-wall break.
 * Returns the trimmed line or a short fallback if the model returns empty.
 */
export async function generateOpeningLinePreview(
  draft: OpeningLineDraft,
): Promise<OpeningLinePreview> {
  const lang = draft.language || 'en';
  const fullNames: Record<string, string> = {
    en: 'English',
    id: 'Bahasa Indonesia',
    ja: 'Japanese',
    ko: 'Korean',
    zh: 'Chinese',
    es: 'Spanish',
    pt: 'Portuguese',
    fr: 'French',
    de: 'German',
  };
  const langName = fullNames[lang] || 'English';

  const parts: string[] = [];
  parts.push(`You are ${draft.name}.`);
  parts.push(`Personality: ${draft.personality.slice(0, 400)}`);
  if (draft.speechStyle) parts.push(`Speech style: ${draft.speechStyle.slice(0, 200)}`);
  if (draft.tonePreset && draft.tonePreset !== 'NONE') {
    parts.push(`Tone: ${draft.tonePreset.toLowerCase()}`);
  }
  if (draft.background) parts.push(`Background: ${draft.background.slice(0, 300)}`);
  if (draft.worldInfo) parts.push(`World: ${draft.worldInfo.slice(0, 200)}`);
  if (draft.relationshipType) parts.push(`Relationship to user: ${draft.relationshipType}`);
  if (draft.relationshipDescription) {
    parts.push(`How they see the user: ${draft.relationshipDescription.slice(0, 200)}`);
  }

  const systemPrompt = [
    ...parts,
    '',
    `## Language: ${langName} (Native Level)`,
    `- You MUST write this beat in **${langName}**.`,
    `- Use natural, immersive phrasing. No textbook or robotic translations.`,
    lang === 'id' ? '- Use casual or literary "Bahasa Indonesia" as appropriate for the persona.' : '',
    '',
    'Write ONE in-character opening beat — how you would appear to the user',
    'in the very first scene together. 1–2 short sentences. Mix a small action',
    '(in *asterisks*) with a single line of speech, or just the action if it',
    'fits better. Do NOT greet with "Hi" / "Hello". Do NOT break the fourth',
    'wall. Do NOT describe the user. Match the speech style and tone exactly.',
  ].filter(Boolean).join('\n');

  const result = await AiProxy.complete({
    model: AI_MODEL_CONFIG[DEFAULT_AI_MODEL].slug,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: 'Opening beat:' },
    ],
    temperature: 0.9,
    maxTokens: 120,
  });

  const line = result.content.trim();
  if (!line || line.length < 3) {
    return { line: `*${draft.name} glances up, silent for a beat.*` };
  }
  return { line };
}
