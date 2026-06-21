import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { CreateProjectDocumentInput, ProjectDocument } from '@subagent/shared';

interface DocRow {
  id: string;
  project_id: string;
  name: string;
  content: string;
  created_at: string;
}

function rowToDoc(row: DocRow): ProjectDocument {
  return { id: row.id, projectId: row.project_id, name: row.name, content: row.content, createdAt: row.created_at };
}

export const documentRepo = {
  findByProjectId(projectId: string): ProjectDocument[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM project_documents WHERE project_id = ? ORDER BY created_at ASC')
      .all(projectId) as DocRow[];
    return rows.map(rowToDoc);
  },

  create(projectId: string, input: CreateProjectDocumentInput): ProjectDocument {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO project_documents (id, project_id, name, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, projectId, input.name, input.content, now);
    return { id, projectId, name: input.name, content: input.content, createdAt: now };
  },

  remove(id: string): boolean {
    const db = getDb();
    return db.prepare('DELETE FROM project_documents WHERE id = ?').run(id).changes > 0;
  },
};
