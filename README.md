# GateFlow: Intelligent Venue Entry Assistant

An AI-powered assistant for crowd entry management at large sporting venues (50,000+ capacity). GateFlow assigns attendees to the fastest available gate, shows live wait times, and gives walking directions, all through a chat interface.

## Chosen Vertical

**Live Event Operations** -- specifically, crowd entry management at large sporting venues.

A 50,000-seat stadium has a narrow entry window: 80% of attendees typically arrive within 50 minutes, which works out to roughly 800 arrivals per minute. Without any coordination, popular gates back up while nearby gates sit half-empty. GateFlow treats this as a load-balancing problem with a chat interface on top.

## Approach and Logic

### Core Thesis

Queue anxiety is mostly an information problem. Research on queue psychology shows that *uncertain* waits feel 2-3x longer than *known* waits. GateFlow attacks this directly: make wait times visible, keep them current, and give attendees an assistant that can answer questions about their specific situation.

### Architecture Decisions

**Assistant-First Design:** GateFlow puts a Gemini-powered conversational assistant at the center rather than building a traditional ops dashboard. The assistant has access to live venue state via function calling and can reason about the attendee's specific context (ticket, seat section, assigned gate, queue position) to give personalized answers.

**Power-of-Two-Choices Gate Assignment:** On check-in, the system doesn't assign attendees to the globally least-loaded gate, since that causes herd oscillation. Instead, it randomly samples two gates from the attendee's eligible set (based on seat proximity) and picks the less-loaded one. This algorithm reduces max queue length from O(log n) to O(log log n) with no coordination overhead.

**Proximity-Weighted Scoring:** Each seating section maps to multiple gates with a proximity score (0.0-1.0). The assignment algorithm weighs both queue length and walking distance, so an attendee in Section 112 won't get routed to the opposite side of the stadium to save 3 minutes of waiting but add 15 minutes of walking.

**EMA-Based Wait Estimation:** Wait times use an Exponential Moving Average (a=0.3) of per-entry processing time at each gate. This weights recent throughput more heavily (so it adapts quickly to lane closures or scanner issues) while smoothing out individual outliers (one slow family doesn't spike the estimate for everyone behind them).

### Google Services Integration

| Service | Role | Why This Service |
|---------|------|------------------|
| **Gemini API** (gemini-2.5-flash) | Conversational assistant with function calling | Powers contextual Q&A: "How long is my wait?", "Where do I go?", "Tell me something about the teams." Function calling lets Gemini invoke gate assignment, queue lookups, and directions dynamically. |
| **Google Maps JavaScript API** | Interactive venue map with gate markers and walking routes | Attendees see their assigned gate on a real map with a walking route from their current location. Directions come from the Maps Directions Service. |
| **Cloud Firestore** | Real-time queue state database | Firestore's real-time listeners (`onSnapshot`) push queue updates to the client without polling or custom SSE infrastructure. Each gate document holds live queue length and EMA metrics. |
| **Firebase Authentication** | Anonymous auth for ticket-holder sessions | Provides a secure session identity without requiring account creation. The anonymous UID links to the attendee's ticket for the duration of the event. |

## How the Solution Works

### 1. Check-In Flow

```
Attendee opens app -> Enters ticket barcode -> App verifies geolocation (within 200m of venue)
-> Assignment engine runs Power-of-Two-Choices -> Gate assigned -> Chat interface opens
```

The check-in endpoint validates the ticket, confirms the attendee is physically near the venue via the Geolocation API, and runs the gate assignment algorithm. The response includes the assigned gate, initial queue position, and estimated wait time.

### 2. Real-Time Queue Updates

Firestore documents at `events/{eventId}/gates/{gateId}` hold live queue state:

```
{
  queueLength: 142,
  emaSecondsPerEntry: 8.3,
  estimatedWaitMinutes: 19.6,
  lastUpdatedAt: Timestamp
}
```

The client subscribes to real-time updates on the assigned gate document. When a checkpoint scanner processes an entry, a Cloud Function decrements the queue count, recalculates the EMA, and writes back, triggering an instant push to all subscribed clients.

### 3. Conversational Assistant

The Gemini-powered assistant is configured with four callable functions:

| Function | Trigger | Response |
|----------|---------|----------|
| `getQueueStatus` | "How long is my wait?" | Fetches live Firestore data, returns personalized ETA |
| `getDirections` | "Where is my gate?" / "How do I get there?" | Calls Google Maps Directions API, returns step-by-step walking directions |
| `getVenueTrivia` | "Tell me something interesting" | Returns contextual trivia about teams, venue history, or matchup stats |
| `requestReassignment` | "Can I switch gates?" | Re-runs assignment algorithm, offers alternative if a shorter queue exists |

The assistant maintains conversation context, so follow-up questions work naturally:
> **User:** "How long is my wait?"  
> **Assistant:** "Gate N2 currently has 87 people ahead of you. At the current pace, you're looking at about 12 minutes."  
> **User:** "Is there anything faster?"  
> **Assistant:** "Gate N3 has a 9-minute wait, but it's a 6-minute walk from your current position. Want me to switch you?"

### 4. Venue Map

The Google Maps component shows:
- Gate locations as custom markers (color-coded by congestion: green/yellow/red)
- The attendee's current location
- A walking route polyline from current position to assigned gate
- Tap-to-switch: tapping another gate marker shows its queue status and offers reassignment

## Assumptions

1. **Venue operators pre-configure gate and section data** in Firestore before the event. The system does not handle venue setup; it consumes a known data structure.
2. **Checkpoint scanners are external hardware** that call a REST endpoint on each barcode scan. GateFlow does not manage scanner hardware.
3. **GPS accuracy is sufficient at a 200m radius.** Indoor positioning via BLE beacons is deferred to a future version.
4. **Attendees have smartphones with data connectivity.** No offline fallback in MVP.
5. **The MVP handles a single active event per venue.** Multi-event support is a future enhancement.
6. **Queue counts in Firestore are eventually consistent** with a lag under 2 seconds. Acceptable for wait-time estimation; not suitable for security-critical headcounts.
7. **Trivia content is pre-loaded** as static data keyed to event/team IDs, not generated dynamically by Gemini.

## Project Structure

```
gateflow/
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout with providers
│   ├── page.tsx                # Check-in landing page
│   ├── dashboard/
│   │   └── page.tsx            # Main assistant + map view
│   └── api/
│       ├── checkin/route.ts    # Check-in + gate assignment endpoint
│       ├── scan/route.ts       # Checkpoint scan ingestion
│       └── chat/route.ts       # Gemini function-calling endpoint
├── components/
│   ├── ChatInterface.tsx       # Conversational assistant UI
│   ├── VenueMap.tsx            # Google Maps with gate markers
│   ├── QueueCard.tsx           # Live wait-time display
│   └── CheckInForm.tsx         # Ticket barcode entry + geolocation
├── lib/
│   ├── assignment.ts           # Power-of-Two-Choices algorithm
│   ├── ema.ts                  # EMA calculation logic
│   ├── firebase.ts             # Firestore + Auth initialization
│   ├── gemini.ts               # Gemini client + function definitions
│   └── maps.ts                 # Google Maps loader + helpers
├── __tests__/
│   ├── assignment.test.ts      # Unit tests for gate assignment
│   ├── ema.test.ts             # Unit tests for EMA calculation
│   └── checkin.test.ts         # Integration tests for check-in flow
├── .env.example                # Required environment variables
├── AGENTS.md                   # Antigravity agent context
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

## Running Locally

```bash
# Install dependencies
npm install

# Copy environment template and add your API keys
cp .env.example .env.local

# Required keys:
# GOOGLE_GEMINI_API_KEY       (from Google AI Studio)
# NEXT_PUBLIC_MAPS_API_KEY    (from Google Cloud Console, Maps JavaScript API enabled)
# FIREBASE_PROJECT_ID         (from Firebase Console)
# FIREBASE_CLIENT_EMAIL       (from Firebase service account)
# FIREBASE_PRIVATE_KEY        (from Firebase service account)

# Seed Firestore with sample venue data
npm run seed

# Start development server
npm run dev
```

## Testing

```bash
# Unit tests (assignment algorithm, EMA logic)
npm test

# Run with coverage
npm run test:coverage
```

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **AI:** Google Gemini 2.5 Flash (function calling)
- **Maps:** Google Maps JavaScript API
- **Database:** Cloud Firestore (real-time listeners)
- **Auth:** Firebase Authentication (anonymous)
- **Testing:** Vitest
- **Deployment:** Google Antigravity / Vercel
