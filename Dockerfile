# syntax=docker/dockerfile:1
# ─────────────────────────────────────────────────────────────────────────────
# AgenticBEAR — production image.
#
# Multi-stage: (1) install ALL workspace deps, (2) build client + esbuild-bundle
# server, (3) copy the tiny runtime with the two native modules we `--external`'d
# out of the bundle (better-sqlite3, pg). Final image serves both the API and
# the built UI from `dist/server.js`. Runs as a non-root user; git is available
# so the git-workspace tools work. SQLite by default, Postgres via DATABASE_URL.
# ─────────────────────────────────────────────────────────────────────────────

# ─── Stage 1: builder — full workspace install + client/server build ─────────
FROM node:20-bookworm AS builder
WORKDIR /app

# Toolchain for the native better-sqlite3 build (in case no prebuilt binary hits).
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

# ─── Stage 2: runtime — minimal image, git available, non-root, PID-1 tini ───
FROM node:20-bookworm-slim AS runtime

# Runtime OS deps:
#   - git      → agent git tools + clone-based workspaces
#   - openssh  → optional SSH remote support for git
#   - ca-certs → HTTPS to provider APIs, git remotes, SonarQube, external agents
#   - tini     → PID 1 that forwards SIGTERM so the server's graceful shutdown runs
# Native compilation still needed for better-sqlite3 at install time.
RUN apt-get update && apt-get install -y --no-install-recommends \
      git openssh-client ca-certificates tini python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# HOME is remapped to /data so both the SQLite file (~/.subagent-manager/data.db)
# and the git workspaces mirror (~/.subagent-manager/workspaces/<projectId>)
# land on the mounted PVC without any code changes.
ENV NODE_ENV=production \
    PORT=3001 \
    HOME=/data \
    DB_PATH=/data/.subagent-manager/data.db

WORKDIR /app

# server bundle, client static (served from dist/public), and node_modules for the
# externalized native modules (better-sqlite3 + pg). Postgres driver is bundled by
# esbuild in most builds but we install pg here too as a safety net (~5MB).
COPY --from=builder /app/dist                    ./dist
COPY --from=builder /app/packages/client/dist    ./dist/public
COPY --from=builder /app/node_modules            ./node_modules
COPY --from=builder /app/package.json            ./package.json

# Writable persistent-data dir; owned by the built-in non-root `node` user.
RUN mkdir -p /data/.subagent-manager /workspace \
    && chown -R node:node /data /workspace \
    && chmod 700 /data/.subagent-manager
USER node

EXPOSE 3001

# tini as PID 1 so SIGTERM propagates to node — index.ts closes DB, clears the
# issue-pull timer, and removes the port file cleanly on shutdown.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/server.js"]

# Health check — kubernetes probes hit /api/health directly, this keeps `docker ps`
# and docker-compose honest too. Node 20 has global fetch(), so no deps needed.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+ (process.env.PORT||3001) + '/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

LABEL org.opencontainers.image.title="AgenticBEAR" \
      org.opencontainers.image.description="Multi-agent LLM platform with OpenAI-compatible gateway" \
      org.opencontainers.image.source="https://github.com/ymnberkay/SubAgentManager" \
      org.opencontainers.image.licenses="MIT"
