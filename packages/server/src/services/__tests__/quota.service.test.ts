import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PermissionGroup, User } from '@subagent/shared';

const { findByIds, getPeriod } = vi.hoisted(() => ({ findByIds: vi.fn(), getPeriod: vi.fn() }));
vi.mock('../../db/repositories/group.repo.js', () => ({ groupRepo: { findByIds } }));
vi.mock('../../db/repositories/group-usage.repo.js', () => ({ groupUsageRepo: { getPeriod, increment: vi.fn() } }));

import { checkQuota, resolveGroupForUser, resolveGroupForKey } from '../quota.service.js';

const group = (over: Partial<PermissionGroup>): PermissionGroup => ({
  id: 'g1', name: 'G1', role: 'contributor', projectIds: [], tokenQuota: null, createdAt: '', ...over,
});
const usage = (totalTokens: number) => ({ groupId: 'g1', period: '2026-06', inputTokens: 0, outputTokens: 0, totalTokens, costUsd: 0, requestCount: 0 });

beforeEach(() => { findByIds.mockReset(); getPeriod.mockReset(); });

describe('quota.service — checkQuota', () => {
  it('no group → unlimited', async () => {
    const r = await checkQuota(null);
    expect(r).toEqual({ allowed: true, groupId: null, used: 0, quota: null, remaining: null });
  });

  it('group without a quota → unlimited (but tagged with groupId)', async () => {
    findByIds.mockResolvedValue([group({ tokenQuota: null })]);
    const r = await checkQuota('g1');
    expect(r.allowed).toBe(true);
    expect(r.quota).toBeNull();
    expect(r.groupId).toBe('g1');
  });

  it('under quota → allowed with correct remaining', async () => {
    findByIds.mockResolvedValue([group({ tokenQuota: 1000 })]);
    getPeriod.mockResolvedValue(usage(400));
    const r = await checkQuota('g1');
    expect(r.allowed).toBe(true);
    expect(r.used).toBe(400);
    expect(r.remaining).toBe(600);
  });

  it('at/over quota → blocked', async () => {
    findByIds.mockResolvedValue([group({ tokenQuota: 1000 })]);
    getPeriod.mockResolvedValue(usage(1000));
    const r = await checkQuota('g1');
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });
});

describe('quota.service — group resolution', () => {
  it('admins are exempt (null)', async () => {
    const admin = { id: 'u1', username: 'a', role: 'admin', groupIds: ['g1'], createdAt: '' } as User;
    expect(await resolveGroupForUser(admin, 'p1')).toBeNull();
  });

  it('picks the group that grants access to the project', async () => {
    const user = { id: 'u2', username: 'b', role: 'contributor', groupIds: ['g1', 'g2'], createdAt: '' } as User;
    findByIds.mockResolvedValue([group({ id: 'g1', projectIds: ['pX'] }), group({ id: 'g2', projectIds: ['p1'] })]);
    expect(await resolveGroupForUser(user, 'p1')).toBe('g2');
  });

  it('falls back to the first group when none match the project', async () => {
    const user = { id: 'u3', username: 'c', role: 'contributor', groupIds: ['g1'], createdAt: '' } as User;
    findByIds.mockResolvedValue([group({ id: 'g1', projectIds: ['pX'] })]);
    expect(await resolveGroupForUser(user, 'p1')).toBe('g1');
  });

  it('no groups → null', async () => {
    const user = { id: 'u4', username: 'd', role: 'contributor', groupIds: [], createdAt: '' } as User;
    expect(await resolveGroupForUser(user, 'p1')).toBeNull();
  });

  it('resolveGroupForKey returns the key group id', () => {
    expect(resolveGroupForKey({ groupId: 'g9' } as never)).toBe('g9');
    expect(resolveGroupForKey(null)).toBeNull();
  });
});
