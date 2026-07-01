import { getDb } from '../client.js';
import { generateId } from '@subagent/shared';
import type { Project, CreateProjectInput, UpdateProjectInput, GitCloneStatus, WorkspaceSource } from '@subagent/shared';

interface ProjectRow {
  id: string;
  name: string;
  description: string;
  workspace_path: string;
  status: string;
  orchestrator_id: string | null;
  workspace_source: string;
  git_url: string;
  git_connection_id: string | null;
  git_default_branch: string;
  git_local_path: string;
  git_last_clone_at: string;
  git_clone_status: string;
  git_clone_error: string;
  sonarqube_project_key: string;
  created_at: string;
  updated_at: string;
}

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    workspacePath: row.workspace_path,
    status: row.status as Project['status'],
    orchestratorId: row.orchestrator_id,
    workspaceSource: (row.workspace_source || 'local') as WorkspaceSource,
    gitUrl: row.git_url ?? '',
    gitConnectionId: row.git_connection_id,
    gitDefaultBranch: row.git_default_branch || 'main',
    gitLocalPath: row.git_local_path ?? '',
    gitLastCloneAt: row.git_last_clone_at ?? '',
    gitCloneStatus: (row.git_clone_status || 'not_cloned') as GitCloneStatus,
    gitCloneError: row.git_clone_error ?? '',
    sonarqubeProjectKey: row.sonarqube_project_key ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const projectRepo = {
  async findAll(): Promise<Project[]> {
    const db = getDb();
    const rows = await db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all<ProjectRow>();
    return rows.map(rowToProject);
  },

  async findById(id: string): Promise<Project | undefined> {
    const db = getDb();
    const row = await db.prepare('SELECT * FROM projects WHERE id = ?').get<ProjectRow>(id);
    return row ? rowToProject(row) : undefined;
  },

  async create(input: CreateProjectInput): Promise<Project> {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();
    const source = input.workspaceSource ?? 'local';

    await db.prepare(`
      INSERT INTO projects (id, name, description, workspace_path, status, created_at, updated_at,
        workspace_source, git_url, git_connection_id, git_default_branch)
      VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)
    `).run(
      id, input.name, input.description ?? '', input.workspacePath ?? '', now, now,
      source, input.gitUrl ?? '', input.gitConnectionId ?? null, input.gitDefaultBranch ?? 'main',
    );

    return (await this.findById(id))!;
  },

  async update(id: string, input: UpdateProjectInput): Promise<Project | undefined> {
    const db = getDb();
    const existing = await this.findById(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    const name = input.name ?? existing.name;
    const description = input.description ?? existing.description;
    const workspacePath = input.workspacePath ?? existing.workspacePath;
    const status = input.status ?? existing.status;
    const workspaceSource = input.workspaceSource ?? existing.workspaceSource;
    const gitUrl = input.gitUrl ?? existing.gitUrl;
    const gitConnectionId = input.gitConnectionId !== undefined ? input.gitConnectionId : existing.gitConnectionId;
    const gitDefaultBranch = input.gitDefaultBranch ?? existing.gitDefaultBranch;
    const sonarqubeProjectKey = input.sonarqubeProjectKey ?? existing.sonarqubeProjectKey;

    await db.prepare(`
      UPDATE projects SET name = ?, description = ?, workspace_path = ?, status = ?, updated_at = ?,
        workspace_source = ?, git_url = ?, git_connection_id = ?, git_default_branch = ?,
        sonarqube_project_key = ?
      WHERE id = ?
    `).run(name, description, workspacePath, status, now,
      workspaceSource, gitUrl, gitConnectionId, gitDefaultBranch,
      sonarqubeProjectKey, id);

    return (await this.findById(id))!;
  },

  /** Persist the current state of the local clone (called by git-workspace.service). */
  async setGitCloneState(
    id: string,
    state: { status: GitCloneStatus; localPath?: string; lastCloneAt?: string; error?: string },
  ): Promise<void> {
    const db = getDb();
    const existing = await this.findById(id);
    if (!existing) return;
    await db.prepare(`
      UPDATE projects SET git_clone_status = ?, git_local_path = ?, git_last_clone_at = ?, git_clone_error = ?, updated_at = ?
      WHERE id = ?
    `).run(
      state.status,
      state.localPath ?? existing.gitLocalPath,
      state.lastCloneAt ?? existing.gitLastCloneAt,
      state.error ?? '',
      new Date().toISOString(),
      id,
    );
  },

  async remove(id: string): Promise<boolean> {
    const db = getDb();
    const result = await db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return result.changes > 0;
  },

  async setOrchestrator(projectId: string, agentId: string | null): Promise<void> {
    const db = getDb();
    await db.prepare('UPDATE projects SET orchestrator_id = ?, updated_at = ? WHERE id = ?')
      .run(agentId, new Date().toISOString(), projectId);
  },
};
