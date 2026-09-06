import { describe, expect, test } from 'bun:test';
import { DEMO_TOKEN_PREFIX, isDemoAuthEnabled, resolveDemoToken } from './demo-auth';

const env = (o: Record<string, string | undefined>) => o as NodeJS.ProcessEnv;
const TOKEN = `${DEMO_TOKEN_PREFIX}victim-uid`;
const ON = env({ NODE_ENV: 'development', ALLOW_DEMO_AUTH: 'true' });

describe('isDemoAuthEnabled — fail-closed', () => {
  test('on only when development AND explicitly opted in', () => {
    expect(isDemoAuthEnabled(ON)).toBe(true);
  });

  // Each of these evaluated TRUE under the old `NODE_ENV !== "production"`
  // guard, so each one is a case where the bypass used to be silently live.
  test.each([
    ['NODE_ENV unset', env({ ALLOW_DEMO_AUTH: 'true' })],
    ['NODE_ENV empty', env({ NODE_ENV: '', ALLOW_DEMO_AUTH: 'true' })],
    ['NODE_ENV misspelled', env({ NODE_ENV: 'Production', ALLOW_DEMO_AUTH: 'true' })],
    ['NODE_ENV=test', env({ NODE_ENV: 'test', ALLOW_DEMO_AUTH: 'true' })],
    ['NODE_ENV=staging', env({ NODE_ENV: 'staging', ALLOW_DEMO_AUTH: 'true' })],
  ])('stays off when %s', (_label, e) => {
    expect(isDemoAuthEnabled(e)).toBe(false);
  });

  test.each([
    ['opt-in absent', env({ NODE_ENV: 'development' })],
    ['opt-in empty', env({ NODE_ENV: 'development', ALLOW_DEMO_AUTH: '' })],
    ['opt-in "1"', env({ NODE_ENV: 'development', ALLOW_DEMO_AUTH: '1' })],
    ['opt-in "TRUE"', env({ NODE_ENV: 'development', ALLOW_DEMO_AUTH: 'TRUE' })],
    ['opt-in "false"', env({ NODE_ENV: 'development', ALLOW_DEMO_AUTH: 'false' })],
  ])('stays off in development when %s', (_label, e) => {
    expect(isDemoAuthEnabled(e)).toBe(false);
  });

  test('never on in production, even if the opt-in is set', () => {
    expect(isDemoAuthEnabled(env({ NODE_ENV: 'production', ALLOW_DEMO_AUTH: 'true' }))).toBe(false);
  });

  test('an empty environment is safe', () => {
    expect(isDemoAuthEnabled(env({}))).toBe(false);
  });
});

describe('resolveDemoToken', () => {
  test('resolves the uid when enabled', () => {
    expect(resolveDemoToken(TOKEN, ON)).toEqual({ uid: 'victim-uid', email: 'user@example.com' });
  });

  test('refuses in production — the impersonation path is closed', () => {
    const prod = env({ NODE_ENV: 'production', ALLOW_DEMO_AUTH: 'true' });
    expect(resolveDemoToken(TOKEN, prod)).toBeNull();
  });

  test('refuses when NODE_ENV is unset, the old fail-open case', () => {
    expect(resolveDemoToken(TOKEN, env({ ALLOW_DEMO_AUTH: 'true' }))).toBeNull();
  });

  test('an empty uid is not an identity', () => {
    expect(resolveDemoToken(DEMO_TOKEN_PREFIX, ON)).toBeNull();
    expect(resolveDemoToken(`${DEMO_TOKEN_PREFIX}   `, ON)).toBeNull();
  });

  test('ignores tokens that merely contain the prefix — it must lead', () => {
    expect(resolveDemoToken(`x${DEMO_TOKEN_PREFIX}uid`, ON)).toBeNull();
  });

  test('ignores a non-demo token even when enabled', () => {
    expect(resolveDemoToken('eyJhbGciOi.real.token', ON)).toBeNull();
  });
});
