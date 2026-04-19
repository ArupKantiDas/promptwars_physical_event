/**
 * __tests__/ema.test.ts
 *
 * Unit tests for lib/ema.ts
 * Covers: smoothing behaviour, edge cases, outlier dampening, wait estimation.
 */

import { describe, it, expect } from 'vitest';
import { calculateEMA, estimateWait } from '../lib/ema';

const EMA_ALPHA = 0.3;

// ─── calculateEMA ─────────────────────────────────────────────────────────────

describe('calculateEMA', () => {
  it('applies the correct smoothing formula', () => {
    const previousEMA = 30;
    const latest = 20;
    const expected = EMA_ALPHA * latest + (1 - EMA_ALPHA) * previousEMA;
    expect(calculateEMA(previousEMA, latest)).toBeCloseTo(expected, 6);
  });

  it('converges toward the true value over repeated observations', () => {
    let ema = 60;
    for (let i = 0; i < 50; i++) ema = calculateEMA(ema, 10);
    expect(ema).toBeCloseTo(10, 0);
  });

  it('dampens large outlier spikes', () => {
    const updated = calculateEMA(15, 1000);
    expect(updated).toBeLessThan(1000 * 0.5);
  });

  it('clamps latestInterval below minimum to prevent degenerate output', () => {
    const result = calculateEMA(30, 0);
    expect(result).toBeGreaterThan(0);
    expect(Number.isFinite(result)).toBe(true);
  });

  it('gives more weight to prior EMA when alpha is 0.3', () => {
    const result = calculateEMA(20, 60);
    const midpoint = (20 + 60) / 2;
    expect(result).toBeGreaterThan(20);
    expect(result).toBeLessThan(60);
    expect(result).toBeLessThan(midpoint);
  });

  it('remains stable when the same value is repeated', () => {
    let ema = 25;
    for (let i = 0; i < 10; i++) ema = calculateEMA(ema, 25);
    expect(ema).toBeCloseTo(25, 6);
  });

  it('honours an explicit alpha parameter', () => {
    const result = calculateEMA(20, 60, 0.5);
    expect(result).toBeCloseTo(40, 6);
  });
});

// ─── estimateWait ─────────────────────────────────────────────────────────────

describe('estimateWait', () => {
  it('returns 0 for an empty queue', () => {
    expect(estimateWait(0, 30)).toBe(0);
  });

  it('correctly converts seconds to minutes', () => {
    // 10 people at 12 s each = 120 s = 2 min
    expect(estimateWait(10, 12)).toBeCloseTo(2, 6);
  });

  it('scales linearly with queue position', () => {
    const ema = 20;
    expect(estimateWait(2, ema)).toBeCloseTo(estimateWait(1, ema) * 2, 6);
  });

  it('returns a positive number for a non-empty queue', () => {
    expect(estimateWait(5, 30)).toBeGreaterThan(0);
  });

  it('produces decreasing wait times as queue shrinks', () => {
    let prev = Infinity;
    for (let q = 20; q >= 0; q--) {
      const wait = estimateWait(q, 30);
      expect(wait).toBeLessThanOrEqual(prev);
      prev = wait;
    }
  });
});
