export type MemoryType = 'interaction' | 'summary';

export interface AgentMemory {
  id: string;
  agentId: string;
  projectId: string;
  type: MemoryType;
  query: string;
  response: string;
  runId: string | null;
  createdAt: string;
}
