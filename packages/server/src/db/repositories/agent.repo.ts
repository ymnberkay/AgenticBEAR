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
  x_axis: number | null;
  y_axis: number | null;
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
    xAxis: row.x_axis,
    yAxis: row.y_axis,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const agentRepo = {
  async findByProjectId(projectId: string): Promise<Agent[]> {
    const db = getDb();
    const rows = await db.prepare('SELECT * FROM agents WHERE project_id = ? ORDER BY created_at ASC')
      .all<AgentRow>(projectId);
    return rows.map(rowToAgent);
  },

  /** agent count per project id (single query) — for the dashboard project cards. */
  async countsByProject(): Promise<Record<string, number>> {
    const rows = await getDb().prepare('SELECT project_id, COUNT(*) AS n FROM agents GROUP BY project_id')
      .all<{ project_id: string; n: number }>();
    const out: Record<string, number> = {};
    for (const r of rows) out[r.project_id] = r.n;
    return out;
  },

  async findById(id: string): Promise<Agent | undefined> {
    const db = getDb();
    const row = await db.prepare('SELECT * FROM agents WHERE id = ?').get<AgentRow>(id);
    return row ? rowToAgent(row) : undefined;
  },

  async create(input: CreateAgentInput): Promise<Agent> {
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

    await db.prepare(`
      INSERT INTO agents (id, project_id, role, name, slug, description, system_prompt, model_config, permissions, template_id, color, icon, x_axis, y_axis, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      input.xAxis ?? null,
      input.yAxis ?? null,
      now,
      now,
    );

    // If this is an orchestrator, set it on the project
    if (input.role === 'orchestrator') {
      await db.prepare('UPDATE projects SET orchestrator_id = ?, updated_at = ? WHERE id = ?')
        .run(id, now, input.projectId);
    }

    return (await this.findById(id))!;
  },

  async update(id: string, input: UpdateAgentInput): Promise<Agent | undefined> {
    const db = getDb();
    const existing = await this.findById(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    const name = input.name ?? existing.name;
    const slug = input.name ? slugify(input.name) : existing.slug;
    const description = input.description ?? existing.description;
    const systemPrompt = input.systemPrompt ?? existing.systemPrompt;
    const color = input.color ?? existing.color;
    const icon = input.icon ?? existing.icon;
    const xAxis = input.xAxis !== undefined ? input.xAxis : (existing.xAxis ?? null);
    const yAxis = input.yAxis !== undefined ? input.yAxis : (existing.yAxis ?? null);

    const modelConfig: ModelConfig = input.modelConfig
      ? { ...existing.modelConfig, ...input.modelConfig }
      : existing.modelConfig;

    const permissions: AgentPermissions = input.permissions
      ? { ...existing.permissions, ...input.permissions }
      : existing.permissions;

    await db.prepare(`
      UPDATE agents SET name = ?, slug = ?, description = ?, system_prompt = ?, model_config = ?, permissions = ?, color = ?, icon = ?, x_axis = ?, y_axis = ?, updated_at = ?
      WHERE id = ?
    `).run(
      name, slug, description, systemPrompt,
      JSON.stringify(modelConfig), JSON.stringify(permissions),
      color, icon, xAxis, yAxis, now, id,
    );

    return (await this.findById(id))!;
  },

  async remove(id: string): Promise<boolean> {
    const db = getDb();
    const agent = await this.findById(id);
    if (!agent) return false;

    // If this was the project's orchestrator, clear it
    if (agent.role === 'orchestrator') {
      await db.prepare('UPDATE projects SET orchestrator_id = NULL, updated_at = ? WHERE orchestrator_id = ?')
        .run(new Date().toISOString(), id);
    }

    const result = await db.prepare('DELETE FROM agents WHERE id = ?').run(id);
    return result.changes > 0;
  },
};
