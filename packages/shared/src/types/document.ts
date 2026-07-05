/**
 * A knowledge document. Bound to one specialist/orchestrator agent via `agentId`
 * (injected only into that agent's context); `agentId` null/undefined = legacy
 * project-wide document, injected into every internal agent. Never external agents.
 */
export interface ProjectDocument {
  id: string;
  projectId: string;
  agentId?: string | null;
  name: string;
  content: string;
  createdAt: string;
}

export interface CreateProjectDocumentInput {
  name: string;
  content: string;
  agentId?: string | null;
}
