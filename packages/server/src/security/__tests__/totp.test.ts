import { describe, expect, it } from 'vitest';
import { base32Decode, base32Encode, generateTotpSecret, otpauthUrl, totpCode, verifyTotp } from '../totp.js';

// RFC 6238 Appendix B secret: ASCII "12345678901234567890".
const RFC_SECRET_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('base32', () => {
  it('round-trips arbitrary bytes', () => {
    const buf = Buffer.from('12345678901234567890', 'ascii');
    expect(base32Encode(buf)).toBe(RFC_SECRET_B32);
    expect(base32Decode(RFC_SECRET_B32)).toEqual(buf);
  });

  it('ignores padding, spaces and case on decode', () => {
    expect(base32Decode('gezd gnbv GY3T QOJQ gezd gnbv gy3t qojq===')).toEqual(
      Buffer.from('12345678901234567890', 'ascii'),
    );
  });
});

describe('totp', () => {
  it('matches the RFC 6238 vector at T=59s (truncated to 6 digits)', () => {
    // RFC value for SHA1/T=59 is 94287082 with 8 digits → 287082 with 6.
    expect(totpCode(RFC_SECRET_B32, Math.floor(59 / 30))).toBe('287082');
  });

  it('accepts the current and adjacent windows, rejects others', () => {
    const now = 59_000;
    expect(verifyTotp(RFC_SECRET_B32, '287082', now)).toBe(1);
    expect(verifyTotp(RFC_SECRET_B32, totpCode(RFC_SECRET_B32, 0), now)).toBe(0); // -1 drift
    expect(verifyTotp(RFC_SECRET_B32, totpCode(RFC_SECRET_B32, 2), now)).toBe(2); // +1 drift
    expect(verifyTotp(RFC_SECRET_B32, totpCode(RFC_SECRET_B32, 5), now)).toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, '000000', now)).toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, 'abcdef', now)).toBeNull();
    expect(verifyTotp(RFC_SECRET_B32, '12345', now)).toBeNull();
  });

  it('generates distinct 32-char base32 secrets', () => {
    const a = generateTotpSecret();
    const b = generateTotpSecret();
    expect(a).toMatch(/^[A-Z2-7]{32}$/);
    expect(a).not.toBe(b);
  });

  it('builds a scannable otpauth URI', () => {
    const url = otpauthUrl('ABC234', 'alice@example.com');
    expect(url).toBe(
      'otpauth://totp/AgenticBEAR:alice%40example.com?secret=ABC234&issuer=AgenticBEAR&algorithm=SHA1&digits=6&period=30',
    );
  });
});
