/**
 * app/api/chat/route.ts
 *
 * POST /api/chat
 *
 * Handles multi-turn Gemini conversations with function calling.
 * Processes one user message at a time, executes any Gemini-requested
 * function calls against Firestore, and returns the final text response.
 *
 * Request body:
 *   { eventId: string; history: GeminiMessage[]; message: string }
 *
 * Response (200):
 *   { reply: string; history: GeminiMessage[] }
 *
 * Response (400 | 500):
 *   { error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import type { Content, Part } from "@google/generative-ai";
import { getGeminiModel, GEMINI_FUNCTIONS } from "@/lib/gemini";
import { getAdminDb } from "@/lib/firebase";
import { assignGate } from "@/lib/assignment";
import type { SectionZoneMapping, GateState } from "@/lib/assignment";

// ─── Types ────────────────────────────────────────────────────────────────────

type GeminiMessage = Content;

interface ChatRequestBody {
  eventId: string;
  history: GeminiMessage[];
  message: string;
}

interface ChatResponse {
  reply: string;
  history: GeminiMessage[];
}

// ─── Function executor ────────────────────────────────────────────────────────

async function executeFunctionCall(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const db = getAdminDb();

  switch (name) {
    case GEMINI_FUNCTIONS.GET_GATE_STATUS: {
      const { eventId, gateId } = args as { eventId: string; gateId: string };
      const doc = await db.doc(`events/${eventId}/gates/${gateId}`).get();
      if (!doc.exists) return { error: "Gate not found." };
      return { gateId, ...doc.data() };
    }

    case GEMINI_FUNCTIONS.GET_ALL_GATES: {
      const { eventId } = args as { eventId: string };
      const snapshot = await db
        .collection(`events/${eventId}/gates`)
        .where("isActive", "==", true)
        .get();
      return snapshot.docs.map((d) => ({ gateId: d.id, ...d.data() }));
    }

    case GEMINI_FUNCTIONS.GET_EVENT_INFO: {
      const { eventId } = args as { eventId: string };
      const doc = await db.doc(`events/${eventId}`).get();
      if (!doc.exists) return { error: "Event not found." };
      return { eventId, ...doc.data() };
    }

    case GEMINI_FUNCTIONS.ASSIGN_GATE: {
      const { eventId, barcode } = args as {
        eventId: string;
        barcode: string;
      };

      const ticketSnapshot = await db
        .collection(`events/${eventId}/tickets`)
        .where("barcode", "==", barcode)
        .limit(1)
        .get();

      if (ticketSnapshot.empty) return { error: "Ticket not found." };

      const ticketData = ticketSnapshot.docs[0]!.data();
      const seatSection = ticketData["seatSection"] as string;

      const eventDoc = await db.doc(`events/${eventId}`).get();
      const venueId = (eventDoc.data() as Record<string, unknown>)["venueId"] as string;

      const sectionDoc = await db
        .doc(`venues/${venueId}/sections/${seatSection}`)
        .get();
      if (!sectionDoc.exists)
        return { error: `Section "${seatSection}" not found.` };

      const sectionRaw = sectionDoc.data() as {
        zoneMappings: Array<{ zoneId: string; proximityScore: number }>;
      };

      const gatesSnapshot = await db
        .collection(`events/${eventId}/gates`)
        .where("isActive", "==", true)
        .get();

      const gateFullData = new Map<string, { zoneId: string; queueLength: number; maxThroughputPerMin: number }>();
      for (const gateDoc of gatesSnapshot.docs) {
        const rawGateData = gateDoc.data();
        gateFullData.set(gateDoc.id, {
          zoneId: rawGateData["zoneId"] as string,
          queueLength: (rawGateData["queueLength"] as number) ?? 0,
          maxThroughputPerMin: (rawGateData["maxThroughputPerMin"] as number) ?? 1,
        });
      }

      const sectionZoneMappings: SectionZoneMapping[] = sectionRaw.zoneMappings.map((zoneMapping) => ({
        zoneId: zoneMapping.zoneId,
        proximityScore: zoneMapping.proximityScore,
        gateIds: [...gateFullData.entries()]
          .filter(([, gateEntry]) => gateEntry.zoneId === zoneMapping.zoneId)
          .map(([gateId]) => gateId),
      }));

      const gateStates = new Map<string, GateState>(
        [...gateFullData.entries()].map(([gateId, gateEntry]) => [
          gateId,
          { queueLength: gateEntry.queueLength, maxThroughputPerMin: gateEntry.maxThroughputPerMin },
        ]),
      );

      const result = assignGate(seatSection, sectionZoneMappings, gateStates);
      if (!result) return { error: "No eligible gates available." };
      return result;
    }

    default:
      return { error: `Unknown function: ${name}` };
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: ChatRequestBody;

  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { eventId, history, message } = body;

  if (!eventId || !message) {
    return NextResponse.json(
      { error: "eventId and message are required." },
      { status: 400 },
    );
  }

  try {
    const model = getGeminiModel();
    const chat = model.startChat({ history: history ?? [] });

    // Send user message
    let result = await chat.sendMessage(message);
    let response = result.response;

    // Agentic loop — keep executing functions until Gemini returns plain text
    while (
      response.candidates?.[0]?.content?.parts?.some(
        (p) => "functionCall" in p,
      )
    ) {
      const functionResponseParts: Part[] = [];

      for (const part of response.candidates[0].content.parts) {
        if (!("functionCall" in part) || !part.functionCall) continue;

        const { name, args } = part.functionCall;
        const fnResult = await executeFunctionCall(
          name,
          args as Record<string, unknown>,
        );

        functionResponseParts.push({
          functionResponse: {
            name,
            response: { result: fnResult },
          },
        });
      }

      // Return function responses to Gemini
      result = await chat.sendMessage(functionResponseParts);
      response = result.response;
    }

    const reply = response.text();
    const updatedHistory = await chat.getHistory();

    const chatResponse: ChatResponse = { reply, history: updatedHistory };
    return NextResponse.json(chatResponse, { status: 200 });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error.";
    console.error("[/api/chat] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
