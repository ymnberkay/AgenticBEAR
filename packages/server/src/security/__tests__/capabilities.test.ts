import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DB_PATH = `${process.env.TMPDIR ?? '/tmp'}/agb-caps-test-${process.pid}.db`;
  process.env.AUTH_SECRET = 'caps-test-secret';
});

import type { User } from '@subagent/shared';
import { initDb } from '../../db/client.js';
import { groupRepo } from '../../db/repositories/group.repo.js';
import { roleRepo } from '../../db/repositories/role.repo.js';
import { resolveAccess, clearRoleCache } from '../capabilities.js';

const mkUser = (over: Partial<User>): User => ({
  id: 'u', username: 'u', role: 'viewer', groupIds: [], tokenQuota: null, createdAt: '', ...over,
});

beforeAll(async () => { await initDb(); });
afterAll(() => { clearRoleCache(); });

describe('resolveAccess (effective capabilities)', () => {
  it('a plain admin is a full admin regardless of groups', async () => {
    const access = await resolveAccess(mkUser({ role: 'admin' }));
    expect(access.isFullAdmin).toBe(true);
    expect(access.canWrite).toBe(true);
  });

  it('a viewer with no groups is read-only', async () => {
    const access = await resolveAccess(mkUser({ role: 'viewer' }));
    expect(access.isFullAdmin).toBe(false);
    expect(access.canWrite).toBe(false);
    expect(access.capabilities.has('projects.view')).toBe(true);
  });

  it('a contributor can write but is not a full admin', async () => {
    const access = await resolveAccess(mkUser({ role: 'contributor' }));
    expect(access.isFullAdmin).toBe(false);
    expect(access.canWrite).toBe(true);
  });

  it('a custom group role elevates a viewer within the group projects (additive)', async () => {
    const role = await roleRepo.create({ name: 'Runner', capabilities: ['projects.view', 'runs.execute'] });
    clearRoleCache();
    const group = await groupRepo.create({ name: 'QA', role: role.id, projectIds: ['proj-1', 'proj-2'] });

    const access = await resolveAccess(mkUser({ role: 'viewer', groupIds: [group.id] }));
    expect(access.canWrite).toBe(true);                       // gained runs.execute
    expect(access.isFullAdmin).toBe(false);                   // but not admin
    expect(access.capabilities.has('runs.execute')).toBe(true);
    expect(access.projectIds.sort()).toEqual(['proj-1', 'proj-2']);
  });

  it('a custom role with admin.full makes group members full admins', async () => {
    const role = await roleRepo.create({ name: 'Superuser', capabilities: ['admin.full'] });
    clearRoleCache();
    const group = await groupRepo.create({ name: 'Ops', role: role.id, projectIds: [] });
    const access = await resolveAccess(mkUser({ role: 'viewer', groupIds: [group.id] }));
    expect(access.isFullAdmin).toBe(true);
  });

  it('a dangling role ref (deleted role) grants no extra caps but keeps the base role', async () => {
    const group = await groupRepo.create({ name: 'Ghost', role: 'deleted-role-id', projectIds: ['p'] });
    const access = await resolveAccess(mkUser({ role: 'viewer', groupIds: [group.id] }));
    expect(access.canWrite).toBe(false);
    expect(access.projectIds).toEqual(['p']);
  });
});
