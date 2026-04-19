/**
 * __tests__/ema.test.ts
 *
 * Unit tests for lib/ema.ts
 * Covers: smoothing formula, cold-start, steady-state convergence,
 * outlier dampening and recovery, wait-time estimation.
 */

import { describe, it, expect } from 'vitest';
import { calculateEMA, estimateWait } from '../lib/ema';

const ALPHA = 0.3;

// ─── calculateEMA ─────────────────────────────────────────────────────────────

describe('calculateEMA', () => {
  // ── Requested: first calculation with previous=0 ──────────────────────────

  it('first call with previousEMA=0 returns alpha * latestInterval', () => {
    const latest = 20;
    // EMA = 0.3 * 20 + 0.7 * 0 = 6
    expect(calculateEMA(0, latest)).toBeCloseTo(ALPHA * latest, 6);
  });

  // ── Requested: steady state — 10 identical intervals converge ─────────────

  it('steady state: 10 identical intervals produce EMA close to that interval', () => {
    const interval = 15;
    let ema = 0;
    for (let i = 0; i < 10; i++) ema = calculateEMA(ema, interval);
    // After 10 identical observations the EMA should be within 10% of the true value
    expect(ema).toBeGreaterThan(interval * 0.9);
    expect(ema).toBeLessThanOrEqual(interval);
  });

  // ── Requested: outlier dampening — spike then return to baseline ───────────

  it('outlier dampening: single spike does not dominate; returns toward baseline after normal values', () => {
    const baseline = 10;

    // Establish baseline
    let ema = baseline;
    for (let i = 0; i < 20; i++) ema = calculateEMA(ema, baseline);

    // One large spike
    ema = calculateEMA(ema, 500);
    const afterSpike = ema;
    expect(afterSpike).toBeLessThan(500 * 0.5); // spike is dampened, not dominant

    // Return to normal observations — should recover toward baseline
    for (let i = 0; i < 20; i++) ema = calculateEMA(ema, baseline);
    expect(ema).toBeCloseTo(baseline, 0); // recovered within 1 unit of baseline
  });

  // ── Core formula and properties ────────────────────────────────────────────

  it('applies the correct smoothing formula', () => {
    const previousEMA = 30;
    const latest = 20;
    const expected = ALPHA * latest + (1 - ALPHA) * previousEMA;
    expect(calculateEMA(previousEMA, latest)).toBeCloseTo(expected, 6);
  });

  it('converges toward the true value over many observations', () => {
    let ema = 60;
    for (let i = 0; i < 50; i++) ema = calculateEMA(ema, 10);
    expect(ema).toBeCloseTo(10, 0);
  });

  it('gives more weight to prior EMA than to a single new observation (alpha=0.3)', () => {
    const result = calculateEMA(20, 60);
    const midpoint = (20 + 60) / 2;
    expect(result).toBeGreaterThan(20);
    expect(result).toBeLessThan(60);
    // Result should be closer to the prior (20) than to the midpoint
    expect(result).toBeLessThan(midpoint);
  });

  it('remains stable when the same value is repeated', () => {
    let ema = 25;
    for (let i = 0; i < 10; i++) ema = calculateEMA(ema, 25);
    expect(ema).toBeCloseTo(25, 6);
  });

  it('honours an explicit alpha parameter', () => {
    // alpha=0.5 → equal weight → result = midpoint
    expect(calculateEMA(20, 60, 0.5)).toBeCloseTo(40, 6);
  });

  it('clamps latestInterval at minimum to prevent degenerate zero output', () => {
    const result = calculateEMA(30, 0);
    expect(result).toBeGreaterThan(0);
    expect(Number.isFinite(result)).toBe(true);
  });
});

// ─── estimateWait ─────────────────────────────────────────────────────────────

describe('estimateWait', () => {
  // ── Requested: correct minutes formula ────────────────────────────────────

  it('returns correct minutes: position * emaSecondsPerEntry / 60', () => {
    const position = 10;
    const emaSeconds = 12;
    // 10 * 12 / 60 = 2 minutes
    expect(estimateWait(position, emaSeconds)).toBeCloseTo(2, 6);
  });

  it('returns 0 for an empty queue (position=0)', () => {
    expect(estimateWait(0, 30)).toBe(0);
  });

  it('returns 0 when emaSecondsPerEntry is 0', () => {
    expect(estimateWait(10, 0)).toBe(0);
  });

  it('scales linearly with queue position', () => {
    const ema = 20;
    expect(estimateWait(2, ema)).toBeCloseTo(estimateWait(1, ema) * 2, 6);
  });

  it('returns a positive number for a non-empty queue with positive EMA', () => {
    expect(estimateWait(5, 30)).toBeGreaterThan(0);
  });

  it('produces monotonically decreasing wait as queue shrinks', () => {
    let prev = Infinity;
    for (let q = 20; q >= 0; q--) {
      const wait = estimateWait(q, 30);
      expect(wait).toBeLessThanOrEqual(prev);
      prev = wait;
    }
  });
});
