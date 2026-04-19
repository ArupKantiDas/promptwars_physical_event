'use client';

/**
 * components/CheckInForm.tsx
 *
 * Attendee check-in form. Submits a barcode to /api/checkin and
 * redirects to the dashboard with the assignment result.
 */

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

interface CheckInResult {
  ticketId: string;
  gateId: string;
  gateName: string;
  estimatedWaitMinutes: number;
}

interface CheckInFormProps {
  /** Default Firestore event ID (can be overridden per-event). */
  eventId: string;
}

export function CheckInForm({ eventId }: CheckInFormProps) {
  const router = useRouter();

  const [barcode, setBarcode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!barcode.trim()) {
      setError('Please enter or scan your ticket barcode.');
      return;
    }

    setIsLoading(true);

    try {
      const response = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, barcode: barcode.trim() }),
      });

      const data: CheckInResult | { error: string } = await response.json() as CheckInResult | { error: string };

      if (!response.ok) {
        throw new Error((data as { error: string }).error ?? 'Check-in failed.');
      }

      const result = data as CheckInResult;

      // Navigate to dashboard with assignment context
      const params = new URLSearchParams({
        ticketId: result.ticketId,
        gateId: result.gateId,
        gateName: result.gateName,
        wait: String(result.estimatedWaitMinutes),
        eventId,
      });
      router.push(`/dashboard?${params.toString()}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md space-y-4"
      aria-label="Ticket check-in form"
    >
      <div className="space-y-2">
        <label
          htmlFor="barcode-input"
          className="block text-sm font-semibold text-slate-300"
        >
          Ticket Barcode
        </label>
        <input
          id="barcode-input"
          type="text"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder="Scan or type your barcode"
          autoComplete="off"
          autoFocus
          disabled={isLoading}
          aria-describedby={error ? 'barcode-error' : undefined}
          className="
            w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3
            text-white placeholder-slate-500 outline-none ring-0
            transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40
            disabled:opacity-50
          "
        />
      </div>

      {error && (
        <p
          id="barcode-error"
          role="alert"
          className="rounded-lg bg-red-500/10 px-4 py-2 text-sm text-red-400 border border-red-500/20"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isLoading}
        aria-busy={isLoading}
        className="
          w-full rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white
          transition hover:bg-indigo-500 active:scale-[0.98]
          disabled:opacity-60 disabled:cursor-not-allowed
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
        "
      >
        {isLoading ? 'Finding your gate…' : 'Check In'}
      </button>
    </form>
  );
}
