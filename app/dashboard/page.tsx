/**
 * app/dashboard/page.tsx — Post-check-in dashboard
 *
 * Mobile-first vertical stack of three collapsible sections:
 *   1. QueueCard — live Firestore gate queue
 *   2. VenueMap  — interactive map with walking route
 *   3. ChatInterface — Gemini assistant (expandable to full-screen)
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DashboardShell } from './DashboardShell';

export const metadata: Metadata = {
  title: 'Your Gate | GateFlow',
  description: 'Live queue status, venue map, and AI assistant for your assigned gate.',
};

interface DashboardSearchParams {
  eventId?: string;
  gateId?: string;
  gateName?: string;
  wait?: string;
  ticketId?: string;
  userLat?: string;
  userLng?: string;
}

interface PageProps {
  searchParams: Promise<DashboardSearchParams>;
}

// Gate positions — mirror scripts/seed.ts GATES array
const SEEDED_GATES = [
  { gateId: 'gate-n1', name: 'Gate N1', lat: 28.6145, lng: 77.2275 },
  { gateId: 'gate-n2', name: 'Gate N2', lat: 28.6148, lng: 77.2290 },
  { gateId: 'gate-n3', name: 'Gate N3', lat: 28.6150, lng: 77.2305 },
  { gateId: 'gate-n4', name: 'Gate N4', lat: 28.6147, lng: 77.2318 },
  { gateId: 'gate-s1', name: 'Gate S1', lat: 28.6113, lng: 77.2278 },
  { gateId: 'gate-s2', name: 'Gate S2', lat: 28.6110, lng: 77.2295 },
  { gateId: 'gate-s3', name: 'Gate S3', lat: 28.6112, lng: 77.2310 },
  { gateId: 'gate-s4', name: 'Gate S4', lat: 28.6115, lng: 77.2322 },
  { gateId: 'gate-e1', name: 'Gate E1', lat: 28.6122, lng: 77.2330 },
  { gateId: 'gate-e2', name: 'Gate E2', lat: 28.6130, lng: 77.2335 },
  { gateId: 'gate-e3', name: 'Gate E3', lat: 28.6138, lng: 77.2332 },
  { gateId: 'gate-w1', name: 'Gate W1', lat: 28.6122, lng: 77.2258 },
  { gateId: 'gate-w2', name: 'Gate W2', lat: 28.6130, lng: 77.2253 },
  { gateId: 'gate-w3', name: 'Gate W3', lat: 28.6138, lng: 77.2256 },
];

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const { eventId, gateId, gateName, wait, ticketId, userLat, userLng } = params;

  if (!eventId || !gateId || !gateName) redirect('/');

  const estimatedWaitMinutes = Number(wait ?? '0');
  const parsedUserLat = userLat ? Number(userLat) : undefined;
  const parsedUserLng = userLng ? Number(userLng) : undefined;

  const gates = SEEDED_GATES.map((g) => ({
    ...g,
    isAssigned: g.gateId === gateId,
    queueLength: 0,
    estimatedWaitMinutes: 0,
  }));

  return (
    <DashboardShell
      eventId={eventId}
      gateId={gateId}
      gateName={gateName}
      ticketId={ticketId ?? ''}
      estimatedWaitMinutes={estimatedWaitMinutes}
      gates={gates}
      userLat={parsedUserLat}
      userLng={parsedUserLng}
    />
  );
}
