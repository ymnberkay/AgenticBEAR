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
  findAll(): Project[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as ProjectRow[];
    return rows.map(rowToProject);
  },

  findById(id: string): Project | undefined {
    const db = getDb();
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
    return row ? rowToProject(row) : undefined;
  },

  create(input: CreateProjectInput): Project {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO projects (id, name, description, workspace_path, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'active', ?, ?)
    `).run(id, input.name, input.description ?? '', input.workspacePath, now, now);

    return this.findById(id)!;
  },

  update(id: string, input: UpdateProjectInput): Project | undefined {
    const db = getDb();
    const existing = this.findById(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    const name = input.name ?? existing.name;
    const description = input.description ?? existing.description;
    const workspacePath = input.workspacePath ?? existing.workspacePath;
    const status = input.status ?? existing.status;

    db.prepare(`
      UPDATE projects SET name = ?, description = ?, workspace_path = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(name, description, workspacePath, status, now, id);

    return this.findById(id)!;
  },

  remove(id: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return result.changes > 0;
  },

  setOrchestrator(projectId: string, agentId: string | null): void {
    const db = getDb();
    db.prepare('UPDATE projects SET orchestrator_id = ?, updated_at = ? WHERE id = ?')
      .run(agentId, new Date().toISOString(), projectId);
  },
};
