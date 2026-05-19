import {
  MIN_HOLD_MS,
  PRESENCE_PRIORITY,
  PRESENCE_TIMING,
  candidateForEvent,
  type PresenceActivity,
  type PresenceEvent,
  type PresenceSource,
  type PresenceState,
} from './presence.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

interface ReplayStep {
  atMs: number;
  event: PresenceEvent;
}

interface Transition {
  atMs: number;
  from: PresenceActivity;
  to: PresenceActivity;
  source: PresenceSource;
}

interface ReplayMetrics {
  transitionCount: number;
  flickerCount: number;
  averageDwellMs: number;
  currentDwellMs: number;
  lastTransitionAt: number;
}

interface ReplayResult {
  state: PresenceState;
  transitions: Transition[];
  metrics: ReplayMetrics;
}

type ReplayMode = 'tuning' | 'strict';

interface ScenarioReport {
  name: string;
  ok: boolean;
  failures: string[];
  path: string;
  finalState: PresenceState;
  metrics: ReplayMetrics;
  transitions: Transition[];
}

interface ReplayJsonReport {
  mode: ReplayMode;
  generatedAt: string;
  timing: typeof PRESENCE_TIMING;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  scenarios: ScenarioReport[];
}

interface Scenario {
  name: string;
  steps: ReplayStep[];
  expect: {
    tuning: (result: ReplayResult) => string[];
    strict: (result: ReplayResult) => string[];
  };
}

type TimerKind = 'debounce' | 'delayedApply' | 'settleIdle' | 'idleTimeout';

interface ScheduledTimer {
  kind: TimerKind;
  atMs: number;
}

class PresenceReplayEngine {
  private nowMs = 0;

  private state: PresenceState = {
    activity: 'idle',
    affect: 'neutral',
    source: 'system',
    updatedAt: 0,
    affectUpdatedAt: 0,
  };

  private pendingEvent: PresenceEvent | null = null;
  private delayedCandidate: PresenceEvent | null = null;
  private timers: ScheduledTimer[] = [];

  private dwellTotalMs = 0;
  private dwellSamples = 0;
  private transitionCount = 0;
  private flickerCount = 0;
  private lastTransitionAt = 0;

  private transitions: Transition[] = [];

  run(steps: ReplayStep[]): ReplayResult {
    const sorted = [...steps].sort((a, b) => a.atMs - b.atMs);
    for (const step of sorted) {
      this.advanceTo(step.atMs);
      this.dispatch(step.event, false);
    }

    // Flush remaining scheduled work and let state settle.
    this.advanceTo(this.nowMs + 1_500);

    return {
      state: this.state,
      transitions: this.transitions,
      metrics: {
        transitionCount: this.transitionCount,
        flickerCount: this.flickerCount,
        averageDwellMs: this.dwellSamples > 0 ? Math.round(this.dwellTotalMs / this.dwellSamples) : 0,
        currentDwellMs: Math.max(0, this.nowMs - this.state.updatedAt),
        lastTransitionAt: this.lastTransitionAt,
      },
    };
  }

  private advanceTo(targetMs: number) {
    while (true) {
      const next = this.nextTimerAtOrBefore(targetMs);
      if (!next) break;
      this.nowMs = next.atMs;
      this.runTimer(next.kind);
    }
    this.nowMs = targetMs;
  }

  private nextTimerAtOrBefore(targetMs: number): ScheduledTimer | null {
    let winner: ScheduledTimer | null = null;
    for (const timer of this.timers) {
      if (timer.atMs > targetMs) continue;
      if (!winner || timer.atMs < winner.atMs) {
        winner = timer;
      }
    }
    return winner;
  }

  private runTimer(kind: TimerKind) {
    this.removeTimer(kind);
    switch (kind) {
      case 'debounce':
        this.flushPending();
        return;
      case 'delayedApply': {
        const next = this.delayedCandidate;
        this.delayedCandidate = null;
        if (!next) return;
        const candidate = candidateForEvent(next.type);
        if (!candidate) return;
        this.applyActivity(candidate, next.source);
        return;
      }
      case 'settleIdle':
        this.applyActivity('idle', 'system');
        return;
      case 'idleTimeout':
        this.dispatch({ type: 'IDLE_TIMEOUT', source: 'system' }, true);
        return;
      default:
        return;
    }
  }

  private hasTimer(kind: TimerKind): boolean {
    return this.timers.some((timer) => timer.kind === kind);
  }

  private setTimer(kind: TimerKind, atMs: number) {
    this.removeTimer(kind);
    this.timers.push({ kind, atMs });
  }

  private removeTimer(kind: TimerKind) {
    this.timers = this.timers.filter((timer) => timer.kind !== kind);
  }

  private clearIdleTimeout() {
    this.removeTimer('idleTimeout');
  }

  private scheduleIdleTimeout() {
    this.clearIdleTimeout();
    if (this.state.activity === 'idle') return;
    this.setTimer('idleTimeout', this.nowMs + PRESENCE_TIMING.idleTimeoutMs);
  }

  private dispatch(event: PresenceEvent, immediate: boolean) {
    if (immediate) {
      this.pendingEvent = null;
      this.removeTimer('debounce');
      const candidate = candidateForEvent(event.type);
      if (candidate) {
        this.applyActivity(candidate, event.source);
      }
      return;
    }

    const incomingCandidate = candidateForEvent(event.type);
    if (!incomingCandidate) return;

    const pending = this.pendingEvent;
    if (!pending) {
      this.pendingEvent = event;
    } else {
      const pendingCandidate = candidateForEvent(pending.type) ?? 'idle';
      if (PRESENCE_PRIORITY[incomingCandidate] >= PRESENCE_PRIORITY[pendingCandidate]) {
        this.pendingEvent = event;
      }
    }

    if (!this.hasTimer('debounce')) {
      this.setTimer('debounce', this.nowMs + PRESENCE_TIMING.debounceMs);
    }
  }

  private flushPending() {
    const event = this.pendingEvent;
    this.pendingEvent = null;
    if (!event) return;
    const candidate = candidateForEvent(event.type);
    if (!candidate) return;
    this.applyActivity(candidate, event.source);
  }

  private shouldReplace(next: PresenceActivity): boolean {
    const heldFor = this.nowMs - this.state.updatedAt;
    const holdPassed = heldFor >= MIN_HOLD_MS[this.state.activity];
    if (holdPassed) return true;
    return PRESENCE_PRIORITY[next] > PRESENCE_PRIORITY[this.state.activity];
  }

  private encodeCandidate(activity: PresenceActivity, source: PresenceSource): PresenceEvent {
    if (activity === 'listening') return { type: 'USER_INPUT_FOCUS', source };
    if (activity === 'typing') return { type: 'USER_INPUT_TYPING', source };
    if (activity === 'thinking') return { type: 'USER_SUBMIT', source };
    if (activity === 'speaking') return { type: 'MODEL_STREAM_CHUNK', source };
    if (activity === 'success') return { type: 'TURN_SUCCESS', source };
    if (activity === 'error') return { type: 'TURN_ERROR', source };
    if (activity === 'alert') return { type: 'MODEL_STREAM_ERROR', source };
    return { type: 'IDLE_TIMEOUT', source };
  }

  private applyActivity(activity: PresenceActivity, source: PresenceSource) {
    if (
      activity === this.state.activity &&
      this.nowMs - this.state.updatedAt < PRESENCE_TIMING.sameStateCooldownMs
    ) {
      return;
    }

    if (!this.shouldReplace(activity)) {
      const remaining = Math.max(0, MIN_HOLD_MS[this.state.activity] - (this.nowMs - this.state.updatedAt));
      const queued = this.delayedCandidate;
      if (!queued || PRESENCE_PRIORITY[activity] >= PRESENCE_PRIORITY[candidateForEvent(queued.type) ?? 'idle']) {
        this.delayedCandidate = this.encodeCandidate(activity, source);
      }
      if (!this.hasTimer('delayedApply')) {
        this.setTimer('delayedApply', this.nowMs + remaining);
      }
      return;
    }

    this.removeTimer('delayedApply');
    this.delayedCandidate = null;
    this.removeTimer('settleIdle');

    if (activity !== this.state.activity) {
      const dwell = Math.max(0, this.nowMs - this.state.updatedAt);
      this.transitionCount += 1;
      this.lastTransitionAt = this.nowMs;
      this.dwellTotalMs += dwell;
      this.dwellSamples += 1;
      if (dwell < PRESENCE_TIMING.flickerThresholdMs) {
        this.flickerCount += 1;
      }
      this.transitions.push({
        atMs: this.nowMs,
        from: this.state.activity,
        to: activity,
        source,
      });
    }

    this.state = {
      ...this.state,
      activity,
      source,
      updatedAt: this.nowMs,
    };

    if (activity === 'success') {
      this.setTimer('settleIdle', this.nowMs + PRESENCE_TIMING.settleToIdleMs);
    }

    this.scheduleIdleTimeout();
  }
}

function assertIncludesPath(result: ReplayResult, expected: PresenceActivity[]): boolean {
  const actual = result.transitions.map((item) => item.to);
  let cursor = 0;
  for (const activity of actual) {
    if (activity === expected[cursor]) {
      cursor += 1;
      if (cursor === expected.length) return true;
    }
  }
  return false;
}

function createScenarios(): Scenario[] {
  return [
    {
      name: 'normal-stream',
      steps: [
        { atMs: 0, event: { type: 'USER_INPUT_TYPING', source: 'user' } },
        { atMs: 500, event: { type: 'USER_SUBMIT', source: 'user' } },
        { atMs: 1_200, event: { type: 'MODEL_STREAM_START', source: 'model' } },
        { atMs: 1_700, event: { type: 'MODEL_STREAM_CHUNK', source: 'model' } },
        { atMs: 2_500, event: { type: 'MODEL_STREAM_DONE', source: 'model' } },
        { atMs: 2_600, event: { type: 'TURN_SUCCESS', source: 'system' } },
      ],
      expect: {
        tuning: (result) => {
          const failures: string[] = [];
          if (!assertIncludesPath(result, ['typing', 'thinking', 'speaking', 'success', 'idle'])) {
            failures.push('expected transition path typing->thinking->speaking->success->idle');
          }
          if (result.metrics.flickerCount > 3) {
            failures.push(`flicker too high (${result.metrics.flickerCount})`);
          }
          return failures;
        },
        strict: (result) => {
          const failures: string[] = [];
          if (!assertIncludesPath(result, ['typing', 'thinking', 'speaking', 'success', 'idle'])) {
            failures.push('strict: expected full normal-stream path');
          }
          if (result.metrics.flickerCount > 2) {
            failures.push(`strict: expected flicker <= 2 but got ${result.metrics.flickerCount}`);
          }
          if (result.state.activity !== 'idle') {
            failures.push(`strict: expected final idle but got ${result.state.activity}`);
          }
          return failures;
        },
      },
    },
    {
      name: 'abort-stream',
      steps: [
        { atMs: 0, event: { type: 'USER_SUBMIT', source: 'user' } },
        { atMs: 250, event: { type: 'MODEL_STREAM_START', source: 'model' } },
        { atMs: 480, event: { type: 'MODEL_STREAM_ERROR', source: 'model' } },
        { atMs: 540, event: { type: 'TURN_ERROR', source: 'system' } },
      ],
      expect: {
        tuning: (result) => {
          const failures: string[] = [];
          if (!assertIncludesPath(result, ['thinking', 'speaking', 'error'])) {
            failures.push('expected abort flow to reach error state');
          }
          if (result.state.activity !== 'error') {
            failures.push(`expected final activity error but got ${result.state.activity}`);
          }
          return failures;
        },
        strict: (result) => {
          const failures: string[] = [];
          if (!assertIncludesPath(result, ['thinking', 'speaking', 'error'])) {
            failures.push('strict: abort should end in error via speaking');
          }
          if (result.state.activity !== 'error') {
            failures.push(`strict: expected final error but got ${result.state.activity}`);
          }
          if (result.metrics.transitionCount > 4) {
            failures.push(`strict: abort transitions too noisy (${result.metrics.transitionCount})`);
          }
          return failures;
        },
      },
    },
    {
      name: 'retry-after-error',
      steps: [
        { atMs: 0, event: { type: 'USER_SUBMIT', source: 'user' } },
        { atMs: 220, event: { type: 'MODEL_STREAM_ERROR', source: 'model' } },
        { atMs: 1_800, event: { type: 'RETRY_TRIGGERED', source: 'user' } },
        { atMs: 2_200, event: { type: 'MODEL_STREAM_START', source: 'model' } },
        { atMs: 2_800, event: { type: 'MODEL_STREAM_DONE', source: 'model' } },
        { atMs: 2_900, event: { type: 'TURN_SUCCESS', source: 'system' } },
      ],
      expect: {
        tuning: (result) => {
          const failures: string[] = [];
          if (!assertIncludesPath(result, ['thinking', 'error', 'thinking', 'speaking', 'success'])) {
            failures.push('expected retry flow to recover from error into success');
          }
          if (!['success', 'idle'].includes(result.state.activity)) {
            failures.push(`unexpected final activity ${result.state.activity}`);
          }
          if (result.metrics.transitionCount < 5) {
            failures.push(`expected >=5 transitions but got ${result.metrics.transitionCount}`);
          }
          return failures;
        },
        strict: (result) => {
          const failures: string[] = [];
          if (!assertIncludesPath(result, ['thinking', 'error', 'thinking', 'speaking', 'success', 'idle'])) {
            failures.push('strict: retry should recover and settle back to idle');
          }
          if (result.state.activity !== 'idle') {
            failures.push(`strict: expected final idle but got ${result.state.activity}`);
          }
          if (result.metrics.flickerCount > 3) {
            failures.push(`strict: retry flicker too high (${result.metrics.flickerCount})`);
          }
          return failures;
        },
      },
    },
    {
      name: 'rapid-typing-burst',
      steps: [
        { atMs: 0, event: { type: 'USER_INPUT_TYPING', source: 'user' } },
        { atMs: 30, event: { type: 'USER_INPUT_TYPING', source: 'user' } },
        { atMs: 55, event: { type: 'USER_INPUT_TYPING', source: 'user' } },
        { atMs: 80, event: { type: 'USER_INPUT_TYPING', source: 'user' } },
        { atMs: 105, event: { type: 'USER_INPUT_TYPING', source: 'user' } },
        { atMs: 200, event: { type: 'USER_INPUT_TYPING', source: 'user' } },
      ],
      expect: {
        tuning: (result) => {
          const failures: string[] = [];
          const toTyping = result.transitions.filter((item) => item.to === 'typing').length;
          if (toTyping > 2) {
            failures.push(`debounce failed, typing transitions too many (${toTyping})`);
          }
          if (result.metrics.flickerCount > 1) {
            failures.push(`flicker too high during typing burst (${result.metrics.flickerCount})`);
          }
          return failures;
        },
        strict: (result) => {
          const failures: string[] = [];
          const toTyping = result.transitions.filter((item) => item.to === 'typing').length;
          if (toTyping !== 1) {
            failures.push(`strict: expected exactly one typing transition, got ${toTyping}`);
          }
          if (result.metrics.transitionCount !== 1) {
            failures.push(`strict: expected transitionCount 1, got ${result.metrics.transitionCount}`);
          }
          return failures;
        },
      },
    },
  ];
}

function formatActivities(result: ReplayResult): string {
  const sequence = ['idle', ...result.transitions.map((item) => item.to)];
  return sequence.join(' -> ');
}

function parseArgs(args: string[]): { mode: ReplayMode; jsonOut: string | null } {
  let mode: ReplayMode = 'tuning';
  let jsonOut: string | null = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === '--mode') {
      const value = args[i + 1];
      if (value === 'strict' || value === 'tuning') {
        mode = value;
        i += 1;
      }
      continue;
    }
    if (arg.startsWith('--mode=')) {
      const value = arg.slice('--mode='.length);
      if (value === 'strict' || value === 'tuning') {
        mode = value;
      }
      continue;
    }
    if (arg === '--json-out') {
      const value = args[i + 1];
      if (value) {
        jsonOut = value;
        i += 1;
      }
      continue;
    }
    if (arg.startsWith('--json-out=')) {
      jsonOut = arg.slice('--json-out='.length);
    }
  }

  return { mode, jsonOut };
}

async function maybeWriteJsonReport(path: string | null, report: ReplayJsonReport): Promise<void> {
  if (!path) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(report, null, 2), 'utf8');
}

async function main() {
  const { mode, jsonOut } = parseArgs(process.argv.slice(2));
  const scenarios = createScenarios();
  let failing = 0;
  const scenarioReports: ScenarioReport[] = [];

  console.log(`Presence replay harness (${mode})`);
  console.log('-----------------------');

  for (const scenario of scenarios) {
    const engine = new PresenceReplayEngine();
    const result = engine.run(scenario.steps);
    const failures = scenario.expect[mode](result);
    const ok = failures.length === 0;

    if (!ok) failing += 1;

    const path = formatActivities(result);
    scenarioReports.push({
      name: scenario.name,
      ok,
      failures,
      path,
      finalState: result.state,
      metrics: result.metrics,
      transitions: result.transitions,
    });

    console.log(`\n[${ok ? 'PASS' : 'FAIL'}] ${scenario.name}`);
    console.log(`path      : ${path}`);
    console.log(
      `metrics   : transitions=${result.metrics.transitionCount}, flicker=${result.metrics.flickerCount}, avgDwell=${result.metrics.averageDwellMs}ms, currentDwell=${result.metrics.currentDwellMs}ms`,
    );
    console.log(`final     : activity=${result.state.activity}, affect=${result.state.affect}`);

    if (!ok) {
      for (const failure of failures) {
        console.log(`assertion : ${failure}`);
      }
    }
  }

  const jsonReport: ReplayJsonReport = {
    mode,
    generatedAt: new Date().toISOString(),
    timing: PRESENCE_TIMING,
    summary: {
      total: scenarios.length,
      passed: scenarios.length - failing,
      failed: failing,
    },
    scenarios: scenarioReports,
  };
  await maybeWriteJsonReport(jsonOut, jsonReport);
  if (jsonOut) {
    console.log(`\nJSON report: ${jsonOut}`);
  }

  if (failing > 0) {
    console.error(`\nReplay failed in ${failing} scenario(s) [mode=${mode}].`);
    process.exit(1);
  }

  console.log(`\nAll replay scenarios passed [mode=${mode}].`);
}

main().catch((error) => {
  console.error('Replay harness crashed.', error);
  process.exit(1);
});
