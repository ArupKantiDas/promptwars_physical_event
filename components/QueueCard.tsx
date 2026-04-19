'use client';

/**
 * components/QueueCard.tsx
 *
 * Real-time queue status for the attendee's assigned gate.
 * Subscribes to Firestore via onSnapshot. Displays a color+icon+text coded ring
 * (green+checkmark <10 min, amber+clock 10-20 min, red+warning >20 min)
 * so status is never communicated by colour alone (WCAG 1.4.1).
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
  initialWaitMinutes: number;
}

// ─── Ring helpers ─────────────────────────────────────────────────────────────

const RADIUS = 80;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const MAX_WAIT_MIN = 30;

function ringColor(waitMinutes: number): string {
  if (waitMinutes < 10) return '#10b981'; // emerald
  if (waitMinutes < 20) return '#f59e0b'; // amber
  return '#ef4444';                        // red
}

function ringOffset(waitMinutes: number): number {
  const fillPct = Math.min(waitMinutes / MAX_WAIT_MIN, 1);
  return CIRCUMFERENCE * (1 - fillPct);
}

function waitTextColor(waitMinutes: number): string {
  if (waitMinutes < 10) return 'text-emerald-400';
  if (waitMinutes < 20) return 'text-amber-400';
  return 'text-red-400';
}

// Icon + label pair so status is never communicated by colour alone (WCAG 1.4.1)
interface PaceInfo { label: string; icon: string; ariaLabel: string }
function paceInfo(waitMinutes: number): PaceInfo {
  if (waitMinutes < 10) return { label: 'Fast',     icon: '✓', ariaLabel: 'Fast — under 10 minutes' };
  if (waitMinutes < 20) return { label: 'Moderate', icon: '◷', ariaLabel: 'Moderate — 10 to 20 minutes' };
  return                       { label: 'Busy',     icon: '!', ariaLabel: 'Busy — over 20 minutes' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function QueueCard({ eventId, gateId, gateName, initialWaitMinutes }: QueueCardProps) {
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
  const queueLength = gate?.queueLength ?? 0;
  const isActive = gate?.isActive ?? true;
  const displayName = gate?.name ?? gateName;

  const waitLabel = waitMinutes < 1 ? '<1' : String(Math.round(waitMinutes));
  const color = ringColor(waitMinutes);
  const textColor = waitTextColor(waitMinutes);
  const pace = paceInfo(waitMinutes);

  return (
    <article aria-label={`Queue status for ${displayName}`} className="space-y-4">

      {/* Ring + core stats */}
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">

        {/* SVG ring */}
        <div className="relative shrink-0">
          <svg
            width="200"
            height="200"
            viewBox="0 0 200 200"
            aria-hidden="true"
            className="drop-shadow-lg"
          >
            {/* Track */}
            <circle
              cx="100" cy="100" r={RADIUS}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="12"
            />
            {/* Fill */}
            <circle
              cx="100" cy="100" r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={ringOffset(waitMinutes)}
              transform="rotate(-90 100 100)"
              style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.6s ease' }}
            />
            {/* Glow */}
            <circle
              cx="100" cy="100" r={RADIUS}
              fill="none"
              stroke={color}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={ringOffset(waitMinutes)}
              transform="rotate(-90 100 100)"
              opacity="0.25"
              style={{ filter: 'blur(4px)', transition: 'stroke-dashoffset 0.8s ease' }}
            />
          </svg>

          {/* Center content — icon + number so status isn't colour-only */}
          <div className="absolute inset-0 flex flex-col items-center justify-center" aria-label={pace.ariaLabel}>
            <span aria-hidden="true" className={`text-xl font-black leading-none ${textColor}`}>
              {pace.icon}
            </span>
            <span className={`text-4xl font-extrabold tabular-nums leading-none ${textColor}`}>
              {waitLabel}
            </span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              min wait
            </span>
          </div>
        </div>

        {/* Textual stats */}
        <div className="flex flex-1 flex-col gap-3 text-center sm:text-left">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Your Gate
            </p>
            <p className="mt-0.5 text-4xl font-extrabold text-white">{displayName}</p>
          </div>

          <div className="flex items-center justify-center gap-2 sm:justify-start">
            <span
              aria-label={isActive ? 'Gate is open' : 'Gate is closed'}
              className={`
                rounded-full px-3 py-1 text-xs font-semibold ring-1
                ${isActive
                  ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30'
                  : 'bg-red-500/15 text-red-400 ring-red-500/30'}
              `}
            >
              {isActive ? 'Open' : 'Closed'}
            </span>
            {connectionError && (
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-400 ring-1 ring-amber-500/30">
                Offline
              </span>
            )}
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/5 p-3">
              <dt className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                In Queue
              </dt>
              <dd className="mt-1 text-2xl font-bold tabular-nums text-white">
                {queueLength}
              </dd>
              <dd className="text-[10px] text-slate-500">people ahead</dd>
            </div>
            <div className="rounded-xl bg-white/5 p-3" aria-label={pace.ariaLabel}>
              <dt className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                Status
              </dt>
              <dd className={`mt-1 flex items-center gap-1.5 text-2xl font-bold ${textColor}`}>
                <span aria-hidden="true">{pace.icon}</span>
                {pace.label}
              </dd>
              <dd className="text-[10px] text-slate-500">current pace</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Live update notice */}
      <p className="text-center text-xs text-slate-600">
        {connectionError
          ? '⚠ Live updates paused — showing last known data'
          : '● Updates live · Powered by GateFlow AI'}
      </p>
    </article>
  );
}
