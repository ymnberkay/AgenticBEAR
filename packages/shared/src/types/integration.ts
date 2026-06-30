export type IntegrationKind = 'github' | 'jira' | 'azure_devops';
export type ExternalTaskKind = 'issue' | 'bug' | 'task' | 'vulnerability' | 'improvement';

export interface IntegrationConnection {
  id: string;
  kind: IntegrationKind;
  label: string;
  credentials: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectIntegration {
  id: string;
  projectId: string;
  connectionId: string;
  kind: IntegrationKind;
  targetName: string;
  targetId: string;
  syncEnabled: boolean;
  createdAt: string;
}

export interface ExternalTask {
  id: string;
  projectId: string;
  projectIntegrationId: string;
  externalId: string;
  externalUrl: string;
  kind: ExternalTaskKind;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee: string | null;
  reporterAgentId: string | null;
  sourceRunId: string | null;
  labels: string[];
  externalCreatedAt: string;
  externalUpdatedAt: string;
  lastSyncedAt: string;
  createdAt: string;
}
