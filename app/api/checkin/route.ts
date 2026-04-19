/**
 * app/api/checkin/route.ts
 *
 * POST /api/checkin
 *
 * Validates a ticket barcode, runs the gate-assignment algorithm, writes the
 * assignment back to Firestore, and returns the result.
 *
 * Request body:
 *   { eventId: string; barcode: string }
 *
 * Response (200):
 *   { ticketId: string; gateId: string; gateName: string; estimatedWaitMinutes: number }
 *
 * Response (400 | 404 | 409 | 500):
 *   { error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase";
import { assignGate } from "@/lib/assignment";
import type { SectionZoneMapping, GateState } from "@/lib/assignment";

// ─── Request / Response schemas ───────────────────────────────────────────────

interface CheckInRequestBody {
  eventId: string;
  barcode: string;
}

interface CheckInResponse {
  ticketId: string;
  gateId: string;
  gateName: string;
  estimatedWaitMinutes: number;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: CheckInRequestBody;

  try {
    body = (await request.json()) as CheckInRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { eventId, barcode } = body;

  if (!eventId || !barcode) {
    return NextResponse.json(
      { error: "eventId and barcode are required." },
      { status: 400 },
    );
  }

  try {
    const db = getAdminDb();

    // 1. Find the ticket by barcode
    const ticketsRef = db.collection(`events/${eventId}/tickets`);
    const ticketSnapshot = await ticketsRef
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

    // 2. Load the section document to get zone mappings
    const venueDoc = await db.doc(`events/${eventId}`).get();
    if (!venueDoc.exists) {
      return NextResponse.json({ error: "Event not found." }, { status: 404 });
    }
    const venueId = (venueDoc.data() as Record<string, unknown>)["venueId"] as string;

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

    // 3. Load all active gates for this event
    const gatesSnapshot = await db
      .collection(`events/${eventId}/gates`)
      .where("isActive", "==", true)
      .get();

    // Build a lookup map of full gate data (for name / wait time after assignment)
    const gateFullData = new Map<string, { name: string; zoneId: string; estimatedWaitMinutes: number; queueLength: number; maxThroughputPerMin: number }>();
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

    // 4. Build sectionZoneMappings — join zone mappings with gate IDs per zone
    const sectionZoneMappings: SectionZoneMapping[] = sectionRaw.zoneMappings.map((zoneMapping) => ({
      zoneId: zoneMapping.zoneId,
      proximityScore: zoneMapping.proximityScore,
      gateIds: [...gateFullData.entries()]
        .filter(([, gateEntry]) => gateEntry.zoneId === zoneMapping.zoneId)
        .map(([gateId]) => gateId),
    }));

    // 5. Build gateStates for the algorithm
    const gateStates = new Map<string, GateState>(
      [...gateFullData.entries()].map(([gateId, gateEntry]) => [
        gateId,
        { queueLength: gateEntry.queueLength, maxThroughputPerMin: gateEntry.maxThroughputPerMin },
      ]),
    );

    // 6. Run Power-of-Two-Choices assignment
    const result = assignGate(seatSection, sectionZoneMappings, gateStates);

    if (!result) {
      return NextResponse.json(
        { error: "No eligible gates available. Please contact staff." },
        { status: 503 },
      );
    }

    const gate = gateFullData.get(result.gateId)!;

    // 7. Atomically update the ticket and increment the gate queue
    const batch = db.batch();

    batch.update(ticketDoc.ref, {
      status: "checked_in",
      assignedGateId: result.gateId,
      checkedInAt: FieldValue.serverTimestamp(),
    });

    batch.update(
      db.doc(`events/${eventId}/gates/${result.gateId}`),
      { queueLength: FieldValue.increment(1) },
    );

    await batch.commit();

    const response: CheckInResponse = {
      ticketId: ticketDoc.id,
      gateId: result.gateId,
      gateName: gate.name,
      estimatedWaitMinutes: gate.estimatedWaitMinutes,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error.";
    console.error("[/api/checkin] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
