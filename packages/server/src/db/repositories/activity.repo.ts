import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { AgentActivity, ActivityStatus } from '@subagent/shared';

interface ActivityRow {
  id: string;
  project_id: string;
  agent_id: string;
  type: string;
  query: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

function rowToActivity(row: ActivityRow): AgentActivity {
  return {
    id: row.id,
    projectId: row.project_id,
    agentId: row.agent_id,
    type: row.type as AgentActivity['type'],
    query: row.query,
    status: row.status as ActivityStatus,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

export const activityRepo = {
  create(input: { projectId: string; agentId: string; type: AgentActivity['type']; query: string }): AgentActivity {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO agent_activities (id, project_id, agent_id, type, query, status, started_at, created_at)
      VALUES (?, ?, ?, ?, ?, 'running', ?, ?)
    `).run(id, input.projectId, input.agentId, input.type, input.query, now, now);

    return this.findById(id)!;
  },

  complete(id: string, status: 'completed' | 'failed' = 'completed'): AgentActivity | undefined {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('UPDATE agent_activities SET status = ?, completed_at = ? WHERE id = ?')
      .run(status, now, id);
    return this.findById(id);
  },

  findById(id: string): AgentActivity | undefined {
    const db = getDb();
    const row = db.prepare('SELECT * FROM agent_activities WHERE id = ?').get(id) as ActivityRow | undefined;
    return row ? rowToActivity(row) : undefined;
  },

  findByAgentId(agentId: string, limit = 50): AgentActivity[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM agent_activities WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(agentId, limit) as ActivityRow[];
    return rows.map(rowToActivity);
  },

  findByProjectId(projectId: string, limit = 50): AgentActivity[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM agent_activities WHERE project_id = ? ORDER BY created_at DESC LIMIT ?')
      .all(projectId, limit) as ActivityRow[];
    return rows.map(rowToActivity);
  },

  remove(id: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM agent_activities WHERE id = ?').run(id);
    return result.changes > 0;
  },

  removeByAgentId(agentId: string): number {
    const db = getDb();
    const result = db.prepare('DELETE FROM agent_activities WHERE agent_id = ?').run(agentId);
    return result.changes;
  },
};
