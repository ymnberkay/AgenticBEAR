import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearLoginFailures, clearMfaFailures, loginRetryAfter, mfaRetryAfter,
  recordLoginFailure, recordMfaFailure, resetThrottle,
} from '../login-throttle.js';

const T0 = 1_000_000_000_000;

beforeEach(() => resetThrottle());

describe('login throttle', () => {
  it('allows up to 10 failures per account, then blocks with a retry-after', () => {
    for (let i = 0; i < 10; i++) {
      expect(loginRetryAfter('alice', '1.1.1.1', T0 + i)).toBe(0);
      recordLoginFailure('alice', '1.1.1.1', T0 + i);
    }
    expect(loginRetryAfter('alice', '1.1.1.1', T0 + 20)).toBeGreaterThan(0);
    // Different account from a different IP is unaffected.
    expect(loginRetryAfter('bob', '2.2.2.2', T0 + 20)).toBe(0);
  });

  it('blocks by IP across accounts (username spraying)', () => {
    for (let i = 0; i < 30; i++) recordLoginFailure(`user-${i}`, '9.9.9.9', T0 + i);
    expect(loginRetryAfter('fresh-user', '9.9.9.9', T0 + 40)).toBeGreaterThan(0);
    expect(loginRetryAfter('fresh-user', '8.8.8.8', T0 + 40)).toBe(0);
  });

  it('window expires', () => {
    for (let i = 0; i < 10; i++) recordLoginFailure('alice', '1.1.1.1', T0);
    expect(loginRetryAfter('alice', '1.1.1.1', T0 + 1000)).toBeGreaterThan(0);
    expect(loginRetryAfter('alice', '1.1.1.1', T0 + 15 * 60_000 + 1)).toBe(0);
  });

  it('success clears the account + IP counters', () => {
    for (let i = 0; i < 10; i++) recordLoginFailure('alice', '1.1.1.1', T0);
    clearLoginFailures('alice', '1.1.1.1');
    expect(loginRetryAfter('alice', '1.1.1.1', T0 + 1)).toBe(0);
  });
});

describe('mfa throttle', () => {
  it('5 wrong codes lock the challenge for a while', () => {
    for (let i = 0; i < 5; i++) {
      expect(mfaRetryAfter('u1', T0 + i)).toBe(0);
      recordMfaFailure('u1', T0 + i);
    }
    expect(mfaRetryAfter('u1', T0 + 10)).toBeGreaterThan(0);
    clearMfaFailures('u1');
    expect(mfaRetryAfter('u1', T0 + 11)).toBe(0);
  });
});
