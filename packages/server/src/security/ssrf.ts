/**
 * SSRF egress guard for server-side outbound requests to user-configured URLs.
 *
 * Any place that fetches a URL an unprivileged user can set (e.g. an external-agent endpoint)
 * must run it through `assertPublicHttpUrl` first. The guard:
 *   - allows only http/https schemes,
 *   - resolves the hostname and rejects loopback / private / link-local / unique-local targets,
 *     which stops requests to cloud metadata (169.254.169.254) and internal-only services.
 *
 * DNS is resolved here and the checked result is returned so callers can pin the connection to the
 * validated IP if they want to close the TOCTOU/DNS-rebinding window.
 */
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** True if `ip` (v4 or v6 literal) is loopback, private, link-local, or otherwise non-public. */
export function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIpv4(ip);
  if (kind === 6) return isPrivateIpv6(ip);
  return true; // not a parseable IP → treat as unsafe
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 "this host"
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true; // loopback / unspecified
  if (lower.startsWith('fe80')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
  // IPv4-mapped (::ffff:a.b.c.d) → validate the embedded v4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return isPrivateIpv4(mapped[1]!);
  return false;
}

export interface SafeUrl {
  url: URL;
  /** The resolved public IP the request should connect to. */
  address: string;
  family: number;
}

/**
 * Validate that `raw` is an http(s) URL whose host resolves to a public address.
 * Throws `Error` with a user-safe message when it isn't. Returns the parsed URL and resolved IP.
 */
export async function assertPublicHttpUrl(raw: string): Promise<SafeUrl> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Endpoint URL is not a valid URL.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Endpoint URL scheme "${url.protocol}" is not allowed; use http or https.`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  // Dev mode: allow localhost and loopback for local agent testing.
  if (process.env.NODE_ENV !== 'production') {
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
      return { url, address: hostname, family: isIP(hostname) || 4 };
    }
  }

  // Literal IP → check directly, no DNS.
  if (isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error('Endpoint URL resolves to a non-public address.');
    return { url, address: hostname, family: isIP(hostname) };
  }

  let resolved: Array<{ address: string; family: number }>;
  try {
    resolved = await lookup(hostname, { all: true });
  } catch {
    throw new Error('Endpoint URL host could not be resolved.');
  }
  if (resolved.length === 0) throw new Error('Endpoint URL host could not be resolved.');
  // Reject if ANY resolved address is non-public (defends against split/rebinding tricks).
  for (const r of resolved) {
    if (isPrivateIp(r.address)) throw new Error('Endpoint URL resolves to a non-public address.');
  }
  const first = resolved[0]!;
  return { url, address: first.address, family: first.family };
}
