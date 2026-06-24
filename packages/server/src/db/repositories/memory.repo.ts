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
  async create(input: {
    agentId: string;
    projectId: string;
    type: MemoryType;
    query: string;
    response: string;
    runId?: string | null;
  }): Promise<AgentMemory> {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();

    await db.prepare(`
      INSERT INTO agent_memories (id, agent_id, project_id, type, query, response, run_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.agentId, input.projectId, input.type, input.query, input.response, input.runId ?? null, now);

    return rowToMemory(
      (await db.prepare('SELECT * FROM agent_memories WHERE id = ?').get<MemoryRow>(id))!,
    );
  },

  // For context injection — N most recent, ASC so oldest first in prompt
  async findByAgentId(agentId: string, limit = 20): Promise<AgentMemory[]> {
    const db = getDb();
    // Subquery aliased (`t`) — Postgres requires an alias on derived tables.
    const rows = await db.prepare(`
      SELECT * FROM (
        SELECT * FROM agent_memories WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?
      ) AS t ORDER BY created_at ASC
    `).all<MemoryRow>(agentId, limit);
    return rows.map(rowToMemory);
  },

  // For UI display — all entries, newest first
  async findAllByAgentId(agentId: string): Promise<AgentMemory[]> {
    const db = getDb();
    const rows = await db.prepare('SELECT * FROM agent_memories WHERE agent_id = ? ORDER BY created_at DESC')
      .all<MemoryRow>(agentId);
    return rows.map(rowToMemory);
  },

  async remove(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.prepare('DELETE FROM agent_memories WHERE id = ?').run(id);
    return result.changes > 0;
  },

  async removeByAgentId(agentId: string): Promise<number> {
    const db = getDb();
    const result = await db.prepare('DELETE FROM agent_memories WHERE agent_id = ?').run(agentId);
    return result.changes;
  },

  async removeByProjectId(projectId: string): Promise<number> {
    const db = getDb();
    const result = await db.prepare('DELETE FROM agent_memories WHERE project_id = ?').run(projectId);
    return result.changes;
  },
};
