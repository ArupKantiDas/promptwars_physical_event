/**
 * app/api/chat/route.ts
 *
 * POST /api/chat
 *
 * Multi-turn Gemini conversation with function calling.
 * Executes tool calls server-side against Firestore and Google Maps, then
 * returns Gemini's final natural-language response.
 *
 * Request body:
 *   { message: string; history: ChatMessage[]; context: { ticketId, gateId, eventId } }
 *
 * Response (200):
 *   { reply: string; history: ChatMessage[]; functionResults: FunctionResult[] }
 *
 * Response (400 | 500):
 *   { error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import type { Content, Part } from "@google/generative-ai";
import { createChat, GEMINI_FUNCTIONS } from "@/lib/gemini";
import { getAdminDb } from "@/lib/firebase";
import { assignGate, computeGateScore } from "@/lib/assignment";
import type { SectionZoneMapping, GateState } from "@/lib/assignment";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChatMessage = Content;

interface ChatContext {
  ticketId: string;
  gateId: string;
  eventId: string;
}

interface ChatRequestBody {
  message: string;
  history: ChatMessage[];
  context: ChatContext;
}

interface FunctionResult {
  name: string;
  result: unknown;
}

interface ChatResponse {
  reply: string;
  history: ChatMessage[];
  functionResults: FunctionResult[];
}

// ─── Shared gate-data loader ──────────────────────────────────────────────────

interface FullGateData {
  name: string;
  zoneId: string;
  lat: number;
  lng: number;
  estimatedWaitMinutes: number;
  queueLength: number;
  maxThroughputPerMin: number;
}

async function loadActiveGates(
  eventId: string,
): Promise<Map<string, FullGateData>> {
  const db = getAdminDb();
  const snapshot = await db
    .collection(`events/${eventId}/gates`)
    .where("isActive", "==", true)
    .get();

  const gateMap = new Map<string, FullGateData>();
  for (const gateDoc of snapshot.docs) {
    const rawData = gateDoc.data();
    gateMap.set(gateDoc.id, {
      name: rawData["name"] as string,
      zoneId: rawData["zoneId"] as string,
      lat: (rawData["lat"] as number) ?? 0,
      lng: (rawData["lng"] as number) ?? 0,
      estimatedWaitMinutes: (rawData["estimatedWaitMinutes"] as number) ?? 0,
      queueLength: (rawData["queueLength"] as number) ?? 0,
      maxThroughputPerMin: (rawData["maxThroughputPerMin"] as number) ?? 1,
    });
  }
  return gateMap;
}

// ─── Function executor ────────────────────────────────────────────────────────

async function executeFunctionCall(
  name: string,
  args: Record<string, unknown>,
  context: ChatContext,
): Promise<unknown> {
  const db = getAdminDb();
  const { eventId } = context;

  switch (name) {
    // ── getQueueStatus ──────────────────────────────────────────────────────
    case GEMINI_FUNCTIONS.GET_QUEUE_STATUS: {
      const { gateId } = args as { gateId: string };
      const gateDoc = await db.doc(`events/${eventId}/gates/${gateId}`).get();
      if (!gateDoc.exists) return { error: "Gate not found." };
      const gateData = gateDoc.data()!;
      return {
        gateId,
        name: gateData["name"],
        queueLength: gateData["queueLength"] ?? 0,
        estimatedWaitMinutes: gateData["estimatedWaitMinutes"] ?? 0,
        isActive: gateData["isActive"] ?? true,
      };
    }

    // ── getDirections ───────────────────────────────────────────────────────
    case GEMINI_FUNCTIONS.GET_DIRECTIONS: {
      const { fromLat, fromLng, toGateId } = args as {
        fromLat: number;
        fromLng: number;
        toGateId: string;
      };

      const gateDoc = await db.doc(`events/${eventId}/gates/${toGateId}`).get();
      if (!gateDoc.exists) return { error: "Gate not found." };

      const gateData = gateDoc.data()!;
      const gateLat = gateData["lat"] as number;
      const gateLng = gateData["lng"] as number;
      const gateName = gateData["name"] as string;

      const mapsApiKey = process.env["NEXT_PUBLIC_MAPS_API_KEY"];
      if (!mapsApiKey) return { error: "Maps API not configured." };

      const directionsUrl = new URL(
        "https://maps.googleapis.com/maps/api/directions/json",
      );
      directionsUrl.searchParams.set("origin", `${fromLat},${fromLng}`);
      directionsUrl.searchParams.set("destination", `${gateLat},${gateLng}`);
      directionsUrl.searchParams.set("mode", "walking");
      directionsUrl.searchParams.set("key", mapsApiKey);

      const mapsResponse = await fetch(directionsUrl.toString());
      if (!mapsResponse.ok) return { error: "Could not reach Maps API." };

      const directionsData = (await mapsResponse.json()) as {
        status: string;
        routes: Array<{
          legs: Array<{
            distance: { text: string; value: number };
            duration: { text: string; value: number };
          }>;
          summary: string;
        }>;
      };

      if (directionsData.status !== "OK" || !directionsData.routes[0]) {
        return { error: `Directions unavailable (${directionsData.status}).` };
      }

      const leg = directionsData.routes[0].legs[0]!;
      return {
        gateName,
        distanceText: leg.distance.text,
        walkingTimeText: leg.duration.text,
        walkingTimeMinutes: Math.ceil(leg.duration.value / 60),
        routeSummary: directionsData.routes[0].summary,
      };
    }

    // ── getVenueTrivia ──────────────────────────────────────────────────────
    case GEMINI_FUNCTIONS.GET_VENUE_TRIVIA: {
      const triviaSnapshot = await db
        .collection(`events/${eventId}/trivia`)
        .get();

      if (triviaSnapshot.empty) return { error: "No trivia available." };

      const randomIndex = Math.floor(Math.random() * triviaSnapshot.size);
      const triviaDoc = triviaSnapshot.docs[randomIndex]!;
      return triviaDoc.data();
    }

    // ── requestReassignment ─────────────────────────────────────────────────
    case GEMINI_FUNCTIONS.REQUEST_REASSIGNMENT: {
      const { ticketId, currentGateId } = args as {
        ticketId: string;
        currentGateId: string;
      };

      // Load ticket to get section
      const ticketDoc = await db
        .doc(`events/${eventId}/tickets/${ticketId}`)
        .get();
      if (!ticketDoc.exists) return { error: "Ticket not found." };

      const seatSection = ticketDoc.data()!["seatSection"] as string;

      // Load event → venue → section mappings
      const eventDoc = await db.doc(`events/${eventId}`).get();
      const venueId = (eventDoc.data() as Record<string, unknown>)["venueId"] as string;

      const sectionDoc = await db
        .doc(`venues/${venueId}/sections/${seatSection}`)
        .get();
      if (!sectionDoc.exists) return { error: "Section data not found." };

      const sectionRaw = sectionDoc.data() as {
        zoneMappings: Array<{ zoneId: string; proximityScore: number }>;
      };

      // Load all active gates
      const gateFullData = await loadActiveGates(eventId);

      const sectionZoneMappings: SectionZoneMapping[] = sectionRaw.zoneMappings.map(
        (zoneMapping) => ({
          zoneId: zoneMapping.zoneId,
          proximityScore: zoneMapping.proximityScore,
          gateIds: [...gateFullData.keys()].filter(
            (gateId) => gateFullData.get(gateId)!.zoneId === zoneMapping.zoneId,
          ),
        }),
      );

      const gateStates = new Map<string, GateState>(
        [...gateFullData.entries()].map(([gateId, gateEntry]) => [
          gateId,
          { queueLength: gateEntry.queueLength, maxThroughputPerMin: gateEntry.maxThroughputPerMin },
        ]),
      );

      // Re-run algorithm to find the best available gate
      const suggestion = assignGate(seatSection, sectionZoneMappings, gateStates);

      if (!suggestion || suggestion.gateId === currentGateId) {
        const currentGate = gateFullData.get(currentGateId);
        return {
          reassignmentAvailable: false,
          message: "Your current gate already has the shortest wait.",
          currentGate: {
            gateId: currentGateId,
            name: currentGate?.name ?? currentGateId,
            estimatedWaitMinutes: currentGate?.estimatedWaitMinutes ?? 0,
          },
        };
      }

      // Compare scores to confirm the suggestion is genuinely better
      const currentGateData = gateFullData.get(currentGateId);
      const suggestedGateData = gateFullData.get(suggestion.gateId)!;

      // Find proximity score for both gates relative to the attendee's section
      const findProximityScore = (gateId: string): number => {
        const gateZoneId = gateFullData.get(gateId)?.zoneId ?? "";
        const zoneMapping = sectionRaw.zoneMappings.find(
          (zm) => zm.zoneId === gateZoneId,
        );
        return zoneMapping?.proximityScore ?? 0.5;
      };

      const currentScore = currentGateData
        ? computeGateScore(
            { queueLength: currentGateData.queueLength, maxThroughputPerMin: currentGateData.maxThroughputPerMin },
            findProximityScore(currentGateId),
          )
        : Infinity;

      const suggestedScore = computeGateScore(
        { queueLength: suggestedGateData.queueLength, maxThroughputPerMin: suggestedGateData.maxThroughputPerMin },
        findProximityScore(suggestion.gateId),
      );

      if (suggestedScore >= currentScore) {
        return {
          reassignmentAvailable: false,
          message: "Your current gate already has the shortest wait.",
        };
      }

      return {
        reassignmentAvailable: true,
        suggestedGateId: suggestion.gateId,
        suggestedGateName: suggestedGateData.name,
        suggestedWaitMinutes: suggestedGateData.estimatedWaitMinutes,
        currentWaitMinutes: currentGateData?.estimatedWaitMinutes ?? 0,
        savedMinutes:
          (currentGateData?.estimatedWaitMinutes ?? 0) -
          suggestedGateData.estimatedWaitMinutes,
      };
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

  const { message, history, context } = body;

  if (!message || !context?.eventId) {
    return NextResponse.json(
      { error: "message and context.eventId are required." },
      { status: 400 },
    );
  }

  try {
    const systemPrompt =
      `You are GateFlow, a friendly venue entry assistant at a major sporting event. ` +
      `You help attendees find their assigned gate, check wait times, get directions, ` +
      `and stay entertained with trivia while they wait. Be concise, helpful, and upbeat. ` +
      `Always provide specific numbers when discussing wait times. ` +
      `ATTENDEE CONTEXT — event: ${context.eventId}, assigned gate ID: ${context.gateId}, ` +
      `ticket ID: ${context.ticketId}. ` +
      `When the attendee asks about their gate or wait time, call getQueueStatus with ` +
      `gateId="${context.gateId}" immediately — do NOT ask them which gate they are at.`;

    const chat = createChat(systemPrompt, history ?? []);

    let result = await chat.sendMessage(message);
    let geminiResponse = result.response;

    const functionResults: FunctionResult[] = [];

    // Agentic loop — keep executing functions until Gemini returns plain text
    while (
      geminiResponse.candidates?.[0]?.content?.parts?.some(
        (part) => "functionCall" in part,
      )
    ) {
      const functionResponseParts: Part[] = [];

      for (const part of geminiResponse.candidates[0].content.parts) {
        if (!("functionCall" in part) || !part.functionCall) continue;

        const { name, args } = part.functionCall;
        const fnResult = await executeFunctionCall(
          name,
          args as Record<string, unknown>,
          context,
        );

        functionResults.push({ name, result: fnResult });

        functionResponseParts.push({
          functionResponse: { name, response: { result: fnResult } },
        });
      }

      result = await chat.sendMessage(functionResponseParts);
      geminiResponse = result.response;
    }

    const reply = geminiResponse.text();
    const updatedHistory = await chat.getHistory();

    const chatResponse: ChatResponse = { reply, history: updatedHistory, functionResults };
    return NextResponse.json(chatResponse, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error.";
    console.error("[/api/chat] Error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
