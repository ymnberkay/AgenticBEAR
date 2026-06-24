import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { Project, CreateProjectInput, UpdateProjectInput } from '@subagent/shared';

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  workspace_path: string;
  status: string;
  orchestrator_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workspacePath: row.workspace_path,
    status: row.status as Project['status'],
    orchestratorId: row.orchestrator_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const projectRepo = {
  async findAll(): Promise<Project[]> {
    const db = getDb();
    const rows = await db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all<ProjectRow>();
    return rows.map(rowToProject);
  },

  async findById(id: string): Promise<Project | undefined> {
    const db = getDb();
    const row = await db.prepare('SELECT * FROM projects WHERE id = ?').get<ProjectRow>(id);
    return row ? rowToProject(row) : undefined;
  },

  async create(input: CreateProjectInput): Promise<Project> {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO projects (id, name, description, workspace_path, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).run(id, input.name, input.description ?? '', input.workspacePath, now, now);

    return (await this.findById(id))!;
  },

  async update(id: string, input: UpdateProjectInput): Promise<Project | undefined> {
    const db = getDb();
    const existing = await this.findById(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    const name = input.name ?? existing.name;
    const description = input.description ?? existing.description;
    const workspacePath = input.workspacePath ?? existing.workspacePath;
    const status = input.status ?? existing.status;

    await db.prepare(`
      UPDATE projects SET name = ?, description = ?, workspace_path = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(name, description, workspacePath, status, now, id);

    return (await this.findById(id))!;
  },

  async remove(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return result.changes > 0;
  },

  async setOrchestrator(projectId: string, agentId: string | null): Promise<void> {
    const db = getDb();
    await db.prepare('UPDATE projects SET orchestrator_id = ?, updated_at = ? WHERE id = ?')
      .run(agentId, new Date().toISOString(), projectId);
  },
};
