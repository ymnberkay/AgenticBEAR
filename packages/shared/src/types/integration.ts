/**
 * Issue tracking + external integrations.
 *
 * `Issue` is an internal, per-project issue (agents like security/qa file these). When the project
 * is linked to an integration connection with sync enabled, an issue is also opened in the external
 * tracker (GitHub Issues / Jira / Azure Boards) and the external id/url are stored back on the issue.
 */

export type IntegrationKind = 'github' | 'jira' | 'azure_devops';
export type IssueKind = 'issue' | 'bug' | 'task' | 'vulnerability' | 'improvement';
export type IssueStatus = 'open' | 'in_progress' | 'closed';
export type IssuePriority = 'low' | 'medium' | 'high' | 'critical';

/** Org-level connection to an external tracker. `credentials` are write-only (masked on read). */
export interface IntegrationConnection {
  id: string;
  kind: IntegrationKind;
  label: string;
  /** API base, e.g. https://api.github.com, https://your.atlassian.net, https://dev.azure.com/org. */
  baseUrl: string;
  /** Provider-specific routing: GitHub {owner,repo}; Jira {projectKey,email}; Azure {org,project}. */
  config: Record<string, string>;
  enabled: boolean;
  /** True when a secret/token is stored (the value itself is never returned). */
  hasCredentials: boolean;
  /** Suggested labels offered as autocomplete when filing an issue against this connection. Free-form: users/agents may add others. */
  labelsVocabulary: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateIntegrationConnectionInput {
  kind: IntegrationKind;
  label: string;
  baseUrl?: string;
  config?: Record<string, string>;
  /** Token/secret (e.g. GitHub PAT, Jira API token, Azure PAT). Stored encrypted-at-rest-ish, masked on read. */
  token?: string;
  enabled?: boolean;
  labelsVocabulary?: string[];
}

export type UpdateIntegrationConnectionInput = Partial<CreateIntegrationConnectionInput>;

/** Links a project to a connection: where this project's issues sync to. */
export interface ProjectIntegration {
  id: string;
  projectId: string;
  connectionId: string;
  kind: IntegrationKind;
  /** Sync new issues to the external tracker? */
  syncEnabled: boolean;
  createdAt: string;
}

export interface Issue {
  id: string;
  projectId: string;
  title: string;
  description: string;
  kind: IssueKind;
  status: IssueStatus;
  priority: IssuePriority;
  /** Free-form labels (synced as Azure tags / Jira labels / GitHub labels). */
  labels: string[];
  /** 'agent' (filed by an agent) or 'user'. */
  source: string;
  agentId: string | null;
  runId: string | null;
  /** Set when synced to an external tracker. */
  connectionId: string | null;
  externalId: string | null;
  externalUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIssueInput {
  title: string;
  description?: string;
  kind?: IssueKind;
  priority?: IssuePriority;
  labels?: string[];
  source?: string;
  agentId?: string | null;
  runId?: string | null;
}

/** Result of a manual or scheduled pull from the linked external tracker. */
export interface IssuePullResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: string[];
  syncedAt: string;
}
