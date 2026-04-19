/**
 * app/dashboard/page.tsx — Post-check-in dashboard (Server Component)
 *
 * Reads gate assignment from URL search params (written by CheckInForm
 * after a successful /api/checkin call) and renders the three main panels:
 *   1. QueueCard — real-time gate queue via Firestore listener
 *   2. VenueMap  — interactive map with gate markers (placeholder coords)
 *   3. ChatInterface — Gemini-powered assistant
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { QueueCard } from '@/components/QueueCard';
import { VenueMap } from '@/components/VenueMap';
import { ChatInterface } from '@/components/ChatInterface';
import type { GateMarker } from '@/components/VenueMap';
import { RefreshButton } from '@/components/RefreshButton';

export const metadata: Metadata = {
  title: 'Your Gate',
  description: 'Live queue status, venue map, and AI assistant for your assigned gate.',
};

interface DashboardSearchParams {
  eventId?: string;
  gateId?: string;
  gateName?: string;
  wait?: string;
  ticketId?: string;
}

// Venue coordinates — matches the seeded National Stadium, Delhi
const VENUE_CENTER = { lat: 28.6129, lng: 77.2295 };

// Gate positions — mirror the seeded GATES array in scripts/seed.ts
const SEEDED_GATES: GateMarker[] = [
  // North Zone
  { gateId: 'gate-n1', name: 'Gate N1', lat: 28.6145, lng: 77.2275, isAssigned: false, queueLength: 0, estimatedWaitMinutes: 0 },
  { gateId: 'gate-n2', name: 'Gate N2', lat: 28.6148, lng: 77.2290, isAssigned: false, queueLength: 0, estimatedWaitMinutes: 0 },
  { gateId: 'gate-n3', name: 'Gate N3', lat: 28.6150, lng: 77.2305, isAssigned: false, queueLength: 0, estimatedWaitMinutes: 0 },
  { gateId: 'gate-n4', name: 'Gate N4', lat: 28.6147, lng: 77.2318, isAssigned: false, queueLength: 0, estimatedWaitMinutes: 0 },
  // South Zone
  { gateId: 'gate-s1', name: 'Gate S1', lat: 28.6113, lng: 77.2278, isAssigned: false, queueLength: 0, estimatedWaitMinutes: 0 },
  { gateId: 'gate-s2', name: 'Gate S2', lat: 28.6110, lng: 77.2295, isAssigned: false, queueLength: 0, estimatedWaitMinutes: 0 },
  { gateId: 'gate-s3', name: 'Gate S3', lat: 28.6112, lng: 77.2310, isAssigned: false, queueLength: 0, estimatedWaitMinutes: 0 },
  { gateId: 'gate-s4', name: 'Gate S4', lat: 28.6115, lng: 77.2322, isAssigned: false, queueLength: 0, estimatedWaitMinutes: 0 },
  // East Zone
  { gateId: 'gate-e1', name: 'Gate E1', lat: 28.6122, lng: 77.2330, isAssigned: false, queueLength: 0, estimatedWaitMinutes: 0 },
  { gateId: 'gate-e2', name: 'Gate E2', lat: 28.6130, lng: 77.2335, isAssigned: false, queueLength: 0, estimatedWaitMinutes: 0 },
  { gateId: 'gate-e3', name: 'Gate E3', lat: 28.6138, lng: 77.2332, isAssigned: false, queueLength: 0, estimatedWaitMinutes: 0 },
  // West Zone
  { gateId: 'gate-w1', name: 'Gate W1', lat: 28.6122, lng: 77.2258, isAssigned: false, queueLength: 0, estimatedWaitMinutes: 0 },
  { gateId: 'gate-w2', name: 'Gate W2', lat: 28.6130, lng: 77.2253, isAssigned: false, queueLength: 0, estimatedWaitMinutes: 0 },
  { gateId: 'gate-w3', name: 'Gate W3', lat: 28.6138, lng: 77.2256, isAssigned: false, queueLength: 0, estimatedWaitMinutes: 0 },
];

interface PageProps {
  searchParams: Promise<DashboardSearchParams>;
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const { eventId, gateId, gateName, wait, ticketId } = params;

  // Redirect to check-in if required params are missing
  if (!eventId || !gateId || !gateName) {
    redirect('/');
  }

  const estimatedWaitMinutes = Number(wait ?? '0');

  // Mark the assigned gate on the map
  const gates = SEEDED_GATES.map((g) => ({
    ...g,
    isAssigned: g.gateId === gateId,
  }));

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6 lg:px-8">
      {/* Background gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-60 left-1/4 h-[500px] w-[500px] rounded-full bg-indigo-700/10 blur-[130px]" />
        <div className="absolute bottom-0 right-1/4 h-[400px] w-[400px] rounded-full bg-violet-700/10 blur-[110px]" />
      </div>

      {/* Page header */}
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 shadow shadow-indigo-500/40">
            <span aria-hidden="true" className="text-sm font-extrabold text-white">
              GF
            </span>
          </div>
          <span className="text-lg font-bold text-white">GateFlow</span>
        </div>

        {ticketId && (
          <p className="text-xs text-slate-500">
            Ticket <span className="font-mono text-slate-400">{ticketId.slice(-8)}</span>
          </p>
        )}
      </header>

      {/* Dashboard grid */}
      <div className="mx-auto max-w-7xl space-y-6 lg:grid lg:grid-cols-[1fr_1.5fr] lg:gap-6 lg:space-y-0">

        {/* Left column — Queue card + Chat */}
        <div className="flex flex-col gap-6">
          <QueueCard
            eventId={eventId}
            gateId={gateId}
            gateName={gateName}
            initialWaitMinutes={estimatedWaitMinutes}
          />

          {/* Quick actions */}
          <div className="grid grid-cols-2 gap-3">
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${VENUE_CENTER.lat},${VENUE_CENTER.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="
                flex items-center gap-2 rounded-xl border border-white/10 bg-white/5
                px-4 py-3 text-sm font-medium text-slate-300 transition
                hover:bg-white/10 hover:text-white focus-visible:outline-none
                focus-visible:ring-2 focus-visible:ring-indigo-400
              "
            >
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4 shrink-0 text-indigo-400">
                <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              Get Directions
            </a>

            <RefreshButton />
          </div>

          {/* Chat (takes remaining height on desktop) */}
          <div className="min-h-[420px] flex-1 lg:min-h-[500px]">
            <ChatInterface
              eventId={eventId}
              initialMessage={`I'm assigned to ${gateName}. What's the current wait?`}
            />
          </div>
        </div>

        {/* Right column — Map */}
        <div className="h-[400px] lg:h-full lg:min-h-[700px]">
          <VenueMap
            centerLat={VENUE_CENTER.lat}
            centerLng={VENUE_CENTER.lng}
            gates={gates}
            assignedGateId={gateId}
          />
        </div>
      </div>
    </main>
  );
}
