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
  // ── External agent columns (empty for orchestrator/specialist) ─────────────
  ext_endpoint_url: string;
  ext_auth_type: string;
  ext_header_name: string;
  ext_secret: string;
  ext_default_model: string;
  ext_supports_images: number;
  ext_supports_streaming: number;
  ext_payload_shape: string;
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
  const base: Agent = {
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
  if (row.role === 'external') {
    base.external = {
      endpointUrl: row.ext_endpoint_url ?? '',
      authType: (row.ext_auth_type as 'none' | 'bearer' | 'header') || 'none',
      headerName: row.ext_header_name ?? '',
      hasSecret: !!row.ext_secret,
      defaultModel: row.ext_default_model ?? '',
      supportsImages: (row.ext_supports_images ?? 0) === 1,
      supportsStreaming: (row.ext_supports_streaming ?? 1) === 1,
      payloadShape: (row.ext_payload_shape as 'openai') || 'openai',
    };
  }
  return base;
}

/** Internal: same as `rowToAgent` but also returns the raw `ext_secret` for outbound calls. */
function rowToAgentWithSecret(row: AgentRow): Agent & { externalSecret?: string } {
  const agent = rowToAgent(row) as Agent & { externalSecret?: string };
  if (row.role === 'external') agent.externalSecret = row.ext_secret ?? '';
  return agent;
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

    const ext = input.role === 'external' ? (input.external ?? {}) : {};
    await db.prepare(`
      INSERT INTO agents (id, project_id, role, name, slug, description, system_prompt, model_config, permissions, template_id, color, icon, x_axis, y_axis,
        ext_endpoint_url, ext_auth_type, ext_header_name, ext_secret, ext_default_model, ext_supports_images, ext_supports_streaming, ext_payload_shape,
        created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      ext.endpointUrl ?? '',
      ext.authType ?? 'none',
      ext.headerName ?? '',
      ext.secret ?? '',
      ext.defaultModel ?? '',
      ext.supportsImages ? 1 : 0,
      ext.supportsStreaming === false ? 0 : 1,
      ext.payloadShape ?? 'openai',
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

    // External-agent fields — only touched when the agent is external. Undefined field on the
    // patch = keep. `secret: ''` explicitly clears the token; omitting `secret` keeps existing.
    let extEndpoint = '';
    let extAuth = 'none';
    let extHeader = '';
    let extSecret = '';
    let extDefaultModel = '';
    let extSupportsImages = 0;
    let extSupportsStreaming = 1;
    let extPayloadShape = 'openai';
    if (existing.role === 'external') {
      const row = await db.prepare('SELECT * FROM agents WHERE id = ?').get<AgentRow>(id);
      const patch = input.external ?? {};
      extEndpoint = patch.endpointUrl ?? row?.ext_endpoint_url ?? '';
      extAuth = patch.authType ?? row?.ext_auth_type ?? 'none';
      extHeader = patch.headerName ?? row?.ext_header_name ?? '';
      extSecret = patch.secret !== undefined ? patch.secret : (row?.ext_secret ?? '');
      extDefaultModel = patch.defaultModel ?? row?.ext_default_model ?? '';
      extSupportsImages = (patch.supportsImages !== undefined ? patch.supportsImages : (row?.ext_supports_images === 1)) ? 1 : 0;
      extSupportsStreaming = (patch.supportsStreaming !== undefined ? patch.supportsStreaming : (row?.ext_supports_streaming === 1)) ? 1 : 0;
      extPayloadShape = patch.payloadShape ?? row?.ext_payload_shape ?? 'openai';
    }

    await db.prepare(`
      UPDATE agents SET name = ?, slug = ?, description = ?, system_prompt = ?, model_config = ?, permissions = ?, color = ?, icon = ?, x_axis = ?, y_axis = ?,
        ext_endpoint_url = ?, ext_auth_type = ?, ext_header_name = ?, ext_secret = ?, ext_default_model = ?, ext_supports_images = ?, ext_supports_streaming = ?, ext_payload_shape = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      name, slug, description, systemPrompt,
      JSON.stringify(modelConfig), JSON.stringify(permissions),
      color, icon, xAxis, yAxis,
      extEndpoint, extAuth, extHeader, extSecret, extDefaultModel, extSupportsImages, extSupportsStreaming, extPayloadShape,
      now, id,
    );

    return (await this.findById(id))!;
  },

  /** Same as `findById` but includes the raw ext_secret for outbound calls. Not exported client-side. */
  async findByIdWithSecret(id: string): Promise<(Agent & { externalSecret?: string }) | undefined> {
    const db = getDb();
    const row = await db.prepare('SELECT * FROM agents WHERE id = ?').get<AgentRow>(id);
    return row ? rowToAgentWithSecret(row) : undefined;
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
