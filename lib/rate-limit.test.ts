import { afterEach, describe, expect, test } from 'bun:test';
import {
  RATE_LIMITS,
  __resetRateLimitState,
  checkRateLimit,
  rateLimitHeaders,
} from './rate-limit';

afterEach(() => __resetRateLimitState());

const RULE = { limit: 3, windowMs: 60_000 };

describe('checkRateLimit', () => {
  test('permits exactly `limit` requests, then rejects', () => {
    const verdicts = [1, 2, 3, 4, 5].map(() => checkRateLimit('k', RULE).allowed);
    expect(verdicts).toEqual([true, true, true, false, false]);
  });

  test('counts down remaining', () => {
    expect(checkRateLimit('k', RULE).remaining).toBe(2);
    expect(checkRateLimit('k', RULE).remaining).toBe(1);
    expect(checkRateLimit('k', RULE).remaining).toBe(0);
  });

  test('keys are isolated — one caller cannot lock out another', () => {
    for (let i = 0; i < RULE.limit; i++) checkRateLimit('user-a', RULE);
    expect(checkRateLimit('user-a', RULE).allowed).toBe(false);
    expect(checkRateLimit('user-b', RULE).allowed).toBe(true);
  });

  test('a rejected request is not recorded, so retries do not extend the lockout', () => {
    for (let i = 0; i < RULE.limit; i++) checkRateLimit('k', RULE);
    const first = checkRateLimit('k', RULE);
    for (let i = 0; i < 20; i++) checkRateLimit('k', RULE);
    const afterRetries = checkRateLimit('k', RULE);
    // resetAt is anchored to the oldest *counted* request, so hammering the
    // endpoint must not push it further out.
    expect(afterRetries.resetAt).toBe(first.resetAt);
  });

  test('reports a positive retryAfter when rejected', () => {
    for (let i = 0; i < RULE.limit; i++) checkRateLimit('k', RULE);
    const rejected = checkRateLimit('k', RULE);
    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBeGreaterThan(0);
    expect(rejected.retryAfterSeconds).toBeLessThanOrEqual(RULE.windowMs / 1000);
  });

  test('entries ageing out of the window free capacity again', () => {
    const shortRule = { limit: 2, windowMs: 40 };
    expect(checkRateLimit('k', shortRule).allowed).toBe(true);
    expect(checkRateLimit('k', shortRule).allowed).toBe(true);
    expect(checkRateLimit('k', shortRule).allowed).toBe(false);
    return Bun.sleep(60).then(() => {
      expect(checkRateLimit('k', shortRule).allowed).toBe(true);
    });
  });
});

describe('rateLimitHeaders', () => {
  test('omits Retry-After while allowed, includes it once rejected', () => {
    const allowed = checkRateLimit('k', RULE);
    expect(rateLimitHeaders(allowed)['Retry-After']).toBeUndefined();
    expect(rateLimitHeaders(allowed)['RateLimit-Limit']).toBe(String(RULE.limit));

    for (let i = 0; i < RULE.limit; i++) checkRateLimit('k', RULE);
    const rejected = checkRateLimit('k', RULE);
    expect(rejected.allowed).toBe(false);
    expect(Number(rateLimitHeaders(rejected)['Retry-After'])).toBeGreaterThan(0);
  });
});

describe('configured budgets', () => {
  test('every Gemini-backed route has a rule', () => {
    expect(Object.keys(RATE_LIMITS).sort()).toEqual([
      'complaint:draft',
      'conduct:analyze',
      'conduct:followup',
    ]);
    for (const rule of Object.values(RATE_LIMITS)) {
      expect(rule.limit).toBeGreaterThan(0);
      expect(rule.windowMs).toBeGreaterThan(0);
    }
  });
});
