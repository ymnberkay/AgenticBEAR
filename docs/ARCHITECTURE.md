# AgenticBEAR — System Architecture

AgenticBEAR is an internal platform with three faces over **one** model-access core:

1. **Agentic** — define multi-agent teams (orchestrator + specialists) and run/chat with them.
2. **Gateway** — an OpenAI-compatible HTTP endpoint your apps call to reach any model.
3. **Cost optimization** — a middleware every model call passes through (cache, routing, prompt-cache, metrics).

All three share the same provider layer, so a model you configure once is reachable everywhere, and cost is measured everywhere.

## Monorepo layout

```
packages/
  shared/   TypeScript types + constants (models, providers, gateway, settings)
  server/   Fastify API + MCP server + cost layer + provider/unified client (SQLite)
  client/   React UI (Vite + TanStack Router/Query)
```

## The one core: provider layer + cost choke-point

```
caller ─▶ ClaudeService.sendMessage/streamMessage     (plain text)
   │        └─▶ costMiddleware.complete   (L1 cache → L2 router → L3 prompt-cache → metrics)
   │              └─▶ llm/client.complete (unified client)
   └─▶ completeWithTools  (tool-use: skips cache/router, still cost-recorded)
                  └─▶ llm/client (unified client)
                        └─▶ provider-registry.resolveProvider(providerId, model)
                              └─▶ Anthropic | OpenAI | Gemini | OpenAI-compatible | Anthropic-compatible
```

- **`provider-registry`** ([server/src/llm/provider-registry.ts](../packages/server/src/llm/provider-registry.ts)) resolves `(providerId, model)` → kind + baseUrl + key (built-in keys from Settings/env; custom providers from the `llm_providers` table; legacy agents via id heuristic), plus `modelPricing()`.
- **`unified client`** ([server/src/llm/client.ts](../packages/server/src/llm/client.ts)) dispatches by provider kind and returns **normalized usage** for every provider — so cost is measurable for all of them.
- **`costMiddleware`** ([server/src/cost/middleware.ts](../packages/server/src/cost/middleware.ts)) is the single choke-point; see [COST_OPTIMIZATION.md](./COST_OPTIMIZATION.md).
- **`ClaudeService`** ([server/src/services/claude.service.ts](../packages/server/src/services/claude.service.ts)) is the provider-agnostic wrapper callers use (despite the historical name, it is not tied to the Anthropic SDK).

## The entry paths (all go through the core)

| Path | Trigger | Code |
|------|---------|------|
| **Run engine** | UI "Start Run" → orchestrator decomposes → specialists execute (tool-use loop, write files) | [engine/execution-engine.ts](../packages/server/src/engine/execution-engine.ts) |
| **Chat** | UI "Chat" tab → talk to an agent; orchestrator can delegate; agents write files (tool-use loop) | [routes/chat.ts](../packages/server/src/routes/chat.ts), [services/agent-loop.service.ts](../packages/server/src/services/agent-loop.service.ts) |
| **MCP** | Claude Code CLI / any MCP client → `ask_agent`, `ask_orchestrator` | [mcp/server.ts](../packages/server/src/mcp/server.ts), [mcp/transport.ts](../packages/server/src/mcp/transport.ts) |
| **Gateway** | External app → `POST /v1/chat/completions` | [routes/gateway.ts](../packages/server/src/routes/gateway.ts) |

They all dispatch through the unified client → cost layers, so cost-stats + Analytics reflect every path. Plain calls use `ClaudeService` (cache/router/prompt-cache); **tool-use** calls (Run engine + Chat) use `completeWithTools` — same providers + cost recording, but they skip the cache/router layers because writing files is a side effect. See [AGENTS.md](./AGENTS.md#3-agentic-tool-use-loop).

## Persistence (SQLite, migrations inlined in [db/client.ts](../packages/server/src/db/client.ts))

`projects`, `agents`, `runs`, `tasks`, `run_steps`, `file_changes`, `templates`, `settings`,
`agent_activities`, `agent_memories`, `llm_providers`, `gateway_keys`, `gateway_usage`.
Migrations run on startup; each is tracked in `_migrations`.

## Data flow for cost/analytics

Every model call records two ledgers:
- **`costMetrics`** (in-memory, session) → `GET /api/cost-stats` live dashboard.
- **Durable rows** → `run_steps` (per-run, with `cost_usd` + `baseline_cost_usd`) feed the project **Analytics** tab; `gateway_usage` (per gateway key) feeds the **Models** tab usage.

## Related docs
- [AGENTS.md](./AGENTS.md) — agent model & execution.
- [GATEWAY.md](./GATEWAY.md) — calling models over the service URL.
- [COST_OPTIMIZATION.md](./COST_OPTIMIZATION.md) — the three cost layers.
