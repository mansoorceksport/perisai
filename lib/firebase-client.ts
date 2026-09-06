import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as fbSignOut,
  onIdTokenChanged as fbOnIdTokenChanged,
  User,
  Auth,
} from 'firebase/auth';
import { getFirestore, Firestore, doc, getDocFromServer } from 'firebase/firestore';
/**
 * Browser Firebase configuration, supplied entirely by environment.
 *
 * These are identifiers, not credentials — Next inlines every NEXT_PUBLIC_*
 * value into the client bundle, which is exactly what the Firebase Web SDK
 * needs in order to reach Identity Toolkit before any user is signed in. They
 * are kept out of the repository so the tree carries no key-shaped strings;
 * what actually protects the project is firestore.rules, the Firebase Auth
 * authorized-domain list, and the API key's HTTP-referrer restriction.
 *
 * Each variable is read as a literal static property access. Next only
 * substitutes NEXT_PUBLIC_* at build time when referenced this way — building
 * the name dynamically yields undefined in the browser.
 *
 * Because they are inlined at BUILD time, a Cloud Run source deploy must pass
 * them with --set-build-env-vars, not only --set-env-vars. See deploy.sh.
 */
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

/** Named Firestore database; undefined selects (default). */
const firestoreDatabaseId = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID || undefined;

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId
);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (isFirebaseConfigured) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  auth = getAuth(app);
  if (firestoreDatabaseId) {
    db = getFirestore(app, firestoreDatabaseId);
  } else {
    db = getFirestore(app);
  }

  if (typeof window !== 'undefined' && db) {
    getDocFromServer(doc(db, 'test', 'connection')).catch((error) => {
      if (error instanceof Error && error.message.includes('the client is offline')) {
        console.warn('Firebase client is offline or connection pending.');
      }
    });
  }
}

export { auth, db };

export async function signInWithGoogle(): Promise<{ user: User | { uid: string; email: string | null; displayName: string | null }; token: string }> {
  if (auth && isFirebaseConfigured) {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const credential = await signInWithPopup(auth, provider);
    const token = await credential.user.getIdToken();
    return { user: credential.user, token };
  }

  // Fallback for preview container when client credentials are being configured
  const demoUser = {
    uid: 'demo-user-perisai',
    email: 'warga.terlindungi@perisai.id',
    displayName: 'Warga Terlindungi',
  };
  const demoToken = `demo-preview-token:${demoUser.uid}`;
  
  if (typeof window !== 'undefined') {
    localStorage.setItem('perisai_demo_user', JSON.stringify(demoUser));
    localStorage.setItem('perisai_demo_token', demoToken);
  }

  return { user: demoUser, token: demoToken };
}

export async function signOutUser(): Promise<void> {
  if (auth && isFirebaseConfigured) {
    await fbSignOut(auth);
  }
  if (typeof window !== 'undefined') {
    localStorage.removeItem('perisai_demo_user');
    localStorage.removeItem('perisai_demo_token');
  }
}

export interface SessionUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

/**
 * A stored demo session is only honoured where the server could actually accept
 * its token: a development build with no Firebase configuration, which is the
 * only situation in which `signInWithGoogle` mints one.
 *
 * Anywhere else it can only be a leftover. Honouring it produced a state that
 * should not exist — a header reading "signed in" while every write to
 * /api/cases returned 401, forever, because the server rejects unverified demo
 * tokens outside an explicitly enabled local development environment (see
 * lib/demo-auth.ts). A stale session is cleared rather than merely ignored, so
 * the state does not sit around waiting to reappear.
 */
function demoSessionUsable(): boolean {
  return process.env.NODE_ENV === 'development' && !isFirebaseConfigured;
}

function readDemoSession(): { user: SessionUser; token: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const storedUser = localStorage.getItem('perisai_demo_user');
    const storedToken = localStorage.getItem('perisai_demo_token');
    if (!storedUser || !storedToken) return null;
    if (!demoSessionUsable()) {
      localStorage.removeItem('perisai_demo_user');
      localStorage.removeItem('perisai_demo_token');
      return null;
    }
    return { user: JSON.parse(storedUser) as SessionUser, token: storedToken };
  } catch {
    return null;
  }
}

/**
 * Restores and tracks the signed-in session.
 *
 * Firebase persists a real Google sign-in in IndexedDB, so on a page refresh
 * the session is recovered asynchronously — reading localStorage alone reports
 * "signed out" and bounces the user back to the landing screen.
 *
 * Uses onIdTokenChanged rather than onAuthStateChanged so the callback also
 * fires when Firebase silently refreshes the ID token (they expire after an
 * hour), keeping the token used for /api/cases from going stale mid-session.
 *
 * Returns an unsubscribe function.
 */
export function subscribeToSession(
  callback: (user: SessionUser | null, token: string | null) => void
): () => void {
  if (auth && isFirebaseConfigured) {
    return fbOnIdTokenChanged(auth, async (fbUser) => {
      if (fbUser) {
        try {
          const token = await fbUser.getIdToken();
          callback(
            { uid: fbUser.uid, email: fbUser.email, displayName: fbUser.displayName },
            token
          );
        } catch {
          callback(null, null);
        }
        return;
      }
      // No Firebase session. A demo preview session may still be active.
      const demo = readDemoSession();
      callback(demo?.user ?? null, demo?.token ?? null);
    });
  }

  // Firebase not configured: demo preview session only.
  const demo = readDemoSession();
  callback(demo?.user ?? null, demo?.token ?? null);
  return () => {};
}

export async function getCurrentUserToken(): Promise<string | null> {
  if (auth && auth.currentUser) {
    return auth.currentUser.getIdToken();
  }
  // Same gate as the session restore: never hand out a token the server is
  // going to reject, and never let this path disagree with subscribeToSession
  // about whether the caller is signed in.
  return readDemoSession()?.token ?? null;
}
