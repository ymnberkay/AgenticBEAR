import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';

export async function registerCors(app: FastifyInstance): Promise<void> {
  // Internal service: reflect any origin so the OpenAI-compatible /v1 gateway is callable
  // from any internal app (browser or server). Server-side callers ignore CORS anyway.
  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
}
