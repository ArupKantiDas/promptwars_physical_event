/**
 * __tests__/checkin.test.ts
 *
 * Integration-style unit tests for app/api/checkin/route.ts.
 * Firestore is fully mocked; Next.js Request/Response run in the Node env.
 *
 * Covered scenarios:
 *   - 422 when user is outside the geofence
 *   - 409 when the ticket has already been checked in
 *   - 200 with correct shape on a valid check-in
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Module mocks (hoisted by Vitest) ─────────────────────────────────────────

vi.mock('@/lib/firebase', () => ({
  getAdminDb: vi.fn(),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    serverTimestamp: () => ({ _type: 'SERVER_TIMESTAMP' }),
    increment: (n: number) => ({ _type: 'INCREMENT', n }),
  },
}));

// Import after mocks are in place
import { POST } from '../app/api/checkin/route';
import { getAdminDb } from '@/lib/firebase';

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_ID = 'ipl-final-2026';
const VENUE_ID  = 'venue-delhi';

/** National Stadium, Delhi — used as the venue geofence centre. */
const VENUE_LAT = 28.6129;
const VENUE_LNG = 77.2295;

/** Coordinates clearly inside the 200 m geofence. */
const INSIDE_LAT = 28.6130;
const INSIDE_LNG = 77.2296;

/** Coordinates far outside the venue (0°N 0°E — Gulf of Guinea). */
const OUTSIDE_LAT = 0;
const OUTSIDE_LNG = 0;

// ─── Mock-db factory ─────────────────────────────────────────────────────────

interface TicketData {
  barcode: string;
  seatSection: string;
  status: string;
  userId: string;
}

interface MockDbOptions {
  ticketExists?: boolean;
  ticketStatus?: string;
}

function buildMockDb(options: MockDbOptions = {}) {
  const { ticketExists = true, ticketStatus = 'booked' } = options;

  const ticketData: TicketData = {
    barcode: 'TEST-BARCODE-001',
    seatSection: 'north-upper',
    status: ticketStatus,
    userId: 'user-001',
  };

  const ticketDocRef = {
    id: 'ticket-abc123',
    exists: ticketExists,
    ref: { path: `events/${EVENT_ID}/tickets/ticket-abc123` },
    data: () => ticketData,
  };

  // batch mock — captured so tests can assert commit was called
  const batch = {
    update: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };

  const db = {
    doc: vi.fn((path: string) => {
      let docData: Record<string, unknown> | null;

      if (path === `events/${EVENT_ID}`) {
        docData = { venueId: VENUE_ID };
      } else if (path === `venues/${VENUE_ID}`) {
        docData = {
          geofenceLat: VENUE_LAT,
          geofenceLng: VENUE_LNG,
          geofenceRadiusM: 200,
        };
      } else if (path.startsWith(`venues/${VENUE_ID}/sections/`)) {
        docData = {
          zoneMappings: [{ zoneId: 'north', proximityScore: 0.9 }],
        };
      } else {
        // Gate doc refs used in batch.update — just need to resolve
        docData = {};
      }

      return {
        get: vi.fn().mockResolvedValue({
          exists: docData !== null,
          data: () => docData ?? {},
        }),
      };
    }),

    collection: vi.fn((path: string) => {
      if (path.includes('/tickets')) {
        return {
          where: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue({
            empty: !ticketExists,
            docs: ticketExists ? [ticketDocRef] : [],
          }),
        };
      }

      if (path.includes('/gates')) {
        return {
          where: vi.fn().mockReturnThis(),
          get: vi.fn().mockResolvedValue({
            docs: [
              {
                id: 'gate-n1',
                data: () => ({
                  name: 'Gate N1',
                  zoneId: 'north',
                  isActive: true,
                  queueLength: 10,
                  estimatedWaitMinutes: 3,
                  maxThroughputPerMin: 60,
                }),
              },
            ],
          }),
        };
      }

      return {
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
      };
    }),

    batch: vi.fn().mockReturnValue(batch),
  };

  return { db, batch };
}

/** Construct a NextRequest with a JSON body. */
function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/checkin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/checkin', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_DEFAULT_EVENT_ID', EVENT_ID);
    vi.stubEnv('SKIP_GEOFENCE', 'true'); // most tests skip geofence
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  // ── Requested: 422 outside geofence ───────────────────────────────────────

  it('returns 422 when user coordinates are outside the venue geofence', async () => {
    vi.stubEnv('SKIP_GEOFENCE', 'false'); // enforce geofence for this test

    const { db } = buildMockDb();
    vi.mocked(getAdminDb).mockReturnValue(db as ReturnType<typeof getAdminDb>);

    const req = makeRequest({ barcode: 'TEST-BAR-001', latitude: OUTSIDE_LAT, longitude: OUTSIDE_LNG });
    const res = await POST(req);

    expect(res.status).toBe(422);

    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/venue|outside|away/i);
  });

  // ── Requested: 409 already checked in ────────────────────────────────────

  it('returns 409 when the ticket has already been checked in', async () => {
    const { db } = buildMockDb({ ticketStatus: 'checked_in' });
    vi.mocked(getAdminDb).mockReturnValue(db as ReturnType<typeof getAdminDb>);

    const req = makeRequest({ barcode: 'TEST-BAR-001', latitude: INSIDE_LAT, longitude: INSIDE_LNG });
    const res = await POST(req);

    expect(res.status).toBe(409);

    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/checked_in/i);
  });

  // ── Requested: 200 with correct shape on valid check-in ──────────────────

  it('returns 200 with the expected gate assignment shape on a valid check-in', async () => {
    const { db, batch } = buildMockDb({ ticketStatus: 'booked' });
    vi.mocked(getAdminDb).mockReturnValue(db as ReturnType<typeof getAdminDb>);

    const req = makeRequest({ barcode: 'TEST-BAR-001', latitude: INSIDE_LAT, longitude: INSIDE_LNG });
    const res = await POST(req);

    expect(res.status).toBe(200);

    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      ticketId: expect.any(String),
      gateId: expect.any(String),
      gateName: expect.any(String),
      queuePosition: expect.any(Number),
      estimatedWaitMinutes: expect.any(Number),
      firestorePath: expect.stringContaining('gates'),
    });

    // firestorePath should point to the gate document for real-time subscription
    expect(body['firestorePath']).toMatch(/^events\/.+\/gates\/.+$/);

    // Batch commit must be called exactly once to persist the check-in atomically
    expect(batch.commit).toHaveBeenCalledOnce();
  });

  // ── Additional edge cases ─────────────────────────────────────────────────

  it('returns 400 when the barcode field is missing', async () => {
    const { db } = buildMockDb();
    vi.mocked(getAdminDb).mockReturnValue(db as ReturnType<typeof getAdminDb>);

    const req = makeRequest({ latitude: INSIDE_LAT, longitude: INSIDE_LNG });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });

  it('returns 404 when no ticket matches the barcode', async () => {
    const { db } = buildMockDb({ ticketExists: false });
    vi.mocked(getAdminDb).mockReturnValue(db as ReturnType<typeof getAdminDb>);

    const req = makeRequest({ barcode: 'NONEXISTENT', latitude: INSIDE_LAT, longitude: INSIDE_LNG });
    const res = await POST(req);

    expect(res.status).toBe(404);
  });

  it('returns 400 when latitude/longitude are not numbers', async () => {
    const { db } = buildMockDb();
    vi.mocked(getAdminDb).mockReturnValue(db as ReturnType<typeof getAdminDb>);

    const req = makeRequest({ barcode: 'TEST-BAR-001', latitude: 'north', longitude: 'east' });
    const res = await POST(req);

    expect(res.status).toBe(400);
  });
});
