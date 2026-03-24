# AgenticBEAR

Build and manage a personal army of AI agents — then use them directly inside Claude Code CLI via MCP.

You define agents once (name, role, system prompt, model). From that point, anyone using Claude Code CLI can call those agents without touching the UI again.

---

## How It Works

```
Claude Code CLI
      │
      │  MCP (SSE)
      ▼
AgenticBEAR Server  ──→  Returns agent system prompt + your query
      │
      ▼
Claude Code answers as that agent (uses your own Claude session)
```

No extra API keys. No extra costs. Your Claude Code subscription handles everything.

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Start the server

```bash
npm run dev
```

Server runs on `http://localhost:3001`, UI on `http://localhost:5173`.

### 3. Create a project and add agents

Open `http://localhost:5173`, create a project, and define your agents. Each agent needs:
- A **name** (e.g. "Backend Engineer")
- A **role** (orchestrator or specialist)
- A **system prompt** describing how it should behave

### 4. Get your MCP URL

Go to **Project Settings** → copy the MCP URL. It looks like:

```
http://localhost:3001/mcp/projects/YOUR_PROJECT_ID
```

### 5. Connect Claude Code CLI

```bash
claude mcp add agenticbear --transport sse http://localhost:3001/mcp/projects/YOUR_PROJECT_ID
```

Done. Open a new Claude Code session — your agents are ready.

---

## Example Usage Scenarios

### List all agents in your project

```
List all agents in agenticbear
```

Claude Code calls `list_agents` and shows every agent with their ID, role, and model.

---

### Ask a specific agent

```
Use the agenticbear backend agent to review this function for performance issues:

function processUsers(users) {
  return users.map(u => db.query(`SELECT * FROM orders WHERE user_id = ${u.id}`))
}
```

Claude Code calls `ask_agent`, loads the Backend Engineer's system prompt, and responds from that agent's perspective — pointing out the N+1 query problem, suggesting batch loading, etc.

---

### Let the orchestrator decide who to ask

```
Ask agenticbear to help me write a migration script for adding a new column to the users table
```

Claude Code calls `ask_orchestrator`. It automatically routes to the most relevant agent (e.g. Database Engineer) based on keyword matching, then answers from that agent's perspective.

---

### Get multiple perspectives at once

```
Use agenticbear multi_agent_discuss with the backend and security agents — topic: "Is JWT or session-based auth better for our API?"
```

Claude Code calls `multi_agent_discuss` with both agent IDs, loads each agent's system prompt, then gives you both perspectives in a single structured response.

---

### Mid-task delegation

You're already working on something and hit a problem:

```
I'm refactoring the auth middleware. Ask the security agent in agenticbear whether storing refresh tokens in httpOnly cookies is sufficient or if we need additional CSRF protection.
```

Claude Code grabs the security agent's context and answers inline — without breaking your flow.

---

## Setting Up a New Project from Scratch

AgenticBEAR works best when you start a project with zero files and let agents build everything.

### 1. Create an empty folder

```bash
mkdir my-new-app
cd my-new-app
```

### 2. Create a project in AgenticBEAR

Open `http://localhost:5173`, create a new project, then go to **Project Settings** and set the **Workspace Path** to your folder's absolute path:

```
/Users/you/projects/my-new-app
```

Agents will read and write files in this directory.

### 3. Add a `.mcp.json` file to the folder

```json
{
  "mcpServers": {
    "agenticbear": {
      "type": "sse",
      "url": "http://localhost:3001/mcp/projects/YOUR_PROJECT_ID"
    }
  }
}
```

This is the only bootstrap file needed. Everything else gets created by the agents.

### 4. Open Claude Code in that folder

```bash
claude
```

When prompted about the MCP server, choose **"Use this and all future MCP servers in this project"**.

---

## CLAUDE.md — Making Agents Automatic

By default, you have to explicitly ask Claude to use AgenticBEAR tools each time. To make agents the **default behavior** for all tasks, create a `CLAUDE.md` file in your project root.

Claude Code reads this file automatically at the start of every session and follows the instructions without being asked.

### Recommended CLAUDE.md

```markdown
# Agent Rules

This project uses AgenticBEAR for all development tasks.

- For any coding, file creation, or development task: call `ask_orchestrator` first — do not respond directly
- After the orchestrator returns a plan, call `ask_agent` for each step
- Actually write files using Write/Edit tools — do not just output code as text
- For simple questions or explanations: respond directly without using agents
```

Place this file at the root of your project next to `.mcp.json`.

### What this gives you

Without `CLAUDE.md`, every session requires:
```
use ask_orchestrator tool, query: "add login page"
```

With `CLAUDE.md`, you just write:
```
add login page
```

Claude automatically routes through the orchestrator, plans the work, calls each specialist agent, and writes the files — without any extra instructions from you.

---

## Managing Multiple Projects

Each project in AgenticBEAR has its own MCP endpoint. To use different agent teams for different codebases, add a project-specific `.mcp.json` to each folder.

```
~/ecommerce-app/
  .mcp.json   →  agenticbear project ID: abc123
  CLAUDE.md
  src/

~/blog-backend/
  .mcp.json   →  agenticbear project ID: def456
  CLAUDE.md
  src/
```

When you open `claude` inside any of these folders, it automatically loads the right agent team for that project. AgenticBEAR keeps each project's agents, activity history, and settings completely separate.

---

## MCP Tools Reference

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_agents` | — | Lists all agents with ID, role, model, and description |
| `ask_agent` | `agent_id`, `query`, `context?` | Loads a specific agent's system prompt and answers as that agent |
| `ask_orchestrator` | `query`, `context?` | Routes to the best-matching agent automatically via keyword scoring |
| `multi_agent_discuss` | `agent_ids[]`, `topic` | Loads multiple agents, answers from each perspective |

---

## Project Structure

```
packages/
  client/     React frontend (Vite + TanStack Router)
  server/     Fastify API + MCP server (SQLite)
  shared/     TypeScript types and constants
```

---

## Supported Models

When creating agents, you can assign any of these models:

**Anthropic (Current)**
- `claude-opus-4-6` — Most capable, 1M context
- `claude-sonnet-4-6` — Balanced speed/quality, 1M context
- `claude-haiku-4-5-20251001` — Fast and lightweight

**Anthropic (Legacy)**
- claude-opus-4-5, claude-sonnet-4-5, claude-opus-4-1, claude-opus-4, claude-sonnet-4

**OpenAI**
- gpt-4o, gpt-4o-mini, o1, o3, o3-mini

> Model selection in the UI is for documentation/labeling purposes. Actual inference runs through Claude Code's own session.

---

## Environment Variables

```env
SERVER_PORT=3001        # API server port (default: 3001)
CLIENT_URL=http://localhost:5173
DB_PATH=~/.subagent-manager/data.db
```

No API keys required.
