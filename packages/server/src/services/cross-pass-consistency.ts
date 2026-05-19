/**
 * Cross-pass consistency checker.
 * Port of CrossPassConsistencyChecker.kt
 */
import type { Severity } from './repetition-detector.js';

export type ConsistencyViolationType =
  | 'CONTRADICTORY_FACT'
  | 'NAME_CONFUSION'
  | 'LOCATION_CONFLICT'
  | 'KNOWLEDGE_BLEED'
  | 'TIMELINE_CONFLICT';

export interface ConsistencyViolation {
  type: ConsistencyViolationType;
  excerpt: string;
  affectedCharacters: string[];
}

export interface ConsistencyResult {
  isConsistent: boolean;
  violations: ConsistencyViolation[];
  severity: Severity;
}

export interface CrossPassAnchor {
  location: string | null;
  castPresentNames: string[];
}

const THOUGHT_RE = /(?:\*[^*]+\*|\([^)]+\))/g;

export function checkCrossPassConsistency(
  turnOutputs: ReadonlyMap<string, string>,
  anchor: CrossPassAnchor,
): ConsistencyResult {
  const violations: ConsistencyViolation[] = [];

  // 1. name confusion — character addresses themselves
  for (const [speaker, text] of turnOutputs) {
    const re = new RegExp(`\\b(?:Hey|Hi|Hello)[,\\s]+${escapeRe(speaker)}\\b`, 'i');
    if (re.test(text)) {
      violations.push({
        type: 'NAME_CONFUSION',
        excerpt: `${speaker} addresses themselves`,
        affectedCharacters: [speaker],
      });
    }
  }

  // 2. knowledge bleed — private thought from pass A appears verbatim in pass B
  const entries = Array.from(turnOutputs.entries());
  for (let i = 0; i < entries.length; i++) {
    const entA = entries[i];
    if (!entA) continue;
    const [spkA, txtA] = entA;
    const thoughts = [...txtA.matchAll(THOUGHT_RE)].map((m) => stripWrap(m[0]).trim()).filter((t) => t.length > 10);
    for (let j = i + 1; j < entries.length; j++) {
      const entB = entries[j];
      if (!entB) continue;
      const [spkB, txtB] = entB;
      for (const th of thoughts) {
        if (txtB.toLowerCase().includes(th.toLowerCase())) {
          violations.push({
            type: 'KNOWLEDGE_BLEED',
            excerpt: th.slice(0, 80),
            affectedCharacters: [spkA, spkB],
          });
        }
      }
    }
  }

  // 3. location conflict — different explicit locations mentioned
  if (anchor.location) {
    const loc = anchor.location.toLowerCase();
    const mentionsOther: string[] = [];
    const locRe = /\b(?:in|at)\s+the?\s+([a-zA-Z][a-zA-Z\s]{3,25})\b/gi;
    for (const [, txt] of turnOutputs) {
      let m: RegExpExecArray | null;
      while ((m = locRe.exec(txt)) !== null) {
        const cap = m[1];
        if (!cap) continue;
        const candidate = cap.toLowerCase().trim();
        if (!loc.includes(candidate) && !candidate.includes(loc)) mentionsOther.push(candidate);
      }
    }
    if (new Set(mentionsOther).size > 1) {
      violations.push({
        type: 'LOCATION_CONFLICT',
        excerpt: Array.from(new Set(mentionsOther)).slice(0, 3).join(', '),
        affectedCharacters: [],
      });
    }
  }

  const score = violations.reduce((acc, v) => {
    if (v.type === 'NAME_CONFUSION' || v.type === 'KNOWLEDGE_BLEED') return Math.max(acc, 3);
    if (v.type === 'CONTRADICTORY_FACT' || v.type === 'TIMELINE_CONFLICT') return Math.max(acc, 2);
    return Math.max(acc, 1);
  }, 0);
  const severity: Severity = score === 3 ? 'HIGH' : score === 2 ? 'MEDIUM' : score === 1 ? 'LOW' : 'CLEAN';
  return {
    isConsistent: violations.length === 0,
    violations,
    severity,
  };
}

function stripWrap(s: string): string {
  if (s.startsWith('*') && s.endsWith('*')) return s.slice(1, -1);
  if (s.startsWith('(') && s.endsWith(')')) return s.slice(1, -1);
  return s;
}
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
