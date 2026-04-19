/**
 * lib/firebase.ts  —  Firebase Admin SDK (server-side only)
 *
 * Lazy-initializes the Admin app once and caches both Firestore and Auth
 * instances. The `admin.apps` guard handles Next.js hot-reload re-execution.
 *
 * Import this file only from API routes or Server Components.
 */

import "server-only";

import admin from "firebase-admin";
import type { App as AdminApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import type { Auth } from "firebase-admin/auth";

// ─── Lazy app singleton ───────────────────────────────────────────────────────

function initAdminApp(): AdminApp {
  // Return existing app on hot-reload re-execution
  if (admin.apps.length > 0 && admin.apps[0]) {
    return admin.apps[0];
  }

  const projectId = process.env["FIREBASE_PROJECT_ID"];
  const clientEmail = process.env["FIREBASE_CLIENT_EMAIL"];
  const privateKey = process.env["FIREBASE_PRIVATE_KEY"];

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_PROJECT_ID, " +
        "FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in .env.local.",
    );
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey: privateKey.replace(/\\n/g, "\n"),
    }),
  });
}

// ─── Cached instances ─────────────────────────────────────────────────────────

let _db: Firestore | undefined;
let _auth: Auth | undefined;

/** Server-side Firestore instance (Admin SDK — full privileged access). */
export function adminDb(): Firestore {
  if (!_db) _db = getFirestore(initAdminApp());
  return _db;
}

/** Server-side Firebase Auth instance (Admin SDK). */
export function adminAuth(): Auth {
  if (!_auth) _auth = getAuth(initAdminApp());
  return _auth;
}

// Backward-compatible alias used by existing API routes
export { adminDb as getAdminDb };
