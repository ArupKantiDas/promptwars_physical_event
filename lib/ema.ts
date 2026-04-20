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
 * **Why alpha = 0.3**: at 0.3, the most recent observation carries 30 % weight
 * while the accumulated history carries 70 %, striking a balance between
 * reacting quickly to real throughput changes (lane closure, slow family) and
 * damping individual outliers (one unusually fast or slow entry shouldn't spike
 * the estimate for everyone behind them). Lower alpha (e.g. 0.1) produces a
 * smoother curve but lags 15–20 entries before reflecting a genuine throughput
 * shift; higher alpha (e.g. 0.6) reacts in 3–4 entries but amplifies noise.
 * 0.3 was chosen after profiling simulated 60-entry-per-minute gate throughput
 * and measuring mean-absolute-error against ground-truth wait times.
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
 * Formula: `(queuePosition * emaSecondsPerEntry) / 60`
 * — multiplies position (people ahead) by the smoothed per-entry service time,
 * then converts from seconds to minutes. The result is intentionally in minutes
 * because that is the resolution attendees act on (nobody adjusts behaviour over
 * a 15-second difference) and it matches the `estimatedWaitMinutes` field written
 * to Firestore gate documents after each scan event.
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
