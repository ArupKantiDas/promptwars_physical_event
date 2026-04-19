/**
 * app/api/checkin/route.ts
 *
 * POST /api/checkin
 *
 * Validates attendee geolocation, assigns an optimal gate, and records the
 * check-in atomically in Firestore.
 *
 * Request body:
 *   { barcode: string; latitude: number; longitude: number }
 *
 * Response (200):
 *   { ticketId, gateId, gateName, queuePosition, estimatedWaitMinutes, firestorePath }
 *
 * Response (400 | 404 | 409 | 422 | 500 | 503):
 *   { error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase";
import { assignGate } from "@/lib/assignment";
import type { SectionZoneMapping, GateState } from "@/lib/assignment";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CheckInRequestBody {
  barcode: string;
  latitude: number;
  longitude: number;
}

interface CheckInResponse {
  ticketId: string;
  gateId: string;
  gateName: string;
  queuePosition: number;
  estimatedWaitMinutes: number;
  /** Firestore document path — subscribe to this for real-time queue updates. */
  firestorePath: string;
}

// ─── Geolocation ──────────────────────────────────────────────────────────────

/** Haversine distance between two (lat, lng) pairs in metres. */
function haversineMetres(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: CheckInRequestBody;

  try {
    body = (await request.json()) as CheckInRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { barcode, latitude, longitude } = body;

  if (!barcode || latitude === undefined || longitude === undefined) {
    return NextResponse.json(
      { error: "barcode, latitude, and longitude are required." },
      { status: 400 },
    );
  }
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return NextResponse.json(
      { error: "latitude and longitude must be numbers." },
      { status: 400 },
    );
  }

  const eventId = process.env["NEXT_PUBLIC_DEFAULT_EVENT_ID"];
  if (!eventId) {
    return NextResponse.json(
      { error: "Event configuration missing." },
      { status: 500 },
    );
  }

  try {
    const db = getAdminDb();

    // 1. Load event → venue for geofence center
    const eventDoc = await db.doc(`events/${eventId}`).get();
    if (!eventDoc.exists) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    const eventData = eventDoc.data() as Record<string, unknown>;
    const venueId = eventData["venueId"] as string;

    const venueDoc = await db.doc(`venues/${venueId}`).get();
    if (!venueDoc.exists) {
      return NextResponse.json({ error: "Venue not found." }, { status: 404 });
    }
    const venueData = venueDoc.data() as Record<string, unknown>;
    const venueLat = venueData["geofenceLat"] as number;
    const venueLng = venueData["geofenceLng"] as number;
    const geofenceRadiusMetres = (venueData["geofenceRadiusM"] as number) ?? 200;

    console.log("[checkin] Venue center:", { lat: venueLat, lng: venueLng, radiusM: geofenceRadiusMetres });
    console.log("[checkin] User location:", { lat: latitude, lng: longitude });

    // 2. Geolocation validation — skip when SKIP_GEOFENCE=true (testing only)
    const skipGeofence = process.env["SKIP_GEOFENCE"] === "true";
    const distanceMetres = haversineMetres(latitude, longitude, venueLat, venueLng);
    console.log(`[checkin] Distance from venue: ${Math.round(distanceMetres)} m (geofence ${skipGeofence ? "SKIPPED" : `radius ${geofenceRadiusMetres} m`})`);

    if (!skipGeofence) {
      if (distanceMetres > geofenceRadiusMetres) {
        return NextResponse.json(
          {
            error:
              `You appear to be ${Math.round(distanceMetres)} m from the venue. ` +
              `Please move within ${geofenceRadiusMetres} m to check in.`,
          },
          { status: 422 },
        );
      }
    }

    // 3. Look up ticket by barcode
    const ticketSnapshot = await db
      .collection(`events/${eventId}/tickets`)
      .where("barcode", "==", barcode)
      .limit(1)
      .get();

    if (ticketSnapshot.empty) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    const ticketDoc = ticketSnapshot.docs[0]!;
    const ticketData = ticketDoc.data();

    if (ticketData["status"] !== "booked") {
      return NextResponse.json(
        { error: `Ticket already ${ticketData["status"] as string}.` },
        { status: 409 },
      );
    }

    const seatSection = ticketData["seatSection"] as string;

    // 4. Load section zone mappings
    const sectionDoc = await db
      .doc(`venues/${venueId}/sections/${seatSection}`)
      .get();

    if (!sectionDoc.exists) {
      return NextResponse.json(
        { error: `Section "${seatSection}" not found.` },
        { status: 404 },
      );
    }

    const sectionRaw = sectionDoc.data() as {
      zoneMappings: Array<{ zoneId: string; proximityScore: number }>;
    };

    // 5. Load current gate states
    const gatesSnapshot = await db
      .collection(`events/${eventId}/gates`)
      .where("isActive", "==", true)
      .get();

    const gateFullData = new Map<string, {
      name: string;
      zoneId: string;
      estimatedWaitMinutes: number;
      queueLength: number;
      maxThroughputPerMin: number;
    }>();

    for (const gateDoc of gatesSnapshot.docs) {
      const rawGateData = gateDoc.data();
      gateFullData.set(gateDoc.id, {
        name: rawGateData["name"] as string,
        zoneId: rawGateData["zoneId"] as string,
        estimatedWaitMinutes: (rawGateData["estimatedWaitMinutes"] as number) ?? 0,
        queueLength: (rawGateData["queueLength"] as number) ?? 0,
        maxThroughputPerMin: (rawGateData["maxThroughputPerMin"] as number) ?? 1,
      });
    }

    // 6. Build inputs for the assignment algorithm
    const sectionZoneMappings: SectionZoneMapping[] = sectionRaw.zoneMappings.map(
      (zoneMapping) => ({
        zoneId: zoneMapping.zoneId,
        proximityScore: zoneMapping.proximityScore,
        gateIds: [...gateFullData.entries()]
          .filter(([, gateEntry]) => gateEntry.zoneId === zoneMapping.zoneId)
          .map(([gateId]) => gateId),
      }),
    );

    const gateStates = new Map<string, GateState>(
      [...gateFullData.entries()].map(([gateId, gateEntry]) => [
        gateId,
        { queueLength: gateEntry.queueLength, maxThroughputPerMin: gateEntry.maxThroughputPerMin },
      ]),
    );

    // 7. Run Power-of-Two-Choices assignment
    const assignment = assignGate(seatSection, sectionZoneMappings, gateStates);

    if (!assignment) {
      return NextResponse.json(
        { error: "No eligible gates available. Please contact staff." },
        { status: 503 },
      );
    }

    const assignedGate = gateFullData.get(assignment.gateId)!;
    // Queue position is 1-indexed: the attendee joins behind existing queue
    const queuePosition = assignedGate.queueLength + 1;

    // 8. Atomically write check-in and increment gate queue
    const batch = db.batch();

    batch.update(ticketDoc.ref, {
      status: "checked_in",
      assignedGateId: assignment.gateId,
      checkedInAt: FieldValue.serverTimestamp(),
    });

    batch.update(
      db.doc(`events/${eventId}/gates/${assignment.gateId}`),
      { queueLength: FieldValue.increment(1) },
    );

    await batch.commit();

    const response: CheckInResponse = {
      ticketId: ticketDoc.id,
      gateId: assignment.gateId,
      gateName: assignedGate.name,
      queuePosition,
      estimatedWaitMinutes: assignedGate.estimatedWaitMinutes,
      firestorePath: `events/${eventId}/gates/${assignment.gateId}`,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error.";
    console.error("[/api/checkin] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
