# Agent Architecture

## What an agent is

An **agent** is a configured role bound to a model. It lives in a **project** and has
([shared/src/types/agent.ts](../packages/shared/src/types/agent.ts)):

| Field | Meaning |
|-------|---------|
| `role` | `orchestrator` (plans + delegates) or `specialist` (does the work) |
| `name`, `slug`, `description` | identity |
| `systemPrompt` | the agent's instructions |
| `modelConfig` | `{ model, providerId?, maxTokens, temperature, topP?, stopSequences? }` |
| `permissions` | file read/write/create/delete + allowed/denied paths |
| `color`, `icon` | UI presentation |

`modelConfig.providerId` ties the agent to a provider (built-in or custom). If absent, the
provider is inferred from the model id (legacy). So an agent can run on Claude, GPT, Gemini,
DeepSeek, a local model, or an Azure Foundry deployment — same shape.

## A project = an agent team + workspace

A project has one **orchestrator** and any number of **specialists**, a workspace path
(where file changes happen), and built-in **templates** to scaffold common roles
(backend, frontend, QA, docs, …) from [server/src/seed-templates.ts](../packages/server/src/seed-templates.ts).

## How agents run

### 1. Run engine (UI "Start Run")
[engine/execution-engine.ts](../packages/server/src/engine/execution-engine.ts):
1. **Decompose** — the orchestrator turns the objective into tasks (JSON) and assigns each to a specialist slug ([services/orchestrator.service.ts](../packages/server/src/services/orchestrator.service.ts)).
2. **Schedule** — tasks run respecting dependencies, up to `maxConcurrentAgents` in parallel ([engine/task-queue.ts](../packages/server/src/engine/task-queue.ts)).
3. **Execute** — each specialist gets a context bundle (task + dependency outputs + relevant files) and runs the **agentic tool-use loop** (below), so it can **write real files** into the workspace ([services/agent-runner.service.ts](../packages/server/src/services/agent-runner.service.ts), [engine/context-builder.ts](../packages/server/src/engine/context-builder.ts)).
4. **Document** — an optional doc agent writes a report.
Every step is recorded in `run_steps` with tokens + `cost_usd` + `baseline_cost_usd`; every file write is recorded in `file_changes` (with previous content) and shown in the workspace UI.

### 2. Chat (UI "Chat" tab)
[routes/chat.ts](../packages/server/src/routes/chat.ts) lets you converse 1:1 with any agent over SSE. The agent runs the **agentic tool-use loop**, so it can write files to the workspace and — if it's the **orchestrator** — `delegate_to_agent` to specialists. Tool activity (`🔧 wrote …`, `→ delegated to backend`) streams inline above the final answer; each turn is recorded as a synthetic run/step + `file_changes` for Analytics.

### 3. Agentic tool-use loop
[services/agent-loop.service.ts](../packages/server/src/services/agent-loop.service.ts) + [llm/tool-client.ts](../packages/server/src/llm/tool-client.ts) + [services/agent-tools.ts](../packages/server/src/services/agent-tools.ts):
- **Specialists** (and any agent doing the work) get `write_file(path, content)`, `read_file(path)`, `list_files()` — all sandboxed to the project `workspacePath` via `assertWithinWorkspace` (path-traversal rejected).
- **An orchestrator that has specialists is a pure coordinator**: it gets **only** `delegate_to_agent(agent, task)` (no file tools), so it must route work to the right specialist (backend → backend agent, frontend → frontend agent, docs → docs agent) rather than doing it itself. `delegate_to_agent` runs the named specialist through the same loop at `depth+1` (specialists cannot delegate further) and returns its result, which the orchestrator synthesizes. (An orchestrator with no specialists falls back to file tools so it can still act.)
- The loop calls `completeWithTools(req, tools)`, which normalizes **Anthropic** tool_use/tool_result content blocks and **OpenAI-compatible** `tools`/`tool_calls`/`role:'tool'` messages behind one `ChatTurn` shape — so tool-use works on Claude, GPT, Gemini, DeepSeek, Azure Foundry, or any custom endpoint.
- Bounded by an **iteration cap** (10) and **delegation depth limit** (1). File writes **auto-apply**.
- Tool-use calls intentionally **bypass L1/L2/L3** (side effects must not be cached/routed) but are still **cost-recorded** to `costMetrics`.

### 4. MCP (`ask_agent` / `ask_orchestrator`)
[mcp/server.ts](../packages/server/src/mcp/server.ts) exposes tools over SSE so a CLI (e.g.
Claude Code) can call a single agent or the whole team. `ask_agent` loads the agent's prompt
+ memory, calls the model **server-side** through the cost layers, saves the answer to
`agent_memories`, and writes a synthetic `run_step` so it shows in Analytics.

## Shared model layer

Plain text calls go through `ClaudeService.sendMessage(...)`, which carries a `meta` tag
(`role`, `agentSlug`, `callKind`, `cacheable`) used by the cost layer for namespacing and
gating. **Tool-use** calls go through `completeWithTools(...)` ([llm/tool-client.ts](../packages/server/src/llm/tool-client.ts)) instead — same provider dispatch + key resolution in the unified client, but skipping the cache/router layers (side effects) while still recording cost.

## Memory

Each agent has persistent `agent_memories` (per project) injected into its system prompt on
MCP calls, so it accumulates context across calls.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the big picture and [COST_OPTIMIZATION.md](./COST_OPTIMIZATION.md) for how each call is optimized.
