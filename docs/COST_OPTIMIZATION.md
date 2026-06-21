# Cost Optimization

Every model call — from the run engine, MCP, or the gateway — passes through one choke-point,
`costMiddleware.complete` ([server/src/cost/middleware.ts](../packages/server/src/cost/middleware.ts)),
which applies up to three layers and records metrics. Each layer is independently toggleable;
with all off, behavior is identical to a plain call (regression-tested).

```
Request
  └─[L1] Semantic Cache  ──hit──▶ return cached answer (no LLM)
        │ miss
        └─[L2] Router  ──▶ pick model (cheap | main)        [Anthropic family]
              └─[L3] Prompt Caching on the chosen model      [Anthropic family]
                    └─ call provider → write L1 → record metrics + cost
```

Config + flags: [server/src/cost/config.ts](../packages/server/src/cost/config.ts)
(`COST_LAYER_SEMANTIC_CACHE`, `COST_LAYER_ROUTER`, `COST_LAYER_PROMPT_CACHE`, default all on).

## L1 — Semantic Cache ([cost/layers/semantic-cache.ts](../packages/server/src/cost/layers/semantic-cache.ts))
Cheap exact-match (normalized prompt hash) → semantic search in **Qdrant**; on similarity ≥
threshold (and within TTL) the cached answer is returned with **no LLM call**. Embeddings via
**Voyage** (or local). Cache is **namespaced by role/agent** so contexts don't collide. Skipped
for high-temperature, tool/side-effecting, or routing/classification calls. If Qdrant or the
embedder is unreachable, L1 **degrades silently** (never throws). Works for any provider.

## L2 — Router ([cost/layers/router.ts](../packages/server/src/cost/layers/router.ts))
A tiny Haiku classification call labels the task `TRIVIAL` / `SIMPLE` / `COMPLEX`; trivial/simple
tasks are served by a cheaper model, complex by the main model. Any unexpected output → safe
fallback to the main model (no risky downgrade). The classifier's own cost is tracked. Applies
to the Anthropic family (and within-provider cheap variants where configured).

## L3 — Prompt Caching ([cost/layers/prompt-cache.ts](../packages/server/src/cost/layers/prompt-cache.ts))
Marks the static prefix (system prompt) with `cache_control: ephemeral` so repeated reads
within the TTL are billed at ~10% of input price. Skipped below the model's minimum cacheable
length. Anthropic family only.

## Cost measurement — for ALL providers
The unified client returns **real `usage` tokens** for every provider, and pricing is resolved
per model ([provider-registry.modelPricing](../packages/server/src/llm/provider-registry.ts) →
built-in `CLAUDE_MODELS` or a custom provider's per-model price). [cost/pricing.ts](../packages/server/src/cost/pricing.ts)
applies cache read/write multipliers. So DeepSeek / Azure / local spend shows up as real cost —
not 0 — wherever the model is used.

- **`actualCostUsd`** = served-model cost (after router/cache) + router overhead.
- **`baselineCostUsd`** = what the call would have cost on the main model, no cache, full prefix.
- **savings** = baseline − actual.

## Where you see it
- **Live session:** `GET /api/cost-stats` (`DELETE` to reset) — hit/miss, router tiers,
  cache_read vs cache_creation tokens, baseline vs actual, % saved.
- **Per project:** the **Analytics** tab (from `run_steps`) — totals, by-agent, over-time, with
  time-range filtering (1h / 24h / 7d / 30d / 90d / all / custom).
- **Per gateway key:** the **Models** tab usage (from `gateway_usage`).

See [GATEWAY.md](./GATEWAY.md) and [AGENTS.md](./AGENTS.md) for the call paths, and
[ARCHITECTURE.md](./ARCHITECTURE.md) for the whole picture.
