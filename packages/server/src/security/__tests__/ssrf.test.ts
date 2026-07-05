import { describe, it, expect, afterEach } from 'vitest';
import { isPrivateIp, isAllowlistedHost, assertPublicHttpUrl } from '../ssrf.js';

const ORIGINAL_ALLOWED = process.env.SSRF_ALLOWED_HOSTS;
afterEach(() => {
  if (ORIGINAL_ALLOWED === undefined) delete process.env.SSRF_ALLOWED_HOSTS;
  else process.env.SSRF_ALLOWED_HOSTS = ORIGINAL_ALLOWED;
});

describe('ssrf — isPrivateIp', () => {
  it('flags loopback, RFC1918, link-local and metadata ranges', () => {
    for (const ip of ['127.0.0.1', '10.96.0.10', '172.20.5.1', '192.168.1.1', '169.254.169.254', '::1', 'fd00::1']) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });
  it('passes public addresses', () => {
    for (const ip of ['8.8.8.8', '104.18.2.1', '2606:4700::6812:201']) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });
});

describe('ssrf — SSRF_ALLOWED_HOSTS allowlist', () => {
  it('matches exact hostnames case-insensitively', () => {
    process.env.SSRF_ALLOWED_HOSTS = 'pii-agent.default.svc.cluster.local, vision-agent.default.svc.cluster.local';
    expect(isAllowlistedHost('pii-agent.default.svc.cluster.local')).toBe(true);
    expect(isAllowlistedHost('PII-Agent.Default.svc.cluster.LOCAL')).toBe(true);
    expect(isAllowlistedHost('video-agent.default.svc.cluster.local')).toBe(false);
  });

  it('supports *.suffix wildcards without matching the bare suffix', () => {
    process.env.SSRF_ALLOWED_HOSTS = '*.svc.cluster.local';
    expect(isAllowlistedHost('anything.default.svc.cluster.local')).toBe(true);
    expect(isAllowlistedHost('svc.cluster.local')).toBe(false);
    expect(isAllowlistedHost('evil.example.com')).toBe(false);
  });

  it('empty/unset env allows nothing', () => {
    delete process.env.SSRF_ALLOWED_HOSTS;
    expect(isAllowlistedHost('pii-agent.default.svc.cluster.local')).toBe(false);
  });

  it('a literal private IP stays blocked even if listed', async () => {
    process.env.SSRF_ALLOWED_HOSTS = '169.254.169.254';
    await expect(assertPublicHttpUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/non-public/);
  });
});
