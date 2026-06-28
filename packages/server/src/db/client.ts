import { config } from '../config.js';
import { createLogger } from '../utils/logger.js';
import { createSqliteDb, createPostgresDb, type Db } from './adapter.js';

const log = createLogger('db');

// SQL migrations inlined for bundler compatibility. Authored in SQLite dialect;
// `toDialect()` rewrites the few non-portable bits for Postgres at apply time.
const MIGRATIONS: Record<string, string> = {
  '001_initial.sql': `-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  workspace_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  orchestrator_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'specialist',
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  model_config TEXT NOT NULL DEFAULT '{}',
  permissions TEXT NOT NULL DEFAULT '{}',
  template_id TEXT,
  color TEXT NOT NULL DEFAULT '#71717a',
  icon TEXT NOT NULL DEFAULT 'Bot',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_agents_project_id ON agents(project_id);
CREATE INDEX IF NOT EXISTS idx_agents_slug ON agents(slug);

-- Runs table
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  objective TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TEXT,
  completed_at TEXT,
  total_input_tokens INTEGER NOT NULL DEFAULT 0,
  total_output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost_usd REAL NOT NULL DEFAULT 0.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_runs_project_id ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  parent_task_id TEXT,
  assigned_agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 0,
  dependencies TEXT NOT NULL DEFAULT '[]',
  "order" INTEGER NOT NULL DEFAULT 0,
  output TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY (assigned_agent_id) REFERENCES agents(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_run_id ON tasks(run_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Run steps table
CREATE TABLE IF NOT EXISTS run_steps (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  type TEXT NOT NULL,
  input TEXT NOT NULL DEFAULT '',
  output TEXT NOT NULL DEFAULT '',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0.0,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_run_steps_run_id ON run_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_run_steps_task_id ON run_steps(task_id);

-- File changes table
CREATE TABLE IF NOT EXISTS file_changes (
  id TEXT PRIMARY KEY,
  run_step_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  operation TEXT NOT NULL,
  previous_content TEXT,
  new_content TEXT NOT NULL DEFAULT '',
  agent_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (run_step_id) REFERENCES run_steps(id) ON DELETE CASCADE,
  FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_file_changes_run_id ON file_changes(run_id);
CREATE INDEX IF NOT EXISTS idx_file_changes_run_step_id ON file_changes(run_step_id);

-- Templates table
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL DEFAULT '',
  default_model_config TEXT NOT NULL DEFAULT '{}',
  default_permissions TEXT NOT NULL DEFAULT '{}',
  suggested_icon TEXT NOT NULL DEFAULT 'Bot',
  suggested_color TEXT NOT NULL DEFAULT '#71717a',
  is_built_in INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_templates_category ON templates(category);

-- Settings table (single row)
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  api_key TEXT NOT NULL DEFAULT '',
  default_model TEXT NOT NULL DEFAULT 'claude-sonnet-4-20250514',
  default_max_tokens INTEGER NOT NULL DEFAULT 8192,
  theme TEXT NOT NULL DEFAULT 'dark',
  default_workspace_path TEXT NOT NULL DEFAULT '',
  max_concurrent_agents INTEGER NOT NULL DEFAULT 3,
  auto_save_interval INTEGER NOT NULL DEFAULT 30000
);`,

  '002_agent_activity.sql': `-- Agent activity log - tracks MCP tool calls and direct agent usage
CREATE TABLE IF NOT EXISTS agent_activities (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'mcp_call',
  query TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_agent_activities_agent ON agent_activities(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_activities_project ON agent_activities(project_id);`,

  '004_settings_provider_keys.sql': `-- Add OpenAI and Gemini API key columns to settings
ALTER TABLE settings ADD COLUMN openai_api_key TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN gemini_api_key TEXT NOT NULL DEFAULT '';`,

  '003_agent_memory.sql': `-- Per-agent persistent memory across runs
CREATE TABLE IF NOT EXISTS agent_memories (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'interaction',
  query TEXT NOT NULL DEFAULT '',
  response TEXT NOT NULL DEFAULT '',
  run_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_id ON agent_memories(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_project_id ON agent_memories(project_id);`,

  '005_llm_providers.sql': `-- User-defined custom LLM providers (DeepSeek, local Ollama/LM Studio, OpenRouter, …)
CREATE TABLE IF NOT EXISTS llm_providers (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  kind TEXT NOT NULL,
  base_url TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  models_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);`,

  '017_provider_auth.sql': `-- Flexible auth for custom providers: corporate gateways/proxies fronting an
-- Anthropic-compatible endpoint can require Authorization: Bearer + extra headers.
ALTER TABLE llm_providers ADD COLUMN auth_type TEXT NOT NULL DEFAULT 'api_key';
ALTER TABLE llm_providers ADD COLUMN headers_json TEXT NOT NULL DEFAULT '{}';`,

  '006_cost_savings.sql': `-- Cost optimization baseline tracking — what the call WOULD have cost without
-- the cost-layer (semantic cache, router downgrade, prompt cache). Savings = baseline - actual.
ALTER TABLE run_steps ADD COLUMN baseline_cost_usd REAL NOT NULL DEFAULT 0.0;
ALTER TABLE runs      ADD COLUMN total_baseline_cost_usd REAL NOT NULL DEFAULT 0.0;`,

  '007_gateway.sql': `-- OpenAI-compatible gateway: API keys for internal callers + per-call usage rows.
CREATE TABLE IF NOT EXISTS gateway_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_gateway_keys_hash ON gateway_keys(key_hash);

CREATE TABLE IF NOT EXISTS gateway_usage (
  id TEXT PRIMARY KEY,
  key_id TEXT,
  model TEXT NOT NULL,
  provider_id TEXT,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0.0,
  baseline_usd REAL NOT NULL DEFAULT 0.0,
  cache_hit INTEGER NOT NULL DEFAULT 0,
  router_tier TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gateway_usage_key ON gateway_usage(key_id);
CREATE INDEX IF NOT EXISTS idx_gateway_usage_created ON gateway_usage(created_at);`,

  '008_gateway_key_scope.sql': `-- Per-key model scope: which catalog model ids a gateway key may call ([] = all).
ALTER TABLE gateway_keys ADD COLUMN allowed_models TEXT NOT NULL DEFAULT '[]';`,

  '009_agent_canvas_and_knowledge.sql': `-- Agent canvas coordinates (for a future visual graph) + per-project knowledge documents.
ALTER TABLE agents ADD COLUMN x_axis REAL;
ALTER TABLE agents ADD COLUMN y_axis REAL;

CREATE TABLE IF NOT EXISTS project_documents (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_project_documents_project ON project_documents(project_id);`,

  '010_run_step_breakdown.sql': `-- Enrich run_steps so project analytics can break down by model + cost layer.
ALTER TABLE run_steps ADD COLUMN model TEXT;
ALTER TABLE run_steps ADD COLUMN provider_id TEXT;
ALTER TABLE run_steps ADD COLUMN cache_hit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE run_steps ADD COLUMN router_tier TEXT;
ALTER TABLE run_steps ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0;
ALTER TABLE run_steps ADD COLUMN cache_creation_tokens INTEGER NOT NULL DEFAULT 0;`,

  '011_run_step_compression.sql': `-- L0 context compression: input tokens saved per step (for project Analytics).
ALTER TABLE run_steps ADD COLUMN compression_saved_tokens INTEGER NOT NULL DEFAULT 0;`,

  '012_gateway_key_expiry.sql': `-- Optional expiry for gateway API keys (NULL = never expires).
ALTER TABLE gateway_keys ADD COLUMN expires_at TEXT;`,

  '013_gateway_key_cache_scope.sql': `-- Per-key L1 cache scope: 'conversation' (default) or 'lastUser' (FAQ mode).
ALTER TABLE gateway_keys ADD COLUMN cache_scope TEXT;`,

  '014_settings_dlp_rules.sql': `-- Org-defined DLP regex rules (JSON array of {label, pattern}).
ALTER TABLE settings ADD COLUMN dlp_custom_rules TEXT NOT NULL DEFAULT '[]';`,

  '015_users.sql': `-- Login + RBAC: users (salted hash) and permission groups (role + project access).
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'contributor',
  group_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS permission_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'contributor',
  project_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);`,

  '016_settings_dlp_disabled_models.sql': `-- Models for which the DLP egress guard is skipped.
ALTER TABLE settings ADD COLUMN dlp_disabled_models TEXT NOT NULL DEFAULT '[]';`,
};

/** Rewrite the SQLite-authored DDL for the target driver. */
function toDialect(sql: string, driver: 'sqlite' | 'postgres'): string {
  if (driver === 'sqlite') return sql;
  // Postgres: TEXT timestamp columns default to a text-ISO value from now().
  return sql.replace(/datetime\('now'\)/g, "now()::text");
}

const migrationFiles = ['001_initial.sql', '002_agent_activity.sql', '003_agent_memory.sql', '004_settings_provider_keys.sql', '005_llm_providers.sql', '006_cost_savings.sql', '007_gateway.sql', '008_gateway_key_scope.sql', '009_agent_canvas_and_knowledge.sql', '010_run_step_breakdown.sql', '011_run_step_compression.sql', '012_gateway_key_expiry.sql', '013_gateway_key_cache_scope.sql', '014_settings_dlp_rules.sql', '015_users.sql', '016_settings_dlp_disabled_models.sql', '017_provider_auth.sql'];

let db: Db | undefined;

export function getDb(): Db {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

export async function initDb(): Promise<Db> {
  if (config.dbDriver === 'postgres') {
    if (!config.databaseUrl) throw new Error('DB_DRIVER=postgres requires DATABASE_URL');
    log.info('Initializing database (postgres)');
    db = await createPostgresDb(config.databaseUrl);
  } else {
    log.info(`Initializing database (sqlite) at: ${config.dbPath}`);
    db = createSqliteDb(config.dbPath);
  }

  await runMigrations(db);
  log.info('Database initialized successfully');
  return db;
}

async function runMigrations(database: Db): Promise<void> {
  log.info('Running migrations...');

  // Migration-tracking table (auto-increment id differs by dialect).
  const idCol = database.driver === 'postgres' ? 'id SERIAL PRIMARY KEY' : 'id INTEGER PRIMARY KEY AUTOINCREMENT';
  await database.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
      ${idCol},
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT (${database.driver === 'postgres' ? "now()::text" : "datetime('now')"})
    )`,
  );

  const appliedStmt = database.prepare('SELECT name FROM _migrations WHERE name = ?');
  const insertStmt = database.prepare('INSERT INTO _migrations (name) VALUES (?)');

  for (const file of migrationFiles) {
    const existing = await appliedStmt.get(file);
    if (existing) {
      log.info(`Migration ${file} already applied, skipping`);
      continue;
    }

    const sql = MIGRATIONS[file];
    if (!sql) {
      throw new Error(`Migration file not found: ${file}`);
    }

    await database.exec(toDialect(sql, database.driver));
    await insertStmt.run(file);
    log.info(`Applied migration: ${file}`);
  }
}

export { db };
