/**
 * Auth + user management.
 *   POST   /api/auth/login        { username, password } → { token, user }   (public)
 *   GET    /api/auth/me           → current user
 *   GET    /api/auth/users        → list (admin)
 *   POST   /api/auth/users        → create (admin)
 *   PATCH  /api/auth/users/:id    → role/groups/password (admin)
 *   DELETE /api/auth/users/:id    → remove (admin)
 */
import type { FastifyInstance } from 'fastify';
import type { CreateUserInput, LoginInput, UserRole } from '@subagent/shared';
import { userRepo } from '../db/repositories/user.repo.js';
import { groupRepo } from '../db/repositories/group.repo.js';
import { verifyPassword, signToken } from '../security/auth-service.js';
import { type AuthedRequest, requireAdmin } from '../middleware/require-auth.js';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: LoginInput }>('/api/auth/login', async (request, reply) => {
    const { username, password } = request.body ?? ({} as LoginInput);
    if (!username || !password) {
      return reply.status(400).send({ error: true, message: 'username and password are required' });
    }
    const row = await userRepo.findRowByUsername(username);
    if (!row || !verifyPassword(password, row.password_hash, row.salt)) {
      return reply.status(401).send({ error: true, message: 'Invalid username or password' });
    }
    const user = (await userRepo.findById(row.id))!;
    return reply.send({ token: signToken(user.id), user });
  });

  app.get('/api/auth/me', async (request, reply) => {
    return reply.send((request as AuthedRequest).authUser);
  });

  app.get('/api/auth/users', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    return reply.send(await userRepo.list());
  });

  app.post<{ Body: CreateUserInput }>('/api/auth/users', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { username, password, role, groupIds } = request.body ?? ({} as CreateUserInput);
    if (!username || !password) {
      return reply.status(400).send({ error: true, message: 'username and password are required' });
    }
    if (await userRepo.findRowByUsername(username)) {
      return reply.status(409).send({ error: true, message: 'Username already exists' });
    }
    return reply.status(201).send(await userRepo.create({ username, password, role, groupIds }));
  });

  app.patch<{ Params: { id: string }; Body: { role?: UserRole; groupIds?: string[]; password?: string } }>(
    '/api/auth/users/:id',
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return;
      const updated = await userRepo.update(request.params.id, request.body ?? {});
      if (!updated) return reply.status(404).send({ error: true, message: 'User not found' });
      return reply.send(updated);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/auth/users/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const self = (request as AuthedRequest).authUser;
    if (self?.id === request.params.id) {
      return reply.status(400).send({ error: true, message: 'You cannot delete your own account' });
    }
    if (!(await userRepo.remove(request.params.id))) return reply.status(404).send({ error: true, message: 'User not found' });
    return reply.status(204).send();
  });

  // ── Permission groups (admin) — role + project access; users belong to groups ──
  app.get('/api/auth/groups', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    return reply.send(await groupRepo.list());
  });

  app.post<{ Body: { name: string; role?: UserRole; projectIds?: string[] } }>('/api/auth/groups', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const { name, role, projectIds } = request.body ?? ({} as { name: string });
    if (!name?.trim()) return reply.status(400).send({ error: true, message: 'name is required' });
    return reply.status(201).send(await groupRepo.create({ name: name.trim(), role, projectIds }));
  });

  app.patch<{ Params: { id: string }; Body: { name?: string; role?: UserRole; projectIds?: string[] } }>(
    '/api/auth/groups/:id',
    async (request, reply) => {
      if (!requireAdmin(request, reply)) return;
      const updated = await groupRepo.update(request.params.id, request.body ?? {});
      if (!updated) return reply.status(404).send({ error: true, message: 'Group not found' });
      return reply.send(updated);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/auth/groups/:id', async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    if (!(await groupRepo.remove(request.params.id))) return reply.status(404).send({ error: true, message: 'Group not found' });
    return reply.status(204).send();
  });
}
