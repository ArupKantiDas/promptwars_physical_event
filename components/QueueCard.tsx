'use client';

/**
 * components/QueueCard.tsx
 *
 * Displays real-time gate queue information for the assigned gate.
 * Subscribes to Firestore real-time updates via the client SDK.
 */

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { getClientDb, ensureAnonymousAuth } from '@/lib/firebase.client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GateSnapshot {
  name: string;
  queueLength: number;
  estimatedWaitMinutes: number;
  isActive: boolean;
  emaSecondsPerEntry: number;
}

interface QueueCardProps {
  eventId: string;
  gateId: string;
  gateName: string;
  /** Initial wait estimate from the check-in response (shown until first Firestore update). */
  initialWaitMinutes: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QueueCard({
  eventId,
  gateId,
  gateName,
  initialWaitMinutes,
}: QueueCardProps) {
  const [gate, setGate] = useState<GateSnapshot | null>(null);
  const [connectionError, setConnectionError] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    ensureAnonymousAuth()
      .then(() => {
        const db = getClientDb();
        const gateRef = doc(db, `events/${eventId}/gates/${gateId}`);

        unsubscribe = onSnapshot(
          gateRef,
          (snapshot) => {
            setConnectionError(false);
            if (snapshot.exists()) {
              setGate(snapshot.data() as GateSnapshot);
            }
          },
          (error) => {
            console.error('[QueueCard] Firestore listener error:', error);
            setConnectionError(true);
          },
        );
      })
      .catch((error: unknown) => {
        console.error('[QueueCard] Anonymous auth failed:', error);
        setConnectionError(true);
      });

    return () => unsubscribe?.();
  }, [eventId, gateId]);

  const waitMinutes = gate?.estimatedWaitMinutes ?? initialWaitMinutes;
  const queueLength = gate?.queueLength ?? '—';
  const isActive = gate?.isActive ?? true;

  const waitLabel =
    waitMinutes < 1 ? 'Less than 1 min' : `~${Math.round(waitMinutes)} min`;

  const urgencyColor =
    waitMinutes <= 5
      ? 'text-emerald-400'
      : waitMinutes <= 15
        ? 'text-amber-400'
        : 'text-red-400';

  return (
    <article
      aria-label={`Queue status for ${gateName}`}
      className="
        rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm
        shadow-xl shadow-black/20
      "
    >
      <header className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Your Gate
          </p>
          <h2 className="mt-1 text-3xl font-bold text-white">{gateName}</h2>
        </div>

        <span
          aria-label={isActive ? 'Gate is open' : 'Gate is closed'}
          className={`
            mt-1 rounded-full px-3 py-1 text-xs font-semibold
            ${isActive ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30' : 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30'}
          `}
        >
          {isActive ? 'Open' : 'Closed'}
        </span>
      </header>

      <dl className="grid grid-cols-2 gap-4">
        <div className="rounded-xl bg-white/5 p-4">
          <dt className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Wait Time
          </dt>
          <dd className={`mt-1 text-2xl font-bold tabular-nums ${urgencyColor}`}>
            {waitLabel}
          </dd>
        </div>

        <div className="rounded-xl bg-white/5 p-4">
          <dt className="text-xs font-semibold uppercase tracking-widest text-slate-400">
            Queue Length
          </dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums text-white">
            {queueLength}
          </dd>
        </div>
      </dl>

      {connectionError && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-400 border border-amber-500/20"
        >
          ⚠ Live updates unavailable — showing last known data.
        </p>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Updates in real time · Powered by GateFlow AI
      </p>
    </article>
  );
}
