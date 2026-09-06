import { getApps, initializeApp, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { resolveDemoToken } from './demo-auth';

// Initialize Firebase Admin with Application Default Credentials (ADC)
// Never hardcode or bundle a service account key.
/**
 * Resolved from environment only. On Cloud Run, GOOGLE_CLOUD_PROJECT is
 * present automatically; leaving projectId undefined is also safe, because
 * Application Default Credentials carry the project. No identifier is
 * hardcoded here, so this file works unchanged against any project.
 */
const projectId =
  process.env.GOOGLE_CLOUD_PROJECT ||
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  undefined;

const firestoreDatabaseId =
  process.env.FIREBASE_DATABASE_ID || process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || undefined;

function getAdminApp(): App {
  const currentApps = getApps();
  if (currentApps.length > 0 && currentApps[0]) {
    return currentApps[0];
  }

  return initializeApp({
    projectId,
  });
}

export const adminApp: App = getAdminApp();
export const adminAuth: Auth = getAuth(adminApp);
export const adminDb: Firestore = firestoreDatabaseId
  ? getFirestore(adminApp, firestoreDatabaseId)
  : getFirestore(adminApp);

/**
 * Strips all undefined fields before sending to Firestore
 * as required by Directive 8: "Strip all undefined values before any Firestore SDK call."
 */
export function cleanFirestoreData<T extends Record<string, any>>(obj: T): T {
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        cleaned[key] = cleanFirestoreData(value);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned as T;
}

/**
 * Verifies Firebase ID Token strictly from the Authorization: Bearer <token> header.
 * Never trust a client-sent UID.
 */
export async function verifyAuthToken(req: Request): Promise<{ uid: string; email: string | null }> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Unauthorized: Missing or invalid Authorization header.');
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    throw new Error('Unauthorized: Bearer token is empty.');
  }

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: decoded.email || null,
    };
  } catch (err: any) {
    // Local-development escape hatch, off unless explicitly switched on.
    // See lib/demo-auth.ts — the gate is fail-closed, so a missing or wrong
    // environment variable leaves it disabled rather than enabled.
    const demoUser = resolveDemoToken(token);
    if (demoUser) return demoUser;

    throw new Error(`Unauthorized: Invalid ID token (${err?.message || 'Verification failed'}).`);
  }
}
