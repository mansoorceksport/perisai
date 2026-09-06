/**
 * Gate for the demo-preview token bypass.
 *
 * A demo token is an *unauthenticated identity assertion*: whoever sends
 * `Authorization: Bearer demo-preview-token:<uid>` becomes <uid>, with no
 * signature to verify. That is only ever acceptable on a local machine, and
 * only when someone has deliberately switched it on.
 *
 * Kept in its own module, free of the Firebase Admin SDK, so the gate can be
 * tested directly without initialising an admin app.
 *
 * Both conditions below are POSITIVE assertions. An unset, empty, or misspelled
 * variable therefore leaves the bypass OFF. The previous guard was
 * `NODE_ENV !== 'production'`, which failed the other way: with NODE_ENV unset
 * it evaluated true and enabled the bypass. Safe had to be configured; unsafe
 * was the default. This inverts that.
 *
 * Read at call time rather than at module load so the value cannot be frozen
 * into a build artifact.
 */
export const DEMO_TOKEN_PREFIX = 'demo-preview-token:';

export function isDemoAuthEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV === 'development' && env.ALLOW_DEMO_AUTH === 'true';
}

/**
 * Resolves a demo token to a uid, or null if the bypass is disabled or the
 * token is not a demo token.
 *
 * A demo token presented while the bypass is off is rejected like any other
 * invalid token: the caller learns nothing about why.
 */
export function resolveDemoToken(
  token: string,
  env: NodeJS.ProcessEnv = process.env
): { uid: string; email: string | null } | null {
  if (!token.startsWith(DEMO_TOKEN_PREFIX)) return null;
  if (!isDemoAuthEnabled(env)) return null;

  const uid = token.slice(DEMO_TOKEN_PREFIX.length).trim();
  if (!uid) return null;

  console.warn(
    `[SECURITY] Unverified demo token accepted for uid "${uid}". ` +
      'This bypasses Firebase token verification and must never be enabled outside local development.'
  );

  return { uid, email: 'user@example.com' };
}
