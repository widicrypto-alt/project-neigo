import { describe, it, expect } from 'bun:test';
import { BLOB_THRESHOLD_BYTES } from './context-blobs.js';

describe('PLANv3 X4.1 — context-blobs thresholds', () => {
  it('threshold matches 8KB documented in the plan', () => {
    expect(BLOB_THRESHOLD_BYTES).toBe(8192);
  });
});
