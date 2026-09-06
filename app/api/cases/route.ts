import { NextRequest, NextResponse } from 'next/server';
import { verifyAuthToken, cleanFirestoreData, adminDb } from '@/lib/firebase-admin';
import { CaseRecord } from '@/lib/types';

/**
 * GET /api/cases
 * Retrieves the current authenticated user's cases.
 * Enforces Directive 3: ID token verified at API route boundary via Firebase Admin SDK.
 * Access is strictly bound to the verified caller's UID.
 */
export async function GET(req: NextRequest) {
  try {
    let authUser: { uid: string; email: string | null };
    try {
      authUser = await verifyAuthToken(req);
    } catch (authErr: any) {
      return NextResponse.json(
        { error: authErr?.message || 'Unauthorized: Token verification failed.' },
        { status: 401 }
      );
    }

    const casesSnapshot = await adminDb
      .collection('users')
      .doc(authUser.uid)
      .collection('cases')
      .orderBy('createdAt', 'desc')
      .limit(20)
      .get();

    const cases: CaseRecord[] = casesSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...(doc.data() as Omit<CaseRecord, 'id'>),
    }));

    return NextResponse.json({ cases });
  } catch (err: any) {
    console.error('Failed to fetch user cases:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error while retrieving cases.' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/cases
 * Persists an evaluation case for the authenticated user.
 * Enforces:
 * - Token verification with Firebase Admin SDK (Directive 3)
 * - Owner-bound isolation (Directive 4)
 * - Defensive stripping of undefined values (Directive 8)
 */
export async function POST(req: NextRequest) {
  try {
    let authUser: { uid: string; email: string | null };
    try {
      authUser = await verifyAuthToken(req);
    } catch (authErr: any) {
      return NextResponse.json(
        { error: authErr?.message || 'Unauthorized: Token verification failed.' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const type = body?.type;
    const input = body?.input;
    const verdict = body?.verdict;
    const lang = body?.lang === 'en' ? 'en' : 'id';

    const validTypes = ['lender_check', 'rate_check', 'conduct_check'];
    if (!type || !validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid or missing case type. Must be lender_check, rate_check, or conduct_check.' },
        { status: 400 }
      );
    }

    if (!input || typeof input !== 'object' || !verdict || typeof verdict !== 'object') {
      return NextResponse.json(
        { error: 'Invalid case payload: input and verdict objects are required.' },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();

    // Prepare case record and strip undefined fields (Directive 8)
    const rawCaseData = {
      userId: authUser.uid,
      type,
      input,
      verdict,
      createdAt: now,
    };
    const cleanedCaseData = cleanFirestoreData(rawCaseData);

    // Update user profile
    const userDocRef = adminDb.collection('users').doc(authUser.uid);
    await userDocRef.set(
      cleanFirestoreData({
        preferredLang: lang,
        lastLogin: now,
        email: authUser.email || undefined,
      }),
      { merge: true }
    );

    // Persist case document
    const caseDocRef = await userDocRef.collection('cases').add(cleanedCaseData);

    const savedCase: CaseRecord = {
      id: caseDocRef.id,
      ...cleanedCaseData,
    } as CaseRecord;

    return NextResponse.json({ success: true, case: savedCase }, { status: 201 });
  } catch (err: any) {
    console.error('Failed to persist case:', err);
    return NextResponse.json(
      { error: err?.message || 'Internal server error while persisting case.' },
      { status: 500 }
    );
  }
}
