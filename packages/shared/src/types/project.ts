export type ProjectStatus = 'active' | 'archived' | 'draft';

/** Where the project's file tree comes from. `local` = user-picked directory; `git` = a repo cloned into a local mirror on this server. */
export type WorkspaceSource = 'local' | 'git';

/** Lifecycle of the git clone the server maintains for a `git`-source project. */
export type GitCloneStatus = 'not_cloned' | 'cloning' | 'ready' | 'error';

export interface Project {
  id: string;
  name: string;
  description: string;
  /** For `local` sources: the user-picked directory. For `git` sources: unused (see `gitLocalPath`). */
  workspacePath: string;
  status: ProjectStatus;
  orchestratorId: string | null;
  // ── Workspace source ──────────────────────────────────────────────────────
  workspaceSource: WorkspaceSource;
  /** Git remote URL, e.g. https://github.com/acme/app.git */
  gitUrl: string;
  /** Which integration_connections row owns the PAT/token used for clone+push. Null → try unauthenticated. */
  gitConnectionId: string | null;
  gitDefaultBranch: string;
  /** Local mirror path once the server has cloned the repo. */
  gitLocalPath: string;
  gitCloneStatus: GitCloneStatus;
  /** ISO of the last successful clone. Empty when never cloned. */
  gitLastCloneAt: string;
  /** Human-readable clone error message (empty when clean). */
  gitCloneError: string;
  // ── SonarQube link ───────────────────────────────────────────────────────
  /** Project key on the linked SonarQube server (empty when no SQ link). */
  sonarqubeProjectKey: string;
  createdAt: string;
  updatedAt: string;
  /** Number of agents in the project (attached by the list endpoint; undefined elsewhere). */
  agentCount?: number;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  workspacePath?: string;
  workspaceSource?: WorkspaceSource;
  gitUrl?: string;
  gitConnectionId?: string | null;
  gitDefaultBranch?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  workspacePath?: string;
  status?: ProjectStatus;
  workspaceSource?: WorkspaceSource;
  gitUrl?: string;
  gitConnectionId?: string | null;
  gitDefaultBranch?: string;
  sonarqubeProjectKey?: string;
}
