/**
 * lib/gemini.ts
 *
 * Gemini API client setup and function declarations for the GateFlow assistant.
 *
 * The chat route sends user messages to Gemini with the function declarations
 * defined here. When Gemini invokes a function, the server executes it against
 * Firestore/Maps and returns the tool result back to Gemini for a final reply.
 */

import "server-only";

import {
  GoogleGenerativeAI,
  type GenerativeModel,
  type Tool,
  type FunctionDeclaration,
  SchemaType,
} from "@google/generative-ai";

// ─── Client singleton ─────────────────────────────────────────────────────────

let _client: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (_client) return _client;

  const apiKey = process.env["GOOGLE_GEMINI_API_KEY"];
  if (!apiKey) {
    throw new Error(
      "GOOGLE_GEMINI_API_KEY is not set. Add it to .env.local.",
    );
  }
  _client = new GoogleGenerativeAI(apiKey);
  return _client;
}

// ─── Model factory ────────────────────────────────────────────────────────────

export const GEMINI_MODEL = "gemini-2.0-flash";

/**
 * Return a Gemini model instance pre-configured with:
 * - System instruction describing the GateFlow assistant role
 * - Function declarations for all available tools
 */
export function getGeminiModel(): GenerativeModel {
  const client = getGeminiClient();

  return client.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: `
You are GateFlow, an intelligent venue entry assistant helping attendees at large
sporting events (50 000+ capacity). Your goals are:
1. Assign attendees to the optimal gate based on their seat section and current
   queue lengths.
2. Provide real-time wait estimates and walking directions.
3. Answer questions about the event, venue, and entry process.

Always be concise, friendly, and proactive. When you call a function, wait for
the result before replying to the user. Never reveal raw Firestore data — always
format numbers and durations in plain English.
    `.trim(),
    tools: [gateflowTools],
  });
}

// ─── Function Declarations ────────────────────────────────────────────────────

const getGateStatusDeclaration: FunctionDeclaration = {
  name: "getGateStatus",
  description:
    "Retrieve live queue length and estimated wait time for a specific gate.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      eventId: {
        type: SchemaType.STRING,
        description: "The Firestore event document ID.",
      },
      gateId: {
        type: SchemaType.STRING,
        description: "The gate document ID within the event.",
      },
    },
    required: ["eventId", "gateId"],
  },
};

const assignGateDeclaration: FunctionDeclaration = {
  name: "assignGate",
  description:
    "Assign the best available gate for an attendee given their ticket barcode. " +
    "Uses the Power-of-Two-Choices algorithm weighted by proximity.",
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      eventId: {
        type: SchemaType.STRING,
        description: "The Firestore event document ID.",
      },
      barcode: {
        type: SchemaType.STRING,
        description: "The attendee's ticket barcode.",
      },
    },
    required: ["eventId", "barcode"],
  },
};

const getAllGatesDeclaration: FunctionDeclaration = {
  name: "getAllGates",
  description: "Return the status of all active gates for an event.",
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

const getEventInfoDeclaration: FunctionDeclaration = {
  name: "getEventInfo",
  description: "Return basic information about the event (name, start time, venue).",
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

/** All tools exposed to the Gemini model. */
export const gateflowTools: Tool = {
  functionDeclarations: [
    getGateStatusDeclaration,
    assignGateDeclaration,
    getAllGatesDeclaration,
    getEventInfoDeclaration,
  ],
};

// ─── Function name constants (used by the chat route handler) ─────────────────

export const GEMINI_FUNCTIONS = {
  GET_GATE_STATUS: "getGateStatus",
  ASSIGN_GATE: "assignGate",
  GET_ALL_GATES: "getAllGates",
  GET_EVENT_INFO: "getEventInfo",
} as const;

export type GeminiFunctionName =
  (typeof GEMINI_FUNCTIONS)[keyof typeof GEMINI_FUNCTIONS];
