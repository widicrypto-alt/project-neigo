import { describe, it, expect } from 'bun:test';
import {
  lineageInsertCounter,
  getLineageCounters,
} from './context-compaction.js';

/**
 * PLANBv6 X4.2 — synthetic lineage wiring tests.
 *
 * We intentionally keep these as lightweight unit checks because the
 * test suite does not currently spin up a Postgres instance per run.
 * A 3-level trace integration test runs via the manual backfill +
 * trace flow documented in PLANBv6.md §7.
 */
describe('PLANBv6 X4.2 — lineage observability counters', () => {
  it('exports a counter object with message/node/blob keys', () => {
    expect(lineageInsertCounter).toBeDefined();
    expect(typeof lineageInsertCounter.message).toBe('number');
    expect(typeof lineageInsertCounter.node).toBe('number');
    expect(typeof lineageInsertCounter.blob).toBe('number');
  });

  it('getLineageCounters returns a snapshot (not a live ref)', () => {
    const before = getLineageCounters();
    const baseline = before.message;
    lineageInsertCounter.message += 1;
    try {
      expect(before.message).toBe(baseline);
      const after = getLineageCounters();
      expect(after.message).toBe(baseline + 1);
    } finally {
      lineageInsertCounter.message = baseline;
    }
  });
});

describe('PLANBv6 X4.2 — traceToMessages API contract', () => {
  it('is exported from context-retrieval and is a function', async () => {
    const mod = await import('./context-retrieval.js');
    expect(typeof mod.traceToMessages).toBe('function');
  });
});
