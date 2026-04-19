/**
 * scripts/seed.ts
 *
 * Populates Firestore with sample data for the GateFlow demo event.
 * Run via:  npm run seed
 *
 * The script is IDEMPOTENT — it checks whether the top-level event document
 * already exists and skips seeding if it does.  Pass --force to overwrite.
 */

import * as admin from "firebase-admin";
import type { Firestore, WriteBatch } from "firebase-admin/firestore";
import { getFirestore } from "firebase-admin/firestore";

// ─── Init ─────────────────────────────────────────────────────────────────────

const FORCE = process.argv.includes("--force");

function initAdmin(): void {
  if (admin.apps.length > 0) return;

  const projectId = process.env["FIREBASE_PROJECT_ID"];
  const clientEmail = process.env["FIREBASE_CLIENT_EMAIL"];
  const privateKey = process.env["FIREBASE_PRIVATE_KEY"];

  if (!projectId || !clientEmail || !privateKey) {
    console.error(
      "❌  Missing Firebase credentials.\n" +
        "    Ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and " +
        "FIREBASE_PRIVATE_KEY are set in .env.local"
    );
    process.exit(1);
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    }),
  });
}

// ─── IDs ──────────────────────────────────────────────────────────────────────

const VENUE_ID = "national-stadium-delhi";
const EVENT_ID = "ipl-final-2026";

// ─── Venue ────────────────────────────────────────────────────────────────────

const VENUE = {
  name: "National Stadium — Delhi",
  city: "Delhi",
  country: "India",
  geofenceLat: 28.6129,
  geofenceLng: 77.2295,
  geofenceRadiusM: 200,
  capacity: 75_000,
};

// ─── Zones ────────────────────────────────────────────────────────────────────

const ZONES = [
  { id: "zone-north", name: "North Zone" },
  { id: "zone-south", name: "South Zone" },
  { id: "zone-east",  name: "East Zone"  },
  { id: "zone-west",  name: "West Zone"  },
] as const;

type ZoneId = typeof ZONES[number]["id"];

// ─── Gates (3-4 per zone, 14 total) ──────────────────────────────────────────

interface GateSeed {
  id: string;
  name: string;
  zoneId: ZoneId;
  maxThroughputPerMin: number;
  lat: number;
  lng: number;
}

const GATES: GateSeed[] = [
  // North Zone — 4 gates
  { id: "gate-n1", name: "Gate N1", zoneId: "zone-north", maxThroughputPerMin: 8, lat: 28.6145, lng: 77.2275 },
  { id: "gate-n2", name: "Gate N2", zoneId: "zone-north", maxThroughputPerMin: 6, lat: 28.6148, lng: 77.2290 },
  { id: "gate-n3", name: "Gate N3", zoneId: "zone-north", maxThroughputPerMin: 7, lat: 28.6150, lng: 77.2305 },
  { id: "gate-n4", name: "Gate N4", zoneId: "zone-north", maxThroughputPerMin: 5, lat: 28.6147, lng: 77.2318 },
  // South Zone — 4 gates
  { id: "gate-s1", name: "Gate S1", zoneId: "zone-south", maxThroughputPerMin: 7, lat: 28.6113, lng: 77.2278 },
  { id: "gate-s2", name: "Gate S2", zoneId: "zone-south", maxThroughputPerMin: 8, lat: 28.6110, lng: 77.2295 },
  { id: "gate-s3", name: "Gate S3", zoneId: "zone-south", maxThroughputPerMin: 6, lat: 28.6112, lng: 77.2310 },
  { id: "gate-s4", name: "Gate S4", zoneId: "zone-south", maxThroughputPerMin: 5, lat: 28.6115, lng: 77.2322 },
  // East Zone — 3 gates
  { id: "gate-e1", name: "Gate E1", zoneId: "zone-east",  maxThroughputPerMin: 8, lat: 28.6122, lng: 77.2330 },
  { id: "gate-e2", name: "Gate E2", zoneId: "zone-east",  maxThroughputPerMin: 6, lat: 28.6130, lng: 77.2335 },
  { id: "gate-e3", name: "Gate E3", zoneId: "zone-east",  maxThroughputPerMin: 7, lat: 28.6138, lng: 77.2332 },
  // West Zone — 3 gates
  { id: "gate-w1", name: "Gate W1", zoneId: "zone-west",  maxThroughputPerMin: 7, lat: 28.6122, lng: 77.2258 },
  { id: "gate-w2", name: "Gate W2", zoneId: "zone-west",  maxThroughputPerMin: 8, lat: 28.6130, lng: 77.2253 },
  { id: "gate-w3", name: "Gate W3", zoneId: "zone-west",  maxThroughputPerMin: 5, lat: 28.6138, lng: 77.2256 },
];

// ─── Sections (20 total, each mapped to 2 zones) ──────────────────────────────

interface ZoneMapping {
  zoneId: ZoneId;
  proximityScore: number; // 0–1, higher = physically closer
}

interface SectionSeed {
  id: string;
  name: string;
  zoneMappings: ZoneMapping[];
  stand: string;
}

const SECTIONS: SectionSeed[] = [
  // North Stand (sections 101–105): primary North, secondary East/West
  { id: "101", name: "Block 101 — North Upper",   stand: "North", zoneMappings: [{ zoneId: "zone-north", proximityScore: 1.0 }, { zoneId: "zone-east",  proximityScore: 0.4 }] },
  { id: "102", name: "Block 102 — North Upper",   stand: "North", zoneMappings: [{ zoneId: "zone-north", proximityScore: 0.9 }, { zoneId: "zone-east",  proximityScore: 0.5 }] },
  { id: "103", name: "Block 103 — North Lower",   stand: "North", zoneMappings: [{ zoneId: "zone-north", proximityScore: 1.0 }, { zoneId: "zone-west",  proximityScore: 0.4 }] },
  { id: "104", name: "Block 104 — North Lower",   stand: "North", zoneMappings: [{ zoneId: "zone-north", proximityScore: 0.9 }, { zoneId: "zone-west",  proximityScore: 0.5 }] },
  { id: "105", name: "Block 105 — North VIP",     stand: "North", zoneMappings: [{ zoneId: "zone-north", proximityScore: 0.8 }, { zoneId: "zone-east",  proximityScore: 0.3 }] },
  // South Stand (sections 201–205)
  { id: "201", name: "Block 201 — South Upper",   stand: "South", zoneMappings: [{ zoneId: "zone-south", proximityScore: 1.0 }, { zoneId: "zone-east",  proximityScore: 0.4 }] },
  { id: "202", name: "Block 202 — South Upper",   stand: "South", zoneMappings: [{ zoneId: "zone-south", proximityScore: 0.9 }, { zoneId: "zone-west",  proximityScore: 0.4 }] },
  { id: "203", name: "Block 203 — South Lower",   stand: "South", zoneMappings: [{ zoneId: "zone-south", proximityScore: 1.0 }, { zoneId: "zone-east",  proximityScore: 0.3 }] },
  { id: "204", name: "Block 204 — South Lower",   stand: "South", zoneMappings: [{ zoneId: "zone-south", proximityScore: 0.9 }, { zoneId: "zone-west",  proximityScore: 0.5 }] },
  { id: "205", name: "Block 205 — South VIP",     stand: "South", zoneMappings: [{ zoneId: "zone-south", proximityScore: 0.8 }, { zoneId: "zone-west",  proximityScore: 0.3 }] },
  // East Stand (sections 301–305)
  { id: "301", name: "Block 301 — East Upper",    stand: "East",  zoneMappings: [{ zoneId: "zone-east",  proximityScore: 1.0 }, { zoneId: "zone-north", proximityScore: 0.4 }] },
  { id: "302", name: "Block 302 — East Upper",    stand: "East",  zoneMappings: [{ zoneId: "zone-east",  proximityScore: 0.9 }, { zoneId: "zone-south", proximityScore: 0.4 }] },
  { id: "303", name: "Block 303 — East Lower",    stand: "East",  zoneMappings: [{ zoneId: "zone-east",  proximityScore: 1.0 }, { zoneId: "zone-north", proximityScore: 0.5 }] },
  { id: "304", name: "Block 304 — East Lower",    stand: "East",  zoneMappings: [{ zoneId: "zone-east",  proximityScore: 0.9 }, { zoneId: "zone-south", proximityScore: 0.5 }] },
  { id: "305", name: "Block 305 — East Press Box",stand: "East",  zoneMappings: [{ zoneId: "zone-east",  proximityScore: 0.7 }, { zoneId: "zone-north", proximityScore: 0.3 }] },
  // West Stand (sections 401–405)
  { id: "401", name: "Block 401 — West Upper",    stand: "West",  zoneMappings: [{ zoneId: "zone-west",  proximityScore: 1.0 }, { zoneId: "zone-north", proximityScore: 0.4 }] },
  { id: "402", name: "Block 402 — West Upper",    stand: "West",  zoneMappings: [{ zoneId: "zone-west",  proximityScore: 0.9 }, { zoneId: "zone-south", proximityScore: 0.4 }] },
  { id: "403", name: "Block 403 — West Lower",    stand: "West",  zoneMappings: [{ zoneId: "zone-west",  proximityScore: 1.0 }, { zoneId: "zone-north", proximityScore: 0.5 }] },
  { id: "404", name: "Block 404 — West Lower",    stand: "West",  zoneMappings: [{ zoneId: "zone-west",  proximityScore: 0.9 }, { zoneId: "zone-south", proximityScore: 0.5 }] },
  { id: "405", name: "Block 405 — West Pavilion", stand: "West",  zoneMappings: [{ zoneId: "zone-west",  proximityScore: 0.8 }, { zoneId: "zone-south", proximityScore: 0.3 }] },
];

// ─── Tickets (50 total) ───────────────────────────────────────────────────────

function randomElement<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function generateBarcode(index: number): string {
  return `IPL2026-${String(index).padStart(4, "0")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

const ROWS = ["A", "B", "C", "D", "E", "F", "G", "H", "J", "K"];

function makeTickets() {
  return Array.from({ length: 50 }, (_, i) => ({
    barcode: generateBarcode(i + 1),
    seatSection: randomElement(SECTIONS).id,
    seatRow: randomElement(ROWS),
    seatNumber: Math.floor(Math.random() * 30) + 1,
    userId: null,
    status: "booked" as const,
    assignedGateId: null,
    checkedInAt: null,
    enteredAt: null,
  }));
}

// ─── Trivia ───────────────────────────────────────────────────────────────────

const TRIVIA = [
  {
    fact: "The IPL was founded in 2008 by the BCCI and has grown into one of the most-watched cricket leagues in the world.",
    category: "IPL History",
    emoji: "🏏",
  },
  {
    fact: "The highest individual score in an IPL match is 175* by Chris Gayle, scored in just 66 balls.",
    category: "Records",
    emoji: "💥",
  },
  {
    fact: "Mumbai Indians are the most successful IPL franchise, having won the title five times.",
    category: "IPL History",
    emoji: "🏆",
  },
  {
    fact: "The D-Day Oval in Melbourne holds the record for the largest cricket crowd — 93,013 fans at the 2015 World Cup final.",
    category: "Venue",
    emoji: "🌏",
  },
  {
    fact: "Virat Kohli holds the record for the most runs in IPL history, surpassing 8,000 runs in the tournament.",
    category: "Records",
    emoji: "📊",
  },
  {
    fact: "Delhi's Arun Jaitley Stadium has hosted international matches since 1987, including the historic 1996 World Cup.",
    category: "Venue",
    emoji: "🏟️",
  },
  {
    fact: "The fastest ball ever bowled in an IPL match was 157.7 km/h by Anrich Nortje playing for Delhi Capitals.",
    category: "Records",
    emoji: "⚡",
  },
  {
    fact: "Over 768 million viewers tuned in to watch IPL 2023, making it one of the most-watched sporting events globally.",
    category: "IPL History",
    emoji: "📺",
  },
  {
    fact: "GateFlow uses AI to reduce average gate entry time by up to 40% compared to traditional queue management.",
    category: "GateFlow",
    emoji: "🤖",
  },
  {
    fact: "The Exponential Moving Average algorithm used by GateFlow adapts to changing crowd speeds in real time, updated with every scan.",
    category: "GateFlow",
    emoji: "📈",
  },
];

// ─── Seeder ───────────────────────────────────────────────────────────────────

async function checkAlreadySeeded(db: Firestore): Promise<boolean> {
  const doc = await db.doc(`events/${EVENT_ID}`).get();
  return doc.exists;
}

/** Write all docs in a collection, flushing every 499 ops (Firestore batch limit). */
async function batchSet(
  db: Firestore,
  writes: Array<{ path: string; data: Record<string, unknown> }>
): Promise<void> {
  const BATCH_LIMIT = 499;
  let batch: WriteBatch = db.batch();
  let count = 0;

  for (const { path, data } of writes) {
    batch.set(db.doc(path), data);
    count++;

    if (count % BATCH_LIMIT === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }

  if (count % BATCH_LIMIT !== 0) {
    await batch.commit();
  }
}

async function seed(): Promise<void> {
  initAdmin();
  const db = getFirestore();

  // ─── Idempotency check ──────────────────────────────────────────────────
  if (!FORCE && (await checkAlreadySeeded(db))) {
    console.log(
      `ℹ️  Event "${EVENT_ID}" already exists in Firestore. Skipping seed.\n` +
        `   Pass --force to overwrite: npm run seed -- --force`
    );
    process.exit(0);
  }

  console.log("🌱  Seeding Firestore...\n");

  const writes: Array<{ path: string; data: Record<string, unknown> }> = [];

  // ─── 1. Venue ────────────────────────────────────────────────────────────
  writes.push({ path: `venues/${VENUE_ID}`, data: VENUE });
  console.log(`   ✔  Venue: ${VENUE.name}`);

  // ─── 2. Zones ────────────────────────────────────────────────────────────
  for (const zone of ZONES) {
    writes.push({
      path: `venues/${VENUE_ID}/zones/${zone.id}`,
      data: { name: zone.name },
    });
  }
  console.log(`   ✔  Zones: ${ZONES.length}`);

  // ─── 3. Sections ─────────────────────────────────────────────────────────
  for (const section of SECTIONS) {
    writes.push({
      path: `venues/${VENUE_ID}/sections/${section.id}`,
      data: {
        name: section.name,
        stand: section.stand,
        zoneMappings: section.zoneMappings,
      },
    });
  }
  console.log(`   ✔  Sections: ${SECTIONS.length}`);

  // ─── 4. Event ────────────────────────────────────────────────────────────
  const now = new Date();
  const gatesOpenAt = new Date(now);
  gatesOpenAt.setHours(16, 0, 0, 0); // Gates open 4 PM today
  const eventStartAt = new Date(now);
  eventStartAt.setHours(19, 30, 0, 0); // Match starts 7:30 PM today

  const EVENT = {
    name: "IPL Final 2026",
    venueId: VENUE_ID,
    season: 2026,
    homeTeam: "Mumbai Indians",
    awayTeam: "Chennai Super Kings",
    gatesOpenAt: admin.firestore.Timestamp.fromDate(gatesOpenAt),
    eventStartAt: admin.firestore.Timestamp.fromDate(eventStartAt),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };

  writes.push({ path: `events/${EVENT_ID}`, data: EVENT as unknown as Record<string, unknown> });
  console.log(`   ✔  Event: ${EVENT.name}`);

  // ─── 5. Gates ────────────────────────────────────────────────────────────
  for (const gate of GATES) {
    writes.push({
      path: `events/${EVENT_ID}/gates/${gate.id}`,
      data: {
        name: gate.name,
        zoneId: gate.zoneId,
        maxThroughputPerMin: gate.maxThroughputPerMin,
        isActive: true,
        queueLength: 0,
        emaSecondsPerEntry: 10,
        estimatedWaitMinutes: 0,
        lat: gate.lat,
        lng: gate.lng,
        lastUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      } as unknown as Record<string, unknown>,
    });
  }
  console.log(`   ✔  Gates: ${GATES.length}`);

  // ─── 6. Tickets ──────────────────────────────────────────────────────────
  const tickets = makeTickets();
  for (const ticket of tickets) {
    // Use barcode as doc ID for easy lookup
    writes.push({
      path: `events/${EVENT_ID}/tickets/${ticket.barcode}`,
      data: ticket as unknown as Record<string, unknown>,
    });
  }
  console.log(`   ✔  Tickets: ${tickets.length}`);

  // Print a few sample barcodes so they can be tested
  const sample = tickets.slice(0, 5);
  console.log("\n   📋  Sample barcodes for testing:");
  for (const t of sample) {
    console.log(`      ${t.barcode}  (Section ${t.seatSection}, Row ${t.seatRow}, Seat ${t.seatNumber})`);
  }

  // ─── 7. Trivia ───────────────────────────────────────────────────────────
  for (let i = 0; i < TRIVIA.length; i++) {
    writes.push({
      path: `events/${EVENT_ID}/trivia/trivia-${String(i + 1).padStart(2, "0")}`,
      data: {
        ...TRIVIA[i],
        order: i + 1,
      } as Record<string, unknown>,
    });
  }
  console.log(`   ✔  Trivia: ${TRIVIA.length}`);

  // ─── Flush all writes ─────────────────────────────────────────────────────
  console.log(`\n   Writing ${writes.length} documents to Firestore…`);
  await batchSet(db, writes);

  console.log("\n✅  Seed complete!\n");
  console.log(`   Event ID : ${EVENT_ID}`);
  console.log(`   Venue ID : ${VENUE_ID}`);
  console.log(`   App URL  : http://localhost:3000\n`);
}

seed().catch((err: unknown) => {
  console.error("❌  Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
