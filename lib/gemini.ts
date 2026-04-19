/**
 * lib/gemini.ts
 *
 * Gemini API client setup and function declarations for the GateFlow assistant.
 *
 * The chat route sends user messages to Gemini with the four tool declarations
 * defined here. When Gemini invokes a function, the server executes it against
 * Firestore/Maps and returns the tool result back to Gemini for a final reply.
 */

import "server-only";

import {
  GoogleGenerativeAI,
  type Content,
  type ChatSession,
  type Tool,
  type FunctionDeclaration,
  SchemaType,
} from "@google/generative-ai";

// ─── Client singleton ─────────────────────────────────────────────────────────

let _client: GoogleGenerativeAI | undefined;

function getGeminiClient(): GoogleGenerativeAI {
  if (_client) return _client;

  const apiKey = process.env["GOOGLE_GEMINI_API_KEY"];
  if (!apiKey) {
    throw new Error("GOOGLE_GEMINI_API_KEY is not set. Add it to .env.local.");
  }
  _client = new GoogleGenerativeAI(apiKey);
  return _client;
}

export const GEMINI_MODEL = "gemini-2.5-flash";

// ─── System prompt ────────────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT =
  "You are GateFlow, a friendly venue entry assistant at a major sporting event. " +
  "You help attendees find their assigned gate, check wait times, get directions, " +
  "and stay entertained with trivia while they wait. Be concise, helpful, and " +
  "upbeat. Always provide specific numbers when discussing wait times.";

// ─── Function declarations ────────────────────────────────────────────────────

const getQueueStatusDeclaration: FunctionDeclaration = {
  name: "getQueueStatus",
  description: "Get the current queue length and estimated wait time for a gate",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      gateId: {
        type: SchemaType.STRING,
        description: "The gate document ID.",
      },
    },
    required: ["gateId"],
  },
};

const getDirectionsDeclaration: FunctionDeclaration = {
  name: "getDirections",
  description: "Get walking directions from attendee's location to their assigned gate",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      fromLat: {
        type: SchemaType.NUMBER,
        description: "Attendee's current latitude.",
      },
      fromLng: {
        type: SchemaType.NUMBER,
        description: "Attendee's current longitude.",
      },
      toGateId: {
        type: SchemaType.STRING,
        description: "The destination gate document ID.",
      },
    },
    required: ["fromLat", "fromLng", "toGateId"],
  },
};

const getVenueTriviaDeclaration: FunctionDeclaration = {
  name: "getVenueTrivia",
  description: "Get an interesting fact about the teams, venue, or today's matchup",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      eventId: {
        type: SchemaType.STRING,
        description: "The Firestore event document ID.",
      },
    },
    required: ["eventId"],
  },
};

const requestReassignmentDeclaration: FunctionDeclaration = {
  name: "requestReassignment",
  description: "Check if there's a faster gate available and offer to reassign",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      ticketId: {
        type: SchemaType.STRING,
        description: "The attendee's ticket document ID.",
      },
      currentGateId: {
        type: SchemaType.STRING,
        description: "The gate the attendee is currently assigned to.",
      },
    },
    required: ["ticketId", "currentGateId"],
  },
};

const assistantTools: Tool = {
  functionDeclarations: [
    getQueueStatusDeclaration,
    getDirectionsDeclaration,
    getVenueTriviaDeclaration,
    requestReassignmentDeclaration,
  ],
};

// ─── Chat session factory ─────────────────────────────────────────────────────

/**
 * Create a Gemini chat session configured with the four assistant tools.
 *
 * @param systemPrompt  Overrides the default GateFlow system prompt.
 * @param history       Prior conversation turns to reconstruct multi-turn context.
 */
export function createChat(
  systemPrompt: string = DEFAULT_SYSTEM_PROMPT,
  history: Content[] = [],
): ChatSession {
  const model = getGeminiClient().getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: systemPrompt,
    tools: [assistantTools],
  });
  return model.startChat({ history });
}

// ─── Function name constants ──────────────────────────────────────────────────

export const GEMINI_FUNCTIONS = {
  GET_QUEUE_STATUS:     "getQueueStatus",
  GET_DIRECTIONS:       "getDirections",
  GET_VENUE_TRIVIA:     "getVenueTrivia",
  REQUEST_REASSIGNMENT: "requestReassignment",
} as const;

export type GeminiFunctionName =
  (typeof GEMINI_FUNCTIONS)[keyof typeof GEMINI_FUNCTIONS];
