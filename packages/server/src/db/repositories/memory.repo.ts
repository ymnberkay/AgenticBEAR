import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { AgentMemory, MemoryType } from '@subagent/shared';

interface MemoryRow {
  id: string;
  agent_id: string;
  project_id: string;
  type: string;
  query: string;
  response: string;
  run_id: string | null;
  created_at: string;
}

function rowToMemory(row: MemoryRow): AgentMemory {
  return {
    id: row.id,
    agentId: row.agent_id,
    projectId: row.project_id,
    type: row.type as MemoryType,
    query: row.query,
    response: row.response,
    runId: row.run_id,
    createdAt: row.created_at,
  };
}

export const memoryRepo = {
  create(input: {
    agentId: string;
    projectId: string;
    type: MemoryType;
    query: string;
    response: string;
    runId?: string | null;
  }): AgentMemory {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO agent_memories (id, agent_id, project_id, type, query, response, run_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.agentId, input.projectId, input.type, input.query, input.response, input.runId ?? null, now);

    return rowToMemory(
      db.prepare('SELECT * FROM agent_memories WHERE id = ?').get(id) as MemoryRow,
    );
  },

  // For context injection — N most recent, ASC so oldest first in prompt
  findByAgentId(agentId: string, limit = 20): AgentMemory[] {
    const db = getDb();
    const rows = db.prepare(`
      SELECT * FROM (
        SELECT * FROM agent_memories WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?
      ) ORDER BY created_at ASC
    `).all(agentId, limit) as MemoryRow[];
    return rows.map(rowToMemory);
  },

  // For UI display — all entries, newest first
  findAllByAgentId(agentId: string): AgentMemory[] {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM agent_memories WHERE agent_id = ? ORDER BY created_at DESC')
      .all(agentId) as MemoryRow[];
    return rows.map(rowToMemory);
  },

  remove(id: string): boolean {
    const db = getDb();
    const result = db.prepare('DELETE FROM agent_memories WHERE id = ?').run(id);
    return result.changes > 0;
  },

  removeByAgentId(agentId: string): number {
    const db = getDb();
    const result = db.prepare('DELETE FROM agent_memories WHERE agent_id = ?').run(agentId);
    return result.changes;
  },

  removeByProjectId(projectId: string): number {
    const db = getDb();
    const result = db.prepare('DELETE FROM agent_memories WHERE project_id = ?').run(projectId);
    return result.changes;
  },
};
