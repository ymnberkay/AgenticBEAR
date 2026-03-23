export type ActivityStatus = 'running' | 'completed' | 'failed';

export interface AgentActivity {
  id: string;
  projectId: string;
  agentId: string;
  type: 'mcp_call' | 'direct';
  query: string;
  status: ActivityStatus;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}
