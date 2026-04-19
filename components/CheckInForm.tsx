'use client';

/**
 * components/CheckInForm.tsx
 *
 * Mobile-first check-in form. Signs in anonymously via Firebase on mount,
 * then captures GPS and POSTs to /api/checkin on submit.
 */

import { useState, useEffect, useRef, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ensureAnonymousAuth } from '@/lib/firebase.client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckInResult {
  ticketId: string;
  gateId: string;
  gateName: string;
  queuePosition: number;
  estimatedWaitMinutes: number;
  firestorePath: string;
}

interface CheckInFormProps {
  eventId: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported by your browser.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
    });
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CheckInForm({ eventId }: CheckInFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [barcode, setBarcode] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const isBusy = isLocating || isLoading;

  // Sign in anonymously so Firestore real-time listeners work on the dashboard
  useEffect(() => {
    ensureAnonymousAuth()
      .then(() => setAuthReady(true))
      .catch(() => setAuthReady(true)); // non-fatal — checkin API is server-side
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!barcode.trim()) {
      setError('Please enter or scan your ticket barcode.');
      inputRef.current?.focus();
      return;
    }

    // Step 1 — acquire GPS
    setIsLocating(true);
    let latitude: number;
    let longitude: number;

    try {
      const position = await getCurrentPosition();
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
    } catch (geoError: unknown) {
      const isDenied =
        geoError instanceof GeolocationPositionError &&
        geoError.code === GeolocationPositionError.PERMISSION_DENIED;

      setError(
        isDenied
          ? 'Please allow location access to check in.'
          : 'Could not determine your location. Please try again.',
      );
      setIsLocating(false);
      return;
    } finally {
      setIsLocating(false);
    }

    // Step 2 — submit to API
    setIsLoading(true);

    try {
      const response = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barcode: barcode.trim(), latitude, longitude }),
      });

      const data = (await response.json()) as CheckInResult | { error: string };

      if (!response.ok) {
        const errorMessage = (data as { error: string }).error ?? 'Check-in failed.';
        const isGeofence = errorMessage.toLowerCase().includes('outside') ||
          errorMessage.toLowerCase().includes('from the venue');
        throw new Error(
          isGeofence
            ? 'You appear to be outside the venue area. Move closer and try again.'
            : errorMessage,
        );
      }

      const result = data as CheckInResult;
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
      className="space-y-4"
      aria-label="Ticket check-in form"
      noValidate
    >
      {/* Barcode input */}
      <div className="space-y-1.5">
        <label
          htmlFor="barcode-input"
          className="block text-sm font-medium text-slate-300"
        >
          Ticket Barcode
        </label>
        <div className="relative">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-5 w-5 text-slate-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
            </svg>
          </span>
          <input
            id="barcode-input"
            ref={inputRef}
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            placeholder="e.g. IPL-2026-A1B2C3"
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            disabled={isBusy}
            aria-describedby={error ? 'checkin-error' : undefined}
            aria-invalid={error ? 'true' : 'false'}
            className="
              w-full rounded-xl border border-white/10 bg-white/5 py-3.5
              pl-11 pr-4 text-sm text-white placeholder-slate-600
              outline-none ring-0 transition
              focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40
              disabled:opacity-50
            "
          />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div
          id="checkin-error"
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2.5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="mt-0.5 h-4 w-4 shrink-0">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          {error}
        </div>
      )}

      {/* Location notice (shown while locating) */}
      {isLocating && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2.5 rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-300"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 animate-pulse">
            <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.757.433l.018.008.006.003zM10 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" clipRule="evenodd" />
          </svg>
          Requesting your location…
        </div>
      )}

      {/* Submit button */}
      <button
        type="submit"
        disabled={isBusy || !authReady}
        aria-busy={isBusy}
        className="
          group relative w-full overflow-hidden rounded-xl
          bg-gradient-to-r from-indigo-600 to-violet-600
          px-6 py-4 text-base font-semibold text-white
          shadow-lg shadow-indigo-600/30
          transition-all duration-200
          hover:from-indigo-500 hover:to-violet-500 hover:shadow-indigo-500/40
          active:scale-[0.98]
          disabled:cursor-not-allowed disabled:opacity-60
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400
        "
      >
        {/* Shimmer overlay on hover */}
        <span
          aria-hidden="true"
          className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent transition-transform duration-500 group-hover:translate-x-full"
        />

        <span className="relative flex items-center justify-center gap-2">
          {isLoading ? (
            <>
              <svg aria-hidden="true" className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Finding your fastest gate…
            </>
          ) : isLocating ? (
            <>
              <svg aria-hidden="true" className="h-5 w-5 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              Getting your location…
            </>
          ) : (
            <>
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
                <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.43z" />
              </svg>
              I&apos;ve Arrived — Check In
            </>
          )}
        </span>
      </button>

      <p className="text-center text-xs text-slate-600">
        Your location is used only to verify you&apos;re at the venue.
      </p>
    </form>
  );
}
