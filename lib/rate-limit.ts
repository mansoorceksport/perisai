/**
 * Per-identity rate limiting for the Gemini-backed routes.
 *
 * These endpoints spend model quota on every call, so an unmetered caller can
 * exhaust it and deny service to real users. Limits are keyed on the verified
 * `uid` from the ID token — never on anything client-supplied such as an IP
 * header or a body field, both of which the caller controls.
 *
 * SCOPE AND LIMITATION — read before relying on this.
 *
 * State is in-process. Cloud Run runs multiple instances and scales to zero, so
 * the effective ceiling is `limit x instances`, and a cold start resets the
 * window. This raises the cost of abuse substantially and stops the common
 * cases (a runaway client, a single script in a loop); it is NOT a hard global
 * quota. A distributed store (Firestore counters, Memorystore) is the upgrade
 * path if a hard guarantee is needed — the call sites do not change, only this
 * module's internals.
 */

export interface RateLimitRule {
  /** Maximum requests permitted inside the window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms at which the oldest counted request falls out of the window. */
  resetAt: number;
  /** Seconds the caller should wait. 0 when allowed. */
  retryAfterSeconds: number;
}

/** Per-route budgets. Sized for a person working through their own case. */
export const RATE_LIMITS: Record<string, RateLimitRule> = {
  'conduct:analyze': { limit: 15, windowMs: 5 * 60_000 },
  'conduct:followup': { limit: 15, windowMs: 5 * 60_000 },
  'complaint:draft': { limit: 10, windowMs: 5 * 60_000 },
};

/** key -> ascending request timestamps inside the current window. */
const hits = new Map<string, number[]>();

/**
 * Drops keys whose entries have all aged out, so an instance that has served
 * many users does not retain their keys forever. Runs opportunistically rather
 * than on a timer: background timers are unreliable in a scale-to-zero runtime.
 */
const SWEEP_EVERY = 500;
let callsSinceSweep = 0;

function sweep(now: number, maxWindowMs: number): void {
  const cutoff = now - maxWindowMs;
  for (const [key, timestamps] of hits) {
    if (timestamps.length === 0 || timestamps[timestamps.length - 1]! <= cutoff) {
      hits.delete(key);
    }
  }
}

/**
 * Records a request against `key` and reports whether it is permitted.
 * A rejected request is NOT recorded, so a caller who backs off recovers
 * exactly one window after their first counted request rather than being held
 * out indefinitely by their own retries.
 */
export function checkRateLimit(key: string, rule: RateLimitRule): RateLimitResult {
  const now = Date.now();
  const cutoff = now - rule.windowMs;

  if (++callsSinceSweep >= SWEEP_EVERY) {
    callsSinceSweep = 0;
    sweep(now, Math.max(...Object.values(RATE_LIMITS).map((r) => r.windowMs), rule.windowMs));
  }

  let timestamps = hits.get(key);
  if (!timestamps) {
    timestamps = [];
    hits.set(key, timestamps);
  }

  // Drop entries that have aged out of the window.
  let firstFresh = 0;
  while (firstFresh < timestamps.length && timestamps[firstFresh]! <= cutoff) {
    firstFresh++;
  }
  if (firstFresh > 0) timestamps.splice(0, firstFresh);

  if (timestamps.length >= rule.limit) {
    const resetAt = timestamps[0]! + rule.windowMs;
    return {
      allowed: false,
      limit: rule.limit,
      remaining: 0,
      resetAt,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
    };
  }

  timestamps.push(now);
  return {
    allowed: true,
    limit: rule.limit,
    remaining: rule.limit - timestamps.length,
    resetAt: timestamps[0]! + rule.windowMs,
    retryAfterSeconds: 0,
  };
}

/** Standard headers so a client can back off without guessing. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'RateLimit-Limit': String(result.limit),
    'RateLimit-Remaining': String(result.remaining),
    'RateLimit-Reset': String(Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000))),
  };
  if (!result.allowed) {
    headers['Retry-After'] = String(result.retryAfterSeconds);
  }
  return headers;
}

/** Test seam. Not used by request handling. */
export function __resetRateLimitState(): void {
  hits.clear();
  callsSinceSweep = 0;
}
