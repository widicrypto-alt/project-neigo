import { useCallback, useEffect, useRef, useState } from 'react';

export type PresenceActivity =
  | 'idle'
  | 'listening'
  | 'typing'
  | 'thinking'
  | 'speaking'
  | 'success'
  | 'alert'
  | 'error';

export type PresenceAffect =
  | 'neutral'
  | 'curious'
  | 'empathetic'
  | 'confident'
  | 'vulnerable'
  | 'conflicted'
  | 'playful'
  | 'guarded';

export type PresenceEventType =
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
  | 'MOOD_SIGNAL'
  | 'VULNERABILITY_MOMENT'
  | 'CONFLICT_MOMENT'
  | 'MILESTONE_SIGNAL'
  | 'IDLE_TIMEOUT'
  | 'RETRY_TRIGGERED';

export type PresenceSource = 'user' | 'model' | 'system';

export interface PresenceEvent {
  type: PresenceEventType;
  source: PresenceSource;
  payload?: Record<string, unknown>;
}

export interface PresenceState {
  activity: PresenceActivity;
  affect: PresenceAffect;
  source: PresenceSource;
  updatedAt: number;
  affectUpdatedAt: number;
}

export interface PresenceTelemetry {
  transitionCount: number;
  flickerCount: number;
  averageDwellMs: number;
  currentDwellMs: number;
  lastTransitionAt: number;
}

export const PRESENCE_PRIORITY: Record<PresenceActivity, number> = {
  error: 100,
  alert: 90,
  speaking: 80,
  thinking: 70,
  typing: 60,
  listening: 50,
  success: 40,
  idle: 10,
};

export const MIN_HOLD_MS: Record<PresenceActivity, number> = {
  idle: 260,
  listening: 320,
  typing: 380,
  thinking: 620,
  speaking: 780,
  success: 560,
  alert: 1100,
  error: 1300,
};

// Tuned for real chat rhythm: faster reaction, still anti-flicker.
export const PRESENCE_TIMING = {
  debounceMs: 120,
  sameStateCooldownMs: 220,
  settleToIdleMs: 320,
  idleTimeoutMs: 12_000,
  affectCooldownMs: 2_000,
  flickerThresholdMs: 400,
} as const;

export function candidateForEvent(type: PresenceEventType): PresenceActivity | null {
  switch (type) {
    case 'USER_INPUT_FOCUS':
      return 'listening';
    case 'USER_INPUT_TYPING':
      return 'typing';
    case 'USER_SUBMIT':
      return 'thinking';
    case 'MODEL_STREAM_START':
    case 'MODEL_STREAM_CHUNK':
      return 'speaking';
    case 'MODEL_STREAM_DONE':
    case 'TURN_SUCCESS':
      return 'success';
    case 'MODEL_STREAM_ERROR':
    case 'TURN_ERROR':
      return 'error';
    case 'RETRY_TRIGGERED':
      return 'thinking';
    case 'IDLE_TIMEOUT':
      return 'idle';
    default:
      return null;
  }
}

function affectCandidateForEvent(event: PresenceEvent): PresenceAffect | null {
  switch (event.type) {
    case 'RELATIONSHIP_STAGE_CHANGED': {
      const stageRaw = typeof event.payload?.stage === 'string' ? event.payload.stage : '';
      const stage = stageRaw.toUpperCase();
      if (stage === 'STRANGER' || stage === 'ACQUAINTANCE') return 'guarded';
      if (stage === 'FRIEND' || stage === 'CLOSE') return 'confident';
      if (stage === 'INTIMATE' || stage === 'BONDED') return 'playful';
      return 'neutral';
    }
    case 'VULNERABILITY_MOMENT':
      return 'vulnerable';
    case 'CONFLICT_MOMENT':
      return 'conflicted';
    case 'MOOD_SIGNAL': {
      const moodRaw = typeof event.payload?.mood === 'string' ? event.payload.mood : '';
      const mood = moodRaw.toLowerCase();
      if (mood.includes('vulnerab') || mood.includes('fragile') || mood.includes('tender')) return 'vulnerable';
      if (mood.includes('distant') || mood.includes('cold') || mood.includes('angry')) return 'conflicted';
      if (mood.includes('curious')) return 'curious';
      return 'neutral';
    }
    case 'TURN_ERROR':
    case 'MODEL_STREAM_ERROR':
      return 'guarded';
    case 'TURN_SUCCESS':
    case 'MODEL_STREAM_DONE':
      return 'confident';
    default:
      return null;
  }
}

function shouldReplace(current: PresenceState, next: PresenceActivity, now: number): boolean {
  const heldFor = now - current.updatedAt;
  const holdPassed = heldFor >= MIN_HOLD_MS[current.activity];
  if (holdPassed) return true;
  return PRESENCE_PRIORITY[next] > PRESENCE_PRIORITY[current.activity];
}

export function usePresenceOrchestrator() {
  const [state, setState] = useState<PresenceState>({
    activity: 'idle',
    affect: 'neutral',
    source: 'system',
    updatedAt: Date.now(),
    affectUpdatedAt: Date.now(),
  });
  const [telemetry, setTelemetry] = useState<PresenceTelemetry>({
    transitionCount: 0,
    flickerCount: 0,
    averageDwellMs: 0,
    currentDwellMs: 0,
    lastTransitionAt: Date.now(),
  });

  const stateRef = useRef(state);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const delayedApplyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const telemetryTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingEventRef = useRef<PresenceEvent | null>(null);
  const delayedCandidateRef = useRef<PresenceEvent | null>(null);
  const dispatchRef = useRef<((event: PresenceEvent, immediate?: boolean) => void) | null>(null);
  const telemetryRef = useRef({
    transitionCount: 0,
    flickerCount: 0,
    dwellTotalMs: 0,
    dwellSamples: 0,
    lastTransitionAt: Date.now(),
  });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const pushTelemetry = useCallback((now: number) => {
    const t = telemetryRef.current;
    const currentDwellMs = Math.max(0, now - stateRef.current.updatedAt);
    const averageDwellMs = t.dwellSamples > 0 ? Math.round(t.dwellTotalMs / t.dwellSamples) : 0;
    setTelemetry({
      transitionCount: t.transitionCount,
      flickerCount: t.flickerCount,
      averageDwellMs,
      currentDwellMs,
      lastTransitionAt: t.lastTransitionAt,
    });
  }, []);

  const applyAffect = useCallback((affect: PresenceAffect, force = false) => {
    const now = Date.now();
    const current = stateRef.current;
    if (affect === current.affect) return;
    if (!force && now - current.affectUpdatedAt < PRESENCE_TIMING.affectCooldownMs) return;
    const next: PresenceState = {
      ...current,
      affect,
      affectUpdatedAt: now,
    };
    stateRef.current = next;
    setState(next);
  }, []);

  const clearIdleTimeout = useCallback(() => {
    if (!idleTimerRef.current) return;
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = null;
  }, []);

  const scheduleIdleTimeout = useCallback(() => {
    clearIdleTimeout();
    if (stateRef.current.activity === 'idle') return;
    idleTimerRef.current = setTimeout(() => {
      dispatchRef.current?.({ type: 'IDLE_TIMEOUT', source: 'system' }, true);
    }, PRESENCE_TIMING.idleTimeoutMs);
  }, [clearIdleTimeout]);

  const applyActivity = useCallback((activity: PresenceActivity, source: PresenceSource) => {
    const now = Date.now();
    const current = stateRef.current;

    if (activity === current.activity && now - current.updatedAt < PRESENCE_TIMING.sameStateCooldownMs) {
      return;
    }

    if (!shouldReplace(current, activity, now)) {
      const remaining = Math.max(0, MIN_HOLD_MS[current.activity] - (now - current.updatedAt));
      const queued = delayedCandidateRef.current;
      if (!queued || PRESENCE_PRIORITY[activity] >= PRESENCE_PRIORITY[candidateForEvent(queued.type) ?? 'idle']) {
        delayedCandidateRef.current = {
          type:
            activity === 'listening'
              ? 'USER_INPUT_FOCUS'
              : activity === 'typing'
                ? 'USER_INPUT_TYPING'
                : activity === 'thinking'
                  ? 'USER_SUBMIT'
                  : activity === 'speaking'
                    ? 'MODEL_STREAM_CHUNK'
                    : activity === 'success'
                      ? 'TURN_SUCCESS'
                      : activity === 'error'
                        ? 'TURN_ERROR'
                        : activity === 'alert'
                          ? 'MODEL_STREAM_ERROR'
                          : 'IDLE_TIMEOUT',
          source,
        };
      }
      if (!delayedApplyTimerRef.current) {
        delayedApplyTimerRef.current = setTimeout(() => {
          delayedApplyTimerRef.current = null;
          const next = delayedCandidateRef.current;
          delayedCandidateRef.current = null;
          if (!next) return;
          const candidate = candidateForEvent(next.type);
          if (!candidate) return;
          applyActivity(candidate, next.source);
        }, remaining);
      }
      return;
    }

    if (delayedApplyTimerRef.current) {
      clearTimeout(delayedApplyTimerRef.current);
      delayedApplyTimerRef.current = null;
      delayedCandidateRef.current = null;
    }

    if (settleIdleTimerRef.current) {
      clearTimeout(settleIdleTimerRef.current);
      settleIdleTimerRef.current = null;
    }

    if (activity !== current.activity) {
      const dwell = Math.max(0, now - current.updatedAt);
      const t = telemetryRef.current;
      t.transitionCount += 1;
      t.lastTransitionAt = now;
      t.dwellTotalMs += dwell;
      t.dwellSamples += 1;
      if (dwell < PRESENCE_TIMING.flickerThresholdMs) {
        t.flickerCount += 1;
      }
    }

    const nextState: PresenceState = {
      ...current,
      activity,
      source,
      updatedAt: now,
    };
    stateRef.current = nextState;
    setState(nextState);
    pushTelemetry(now);

    if (activity === 'success') {
      settleIdleTimerRef.current = setTimeout(() => {
        applyActivity('idle', 'system');
      }, PRESENCE_TIMING.settleToIdleMs);
    }

    scheduleIdleTimeout();
  }, [pushTelemetry, scheduleIdleTimeout]);

  const flushPending = useCallback(() => {
    debounceTimerRef.current = null;
    const event = pendingEventRef.current;
    pendingEventRef.current = null;
    if (!event) return;
    const candidate = candidateForEvent(event.type);
    if (!candidate) return;
    applyActivity(candidate, event.source);
  }, [applyActivity]);

  const dispatch = useCallback((event: PresenceEvent, immediate = false) => {
    const affectCandidate = affectCandidateForEvent(event);
    if (affectCandidate) {
      const critical = event.type === 'VULNERABILITY_MOMENT' || event.type === 'CONFLICT_MOMENT';
      applyAffect(affectCandidate, critical);
    }

    if (immediate) {
      pendingEventRef.current = null;
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      const candidate = candidateForEvent(event.type);
      if (candidate) {
        applyActivity(candidate, event.source);
      }
      return;
    }

    const incomingCandidate = candidateForEvent(event.type);
    if (!incomingCandidate) return;

    const pending = pendingEventRef.current;
    if (!pending) {
      pendingEventRef.current = event;
    } else {
      const pendingCandidate = candidateForEvent(pending.type) ?? 'idle';
      if (PRESENCE_PRIORITY[incomingCandidate] >= PRESENCE_PRIORITY[pendingCandidate]) {
        pendingEventRef.current = event;
      }
    }

    if (!debounceTimerRef.current) {
      debounceTimerRef.current = setTimeout(flushPending, PRESENCE_TIMING.debounceMs);
    }
  }, [applyActivity, applyAffect, flushPending]);

  // Keep dispatchRef in sync so scheduleIdleTimeout can call dispatch without
  // requiring it as a dep (which would create a circular dependency chain).
  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  useEffect(() => {
    pushTelemetry(Date.now());
    telemetryTickRef.current = setInterval(() => {
      pushTelemetry(Date.now());
    }, 1_000);
    return () => {
      if (telemetryTickRef.current) clearInterval(telemetryTickRef.current);
    };
  }, [pushTelemetry]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (delayedApplyTimerRef.current) clearTimeout(delayedApplyTimerRef.current);
      if (settleIdleTimerRef.current) clearTimeout(settleIdleTimerRef.current);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (telemetryTickRef.current) clearInterval(telemetryTickRef.current);
    };
  }, []);

  return { state, telemetry, dispatch };
}

export function presenceLabel(activity: PresenceActivity): string {
  switch (activity) {
    case 'idle':
      return 'Idle';
    case 'listening':
      return 'Listening';
    case 'typing':
      return 'Typing';
    case 'thinking':
      return 'Thinking';
    case 'speaking':
      return 'Speaking';
    case 'success':
      return 'Settled';
    case 'alert':
      return 'Alert';
    case 'error':
      return 'Error';
    default:
      return 'Idle';
  }
}

export function affectLabel(affect: PresenceAffect): string {
  switch (affect) {
    case 'neutral':
      return 'Neutral';
    case 'curious':
      return 'Curious';
    case 'empathetic':
      return 'Empathetic';
    case 'confident':
      return 'Confident';
    case 'vulnerable':
      return 'Vulnerable';
    case 'conflicted':
      return 'Conflicted';
    case 'playful':
      return 'Playful';
    case 'guarded':
      return 'Guarded';
    default:
      return 'Neutral';
  }
}
