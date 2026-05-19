/**
 * Orchestrator Replay Harness
 *
 * Deterministic regression tests for the validator chain (repetition,
 * continuity, refusal, tone drift, format drift, POV drift). Feeds known
 * AI outputs through each detector and asserts correct accept/reject behavior.
 *
 * Run: pnpm --filter @neigo/server test:replay
 * Does NOT call LLM — tests validators only.
 */
import { detectRepetition } from './repetition-detector.js';
import { detectRefusal } from './pass-output-sanitizer.js';
import { detectFormatDrift } from './format-drift-detector.js';
import { detectPovDrift } from './pov-drift-detector.js';
import { checkToneDrift } from './tone-drift-detector.js';

// ── Types ────────────────────────────────────────────────────────────────────

interface ReplayScenario {
  name: string;
  description: string;
  input: {
    text: string;
    recentAssistant?: string[];
    expectedPov?: 'first_person_character' | 'third_person_limited' | 'third_person_omniscient';
    tonePreset?: string;
    trustScore?: number;
  };
  expected: {
    repetition?: 'pass' | 'reject';
    refusal?: 'pass' | 'reject';
    formatDrift?: 'pass' | 'reject';
    povDrift?: 'pass' | 'reject';
    toneDrift?: 'pass' | 'reject';
  };
}

interface ReplayResult {
  scenario: string;
  results: Record<string, { expected: string; actual: string; pass: boolean }>;
  allPassed: boolean;
}

// ── Scenarios ────────────────────────────────────────────────────────────────

const SCENARIOS: ReplayScenario[] = [
  {
    name: 'clean_3rd_person_response',
    description: 'Well-formed 3rd-person roleplay, no issues',
    input: {
      text: `Lysandra's fingers brushed against the worn spine of the book, her gaze distant. "I didn't expect you to come back," she murmured, a faint tremor in her voice betraying the careful composure she'd built like a fortress.\n\nThe candlelight caught the edge of her jaw, casting amber shadows across the wall behind her.`,
      recentAssistant: [
        `She turned away, the silence stretching between them like a thread about to snap. "Some things aren't meant to be spoken aloud," she said.`,
      ],
      expectedPov: 'third_person_limited',
      tonePreset: 'NONE',
      trustScore: 45,
    },
    expected: {
      repetition: 'pass',
      refusal: 'pass',
      formatDrift: 'pass',
      povDrift: 'pass',
      toneDrift: 'pass',
    },
  },
  {
    name: 'repetitive_response',
    description: 'AI repeats same phrases from recent output',
    input: {
      text: `She turned away, the silence stretching between them like a thread about to snap. "Some things aren't meant to be spoken aloud," she said quietly, her eyes averted.`,
      recentAssistant: [
        `She turned away, the silence stretching between them like a thread about to snap. "Some things aren't meant to be spoken aloud," she said.`,
        `The room fell quiet again. Lysandra picked up the teacup, turning it slowly in her hands.`,
      ],
      expectedPov: 'third_person_limited',
      tonePreset: 'NONE',
      trustScore: 45,
    },
    expected: {
      repetition: 'reject',
      refusal: 'pass',
      formatDrift: 'pass',
      povDrift: 'pass',
    },
  },
  {
    name: 'refusal_detected',
    description: 'AI breaks character with a disclaimer',
    input: {
      text: `As an AI language model, I cannot engage in this type of roleplay scenario. However, I can suggest alternative approaches to creative writing that would be more appropriate.`,
      recentAssistant: [],
      expectedPov: 'third_person_limited',
      tonePreset: 'NONE',
      trustScore: 45,
    },
    expected: {
      repetition: 'pass',
      refusal: 'reject',
      formatDrift: 'pass',
    },
  },
  {
    name: 'format_drift_dialogue_in_italics',
    description: 'Dialogue incorrectly wrapped in italics markers',
    input: {
      text: `*"I don't know why you keep coming back here," she whispered.* The room fell silent. *"Maybe I can't stay away," he replied.* She looked away. *"Then don't," she breathed.*`,
      recentAssistant: [],
      expectedPov: 'third_person_limited',
      tonePreset: 'NONE',
      trustScore: 45,
    },
    expected: {
      repetition: 'pass',
      refusal: 'pass',
      formatDrift: 'reject',
    },
  },
  {
    name: 'pov_drift_first_to_third',
    description: 'Expected first-person but AI writes in third person',
    input: {
      text: `She looked at the stranger with curiosity. She felt a shiver run down her spine. She turned away from the window and noticed the letter on the desk.`,
      recentAssistant: [],
      expectedPov: 'first_person_character',
      tonePreset: 'NONE',
      trustScore: 45,
    },
    expected: {
      repetition: 'pass',
      refusal: 'pass',
      formatDrift: 'pass',
      povDrift: 'reject',
    },
  },
  {
    name: 'pov_correct_first_person',
    description: 'First-person POV maintained correctly',
    input: {
      text: `I set the book down carefully, trying not to let my hands tremble. "You shouldn't be here," I said, keeping my voice steady despite the pounding in my chest. The last time someone knocked this late, it hadn't ended well.`,
      recentAssistant: [],
      expectedPov: 'first_person_character',
      tonePreset: 'NONE',
      trustScore: 45,
    },
    expected: {
      repetition: 'pass',
      refusal: 'pass',
      formatDrift: 'pass',
      povDrift: 'pass',
    },
  },
  {
    name: 'tone_drift_cold_char_too_warm',
    description: 'COLD tone preset but response is too warm/affectionate',
    input: {
      text: `"Oh darling, I missed you so much!" she exclaimed, throwing her arms around him with unbridled joy. "Every moment without you felt like an eternity of longing! I love you more than words can say, my sweet angel!"`,
      recentAssistant: [],
      expectedPov: 'third_person_limited',
      tonePreset: 'STOIC',
      trustScore: 20,
    },
    expected: {
      repetition: 'pass',
      refusal: 'pass',
      toneDrift: 'reject',
    },
  },
  {
    name: 'tone_correct_cold',
    description: 'COLD preset, appropriately reserved response',
    input: {
      text: `She didn't look up when the door opened. "You're late," was all she offered, her pen continuing its steady path across the page. The temperature in the room seemed to drop another degree.`,
      recentAssistant: [],
      expectedPov: 'third_person_limited',
      tonePreset: 'STOIC',
      trustScore: 20,
    },
    expected: {
      repetition: 'pass',
      refusal: 'pass',
      toneDrift: 'pass',
    },
  },
  {
    name: 'mixed_language_clean',
    description: 'Indonesian + English mixed roleplay, no issues',
    input: {
      text: `Lysandra meletakkan buku itu dengan hati-hati. "Kamu seharusnya tidak datang kemari," katanya pelan, meskipun matanya berkata sebaliknya. *Jari-jarinya mencengkeram tepi meja, berusaha menyembunyikan getaran di tangannya.*`,
      recentAssistant: [
        `"Aku sudah bilang, jangan kembali," bisiknya. Tapi langkahnya tidak mundur — justru semakin mendekat.`,
      ],
      expectedPov: 'third_person_limited',
      tonePreset: 'NONE',
      trustScore: 60,
    },
    expected: {
      repetition: 'pass',
      refusal: 'pass',
      formatDrift: 'pass',
      povDrift: 'pass',
      toneDrift: 'pass',
    },
  },
];

// ── Runner ───────────────────────────────────────────────────────────────────

function runScenario(scenario: ReplayScenario): ReplayResult {
  const { input, expected } = scenario;
  const results: Record<string, { expected: string; actual: string; pass: boolean }> = {};

  // Repetition
  if (expected.repetition) {
    const rep = detectRepetition(input.text, input.recentAssistant ?? []);
    const actual = rep.shouldReject ? 'reject' : 'pass';
    results.repetition = { expected: expected.repetition, actual, pass: actual === expected.repetition };
  }

  // Refusal
  if (expected.refusal) {
    const ref = detectRefusal(input.text);
    const actual = ref.refused ? 'reject' : 'pass';
    results.refusal = { expected: expected.refusal, actual, pass: actual === expected.refusal };
  }

  // Format drift
  if (expected.formatDrift) {
    const fmt = detectFormatDrift(input.text);
    const actual = fmt.shouldReject ? 'reject' : 'pass';
    results.formatDrift = { expected: expected.formatDrift, actual, pass: actual === expected.formatDrift };
  }

  // POV drift
  if (expected.povDrift && input.expectedPov) {
    const pov = detectPovDrift(input.text, input.expectedPov);
    const actual = pov.shouldReject ? 'reject' : 'pass';
    results.povDrift = { expected: expected.povDrift, actual, pass: actual === expected.povDrift };
  }

  // Tone drift
  if (expected.toneDrift && input.tonePreset) {
    const tone = checkToneDrift(input.text, { name: 'Test', tonePreset: input.tonePreset as any }, input.trustScore ?? 0);
    const actual = tone.kind === 'drifting' ? 'reject' : 'pass';
    results.toneDrift = { expected: expected.toneDrift, actual, pass: actual === expected.toneDrift };
  }

  const allPassed = Object.values(results).every((r) => r.pass);
  return { scenario: scenario.name, results, allPassed };
}

export function runReplayHarness(): { results: ReplayResult[]; summary: { total: number; passed: number; failed: number } } {
  const results = SCENARIOS.map(runScenario);
  const passed = results.filter((r) => r.allPassed).length;
  return {
    results,
    summary: { total: results.length, passed, failed: results.length - passed },
  };
}

// CLI entry point
if (typeof process !== 'undefined' && process.argv[1]?.includes('orchestrator-replay')) {
  const { results, summary } = runReplayHarness();

  console.log('\n══════════════════════════════════════════════════════');
  console.log('  ORCHESTRATOR REPLAY HARNESS');
  console.log('══════════════════════════════════════════════════════\n');

  for (const r of results) {
    const icon = r.allPassed ? '✓' : '✗';
    const color = r.allPassed ? '\x1b[32m' : '\x1b[31m';
    console.log(`${color}${icon}\x1b[0m ${r.scenario}`);
    if (!r.allPassed) {
      for (const [check, detail] of Object.entries(r.results)) {
        if (!detail.pass) {
          console.log(`    └─ ${check}: expected=${detail.expected} actual=${detail.actual}`);
        }
      }
    }
  }

  console.log(`\n  Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed}`);
  console.log('══════════════════════════════════════════════════════\n');

  process.exit(summary.failed > 0 ? 1 : 0);
}
