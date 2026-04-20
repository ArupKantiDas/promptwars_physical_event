/**
 * lib/assignment.ts
 *
 * Gate assignment using the Power-of-Two-Choices algorithm with proximity weighting.
 * Score = (queueLength / maxThroughputPerMin) * (1 / proximityScore) — lower wins.
 */

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface SectionZoneMapping {
  zoneId: string;
  gateIds: string[];
  proximityScore: number;
}

export interface GateState {
  queueLength: number;
  maxThroughputPerMin: number;
}

export interface AssignmentResult {
  gateId: string;
  zoneId: string;
}

// ─── Helpers (exported for testing) ──────────────────────────────────────────

/**
 * Compute the assignment score for one gate. Lower is better.
 */
export function computeGateScore(state: GateState, proximityScore: number): number {
  if (proximityScore <= 0) {
    throw new RangeError(`proximityScore must be > 0, received ${proximityScore}`);
  }
  if (state.maxThroughputPerMin <= 0) {
    throw new RangeError(`maxThroughputPerMin must be > 0, received ${state.maxThroughputPerMin}`);
  }
  return (state.queueLength / state.maxThroughputPerMin) * (1 / proximityScore);
}

/**
 * Sample `count` distinct items from `array` without replacement (Fisher-Yates).
 */
export function sampleWithoutReplacement<T>(array: T[], count: number): T[] {
  if (array.length < count) {
    throw new RangeError(`Cannot sample ${count} items from array of length ${array.length}`);
  }
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

// ─── Internal ─────────────────────────────────────────────────────────────────

interface Candidate {
  gateId: string;
  zoneId: string;
  proximityScore: number;
  state: GateState;
}

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Assign a gate using Power-of-Two-Choices with proximity weighting.
 *
 * **Power-of-Two-Choices** (Mitzenmacher 1996): instead of scanning all eligible
 * gates and picking the globally least-loaded one — which causes herd oscillation
 * as every attendee races to the same gate — we randomly sample exactly TWO
 * candidates and assign to whichever scores lower. This reduces the maximum queue
 * length from O(log n) (uniform random) to O(log log n) with zero coordination
 * overhead, meaning load stays near-optimal even when thousands of attendees check
 * in simultaneously.
 *
 * **Proximity weighting**: raw queue length alone ignores walking distance.
 * Gate N3 may have 5 fewer people but sit on the opposite side of a 50 000-seat
 * stadium. The score formula `(queueLength / maxThroughputPerMin) * (1 / proximityScore)`
 * converts queue depth into *estimated wait minutes* and then scales it by how far
 * the attendee has to walk — a gate with proximityScore 0.5 effectively doubles its
 * apparent wait, so a nearby gate (score 0.9) is only overridden when it is
 * substantially more congested.
 *
 * @param seatSection         The attendee's section ID.
 * @param sectionZoneMappings Zone-to-gate mappings with proximity scores and gate IDs.
 * @param gateStates          Live queue state keyed by gateId.
 * @returns The winning gateId and zoneId, or null if no eligible gate exists.
 */
export function assignGate(
  _seatSection: string,
  sectionZoneMappings: SectionZoneMapping[],
  gateStates: Map<string, GateState>,
): AssignmentResult | null {

  // 1. Flatten all eligible gates into a candidate list
  const candidates: Candidate[] = [];

  for (const mapping of sectionZoneMappings) {
    for (const gateId of mapping.gateIds) {
      const state = gateStates.get(gateId);
      if (state) {
        candidates.push({ gateId, zoneId: mapping.zoneId, proximityScore: mapping.proximityScore, state });
      }
    }
  }

  if (candidates.length === 0) return null;

  // 2. Single candidate — return directly
  if (candidates.length === 1) {
    return { gateId: candidates[0].gateId, zoneId: candidates[0].zoneId };
  }

  // 3. Sample two candidates without replacement
  const [a, b] = sampleWithoutReplacement(candidates, 2) as [Candidate, Candidate];

  // 4. Score each — lower wins
  const winner = computeGateScore(a.state, a.proximityScore) <= computeGateScore(b.state, b.proximityScore) ? a : b;

  // 5. Return winning gate ID and zone ID
  return { gateId: winner.gateId, zoneId: winner.zoneId };
}
