/**
 * TOTP (RFC 6238, HMAC-SHA1, 30s step, 6 digits) — dependency-free, same ethos as
 * auth-service.ts. Secrets are base32 (what authenticator apps expect in otpauth:// URIs).
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 20 random bytes → base32, per RFC 4226's recommended secret length. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

/** The 6-digit code for a base32 secret at a given step counter. */
export function totpCode(secretB32: string, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', base32Decode(secretB32)).update(msg).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const bin =
    ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return (bin % 10 ** DIGITS).toString().padStart(DIGITS, '0');
}

/**
 * Verify a user-typed code against the secret, allowing ±1 time step of clock drift.
 * Returns the matched counter (for replay tracking) or null.
 */
export function verifyTotp(secretB32: string, code: string, now = Date.now()): number | null {
  const normalized = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return null;
  const counter = Math.floor(now / 1000 / STEP_SECONDS);
  for (const c of [counter, counter - 1, counter + 1]) {
    const expected = totpCode(secretB32, c);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) return c;
  }
  return null;
}

/** otpauth:// URI — QR payload / deep link for authenticator apps. */
export function otpauthUrl(secretB32: string, account: string, issuer = 'AgenticBEAR'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}
