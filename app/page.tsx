/**
 * app/page.tsx — Check-in landing page (Server Component)
 */

import type { Metadata } from 'next';
import { CheckInForm } from '@/components/CheckInForm';

export const metadata: Metadata = {
  title: 'Check In | GateFlow',
  description:
    'Scan your ticket barcode to get assigned to the fastest gate with live wait times.',
};

const EVENT_ID = process.env['NEXT_PUBLIC_DEFAULT_EVENT_ID'] ?? 'ipl-final-2026';

export default function CheckInPage() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-slate-950">

      {/* ── Atmospheric background ── */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        {/* Top-centre purple bloom */}
        <div className="absolute -top-32 left-1/2 h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-indigo-700/25 blur-[140px]" />
        {/* Bottom-right violet accent */}
        <div className="absolute -bottom-24 -right-24 h-[420px] w-[420px] rounded-full bg-violet-700/20 blur-[120px]" />
        {/* Subtle stadium arc lines */}
        <svg
          aria-hidden="true"
          className="absolute inset-0 h-full w-full opacity-[0.03]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow shadow-indigo-500/50">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-white">
              <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
            </svg>
          </div>
          <span className="text-sm font-bold tracking-wide text-white">GateFlow</span>
        </div>
        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
          Gates Open
        </span>
      </header>

      {/* ── Hero ── */}
      <section className="flex flex-1 flex-col items-center justify-center px-5 pb-8 pt-10 sm:px-8">

        {/* Stadium icon */}
        <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-2xl shadow-indigo-600/40">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-10 w-10 text-white">
            <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM15.75 9.75a3 3 0 116 0 3 3 0 01-6 0zM2.25 9.75a3 3 0 116 0 3 3 0 01-6 0zM6.31 15.117A6.745 6.745 0 0112 12a6.745 6.745 0 016.709 7.498.75.75 0 01-.372.568A12.696 12.696 0 0112 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 01-.372-.568 6.787 6.787 0 011.019-4.38z" clipRule="evenodd" />
            <path d="M5.082 14.254a8.287 8.287 0 00-1.308 5.135 9.687 9.687 0 01-1.764-.44l-.115-.04a.563.563 0 01-.373-.487l-.01-.121a3.75 3.75 0 013.57-4.047zM20.226 19.389a8.287 8.287 0 00-1.308-5.135 3.75 3.75 0 013.57 4.047l-.01.121a.563.563 0 01-.373.486l-.115.04c-.567.2-1.156.349-1.764.441z" />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-center text-5xl font-extrabold tracking-tight sm:text-6xl">
          <span className="bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            Gate
          </span>
          <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
            Flow
          </span>
        </h1>

        <p className="mt-3 text-center text-base text-slate-400 sm:text-lg">
          AI-powered entry · Zero queues · Real-time gates
        </p>

        {/* Live stats strip */}
        <div className="mt-8 flex items-center gap-6 rounded-2xl border border-white/8 bg-white/5 px-6 py-3 backdrop-blur-sm">
          <div className="text-center">
            <p className="text-xl font-bold text-white">14</p>
            <p className="text-[11px] text-slate-500">Active Gates</p>
          </div>
          <div className="h-8 w-px bg-white/10" aria-hidden="true" />
          <div className="text-center">
            <p className="text-xl font-bold text-emerald-400">&lt;3 min</p>
            <p className="text-[11px] text-slate-500">Avg Wait</p>
          </div>
          <div className="h-8 w-px bg-white/10" aria-hidden="true" />
          <div className="text-center">
            <p className="text-xl font-bold text-white">AI</p>
            <p className="text-[11px] text-slate-500">Powered</p>
          </div>
        </div>

        {/* Check-in card */}
        <div className="mt-10 w-full max-w-md">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-2xl shadow-black/40 backdrop-blur-md sm:p-8">

            <div className="mb-6">
              <h2 className="text-xl font-bold text-white">Check In</h2>
              <p className="mt-1 text-sm text-slate-400">
                Enter your ticket barcode and we&apos;ll assign you the fastest gate.
              </p>
            </div>

            <CheckInForm eventId={EVENT_ID} />
          </div>

          {/* Trust signals */}
          <div className="mt-6 flex items-center justify-center gap-5 text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-slate-500">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              Secure check-in
            </span>
            <span className="h-3 w-px bg-slate-700" aria-hidden="true" />
            <span className="flex items-center gap-1.5">
              <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-slate-500">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              Location used once only
            </span>
            <span className="h-3 w-px bg-slate-700" aria-hidden="true" />
            <span>Powered by Gemini</span>
          </div>
        </div>
      </section>
    </main>
  );
}
