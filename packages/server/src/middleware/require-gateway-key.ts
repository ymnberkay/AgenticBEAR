/**
 * Gateway auth — verifies the `Authorization: Bearer agb_live_…` header against issued
 * gateway keys. Bootstrap-friendly: while NO keys exist the gateway runs open, so an
 * admin can try it immediately; once the first key is created it is enforced.
 *
 * On success, attaches `request.gatewayKeyId` for usage attribution.
 */
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { GatewayKey } from '@subagent/shared';
import { gatewayKeyRepo, hashKey } from '../db/repositories/gateway-key.repo.js';

/** Fields the gateway routes read off the request after auth. */
export type AuthedRequest = FastifyRequest & { gatewayKeyId?: string; gatewayKey?: GatewayKey };

function unauthorized(reply: FastifyReply, message: string) {
  return reply.status(401).send({ error: { message, type: 'authentication_error', code: 'invalid_api_key' } });
}

export async function requireGatewayKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  // Open until the admin issues the first key.
  if ((await gatewayKeyRepo.count()) === 0) return;

  const header = request.headers['authorization'];
  const token = header && header.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
  if (!token) {
    return unauthorized(reply, 'Missing API key. Pass `Authorization: Bearer <key>`.');
  }

  const key = await gatewayKeyRepo.findByHash(hashKey(token));
  if (!key || !key.enabled) {
    return unauthorized(reply, 'Invalid or disabled API key.');
  }
  if (key.expiresAt && Date.parse(key.expiresAt) <= Date.now()) {
    return unauthorized(reply, 'API key has expired.');
  }

  await gatewayKeyRepo.touchLastUsed(key.id);
  const r = request as AuthedRequest;
  r.gatewayKeyId = key.id;
  r.gatewayKey = key;
}
