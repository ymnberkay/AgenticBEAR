# LLM Gateway — Calling models over the service URL

The gateway turns AgenticBEAR into a single, **OpenAI-compatible** endpoint your internal
apps point at. Every request flows through the cost-optimization layers and is dispatched to
the right provider — so each app is cost-optimized for free, across all configured models.

Code: [server/src/routes/gateway.ts](../packages/server/src/routes/gateway.ts).

## Endpoints

### `POST /v1/chat/completions`
Standard OpenAI body: `{ model, messages, max_tokens?, temperature?, stream?, stop? }`.

- **Model addressing:** `model` is either a **bare built-in id** (`gpt-4o`, `claude-sonnet-4-6`)
  or **`<providerId>/<modelId>`** for a custom provider (e.g. `EjhP…/DeepSeek-V4-Flash`,
  `Dh0…/gemini-2.5-flash`). Split is on the first `/`, and only when the first segment is a
  known provider id — so model ids that contain `/` still work.
- **Response:** OpenAI-shaped `choices[]` + `usage`. Extra headers expose cost:
  `x-agb-served-model`, `x-agb-cost-usd`, `x-agb-baseline-usd`, `x-agb-cache-hit`.
- **Streaming:** `stream: true` → SSE chunks (`data: {choices:[{delta:{content}}]}`) then `[DONE]`.

### `GET /v1/models`
Catalog of reachable models. Built-in providers are listed via **live discovery** from their
own `/models` endpoint using the configured key ([server/src/llm/model-discovery.ts](../packages/server/src/llm/model-discovery.ts)),
falling back to a static list. Custom providers list their models as `<providerId>/<modelId>`.
A scoped key only sees the models it is allowed to call.

## Auth — gateway API keys

Issue keys in the **Models** tab (`agb_live_<32-hex>`, shown once, stored as `sha256`):
- Pass `Authorization: Bearer <key>`.
- **Bootstrap:** while no keys exist the gateway is open; it is enforced once the first key is created.
- **Per-key model scope:** at creation, restrict a key to a subset of reachable models. A
  scoped key gets `403` for any other model. Empty scope = all models.
- Admin endpoints: `GET/POST/PATCH/DELETE /api/gateway-keys`; usage at `GET /api/gateway-usage`.

Code: [middleware/require-gateway-key.ts](../packages/server/src/middleware/require-gateway-key.ts),
[db/repositories/gateway-key.repo.ts](../packages/server/src/db/repositories/gateway-key.repo.ts).

## Drop-in usage (any OpenAI SDK)

```python
from openai import OpenAI
client = OpenAI(base_url="http://<host>:3001/v1", api_key="agb_live_…")
resp = client.chat.completions.create(
    model="EjhP…/DeepSeek-V4-Flash",        # or a bare built-in id
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)
```

## Cost is measured per caller

Each call writes a `gateway_usage` row (key, model, tokens, actual vs baseline cost, cache hit,
router tier). The **Models** tab shows totals + savings by model and by key; the same call also
updates the live `costMetrics` dashboard (`GET /api/cost-stats`).

## Adding a provider for the gateway

Use **Models → Custom LLM Providers**: OpenAI-compatible (DeepSeek, Azure Foundry `/openai/v1`,
Ollama, LM Studio, Groq, OpenRouter, …) or Anthropic-compatible. The chat URL preserves any
query string on the base URL, so Azure-style `?api-version=…` endpoints work. See
[COST_OPTIMIZATION.md](./COST_OPTIMIZATION.md) for what the layers do to each call.
