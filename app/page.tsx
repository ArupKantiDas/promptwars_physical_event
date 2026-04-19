/**
 * app/page.tsx — Check-in landing page (Server Component)
 *
 * The entry point for attendees. Displays branding and the CheckInForm
 * client component. The event ID is read from an environment variable
 * (can be extended to support dynamic routing per event).
 */

import type { Metadata } from 'next';
import { CheckInForm } from '@/components/CheckInForm';

export const metadata: Metadata = {
  title: 'Check In',
  description:
    'Scan your ticket barcode to get assigned to the best gate and see live wait times.',
};

// In a production deployment this would come from a CMS or URL param per event
const EVENT_ID = process.env['NEXT_PUBLIC_DEFAULT_EVENT_ID'] ?? 'ipl-final-2026';

export default function CheckInPage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-16">
      {/* Background gradient blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-indigo-700/20 blur-[120px]" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-violet-700/15 blur-[100px]" />
      </div>

      {/* Logo / branding */}
      <header className="mb-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-500/30">
          <svg
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-8 w-8 text-white"
          >
            <path
              fillRule="evenodd"
              d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.38z"
              clipRule="evenodd"
            />
            <path d="M5.082 14.254a8.287 8.287 0 00-1.308 5.135 9.687 9.687 0 01-1.764-.44l-.115-.04a.563.563 0 01-.373-.487l-.01-.121a3.75 3.75 0 013.57-4.047zM20.226 19.389a8.287 8.287 0 00-1.308-5.135 3.75 3.75 0 013.57 4.047l-.01.121a.563.563 0 01-.373.486l-.115.04c-.567.2-1.156.349-1.764.441z" />
          </svg>
        </div>

        <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
          Gate<span className="text-indigo-400">Flow</span>
        </h1>
        <p className="mt-3 text-lg text-slate-400">
          AI-powered venue entry · Real-time gate assignment
        </p>
      </header>

      {/* Check-in card */}
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/30 backdrop-blur-sm">
          <h2 className="mb-6 text-xl font-semibold text-white">
            Check In to Your Event
          </h2>
          <CheckInForm eventId={EVENT_ID} />
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Gates are assigned using real-time queue intelligence.
          <br />
          For staff assistance, visit any information booth.
        </p>
      </div>
    </main>
  );
}
