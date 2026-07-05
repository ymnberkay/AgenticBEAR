import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { CreateProjectDocumentInput, ProjectDocument } from '@subagent/shared';

interface DocRow {
  id: string;
  project_id: string;
  agent_id: string | null;
  name: string;
  content: string;
  created_at: string;
}

function rowToDoc(row: DocRow): ProjectDocument {
  return { id: row.id, projectId: row.project_id, agentId: row.agent_id, name: row.name, content: row.content, createdAt: row.created_at };
}

export const documentRepo = {
  async findByProjectId(projectId: string): Promise<ProjectDocument[]> {
    const db = getDb();
    const rows = await db.prepare('SELECT * FROM project_documents WHERE project_id = ? ORDER BY created_at ASC')
      .all<DocRow>(projectId);
    return rows.map(rowToDoc);
  },

  /** Documents visible to one agent: its own + legacy unassigned (project-wide) ones. */
  async findForAgent(projectId: string, agentId: string): Promise<ProjectDocument[]> {
    const db = getDb();
    const rows = await db.prepare(
      'SELECT * FROM project_documents WHERE project_id = ? AND (agent_id IS NULL OR agent_id = ?) ORDER BY created_at ASC',
    ).all<DocRow>(projectId, agentId);
    return rows.map(rowToDoc);
  },

  async create(projectId: string, input: CreateProjectDocumentInput): Promise<ProjectDocument> {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();
    const agentId = input.agentId ?? null;
    await db.prepare('INSERT INTO project_documents (id, project_id, agent_id, name, content, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, projectId, agentId, input.name, input.content, now);
    return { id, projectId, agentId, name: input.name, content: input.content, createdAt: now };
  },

  async remove(id: string): Promise<boolean> {
    const db = getDb();
    return (await db.prepare('DELETE FROM project_documents WHERE id = ?').run(id)).changes > 0;
  },
};
