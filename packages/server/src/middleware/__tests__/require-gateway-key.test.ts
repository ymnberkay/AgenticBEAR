import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';

const { repoMock } = vi.hoisted(() => ({
  repoMock: { count: vi.fn(), findByHash: vi.fn(), touchLastUsed: vi.fn() },
}));
vi.mock('../../db/repositories/gateway-key.repo.js', () => ({
  gatewayKeyRepo: repoMock,
  hashKey: (s: string) => `hash:${s}`,
}));

import { requireGatewayKey } from '../require-gateway-key.js';

function fakeReply() {
  const reply = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    send(b: unknown) { this.body = b; return this; },
  };
  return reply as unknown as FastifyReply & { statusCode: number; body: unknown };
}
function fakeReq(authorization?: string) {
  return { headers: authorization ? { authorization } : {} } as unknown as FastifyRequest & { gatewayKeyId?: string };
}

beforeEach(() => {
  repoMock.count.mockReset();
  repoMock.findByHash.mockReset();
  repoMock.touchLastUsed.mockReset();
});

describe('requireGatewayKey', () => {
  it('no keys exist → open (no 401, passes through)', async () => {
    repoMock.count.mockReturnValue(0);
    const reply = fakeReply();
    await requireGatewayKey(fakeReq(), reply);
    expect(reply.statusCode).toBe(0);
  });

  it('keys exist, missing header → 401', async () => {
    repoMock.count.mockReturnValue(2);
    const reply = fakeReply();
    await requireGatewayKey(fakeReq(), reply);
    expect(reply.statusCode).toBe(401);
  });

  it('keys exist, valid Bearer → attaches keyId, touches last-used, no 401', async () => {
    repoMock.count.mockReturnValue(1);
    repoMock.findByHash.mockReturnValue({ id: 'k1', enabled: true });
    const reply = fakeReply();
    const req = fakeReq('Bearer agb_live_good');
    await requireGatewayKey(req, reply);
    expect(reply.statusCode).toBe(0);
    expect(req.gatewayKeyId).toBe('k1');
    expect(repoMock.findByHash).toHaveBeenCalledWith('hash:agb_live_good');
    expect(repoMock.touchLastUsed).toHaveBeenCalledWith('k1');
  });

  it('keys exist, unknown key → 401', async () => {
    repoMock.count.mockReturnValue(1);
    repoMock.findByHash.mockReturnValue(undefined);
    const reply = fakeReply();
    await requireGatewayKey(fakeReq('Bearer nope'), reply);
    expect(reply.statusCode).toBe(401);
  });

  it('keys exist, disabled key → 401', async () => {
    repoMock.count.mockReturnValue(1);
    repoMock.findByHash.mockReturnValue({ id: 'k2', enabled: false });
    const reply = fakeReply();
    await requireGatewayKey(fakeReq('Bearer disabled'), reply);
    expect(reply.statusCode).toBe(401);
  });

  it('expired key → 401', async () => {
    repoMock.count.mockReturnValue(1);
    repoMock.findByHash.mockReturnValue({ id: 'k3', enabled: true, expiresAt: new Date(Date.now() - 1000).toISOString() });
    const reply = fakeReply();
    await requireGatewayKey(fakeReq('Bearer expired'), reply);
    expect(reply.statusCode).toBe(401);
  });

  it('not-yet-expired key → passes', async () => {
    repoMock.count.mockReturnValue(1);
    repoMock.findByHash.mockReturnValue({ id: 'k4', enabled: true, expiresAt: new Date(Date.now() + 86_400_000).toISOString() });
    const reply = fakeReply();
    const req = fakeReq('Bearer valid');
    await requireGatewayKey(req, reply);
    expect(reply.statusCode).toBe(0);
    expect(req.gatewayKeyId).toBe('k4');
  });
});
