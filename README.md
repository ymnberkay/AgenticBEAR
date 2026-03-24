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

### 4. Set the Workspace Path

Go to **Project Settings** → set **Workspace Path** to the absolute path of your project folder:

```
/Users/you/projects/my-app
```

Agents will read and write files in this directory.

### 5. Get your MCP URL

Go to **Project Settings** → copy the MCP URL. It looks like:

```
http://localhost:3001/mcp/projects/YOUR_PROJECT_ID
```

### 6. Connect Claude Code CLI

```bash
claude mcp add agenticbear --transport sse http://localhost:3001/mcp/projects/YOUR_PROJECT_ID
```

Done. Open a new Claude Code session — your agents are ready.

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

## Usage Modes

AgenticBEAR supports three distinct usage patterns. Choose based on the complexity of your task.

---

### Mode 1: Full Orchestration (automatic)

The orchestrator plans the work, decomposes it into subtasks, and delegates to specialists automatically.

```
Ask agenticbear to build me a REST API with user auth and JWT tokens
```

Claude Code calls `ask_orchestrator`. The orchestrator:
1. Reads all available specialist agents
2. Decomposes the goal into concrete subtasks
3. Calls `ask_agent` for each subtask with the right specialist
4. Passes outputs between agents when there are dependencies
5. Invokes the documentation agent at the end (if present) to write a summary report

**Best for:** Large features, greenfield projects, tasks spanning multiple domains

---

### Mode 2: Direct Agent

Call a specific agent by name without going through the orchestrator. You control exactly which agent handles the task.

```
Use the agenticbear backend agent to review this function for N+1 query issues:

function getUsers() {
  return users.map(u => db.query(`SELECT * FROM orders WHERE user_id = ${u.id}`))
}
```

Claude Code calls `ask_agent` with the matching agent ID and answers from that agent's perspective.

**Best for:** Targeted questions, code review, when you know exactly which specialist you need

---

### Mode 3: Manual Agent Chain

Chain specific agents yourself, passing context between them. You control the order and what gets passed along.

```
1. Use agenticbear backend agent to design the database schema for a blog platform
2. Use agenticbear frontend agent to build the UI — here's the schema: [paste output]
```

**Best for:** When you want control over the workflow, cross-domain tasks where you manage the handoff

---

### Mode 4: Multi-Agent Discussion

Get multiple agents to weigh in on the same topic simultaneously.

```
Use agenticbear multi_agent_discuss with the backend and security agents — topic: "Is JWT or session-based auth better for our API?"
```

Claude Code calls `multi_agent_discuss` with both agent IDs, loads each agent's system prompt, then gives both perspectives in a single structured response.

**Best for:** Architecture decisions, trade-off analysis, getting a second opinion

---

## CLAUDE.md — Making Agents Automatic

By default, you have to explicitly ask Claude to use AgenticBEAR tools each time. To make agents the **default behavior** for all tasks, create a `CLAUDE.md` file in your project root.

Claude Code reads this file automatically at the start of every session and follows the instructions without being asked.

### Option A: Always use the orchestrator

```markdown
# Agent Rules

This project uses AgenticBEAR for all development tasks.

- For any coding, file creation, or development task: call `ask_orchestrator` first — do not respond directly
- After the orchestrator returns a plan, call `ask_agent` for each step
- Actually write files using Write/Edit tools — do not just output code as text
- For simple questions or explanations: respond directly without using agents
```

Without `CLAUDE.md`, every session requires:
```
use ask_orchestrator tool, query: "add login page"
```

With `CLAUDE.md`, you just write:
```
add login page
```

Claude automatically routes through the orchestrator, plans the work, calls each specialist agent, and writes the files.

---

### Option B: Always use a specific agent

When you want one agent (e.g. a senior backend engineer) to handle everything:

```markdown
# Agent Rules

This project uses AgenticBEAR.

- For any coding or development task: call `ask_agent` with the Backend Engineer agent
- Write all code using Write/Edit tools — never output code as text
- For questions and explanations: respond directly
```

---

### Option C: Let Claude ask you which mode to use

For flexible projects where you want to choose per task:

```markdown
# Agent Rules

This project uses AgenticBEAR. Before starting any development task, ask:
"Should I use the orchestrator (full plan + all agents) or a specific agent?"

- orchestrator → call `ask_orchestrator`
- specific agent → call `ask_agent` with the chosen agent ID
- Write all output as real files using Write/Edit tools
```

---

## File Writing Behavior

All agents are instructed to write real files — not output code as text.

When an agent completes a task, it uses Claude Code's `Write` and `Edit` tools to create or modify files directly in your workspace. You will see actual file changes, not code blocks in a response.

This applies to:
- `ask_agent` — the specialist writes the files it's responsible for
- `ask_orchestrator` — each specialist agent writes its own files; the documentation agent (if present) writes a `run-report.txt` at the end

---

## Agent Templates

AgenticBEAR ships with 21 built-in templates, grouped by category. When creating a new agent, select a template to pre-fill the system prompt, model config, and permissions.

| Category | Templates |
|----------|-----------|
| **Orchestrator** | Project Orchestrator |
| **Backend** | Node.js/Express, TypeScript/Fastify, JavaScript/Node.js, Java/Spring Boot, Go, Python/FastAPI |
| **Frontend** | React/TypeScript, Next.js App Router, Vue 3 |
| **Mobile** | React Native/Expo, iOS/SwiftUI, Android/Compose, Flutter |
| **Database** | PostgreSQL/SQL |
| **DevOps** | Docker/Kubernetes/CI-CD |
| **QA** | Test Engineer |
| **Security** | Security Engineer |
| **Documentation** | Technical Writer |
| **Design** | UI/UX Designer |
| **Custom** | Blank template |

Templates set recommended model, permissions, and a detailed system prompt with domain-specific standards.

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
| `ask_orchestrator` | `query`, `context?` | Full orchestration: orchestrator plans the task, delegates to specialists via `ask_agent`, documentation agent writes a final report |
| `multi_agent_discuss` | `agent_ids[]`, `topic` | Loads multiple agents, answers from each perspective in sequence |

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
