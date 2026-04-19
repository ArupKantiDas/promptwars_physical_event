/**
 * app/api/scan/route.ts
 *
 * POST /api/scan
 *
 * Called by gate scanner hardware/staff when an attendee physically passes
 * through a gate. Records entry, updates EMA wait estimates, and decrements
 * the gate queue counter.
 *
 * Request body:
 *   { eventId: string; gateId: string; barcode: string }
 *
 * Response (200):
 *   { ticketId: string; updatedEma: number; estimatedWaitMinutes: number }
 *
 * Response (400 | 404 | 409 | 500):
 *   { error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase";
import { calculateEMA, estimateWait } from "@/lib/ema";

// ─── Request / Response schemas ───────────────────────────────────────────────

interface ScanRequestBody {
  eventId: string;
  gateId: string;
  barcode: string;
}

interface ScanResponse {
  ticketId: string;
  updatedEma: number;
  estimatedWaitMinutes: number;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: ScanRequestBody;

  try {
    body = (await request.json()) as ScanRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { eventId, gateId, barcode } = body;

  if (!eventId || !gateId || !barcode) {
    return NextResponse.json(
      { error: "eventId, gateId, and barcode are required." },
      { status: 400 },
    );
  }

  try {
    const db = getAdminDb();

    // 1. Find and validate the ticket
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

    if (ticketData["status"] === "entered") {
      return NextResponse.json(
        { error: "Ticket already scanned at entry." },
        { status: 409 },
      );
    }

    if (
      ticketData["status"] !== "checked_in" ||
      ticketData["assignedGateId"] !== gateId
    ) {
      return NextResponse.json(
        { error: "Ticket not assigned to this gate." },
        { status: 409 },
      );
    }

    // 2. Load the gate to get current EMA and queue length
    const gateRef = db.doc(`events/${eventId}/gates/${gateId}`);
    const gateDoc = await gateRef.get();

    if (!gateDoc.exists) {
      return NextResponse.json({ error: "Gate not found." }, { status: 404 });
    }

    const gateData = gateDoc.data()!;
    const previousEma = (gateData["emaSecondsPerEntry"] as number) ?? 30;
    const currentQueueLength = (gateData["queueLength"] as number) ?? 0;
    const lastUpdatedAt = gateData["lastUpdatedAt"] as Timestamp | undefined;

    // 3. Calculate interval since last scan (seconds)
    const nowMs = Date.now();
    const lastUpdatedMs = lastUpdatedAt ? lastUpdatedAt.toMillis() : nowMs - 30_000;
    const latestInterval = (nowMs - lastUpdatedMs) / 1000;

    // Queue position for the scanned attendee (they are at the front)
    const queuePosition = Math.max(0, currentQueueLength - 1);

    // 4. Update EMA and estimate wait
    const updatedEma = calculateEMA(previousEma, latestInterval);
    const estimatedWaitMinutes = estimateWait(queuePosition, updatedEma);

    // 5. Atomically update ticket status and gate stats
    const batch = db.batch();

    batch.update(ticketDoc.ref, {
      status: "entered",
      enteredAt: FieldValue.serverTimestamp(),
    });

    batch.update(gateRef, {
      queueLength: FieldValue.increment(-1),
      emaSecondsPerEntry: updatedEma,
      estimatedWaitMinutes,
      lastUpdatedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    const response: ScanResponse = { ticketId: ticketDoc.id, updatedEma, estimatedWaitMinutes };
    return NextResponse.json(response, { status: 200 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error.";
    console.error("[/api/scan] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
