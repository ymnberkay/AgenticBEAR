import { describe, expect, it } from 'vitest';
import {
  needsRefresh, signMfaToken, signSsoState, signToken,
  verifyMfaToken, verifySsoState, verifyToken,
} from '../auth-service.js';
import { seal, open, openOrPlain } from '../secret-box.js';

describe('token purposes stay separate', () => {
  it('session tokens verify as sessions only', () => {
    const t = signToken('user-1');
    expect(verifyToken(t)?.uid).toBe('user-1');
    expect(verifyMfaToken(t)).toBeNull();
  });

  it('mfa-pending tokens never pass as sessions', () => {
    const t = signMfaToken('user-1');
    expect(verifyMfaToken(t)).toBe('user-1');
    expect(verifyToken(t)).toBeNull();
  });

  it('sso state binds to its provider', () => {
    const s = signSsoState('entra');
    expect(verifySsoState(s, 'entra').valid).toBe(true);
    expect(verifySsoState(s, 'github').valid).toBe(false);
    expect(verifyToken(s)).toBeNull();
  });

  it('rejects tampered tokens', () => {
    const t = signToken('user-1');
    expect(verifyToken(`${t}x`)).toBeNull();
    expect(verifyToken(t.replace(/^./, 'A'))).toBeNull();
    expect(verifyToken('not-a-token')).toBeNull();
  });
});

describe('session claims (revocation + sliding renewal)', () => {
  it('carries the token version it was minted with', () => {
    expect(verifyToken(signToken('u', 0))?.tokenVersion).toBe(0);
    expect(verifyToken(signToken('u', 3))?.tokenVersion).toBe(3);
  });

  it('needsRefresh flips past the half-life', () => {
    const claims = verifyToken(signToken('u'))!;
    const life = claims.exp - claims.iat;
    expect(needsRefresh(claims, claims.iat + life * 0.4)).toBe(false);
    expect(needsRefresh(claims, claims.iat + life * 0.6)).toBe(true);
  });
});

describe('sso state carries a sealed PKCE verifier', () => {
  it('round-trips the verifier only for the matching provider', () => {
    const s = signSsoState('oidc', 'my-code-verifier-123');
    const res = verifySsoState(s, 'oidc');
    expect(res.valid).toBe(true);
    expect(res.pkceVerifier).toBe('my-code-verifier-123');
    expect(verifySsoState(s, 'entra').valid).toBe(false);
  });

  it('verifier is not readable from the raw state token', () => {
    const s = signSsoState('oidc', 'super-secret-verifier');
    expect(Buffer.from(s.split('.')[0], 'base64').toString()).not.toContain('super-secret-verifier');
  });
});

describe('secret box', () => {
  it('seals and opens', () => {
    const sealed = seal('JBSWY3DPEHPK3PXP');
    expect(sealed.startsWith('v1.')).toBe(true);
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(open(sealed)).toBe('JBSWY3DPEHPK3PXP');
  });

  it('rejects tampering', () => {
    const sealed = seal('secret');
    const tampered = sealed.slice(0, -2) + (sealed.endsWith('AA') ? 'BB' : 'AA');
    expect(open(tampered)).toBeNull();
    expect(open('v1.garbage')).toBeNull();
    expect(open('plaintext')).toBeNull();
  });

  it('openOrPlain passes legacy plaintext through', () => {
    expect(openOrPlain('LEGACYBASE32SECRET')).toBe('LEGACYBASE32SECRET');
    expect(openOrPlain(seal('NEWSECRET'))).toBe('NEWSECRET');
  });
});
