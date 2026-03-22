import { getDb } from '../client.js';
import { generateId, DEFAULT_PERMISSIONS, DEFAULT_MODEL_CONFIG } from '@subagent/shared';
import type { Agent, CreateAgentInput, UpdateAgentInput, ModelConfig, AgentPermissions } from '@subagent/shared';

interface AgentRow {
  id: string;
  project_id: string;
  role: string;
  name: string;
  slug: string;
  description: string;
  system_prompt: string;
  model_config: string;
  permissions: string;
  template_id: string | null;
  color: string;
  icon: string;
  created_at: string;
  updated_at: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    projectId: row.project_id,
    role: row.role as Agent['role'],
    name: row.name,
    slug: row.slug,
    description: row.description,
    systemPrompt: row.system_prompt,
    modelConfig: JSON.parse(row.model_config) as ModelConfig,
    permissions: JSON.parse(row.permissions) as AgentPermissions,
    templateId: row.template_id,
    color: row.color,
    icon: row.icon,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const agentRepo = {
  findByProjectId(projectId: string): Agent[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM agents WHERE project_id = ? ORDER BY created_at ASC')
      .all(projectId) as AgentRow[];
    return rows.map(rowToAgent);
  },

  findById(id: string): Agent | undefined {
    const db = getDb();
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as AgentRow | undefined;
    return row ? rowToAgent(row) : undefined;
  },

  create(input: CreateAgentInput): Agent {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();
    const slug = slugify(input.name);

    const modelConfig: ModelConfig = {
      ...DEFAULT_MODEL_CONFIG,
      ...input.modelConfig,
    };

    const permissions: AgentPermissions = {
      ...DEFAULT_PERMISSIONS,
      ...input.permissions,
    };

    db.prepare(`
      INSERT INTO agents (id, project_id, role, name, slug, description, system_prompt, model_config, permissions, template_id, color, icon, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.projectId,
      input.role,
      input.name,
      slug,
      input.description ?? '',
      input.systemPrompt,
      JSON.stringify(modelConfig),
      JSON.stringify(permissions),
      input.templateId ?? null,
      input.color ?? '#71717a',
      input.icon ?? 'Bot',
      now,
      now,
    );

    // If this is an orchestrator, set it on the project
    if (input.role === 'orchestrator') {
      db.prepare('UPDATE projects SET orchestrator_id = ?, updated_at = ? WHERE id = ?')
        .run(id, now, input.projectId);
    }

    return this.findById(id)!;
  },

  update(id: string, input: UpdateAgentInput): Agent | undefined {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    const name = input.name ?? existing.name;
    const slug = input.name ? slugify(input.name) : existing.slug;
    const description = input.description ?? existing.description;
    const systemPrompt = input.systemPrompt ?? existing.systemPrompt;
    const color = input.color ?? existing.color;
    const icon = input.icon ?? existing.icon;

    const modelConfig: ModelConfig = input.modelConfig
      ? { ...existing.modelConfig, ...input.modelConfig }
      : existing.modelConfig;

    const permissions: AgentPermissions = input.permissions
      ? { ...existing.permissions, ...input.permissions }
      : existing.permissions;

    db.prepare(`
      UPDATE agents SET name = ?, slug = ?, description = ?, system_prompt = ?, model_config = ?, permissions = ?, color = ?, icon = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name, slug, description, systemPrompt,
      JSON.stringify(modelConfig), JSON.stringify(permissions),
      color, icon, now, id,
    );

    return this.findById(id)!;
  },

  remove(id: string): boolean {
    const db = getDb();
    const agent = this.findById(id);
    if (!agent) return false;

    // If this was the project's orchestrator, clear it
    if (agent.role === 'orchestrator') {
      db.prepare('UPDATE projects SET orchestrator_id = NULL, updated_at = ? WHERE orchestrator_id = ?')
        .run(new Date().toISOString(), id);
    }

    const result = db.prepare('DELETE FROM agents WHERE id = ?').run(id);
    return result.changes > 0;
  },
};
