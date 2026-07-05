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

  '018_governance.sql': `-- Governance: group token quotas, gateway-key→group link, per-request user attribution,
-- per-model limits, and staged (approval-pending) file changes.
ALTER TABLE permission_groups ADD COLUMN token_quota INTEGER;
ALTER TABLE gateway_keys ADD COLUMN group_id TEXT;
ALTER TABLE runs ADD COLUMN user_id TEXT;
ALTER TABLE runs ADD COLUMN username TEXT;
ALTER TABLE runs ADD COLUMN group_id TEXT;
ALTER TABLE gateway_usage ADD COLUMN group_id TEXT;
ALTER TABLE settings ADD COLUMN model_limits_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE file_changes ADD COLUMN status TEXT NOT NULL DEFAULT 'applied';
ALTER TABLE file_changes ADD COLUMN applied_at TEXT;`,

  '019_group_usage.sql': `-- Per-group monthly token consumption (shared pool; period = 'YYYY-MM'). Drives quota enforcement.
CREATE TABLE IF NOT EXISTS group_token_usage (
  group_id TEXT NOT NULL,
  period TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0.0,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (group_id, period)
);`,

  '021_enabled_models.sql': `-- Curated allowlist of catalog model ids exposed in pickers/gateway ([] = all available).
ALTER TABLE settings ADD COLUMN enabled_models_json TEXT NOT NULL DEFAULT '[]';`,

  '022_org_profile.sql': `-- Organization profile shown in Settings → General.
ALTER TABLE settings ADD COLUMN org_name TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN org_description TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN org_contact TEXT NOT NULL DEFAULT '';
ALTER TABLE settings ADD COLUMN org_website TEXT NOT NULL DEFAULT '';`,

  '023_issues_integrations.sql': `-- Issue tracking + external tracker (GitHub/Jira/Azure Boards) integrations.
CREATE TABLE IF NOT EXISTS integration_connections (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  base_url TEXT NOT NULL DEFAULT '',
  config_json TEXT NOT NULL DEFAULT '{}',
  token TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS project_integrations (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  connection_id TEXT NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  sync_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_project_integrations_project ON project_integrations(project_id);

CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'issue',
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  source TEXT NOT NULL DEFAULT 'user',
  agent_id TEXT,
  run_id TEXT,
  connection_id TEXT,
  external_id TEXT,
  external_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_issues_project ON issues(project_id);`,

  '024_curation_and_key_limits.sql': `-- Curation-first model exposure + per-API-key guardrails.
ALTER TABLE settings ADD COLUMN model_curation_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gateway_keys ADD COLUMN rate_limit_per_min INTEGER;
ALTER TABLE gateway_keys ADD COLUMN monthly_budget_usd REAL;`,

  '025_issue_labels_and_pull.sql': `-- Free-form labels on issues + per-connection label vocabulary + inbound-pull bookkeeping.
ALTER TABLE issues ADD COLUMN labels_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE integration_connections ADD COLUMN labels_vocabulary_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE project_integrations ADD COLUMN last_pull_at TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_issues_external ON issues(connection_id, external_id);`,

  '028_project_sonarqube_key.sql': `-- Per-project SonarQube project key. Only meaningful when the project is linked
-- to a 'sonarqube' integration_connection. Empty means "not linked yet".
ALTER TABLE projects ADD COLUMN sonarqube_project_key TEXT NOT NULL DEFAULT '';`,

  '029_external_agents.sql': `-- External agents: HTTP proxy to a team-built endpoint (OpenAI-compatible /chat/completions).
-- Only meaningful when agents.role='external'. Legacy agents (role in orchestrator/specialist)
-- leave all these columns empty.
ALTER TABLE agents ADD COLUMN ext_endpoint_url TEXT NOT NULL DEFAULT '';
ALTER TABLE agents ADD COLUMN ext_auth_type TEXT NOT NULL DEFAULT 'none';
ALTER TABLE agents ADD COLUMN ext_header_name TEXT NOT NULL DEFAULT '';
ALTER TABLE agents ADD COLUMN ext_secret TEXT NOT NULL DEFAULT '';
ALTER TABLE agents ADD COLUMN ext_default_model TEXT NOT NULL DEFAULT '';
ALTER TABLE agents ADD COLUMN ext_supports_images INTEGER NOT NULL DEFAULT 0;
ALTER TABLE agents ADD COLUMN ext_supports_streaming INTEGER NOT NULL DEFAULT 1;
ALTER TABLE agents ADD COLUMN ext_payload_shape TEXT NOT NULL DEFAULT 'openai';`,

  '027_project_git_workspace.sql': `-- Git-backed project workspaces. Local workspaces stay untouched; a project can
-- opt into 'git' source and the server clones the repo into a local mirror. PAT/token comes from
-- an existing integration_connections row (typically the GitHub or Azure DevOps connection).
ALTER TABLE projects ADD COLUMN workspace_source TEXT NOT NULL DEFAULT 'local';
ALTER TABLE projects ADD COLUMN git_url TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN git_connection_id TEXT;
ALTER TABLE projects ADD COLUMN git_default_branch TEXT NOT NULL DEFAULT 'main';
ALTER TABLE projects ADD COLUMN git_local_path TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN git_last_clone_at TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN git_clone_status TEXT NOT NULL DEFAULT 'not_cloned';
ALTER TABLE projects ADD COLUMN git_clone_error TEXT NOT NULL DEFAULT '';`,

  '026_project_goals.sql': `-- Project goals: high-level objectives the user can hand off to the orchestrator.
CREATE TABLE IF NOT EXISTS project_goals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  order_index INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'user',
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_project_goals_project ON project_goals(project_id);
CREATE INDEX IF NOT EXISTS idx_project_goals_order ON project_goals(project_id, order_index);`,

  '032_gateway_observability.sql': `-- Gateway per-call observability: latency, request status, error type, and L1 cache path.
-- status: 'ok' (billable) | 'error' | 'rate_limited' | 'quota_exceeded' | 'model_not_allowed' | 'dlp_blocked'.
ALTER TABLE gateway_usage ADD COLUMN latency_ms INTEGER;
ALTER TABLE gateway_usage ADD COLUMN status TEXT NOT NULL DEFAULT 'ok';
ALTER TABLE gateway_usage ADD COLUMN error_type TEXT;
ALTER TABLE gateway_usage ADD COLUMN cache_kind TEXT;`,

  '030_user_token_quota.sql': `-- Per-user monthly token budget (NULL/0 = unlimited). Enforced alongside the group quota.
ALTER TABLE users ADD COLUMN token_quota INTEGER;`,

  '031_user_usage.sql': `-- Per-user monthly token consumption (period = 'YYYY-MM'). Drives per-user quota enforcement.
CREATE TABLE IF NOT EXISTS user_token_usage (
  user_id TEXT NOT NULL,
  period TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0.0,
  request_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, period)
);`,

  '033_external_agent_audio.sql': `-- External agents: whether the endpoint accepts audio input (OpenAI input_audio shape).
ALTER TABLE agents ADD COLUMN ext_supports_audio INTEGER NOT NULL DEFAULT 0;`,

  '034_external_agent_video.sql': `-- External agents: whether the endpoint accepts video input (OpenAI video_url shape).
ALTER TABLE agents ADD COLUMN ext_supports_video INTEGER NOT NULL DEFAULT 0;`,

  '020_activity_log.sql': `-- Per-project audit trail: who did what (chat, file approve/reject, agent CRUD, runs).
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  user_id TEXT,
  username TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_log_project ON activity_log(project_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);`,
};

/** Rewrite the SQLite-authored DDL for the target driver. */
function toDialect(sql: string, driver: 'sqlite' | 'postgres'): string {
  if (driver === 'sqlite') return sql;
  // Postgres: TEXT timestamp columns default to a text-ISO value from now().
  return sql.replace(/datetime\('now'\)/g, "now()::text");
}

const migrationFiles = ['001_initial.sql', '002_agent_activity.sql', '003_agent_memory.sql', '004_settings_provider_keys.sql', '005_llm_providers.sql', '006_cost_savings.sql', '007_gateway.sql', '008_gateway_key_scope.sql', '009_agent_canvas_and_knowledge.sql', '010_run_step_breakdown.sql', '011_run_step_compression.sql', '012_gateway_key_expiry.sql', '013_gateway_key_cache_scope.sql', '014_settings_dlp_rules.sql', '015_users.sql', '016_settings_dlp_disabled_models.sql', '017_provider_auth.sql', '018_governance.sql', '019_group_usage.sql', '020_activity_log.sql', '021_enabled_models.sql', '022_org_profile.sql', '023_issues_integrations.sql', '024_curation_and_key_limits.sql', '025_issue_labels_and_pull.sql', '026_project_goals.sql', '027_project_git_workspace.sql', '028_project_sonarqube_key.sql', '029_external_agents.sql', '030_user_token_quota.sql', '031_user_usage.sql', '032_gateway_observability.sql', '033_external_agent_audio.sql', '034_external_agent_video.sql'];

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
