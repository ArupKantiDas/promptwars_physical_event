/**
 * __tests__/assignment.test.ts
 *
 * Unit tests for lib/assignment.ts
 * Covers: scoring, sampling, Power-of-Two-Choices behaviour, proximity weighting,
 * probabilistic distribution, and edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeGateScore,
  sampleWithoutReplacement,
  assignGate,
  type GateState,
  type SectionZoneMapping,
} from '../lib/assignment';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeState(overrides?: Partial<GateState>): GateState {
  return { queueLength: 0, maxThroughputPerMin: 60, ...overrides };
}

function makeMapping(
  zoneId: string,
  gateIds: string[],
  proximityScore = 1.0,
): SectionZoneMapping {
  return { zoneId, gateIds, proximityScore };
}

// ─── computeGateScore ─────────────────────────────────────────────────────────

describe('computeGateScore', () => {
  it('returns 0 for an empty queue', () => {
    expect(computeGateScore(makeState({ queueLength: 0 }), 1.0)).toBe(0);
  });

  it('produces a lower score for a higher proximity', () => {
    const state = makeState({ queueLength: 60 });
    expect(computeGateScore(state, 1.0)).toBeLessThan(computeGateScore(state, 0.5));
  });

  it('produces a lower score for a shorter queue at equal proximity', () => {
    expect(
      computeGateScore(makeState({ queueLength: 10 }), 1.0),
    ).toBeLessThan(
      computeGateScore(makeState({ queueLength: 100 }), 1.0),
    );
  });

  it('throws for proximityScore <= 0', () => {
    expect(() => computeGateScore(makeState(), 0)).toThrow(RangeError);
    expect(() => computeGateScore(makeState(), -0.5)).toThrow(RangeError);
  });

  it('throws for maxThroughputPerMin <= 0', () => {
    expect(() => computeGateScore(makeState({ maxThroughputPerMin: 0 }), 1.0)).toThrow(RangeError);
  });

  it('correctly weights queue load vs proximity', () => {
    // Gate A: low queue but far → score = (10/60)*(1/0.2) = 0.833
    // Gate B: higher queue but close → score = (30/60)*(1/0.9) = 0.556
    const scoreA = computeGateScore(makeState({ queueLength: 10 }), 0.2);
    const scoreB = computeGateScore(makeState({ queueLength: 30 }), 0.9);
    expect(scoreB).toBeLessThan(scoreA);
  });
});

// ─── sampleWithoutReplacement ─────────────────────────────────────────────────

describe('sampleWithoutReplacement', () => {
  it('returns the exact number requested', () => {
    expect(sampleWithoutReplacement([1, 2, 3, 4, 5], 3)).toHaveLength(3);
  });

  it('returns all items when count equals array length', () => {
    const arr = [10, 20, 30];
    expect(sampleWithoutReplacement(arr, 3).sort()).toEqual(arr.sort());
  });

  it('returns no duplicates', () => {
    const result = sampleWithoutReplacement([1, 2, 3, 4, 5, 6, 7, 8], 5);
    expect(new Set(result).size).toBe(5);
  });

  it('throws when requesting more items than available', () => {
    expect(() => sampleWithoutReplacement([1, 2], 3)).toThrow(RangeError);
  });

  it('works with a single item', () => {
    expect(sampleWithoutReplacement(['only'], 1)).toEqual(['only']);
  });
});

// ─── assignGate ───────────────────────────────────────────────────────────────

describe('assignGate', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('returns null when gateStates is empty', () => {
    const mappings = [makeMapping('zone-a', ['g1'])];
    expect(assignGate('101', mappings, new Map())).toBeNull();
  });

  it('returns null when no mappings are provided', () => {
    const states = new Map([['g1', makeState()]]);
    expect(assignGate('101', [], states)).toBeNull();
  });

  it('returns null when all gateIds lists are empty', () => {
    const mappings = [makeMapping('zone-z', [])];
    const states = new Map([['g1', makeState()]]);
    expect(assignGate('201', mappings, states)).toBeNull();
  });

  // ── Requested: single eligible gate ─────────────────────────────────────────

  it('single eligible gate is always returned', () => {
    const mappings = [makeMapping('zone-b', ['gate-solo'], 0.9)];
    const states = new Map([['gate-solo', makeState({ queueLength: 5 })]]);

    const result = assignGate('301', mappings, states);

    expect(result).not.toBeNull();
    expect(result?.gateId).toBe('gate-solo');
    expect(result?.zoneId).toBe('zone-b');
  });

  // ── Requested: empty gate beats full gate in >80% of 100 iterations ─────────
  // With two candidates the algorithm always samples both and picks the lower
  // score. An empty gate (score=0) beats a full gate (score>0) 100% of the time.

  it('empty gate wins over a full gate in >80% of 100 iterations', () => {
    vi.mocked(Math.random).mockRestore(); // use real randomness

    const mappings = [makeMapping('zone-a', ['empty', 'full'], 1.0)];
    const states = new Map([
      ['empty', makeState({ queueLength: 0 })],
      ['full',  makeState({ queueLength: 500 })],
    ]);

    let emptyWins = 0;
    for (let i = 0; i < 100; i++) {
      if (assignGate('101', mappings, states)?.gateId === 'empty') emptyWins++;
    }

    expect(emptyWins).toBeGreaterThan(80);
  });

  // ── Requested: proximity weighting ──────────────────────────────────────────
  // Gate A: close (proximity=0.9) with moderate load → score = (40/60)*(1/0.9) ≈ 0.74
  // Gate B: far   (proximity=0.2) with lighter load  → score = (10/60)*(1/0.2) ≈ 0.83
  // Proximity weighting makes A win even though B has fewer people.

  it('close gate with moderate load beats far gate with lighter load', () => {
    vi.mocked(Math.random).mockRestore();

    const mappings = [
      makeMapping('zone-close', ['gate-close'], 0.9),
      makeMapping('zone-far',   ['gate-far'],   0.2),
    ];
    const states = new Map([
      ['gate-close', makeState({ queueLength: 40 })],
      ['gate-far',   makeState({ queueLength: 10 })],
    ]);

    // Verify scores directly to document the intent
    const scoreClose = (40 / 60) * (1 / 0.9);
    const scoreFar   = (10 / 60) * (1 / 0.2);
    expect(scoreClose).toBeLessThan(scoreFar);

    // With only one candidate per zone, both are always sampled; close wins every time
    for (let i = 0; i < 20; i++) {
      expect(assignGate('101', mappings, states)?.gateId).toBe('gate-close');
    }
  });

  // ── Requested: equal load → roughly even distribution ───────────────────────

  it('distributes evenly across gates with identical load', () => {
    vi.mocked(Math.random).mockRestore();

    const gateIds = ['g1', 'g2', 'g3', 'g4'];
    const mappings = [makeMapping('zone-x', gateIds, 1.0)];
    const states = new Map(gateIds.map((id) => [id, makeState({ queueLength: 50 })]));

    const counts: Record<string, number> = Object.fromEntries(gateIds.map((id) => [id, 0]));
    const iterations = 1000;

    for (let i = 0; i < iterations; i++) {
      const result = assignGate('201', mappings, states);
      if (result) counts[result.gateId]++;
    }

    // Each gate should receive roughly 25% ± 10%
    const expectedShare = iterations / gateIds.length;
    for (const id of gateIds) {
      expect(counts[id]).toBeGreaterThan(expectedShare * 0.6);
      expect(counts[id]).toBeLessThan(expectedShare * 1.4);
    }
  });

  it('always picks the better gate out of two distinct candidates', () => {
    vi.mocked(Math.random).mockRestore();

    const mappings = [makeMapping('zone-a', ['empty', 'congested'], 1.0)];
    const states = new Map([
      ['empty',    makeState({ queueLength: 0 })],
      ['congested', makeState({ queueLength: 1000 })],
    ]);

    for (let i = 0; i < 20; i++) {
      expect(assignGate('101', mappings, states)?.gateId).toBe('empty');
    }
  });

  it('returns both gateId and zoneId from the winning candidate', () => {
    const mappings = [makeMapping('zone-c', ['g-box'], 0.8)];
    const states = new Map([['g-box', makeState({ queueLength: 5 })]]);
    const result = assignGate('401', mappings, states);
    expect(result?.gateId).toBe('g-box');
    expect(result?.zoneId).toBe('zone-c');
  });
});
