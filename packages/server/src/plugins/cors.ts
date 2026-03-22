import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { config } from '../config.js';

export async function registerCors(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: config.clientUrl,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });
}
