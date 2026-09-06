import { NextResponse } from 'next/server';
import { verifyAuthToken } from './firebase-admin';
import { RATE_LIMITS, checkRateLimit, rateLimitHeaders } from './rate-limit';
import { Language } from './types';

/**
 * Auth + rate-limit gate for the Gemini-backed routes.
 *
 * These endpoints spend model quota on every call and were previously
 * unauthenticated while the service is deployed --allow-unauthenticated, so
 * anyone could drain the quota and deny service to real users. Every one of
 * them now proves identity first and is then metered against the verified uid.
 *
 * Returns either the caller's identity or a ready-to-send error response.
 * Handlers must return `denied` untouched — never continue past it.
 */
export type GuardOutcome =
  | {
      ok: true;
      uid: string;
      email: string | null;
      /** Attach to the success response so clients can back off before the wall. */
      headers: Record<string, string>;
    }
  | { ok: false; denied: NextResponse };

export async function guardModelRoute(
  req: Request,
  routeKey: keyof typeof RATE_LIMITS | string,
  lang: Language
): Promise<GuardOutcome> {
  let authUser: { uid: string; email: string | null };
  try {
    authUser = await verifyAuthToken(req);
  } catch {
    // Deliberately generic: do not disclose whether the token was absent,
    // malformed, expired or for an unknown user.
    return {
      ok: false,
      denied: NextResponse.json(
        {
          error:
            lang === 'en'
              ? 'Sign-in required. Please reload the page and sign in again.'
              : 'Anda perlu masuk kembali. Silakan muat ulang halaman lalu masuk lagi.',
          code: 'unauthenticated',
        },
        { status: 401 }
      ),
    };
  }

  const rule = RATE_LIMITS[routeKey];
  if (!rule) {
    // An unknown route key means a coding error, not a caller problem. Fail
    // closed rather than silently serving an unmetered endpoint.
    console.error(`No rate limit rule configured for route key "${routeKey}".`);
    return {
      ok: false,
      denied: NextResponse.json(
        { error: 'Internal configuration error.', code: 'misconfigured' },
        { status: 500 }
      ),
    };
  }

  // Keyed on the verified uid — never on a client-supplied header or body field.
  const result = checkRateLimit(`${routeKey}:${authUser.uid}`, rule);
  if (!result.allowed) {
    return {
      ok: false,
      denied: NextResponse.json(
        {
          error:
            lang === 'en'
              ? `Too many requests. Please wait ${result.retryAfterSeconds} seconds and try again.`
              : `Terlalu banyak permintaan. Mohon tunggu ${result.retryAfterSeconds} detik lalu coba lagi.`,
          code: 'rate_limited',
          retry_after_seconds: result.retryAfterSeconds,
        },
        { status: 429, headers: rateLimitHeaders(result) }
      ),
    };
  }

  return {
    ok: true,
    uid: authUser.uid,
    email: authUser.email,
    headers: rateLimitHeaders(result),
  };
}
