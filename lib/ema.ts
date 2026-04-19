/**
 * lib/ema.ts
 *
 * Pure functions for Exponential Moving Average (EMA) and wait-time estimation.
 */

/** Minimum plausible interval to guard against degenerate inputs. */
const MIN_INTERVAL = 0.1;

/**
 * Update an EMA with the latest observed interval.
 *
 * @param previousEMA    Last stored EMA value.
 * @param latestInterval Most recent observed value (same unit as previousEMA).
 * @param alpha          Smoothing factor (0 < alpha ≤ 1). Defaults to 0.3.
 */
export function calculateEMA(
  previousEMA: number,
  latestInterval: number,
  alpha = 0.3,
): number {
  const clamped = Math.max(latestInterval, MIN_INTERVAL);
  return alpha * clamped + (1 - alpha) * previousEMA;
}

/**
 * Estimate wait time for an attendee at a given queue position.
 *
 * @param queuePosition       Number of people ahead in the queue.
 * @param emaSecondsPerEntry  Current EMA of seconds per entry processed.
 * @returns                   Estimated wait in minutes.
 */
export function estimateWait(
  queuePosition: number,
  emaSecondsPerEntry: number,
): number {
  return (queuePosition * emaSecondsPerEntry) / 60;
}
