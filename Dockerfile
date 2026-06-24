# syntax=docker/dockerfile:1
# ── Build stage: install deps, build client (Vite) + bundle server (esbuild) ──
FROM node:20-bookworm AS builder
WORKDIR /app

# Toolchain for native module (better-sqlite3) in case a prebuilt binary isn't available.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Install with the full workspace manifest set so npm can resolve the monorepo.
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci

# Build everything: client → packages/client/dist, server bundle → dist/server.js
COPY . .
RUN npm run build

# ── Runtime stage: slim image, only the bundle + client + better-sqlite3 native dep ──
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3001 \
    HOME=/data \
    DB_PATH=/data/.subagent-manager/data.db
WORKDIR /app

# server bundle, client static (served from dist/public), and node_modules for the
# externalized native module (better-sqlite3). Postgres driver (pg) is bundled into server.js.
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/packages/client/dist ./dist/public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Writable HOME for the port file / sqlite dir; runs as the built-in non-root `node` user.
RUN mkdir -p /data /workspace && chown -R node:node /data /workspace
USER node

EXPOSE 3001
CMD ["node", "dist/server.js"]
