'use client';

/**
 * app/dashboard/DashboardShell.tsx
 *
 * Client component that owns the interactive dashboard layout:
 * - Mobile-first vertical stack of collapsible sections
 * - Chat expandable to full-screen overlay
 */

import { useState } from 'react';
import { QueueCard } from '@/components/QueueCard';
import { VenueMap } from '@/components/VenueMap';
import { ChatInterface } from '@/components/ChatInterface';
import { CollapsibleSection } from '@/components/CollapsibleSection';
import type { GateMarker } from '@/components/VenueMap';

// Venue centre — National Stadium, Delhi
const VENUE_CENTER = { lat: 28.6129, lng: 77.2295 };

interface DashboardShellProps {
  eventId: string;
  gateId: string;
  gateName: string;
  ticketId: string;
  estimatedWaitMinutes: number;
  gates: GateMarker[];
  userLat?: number;
  userLng?: number;
}

export function DashboardShell({
  eventId,
  gateId,
  gateName,
  ticketId,
  estimatedWaitMinutes,
  gates,
  userLat,
  userLng,
}: DashboardShellProps) {
  const [chatFullScreen, setChatFullScreen] = useState(false);

  const welcomeMessage =
    `Hi! I'm GateFlow. Your gate is **${gateName}** with an estimated ` +
    `${estimatedWaitMinutes < 1 ? 'less than 1' : String(Math.round(estimatedWaitMinutes))}-minute wait. ` +
    `Ask me anything — wait times, directions, or trivia!`;

  return (
    <div className="relative min-h-screen bg-slate-950">

      {/* ── Ambient background ── */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-indigo-700/10 blur-[130px]" />
        <div className="absolute bottom-0 right-0 h-[350px] w-[350px] rounded-full bg-violet-700/10 blur-[110px]" />
      </div>

      {/* ── Top bar ── */}
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-white/8 bg-slate-950/90 px-4 py-3 backdrop-blur-md">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 shadow shadow-indigo-500/40">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 text-white">
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">GateFlow</p>
          <p className="text-[11px] text-slate-500">
            {gateName} · {estimatedWaitMinutes < 1 ? '<1' : Math.round(estimatedWaitMinutes)} min wait
          </p>
        </div>
        {ticketId && (
          <p className="text-[11px] text-slate-600">
            #{ticketId.slice(-6).toUpperCase()}
          </p>
        )}
      </header>

      {/* ── Main content ── */}
      <main className="mx-auto max-w-2xl space-y-3 px-3 py-4 pb-10">

        {/* 1. Queue Status */}
        <CollapsibleSection
          title="Queue Status"
          defaultOpen
          icon={
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zM1.49 15.326a.78.78 0 01-.358-.442 3 3 0 014.308-3.516 6.484 6.484 0 00-1.905 3.959c-.023.222-.014.442.025.654a4.97 4.97 0 01-2.07-.655zM16.44 15.98a4.97 4.97 0 002.07-.654.78.78 0 00.357-.442 3 3 0 00-4.308-3.517 6.484 6.484 0 011.907 3.96 2.32 2.32 0 01-.026.654zM18 8a2 2 0 11-4 0 2 2 0 014 0zM5.304 16.19a.844.844 0 01-.277-.71 5 5 0 019.947 0 .843.843 0 01-.277.71A6.975 6.975 0 0110 18a6.974 6.974 0 01-4.696-1.81z" />
            </svg>
          }
          badge={
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 ring-1 ring-emerald-500/25">
              Live
            </span>
          }
        >
          <QueueCard
            eventId={eventId}
            gateId={gateId}
            gateName={gateName}
            initialWaitMinutes={estimatedWaitMinutes}
          />
        </CollapsibleSection>

        {/* 2. Venue Map */}
        <CollapsibleSection
          title="Venue Map"
          defaultOpen
          icon={
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M9.69 18.933l.003.001C9.89 19.02 10 19 10 19s.11.02.308-.066l.002-.001.006-.003.018-.008a5.741 5.741 0 00.281-.14c.186-.096.446-.24.757-.433.62-.384 1.445-.966 2.274-1.765C15.302 14.988 17 12.493 17 9A7 7 0 103 9c0 3.492 1.698 5.988 3.355 7.584a13.731 13.731 0 002.273 1.765 11.842 11.842 0 00.757.433l.018.008.006.003zM10 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" clipRule="evenodd" />
            </svg>
          }
          badge={
            userLat !== undefined ? (
              <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-400 ring-1 ring-indigo-500/25">
                Walking route
              </span>
            ) : undefined
          }
        >
          <div className="h-72 w-full sm:h-96">
            <VenueMap
              centerLat={VENUE_CENTER.lat}
              centerLng={VENUE_CENTER.lng}
              gates={gates}
              assignedGateId={gateId}
              userLat={userLat}
              userLng={userLng}
            />
          </div>
        </CollapsibleSection>

        {/* 3. AI Chat */}
        <CollapsibleSection
          title="GateFlow AI"
          defaultOpen
          icon={
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M3.505 2.365A41.369 41.369 0 019 2c1.863 0 3.697.124 5.495.365 1.247.167 2.18 1.108 2.435 2.268a4.45 4.45 0 00-.577-.069 43.141 43.141 0 00-4.706 0C9.229 4.696 7.5 6.727 7.5 9.5c0 1.547.403 2.998 1.114 4.248-.99.389-1.927.952-2.65 1.735a2.25 2.25 0 01-2.763.495 3.375 3.375 0 01-1.563-2.761c-.15-1.53-.15-3.084 0-4.613a3.376 3.376 0 011.847-2.739z" />
              <path d="M13.5 4.938a41.37 41.37 0 015.494.365 2.376 2.376 0 011.847 2.739 23.747 23.747 0 010 4.614 2.376 2.376 0 01-1.847 2.739 41.37 41.37 0 01-5.494.365A2.376 2.376 0 0111.5 13.5v-7a2.376 2.376 0 012-2.562z" />
            </svg>
          }
          badge={
            <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-violet-400 ring-1 ring-violet-500/25">
              Gemini
            </span>
          }
          onExpandFull={() => setChatFullScreen(true)}
          expandLabel="Open chat full screen"
        >
          <div className="h-80">
            <ChatInterface
              eventId={eventId}
              gateId={gateId}
              ticketId={ticketId}
              welcomeMessage={welcomeMessage}
            />
          </div>
        </CollapsibleSection>

      </main>

      {/* ── Full-screen chat overlay ── */}
      {chatFullScreen && (
        <ChatInterface
          eventId={eventId}
          gateId={gateId}
          ticketId={ticketId}
          welcomeMessage={welcomeMessage}
          isFullScreen
          onExitFullScreen={() => setChatFullScreen(false)}
        />
      )}
    </div>
  );
}
