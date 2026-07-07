import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { Trash2, Copy, Check, Settings, AlertTriangle, FolderOpen, GitBranch, Download, ExternalLink, Loader2, Link2, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useProject, useUpdateProject, useDeleteProject } from '../../api/hooks/use-projects';
import { useConnections, useProjectIntegrations, useLinkIntegration, useUnlinkIntegration } from '../../api/hooks/use-integrations';
import { FolderPickerInput } from '../../components/ui/folder-picker';
import { useToast } from '../../components/ui/toast';
import { Dialog } from '../../components/ui/dialog';
import { Skeleton } from '../../components/ui/skeleton';
import { apiPost } from '../../api/client';
import { ProjectSharing } from '../../components/settings/project-sharing';
import type { ProjectStatus, WorkspaceSource, Project } from '@subagent/shared';

const fieldStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border-default)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  outline: 'none',
  transition: 'border-color 0.15s',
  borderRadius: 'var(--radius-md)',
};

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label
      htmlFor={htmlFor}
      style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}
    >
      {children}
    </label>
  );
}

export function ProjectSettingsPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: project, isLoading } = useProject(projectId);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const navigate = useNavigate();
  const { show: showToast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [workspaceSource, setWorkspaceSource] = useState<WorkspaceSource>('local');
  const [gitUrl, setGitUrl] = useState('');
  const [gitConnectionId, setGitConnectionId] = useState<string>('');
  const [gitDefaultBranch, setGitDefaultBranch] = useState('main');
  const [sonarqubeProjectKey, setSonarqubeProjectKey] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const { data: connections } = useConnections();
  const queryClient = useQueryClient();
  const gitCandidates = (connections ?? []).filter((c) => (c.kind === 'github' || c.kind === 'azure_devops') && c.hasCredentials && c.enabled);

  const cloneProject = useMutation({
    mutationFn: () => apiPost<Project>(`/api/projects/${projectId}/git/clone`, {}),
    onSuccess: (p) => {
      queryClient.setQueryData(['project', projectId], p);
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      showToast('Repository cloned.', { variant: 'success' });
    },
    onError: (err) => showToast(err instanceof Error ? err.message : 'Clone failed', { variant: 'error' }),
  });
  const [copiedId, setCopiedId] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  const copyProjectId = async () => {
    try {
      await navigator.clipboard.writeText(projectId);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      showToast('Could not copy. Select and copy manually.', { variant: 'error' });
    }
  };

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description);
      setWorkspacePath(project.workspacePath ?? '');
      setStatus(project.status);
      setWorkspaceSource(project.workspaceSource ?? 'local');
      setGitUrl(project.gitUrl ?? '');
      setGitConnectionId(project.gitConnectionId ?? '');
      setGitDefaultBranch(project.gitDefaultBranch || 'main');
      setSonarqubeProjectKey(project.sonarqubeProjectKey ?? '');
    }
  }, [project]);

  const isDirty = useMemo(() => {
    if (!project) return false;
    return (
      name !== project.name ||
      description !== project.description ||
      workspacePath !== (project.workspacePath ?? '') ||
      status !== project.status ||
      workspaceSource !== (project.workspaceSource ?? 'local') ||
      gitUrl !== (project.gitUrl ?? '') ||
      (gitConnectionId || null) !== (project.gitConnectionId ?? null) ||
      gitDefaultBranch !== (project.gitDefaultBranch || 'main') ||
      sonarqubeProjectKey !== (project.sonarqubeProjectKey ?? '')
    );
  }, [project, name, description, workspacePath, status, workspaceSource, gitUrl, gitConnectionId, gitDefaultBranch, sonarqubeProjectKey]);

  // Warn before navigating away with unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  if (isLoading) {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>
        <Skeleton height={14} width={180} className="mb-6" />
        <Skeleton height={220} className="mb-3" />
        <Skeleton height={180} className="mb-3" />
        <Skeleton height={90} />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2">
        <p style={{ fontSize: 13, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>Project not found</p>
      </div>
    );
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (workspaceSource === 'git' && !gitUrl.trim()) {
      showToast('Git URL is required when workspace source is Git.', { variant: 'error' });
      return;
    }
    updateProject.mutate(
      {
        id: projectId, name, description, workspacePath, status,
        workspaceSource, gitUrl, gitConnectionId: gitConnectionId || null, gitDefaultBranch,
        sonarqubeProjectKey,
      },
      {
        onSuccess: () => showToast('Project settings saved', { variant: 'success' }),
        onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to save settings', { variant: 'error' }),
      },
    );
  };

  const handleConfirmDelete = () => {
    if (confirmName !== project.name) return;
    const deletedName = project.name;
    deleteProject.mutate(projectId, {
      onSuccess: () => {
        setConfirmOpen(false);
        showToast(`Deleted "${deletedName}"`, { variant: 'success' });
        // Back to the dashboard — staying here would 404 on the now-deleted project.
        void navigate({ to: '/' });
      },
      onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to delete', { variant: 'error' }),
    });
  };

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', width: '100%' }}>

      {/* Page header */}
      <div className="flex items-center gap-2" style={{ marginBottom: 28 }}>
        <Settings style={{ width: 13, height: 13, color: '#7c8cf8', flexShrink: 0 }} aria-hidden="true" />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
          Project Settings
        </span>
        <button
          type="button"
          onClick={copyProjectId}
          title="Copy project ID"
          className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            padding: '3px 9px', borderRadius: 999, cursor: 'pointer',
            background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
            fontSize: 10, fontFamily: 'var(--font-mono)',
            color: copiedId ? 'var(--color-success)' : 'var(--color-text-tertiary)',
            transition: 'color .15s',
          }}
        >
          id: {projectId.slice(0, 8)}…
          {copiedId ? <Check style={{ width: 11, height: 11 }} aria-hidden="true" /> : <Copy style={{ width: 11, height: 11 }} aria-hidden="true" />}
        </button>
        {isDirty && (
          <span
            aria-live="polite"
            style={{
              marginLeft: 'auto', fontSize: 10, fontFamily: 'var(--font-mono)',
              color: 'var(--color-warning)', background: 'var(--color-warning-subtle)',
              border: '1px solid rgba(226,176,74,0.25)', borderRadius: 'var(--radius-sm)',
              padding: '3px 7px', letterSpacing: '0.04em', textTransform: 'uppercase',
            }}
          >
            Unsaved changes
          </span>
        )}
      </div>

      {/* General section */}
      <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid #7c8cf8', marginBottom: 12, borderRadius: 'var(--radius-md)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
            General
          </span>
        </div>

        <form onSubmit={handleSave} aria-label="Project general settings">
          <div className="flex flex-col gap-5" style={{ padding: '16px' }}>
            <div>
              <FieldLabel htmlFor="project-name">Name</FieldLabel>
              <input
                id="project-name"
                type="text"
                value={name}
                required
                onChange={(e) => setName(e.target.value)}
                style={{ ...fieldStyle, height: 38, padding: '0 12px' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(124,140,248,0.5)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
              />
            </div>

            <div>
              <FieldLabel htmlFor="project-description">Description</FieldLabel>
              <textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{ ...fieldStyle, padding: '10px 12px', resize: 'vertical', minHeight: 72 }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(124,140,248,0.5)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
              />
            </div>

            {/* Workspace source: local path OR git repo */}
            <div>
              <FieldLabel>Workspace source</FieldLabel>
              <div role="group" aria-label="Workspace source" className="flex items-center" style={{ gap: 2, padding: 3, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 999, width: 'fit-content' }}>
                {([
                  { v: 'local' as const, label: 'Local path', icon: FolderOpen, hint: 'A directory on this machine' },
                  { v: 'git'   as const, label: 'Git repository', icon: GitBranch, hint: 'Cloned and mirrored by the server' },
                ]).map((o) => {
                  const on = workspaceSource === o.v;
                  const Icon = o.icon;
                  return (
                    <button
                      key={o.v}
                      type="button"
                      onClick={() => setWorkspaceSource(o.v)}
                      aria-pressed={on}
                      title={o.hint}
                      className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                      style={{
                        height: 30, padding: '0 12px', fontSize: 12, fontFamily: 'var(--font-mono)',
                        background: on ? 'linear-gradient(180deg, rgba(124,140,248,0.22), rgba(124,140,248,0.10))' : 'transparent',
                        border: on ? '1px solid rgba(124,140,248,0.4)' : '1px solid transparent',
                        color: on ? '#7c8cf8' : 'var(--color-text-secondary)',
                        borderRadius: 999, cursor: on ? 'default' : 'pointer', fontWeight: on ? 600 : 500,
                        transition: 'background .15s, color .15s, border-color .15s',
                      }}
                    >
                      <Icon style={{ width: 12, height: 12 }} /> {o.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {workspaceSource === 'local' ? (
              <div>
                <FieldLabel>Workspace path</FieldLabel>
                <FolderPickerInput
                  value={workspacePath}
                  onChange={setWorkspacePath}
                  inputStyle={{ ...fieldStyle, height: 38, padding: '0 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
              </div>
            ) : (
              <>
                <div>
                  <FieldLabel htmlFor="git-url">Git URL</FieldLabel>
                  <input
                    id="git-url"
                    type="text"
                    placeholder="https://github.com/acme/app.git"
                    value={gitUrl}
                    onChange={(e) => setGitUrl(e.target.value)}
                    style={{ ...fieldStyle, height: 38, padding: '0 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(124,140,248,0.5)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
                  />
                </div>

                <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                  <div>
                    <FieldLabel htmlFor="git-connection">Auth (PAT from integration)</FieldLabel>
                    <select
                      id="git-connection"
                      value={gitConnectionId}
                      onChange={(e) => setGitConnectionId(e.target.value)}
                      style={{ ...fieldStyle, height: 38, padding: '0 12px', cursor: 'pointer', appearance: 'none' }}
                    >
                      <option value="" style={{ background: 'var(--color-bg-surface)' }}>None (public repo)</option>
                      {gitCandidates.map((c) => (
                        <option key={c.id} value={c.id} style={{ background: 'var(--color-bg-surface)' }}>
                          {c.label} · {c.kind === 'github' ? 'GitHub' : 'Azure DevOps'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel htmlFor="git-branch">Default branch</FieldLabel>
                    <input
                      id="git-branch"
                      type="text"
                      value={gitDefaultBranch}
                      onChange={(e) => setGitDefaultBranch(e.target.value)}
                      style={{ ...fieldStyle, height: 38, padding: '0 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}
                    />
                  </div>
                </div>

                {/* Clone status + action */}
                <div className="flex items-center justify-between gap-3 flex-wrap" style={{
                  padding: '10px 12px',
                  background: 'var(--color-bg-base)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                }}>
                  <div className="flex items-center gap-2" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                    {project.gitCloneStatus === 'ready' ? (
                      <>
                        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)' }} />
                        <span>Cloned {project.gitLastCloneAt ? `· ${new Date(project.gitLastCloneAt).toLocaleString()}` : ''}</span>
                        {project.gitLocalPath && (
                          <span style={{ color: 'var(--color-text-disabled)' }}>
                            · <code style={{ fontFamily: 'inherit', fontSize: 10.5 }}>{project.gitLocalPath}</code>
                          </span>
                        )}
                      </>
                    ) : project.gitCloneStatus === 'cloning' ? (
                      <>
                        <Loader2 className="animate-spin" style={{ width: 12, height: 12, color: 'var(--color-accent)' }} />
                        <span>Cloning…</span>
                      </>
                    ) : project.gitCloneStatus === 'error' ? (
                      <>
                        <AlertTriangle style={{ width: 12, height: 12, color: 'var(--color-error)' }} />
                        <span style={{ color: 'var(--color-error)' }}>Clone failed</span>
                        {project.gitCloneError && (
                          <span style={{ color: 'var(--color-text-disabled)' }}>· {project.gitCloneError.slice(0, 140)}</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-text-disabled)' }} />
                        <span>Not cloned yet. Save the settings above, then clone.</span>
                      </>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => cloneProject.mutate()}
                    disabled={cloneProject.isPending || isDirty || !gitUrl.trim()}
                    title={isDirty ? 'Save settings first' : project.gitCloneStatus === 'ready' ? 'Re-clone: existing local changes will be discarded' : 'Clone into the server-side mirror'}
                    className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                    style={{
                      height: 30, padding: '0 12px', fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-mono)',
                      color: cloneProject.isPending || isDirty || !gitUrl.trim() ? 'var(--color-text-disabled)' : '#021526',
                      background: cloneProject.isPending || isDirty || !gitUrl.trim() ? 'var(--color-bg-surface)' : 'var(--color-accent)',
                      border: '1px solid ' + (cloneProject.isPending || isDirty || !gitUrl.trim() ? 'var(--color-border-subtle)' : 'transparent'),
                      borderRadius: 'var(--radius-md)',
                      cursor: cloneProject.isPending ? 'wait' : (isDirty || !gitUrl.trim() ? 'not-allowed' : 'pointer'),
                    }}
                  >
                    <Download className={cloneProject.isPending ? 'animate-pulse' : ''} style={{ width: 12, height: 12 }} />
                    {cloneProject.isPending ? 'cloning…' : (project.gitCloneStatus === 'ready' ? 'Re-clone' : 'Clone now')}
                  </button>
                </div>
                {project.gitUrl && (
                  <a
                    href={project.gitUrl.replace(/\.git$/, '')}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', textDecoration: 'none' }}
                  >
                    Open in browser <ExternalLink style={{ width: 10, height: 10 }} />
                  </a>
                )}
              </>
            )}

            {/* SonarQube link */}
            {(() => {
              const sqConn = (connections ?? []).find((c) => c.kind === 'sonarqube' && c.enabled && c.hasCredentials);
              return (
                <div>
                  <FieldLabel htmlFor="project-sq-key">SonarQube project key</FieldLabel>
                  <input
                    id="project-sq-key"
                    type="text"
                    placeholder={sqConn ? 'e.g. acme_web_app' : 'Add a SonarQube integration under Settings → Integrations first'}
                    value={sonarqubeProjectKey}
                    onChange={(e) => setSonarqubeProjectKey(e.target.value)}
                    disabled={!sqConn}
                    style={{ ...fieldStyle, height: 38, padding: '0 12px', fontFamily: 'var(--font-mono)', fontSize: 12, opacity: sqConn ? 1 : 0.6 }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(124,140,248,0.5)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
                  />
                </div>
              );
            })()}

            <div>
              <FieldLabel htmlFor="project-status">Status</FieldLabel>
              <select
                id="project-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                style={{ ...fieldStyle, height: 38, padding: '0 12px', cursor: 'pointer', appearance: 'none' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(124,140,248,0.5)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
              >
                <option value="active" style={{ background: 'var(--color-bg-surface)' }}>Active</option>
                <option value="draft" style={{ background: 'var(--color-bg-surface)' }}>Draft</option>
                <option value="archived" style={{ background: 'var(--color-bg-surface)' }}>Archived</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2" style={{ padding: '10px 16px', borderTop: '1px solid var(--color-border-subtle)' }}>
            <button
              type="submit"
              disabled={updateProject.isPending || !isDirty}
              aria-busy={updateProject.isPending || undefined}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                height: 36, padding: '0 18px', borderRadius: 'var(--radius-md)',
                background: updateProject.isPending || !isDirty ? 'var(--color-bg-raised)' : '#7c8cf8',
                color: updateProject.isPending || !isDirty ? 'var(--color-text-disabled)' : '#021526',
                fontSize: 12, fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                border: 'none', cursor: updateProject.isPending || !isDirty ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { if (!updateProject.isPending && isDirty) e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
              onMouseLeave={(e) => { if (!updateProject.isPending && isDirty) e.currentTarget.style.background = '#7c8cf8'; }}
            >
              {updateProject.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </section>

      {/* Issue tracker — link/unlink the connection this project syncs issues with */}
      <IssueTrackerSection projectId={projectId} />

      {/* Access — share with permission groups */}
      <ProjectSharing projectId={projectId} />

      {/* Danger zone */}
      <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid rgba(224,96,96,0.5)', borderRadius: 'var(--radius-md)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'rgba(224,96,96,0.85)' }}>
            Danger Zone
          </span>
        </div>
        <div className="flex items-center justify-between gap-4" style={{ padding: '14px 16px' }}>
          <div>
            <div style={{ fontSize: 13, fontFamily: 'var(--font-sans)', fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 2 }}>
              Delete this project
            </div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
              Permanently removes all agents, runs, and data.
            </div>
          </div>
          <button
            type="button"
            onClick={() => { setConfirmName(''); setConfirmOpen(true); }}
            disabled={deleteProject.isPending}
            className="flex items-center gap-1.5 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              height: 36, padding: '0 14px',
              fontSize: 12, fontFamily: 'var(--font-mono)',
              color: '#e06060',
              background: 'transparent',
              border: '1px solid rgba(224,96,96,0.35)',
              borderRadius: 'var(--radius-md)',
              cursor: deleteProject.isPending ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              opacity: deleteProject.isPending ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(224,96,96,0.08)'; e.currentTarget.style.borderColor = 'rgba(224,96,96,0.5)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(224,96,96,0.35)'; }}
          >
            <Trash2 style={{ width: 12, height: 12 }} aria-hidden="true" />
            Delete project
          </button>
        </div>
      </section>

      <DeleteConfirmDialog
        open={confirmOpen}
        projectName={project.name}
        confirmName={confirmName}
        onConfirmNameChange={setConfirmName}
        onConfirm={handleConfirmDelete}
        onClose={() => setConfirmOpen(false)}
        pending={deleteProject.isPending}
      />
    </div>
  );
}

function DeleteConfirmDialog({
  open, projectName, confirmName, onConfirmNameChange, onConfirm, onClose, pending,
}: {
  open: boolean;
  projectName: string;
  confirmName: string;
  onConfirmNameChange: (v: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  pending: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 60);
  }, [open]);
  const canDelete = confirmName === projectName && !pending;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Delete project"
      maxWidth="440px"
      disableBackdropClose
    >
      <div className="flex items-start gap-3" style={{ marginBottom: 16 }}>
        <div
          aria-hidden="true"
          className="flex items-center justify-center shrink-0"
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'var(--color-error-subtle)', border: '1px solid rgba(224,96,96,0.3)',
          }}
        >
          <AlertTriangle style={{ width: 18, height: 18, color: '#e06060' }} />
        </div>
        <div>
          <p style={{ fontSize: 13, color: 'var(--color-text-primary)', lineHeight: 1.5, margin: 0 }}>
            This will permanently delete <strong>{projectName}</strong>, all of its agents, runs, and data.
            This action cannot be undone.
          </p>
        </div>
      </div>
      <label
        htmlFor="confirm-project-name"
        style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 6 }}
      >
        Type <span style={{ color: 'var(--color-text-primary)' }}>{projectName}</span> to confirm.
      </label>
      <input
        ref={inputRef}
        id="confirm-project-name"
        type="text"
        value={confirmName}
        onChange={(e) => onConfirmNameChange(e.target.value)}
        autoComplete="off"
        style={{
          width: '100%', height: 38, padding: '0 12px',
          background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)',
          color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontSize: 13,
          borderRadius: 'var(--radius-md)', outline: 'none',
        }}
      />
      <div className="flex items-center justify-end gap-2" style={{ marginTop: 18 }}>
        <button
          type="button"
          onClick={onClose}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            height: 36, padding: '0 14px',
            background: 'transparent', border: '1px solid var(--color-border-default)',
            color: 'var(--color-text-primary)', fontSize: 12, borderRadius: 'var(--radius-md)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canDelete}
          aria-busy={pending || undefined}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            height: 36, padding: '0 14px',
            background: canDelete ? '#e06060' : 'var(--color-bg-raised)',
            color: canDelete ? '#021526' : 'var(--color-text-disabled)',
            border: 'none', borderRadius: 'var(--radius-md)',
            fontSize: 12, fontWeight: 600,
            cursor: canDelete ? 'pointer' : 'not-allowed',
            opacity: canDelete ? 1 : 0.7,
          }}
        >
          {pending ? 'Deleting…' : 'Delete project'}
        </button>
      </div>
    </Dialog>
  );
}

/** Issue-tracker linking — moved here from the Issues page so it doesn't crowd the issue list. */
function IssueTrackerSection({ projectId }: { projectId: string }) {
  const { data: links } = useProjectIntegrations(projectId);
  const { data: connections } = useConnections();
  const linkIntegration = useLinkIntegration(projectId);
  const unlinkIntegration = useUnlinkIntegration(projectId);
  const { show: showToast } = useToast();

  const linked = links?.[0];
  const linkedConn = connections?.find((c) => c.id === linked?.connectionId);
  const available = (connections ?? []).filter((c) => c.enabled && !(links ?? []).some((l) => l.connectionId === c.id));

  return (
    <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid #7c8cf8', marginBottom: 12, borderRadius: 'var(--radius-md)' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
          Issue Tracker
        </span>
      </div>
      <div style={{ padding: 16 }}>
        {linked ? (
          <div className="flex items-center justify-between gap-3" style={{ padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
            <div className="flex items-center gap-2 min-w-0">
              <Link2 style={{ width: 13, height: 13, color: 'var(--color-accent)', flexShrink: 0 }} aria-hidden="true" />
              <span className="truncate" style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>
                {linkedConn?.label ?? 'Linked tracker'} <span style={{ color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>· {linkedConn?.kind ?? ''}</span>
              </span>
            </div>
            <button type="button"
              onClick={() => unlinkIntegration.mutate(linked.connectionId, {
                onSuccess: () => showToast('Tracker unlinked'),
                onError: (err) => showToast(err instanceof Error ? err.message : 'Unlink failed', { variant: 'error' }),
              })}
              className="flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{ height: 30, padding: '0 11px', borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11.5, fontFamily: 'var(--font-mono)', cursor: 'pointer', flexShrink: 0 }}>
              <X style={{ width: 12, height: 12 }} aria-hidden="true" /> Unlink
            </button>
          </div>
        ) : available.length > 0 ? (
          <div>
            <FieldLabel htmlFor="issue-tracker-link">Link a tracker connection</FieldLabel>
            <select id="issue-tracker-link" defaultValue="" onChange={(e) => { if (e.target.value) linkIntegration.mutate({ connectionId: e.target.value, syncEnabled: true }); }}
              style={{ ...fieldStyle, height: 38, padding: '0 12px', cursor: 'pointer' }}>
              <option value="">Select a connection…</option>
              {available.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.kind})</option>)}
            </select>
          </div>
        ) : (
          <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            No tracker connections — add one under Settings → Integrations.
          </span>
        )}
      </div>
    </section>
  );
}
