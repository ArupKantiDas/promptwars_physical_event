/**
 * lib/firebase.client.ts  —  Firebase Client SDK (browser-side)
 *
 * Lazy-initializes the client Firebase app once and caches Firestore and Auth
 * instances. The `getApps()` guard handles Next.js hot-reload re-execution.
 *
 * Import this file only from 'use client' components or client-side utilities.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";

// ─── Config (public — safe to expose in the browser) ─────────────────────────

const firebaseConfig = {
  apiKey:            process.env["NEXT_PUBLIC_FIREBASE_API_KEY"],
  authDomain:        process.env["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"],
  projectId:         process.env["NEXT_PUBLIC_FIREBASE_PROJECT_ID"],
  storageBucket:     process.env["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"],
  messagingSenderId: process.env["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"],
  appId:             process.env["NEXT_PUBLIC_FIREBASE_APP_ID"],
};

// ─── Lazy app singleton ───────────────────────────────────────────────────────

function initClientApp(): FirebaseApp {
  // Return existing app on hot-reload re-execution
  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

// ─── Cached instances ─────────────────────────────────────────────────────────

let _db: Firestore | undefined;
let _auth: Auth | undefined;

/** Client-side Firestore instance for real-time listeners. */
export function clientDb(): Firestore {
  if (!_db) _db = getFirestore(initClientApp());
  return _db;
}

/** Client-side Firebase Auth instance. */
export function clientAuth(): Auth {
  if (!_auth) _auth = getAuth(initClientApp());
  return _auth;
}

/**
 * Sign in anonymously if no user is currently authenticated.
 * Call once from a top-level component or layout to ensure Firestore rules
 * that require authentication are satisfied for real-time listeners.
 */
export async function ensureAnonymousAuth(): Promise<void> {
  const auth = clientAuth();
  if (!auth.currentUser) {
    await signInAnonymously(auth);
  }
}

// Backward-compatible aliases
export { clientDb as getClientDb, clientAuth as getClientAuth };
