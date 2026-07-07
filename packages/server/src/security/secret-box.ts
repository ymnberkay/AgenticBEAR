/**
 * At-rest encryption for small secrets (TOTP seeds, PKCE verifiers in SSO state) —
 * AES-256-GCM with a key derived from AUTH_SECRET. A DB dump alone can no longer
 * yield working second factors. Format: `v1.<base64url(iv | tag | ciphertext)>`.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { config } from '../config.js';

const PREFIX = 'v1.';
let cachedKey: Buffer | undefined;

function key(): Buffer {
  cachedKey ??= scryptSync(config.auth.secret, 'agb-secret-box-v1', 32);
  return cachedKey;
}

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

export function seal(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + b64url(Buffer.concat([iv, cipher.getAuthTag(), ct]));
}

/** Decrypt a sealed value → plaintext, or null when tampered/garbled. */
export function open(sealed: string): string | null {
  if (!sealed.startsWith(PREFIX)) return null;
  try {
    const raw = fromB64url(sealed.slice(PREFIX.length));
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

/** Read a value that may predate encryption: sealed → decrypt, otherwise as-is. */
export function openOrPlain(value: string): string {
  return value.startsWith(PREFIX) ? (open(value) ?? '') : value;
}
