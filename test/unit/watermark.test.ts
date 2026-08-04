import { describe, expect, it } from 'vitest';
import { watermarkEpochSeconds } from '../../src/pipeline/sync.js';

describe('watermarkEpochSeconds', () => {
  it('returns undefined when never synced (full history)', () => {
    expect(watermarkEpochSeconds(null)).toBeUndefined();
  });

  it('subtracts a 3-day overlap', () => {
    const newest = new Date('2026-08-04T12:00:00Z');
    const expected = Math.floor(new Date('2026-08-01T12:00:00Z').getTime() / 1000);
    expect(watermarkEpochSeconds(newest)).toBe(expected);
  });
});
