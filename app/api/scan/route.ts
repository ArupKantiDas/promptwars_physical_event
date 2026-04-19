/**
 * app/api/scan/route.ts
 *
 * POST /api/scan
 *
 * Called by gate scanner hardware when an attendee physically passes through.
 * Resolves the ticket via a collectionGroup query (no eventId in body),
 * records entry, recalculates the EMA wait estimate, and decrements the queue.
 *
 * Request body:
 *   { barcode: string; checkpointId: string }
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

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScanRequestBody {
  barcode: string;
  /** Physical gate ID at the scanner checkpoint. */
  checkpointId: string;
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

  const { barcode, checkpointId } = body;

  if (!barcode || !checkpointId) {
    return NextResponse.json(
      { error: "barcode and checkpointId are required." },
      { status: 400 },
    );
  }

  try {
    const db = getAdminDb();

    // 1. Find ticket across all events via collectionGroup — no eventId in body
    const ticketSnapshot = await db
      .collectionGroup("tickets")
      .where("barcode", "==", barcode)
      .limit(1)
      .get();

    if (ticketSnapshot.empty) {
      return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
    }

    const ticketDoc = ticketSnapshot.docs[0]!;
    const ticketData = ticketDoc.data();

    // Extract eventId from the document path: events/{eventId}/tickets/{ticketId}
    const pathSegments = ticketDoc.ref.path.split("/");
    const eventId = pathSegments[1]!;

    if (ticketData["status"] === "entered") {
      return NextResponse.json(
        { error: "Ticket already scanned at entry." },
        { status: 409 },
      );
    }

    if (
      ticketData["status"] !== "checked_in" ||
      ticketData["assignedGateId"] !== checkpointId
    ) {
      return NextResponse.json(
        { error: "Ticket not assigned to this gate." },
        { status: 409 },
      );
    }

    // 2. Load gate document for EMA and scan timestamps
    const gateRef = db.doc(`events/${eventId}/gates/${checkpointId}`);
    const gateDoc = await gateRef.get();

    if (!gateDoc.exists) {
      return NextResponse.json({ error: "Gate not found." }, { status: 404 });
    }

    const gateData = gateDoc.data()!;
    const previousEma = (gateData["emaSecondsPerEntry"] as number) ?? 30;
    const currentQueueLength = (gateData["queueLength"] as number) ?? 0;

    // 3. Compute scan interval from the last two timestamps:
    //    previousScanAt (the scan before last) and lastScanAt (most recent scan).
    //    On the very first scan there is no lastScanAt, so we default to 30 s ago.
    const lastScanAt = gateData["lastScanAt"] as Timestamp | undefined;
    const nowMs = Date.now();
    const lastScanMs = lastScanAt ? lastScanAt.toMillis() : nowMs - 30_000;
    const latestIntervalSeconds = (nowMs - lastScanMs) / 1000;

    // 4. Update EMA and estimate remaining wait for the people still in queue
    const queuePosition = Math.max(0, currentQueueLength - 1);
    const updatedEma = calculateEMA(previousEma, latestIntervalSeconds);
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
      // Rotate timestamps: previous ← last ← now
      previousScanAt: lastScanAt ?? FieldValue.serverTimestamp(),
      lastScanAt: FieldValue.serverTimestamp(),
      lastUpdatedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    const response: ScanResponse = { ticketId: ticketDoc.id, updatedEma, estimatedWaitMinutes };
    return NextResponse.json(response, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error.";
    console.error("[/api/scan] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
