export type ProjectStatus = 'active' | 'archived' | 'draft';

export interface Project {
  id: string;
  name: string;
  description: string;
  workspacePath: string;
  status: ProjectStatus;
  orchestratorId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  workspacePath: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  workspacePath?: string;
  status?: ProjectStatus;
}
