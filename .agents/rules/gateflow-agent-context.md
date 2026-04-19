---
trigger: always_on
---

# GateFlow — Agent Context

## Project Overview
GateFlow is an AI-powered venue entry management assistant for large-scale sporting events (50K+ attendees). It assigns gates intelligently, provides real-time wait estimates, and offers a conversational assistant interface.

## Critical Constraints
- **Repository size must stay under 1 MB.** No images, no vendored dependencies, no large data files. All assets must be loaded via CDN or API.
- **Single branch only.** All work goes to `main`.
- **Google Services are mandatory.** The project must meaningfully integrate: Gemini API (function calling), Google Maps JavaScript API, Cloud Firestore (real-time), and Firebase Auth.

## Architecture Rules
1. **Next.js App Router only.** No Pages Router. Use server components by default, `'use client'` only where needed (map, chat, real-time listeners).
2. **All API routes in `app/api/`.** Keep business logic in `lib/` and import into route handlers.
3. **Firestore as the sole database.** No PostgreSQL, no Redis, no SQLite. Real-time listeners replace SSE/WebSocket infrastructure.
4. **Gemini function calling for assistant intelligence.** The chat endpoint sends messages to Gemini with function declarations. When Gemini invokes a function, the server executes it against Firestore/Maps and returns the result.
5. **No hardcoded API keys.** All credentials via `.env.local`. The `.env.example` file documents required variables.
6. **TypeScript strict mode.** No `any` types. Proper interfaces for all data structures.

## Algorithm: Power-of-Two-Choices
When assigning a gate:
1. Look up the attendee's seat section.
2. Get all eligible gates via section-zone mappings (each has a proximity score 0.0–1.0).
3. Randomly sample TWO gates from the eligible set.
4. Score each: `(queueLength / maxThroughputPerMin) * (1 / proximityScore)`.
5. Assign to the lower score. Atomically increment that gate's queue count in Firestore.

## Algorithm: EMA Wait Estimation
- `EMA_new = 0.3 * latestEntryTime + 0.7 * EMA_previous`
- `estimatedWait = queuePosition * EMA_secondsPerEntry`
- Recalculate on every scan event. Write to Firestore gate document to trigger real-time listeners.

## Firestore Schema

```
events/{eventId}
  name, venueId, gatesOpenAt, eventStartAt

venues/{venueId}
  name, geofenceLat, geofenceLng, geofenceRadiusM

venues/{venueId}/sections/{sectionId}
  name, zoneMappings: [{ zoneId, proximityScore }]

events/{eventId}/gates/{gateId}
  name, zoneId, maxThroughputPerMin, isActive,
  queueLength, emaSecondsPerEntry, estimatedWaitMinutes, lastUpdatedAt

events/{eventId}/tickets/{ticketId}
  barcode, seatSection, seatRow, seatNumber, userId,
  status: 'booked' | 'checked_in' | 'entered',
  assignedGateId, checkedInAt, enteredAt
```

## Testing Requirements
- Unit tests for `lib/assignment.ts` (verify two-choices sampling, proximity weighting, edge cases).
- Unit tests for `lib/ema.ts` (verify smoothing behavior, outlier dampening).
- Use Vitest. Tests in `__tests__/` directory.

## Code Style
- Functional components only. No class components.
- Named exports. No default exports except page components.
- Descriptive variable names. No abbreviations except well-known ones (EMA, SSE, API).
- Error handling on every async operation. No silent catches.
- Accessible HTML: proper ARIA labels, semantic elements, keyboard navigation.
