import { useState, useEffect, useMemo } from 'react';
import { FolderOpen, GitBranch, KeyRound, Check } from 'lucide-react';
import { Dialog } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { FolderPickerInput } from '../ui/folder-picker';
import { useToast } from '../ui/toast';
import { useCreateProject } from '../../api/hooks/use-projects';
import { useConnections } from '../../api/hooks/use-integrations';
import { apiPost } from '../../api/client';
import type { WorkspaceSource } from '@subagent/shared';

interface QuickCreateDialogProps {
  open: boolean;
  onClose: () => void;
}

const fpInputStyle: React.CSSProperties = {
  height: 38, padding: '0 12px', fontSize: 13.5, color: 'var(--color-text-primary)',
  background: 'var(--glass-bg)', border: '1px solid var(--color-border-default)', outline: 'none',
  borderRadius: 'var(--radius-md)',
};

const monoInputStyle: React.CSSProperties = {
  width: '100%', height: 38, padding: '0 12px', fontSize: 12.5,
  color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)',
  background: 'var(--glass-bg)', border: '1px solid var(--color-border-default)',
  outline: 'none', borderRadius: 'var(--radius-md)', transition: 'border-color .15s',
};

function SmallLabel({ htmlFor, children, hint }: { htmlFor?: string; children: React.ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-0.5">
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
        {children}
      </span>
      {hint && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{hint}</span>}
    </label>
  );
}

export function QuickCreateDialog({ open, onClose }: QuickCreateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState<WorkspaceSource>('git');
  const [workspacePath, setWorkspacePath] = useState('');
  const [gitUrl, setGitUrl] = useState('');
  const [gitDefaultBranch, setGitDefaultBranch] = useState('main');
  const [gitConnectionId, setGitConnectionId] = useState('');
  const [error, setError] = useState('');
  const createProject = useCreateProject();
  const { data: connections } = useConnections();
  const { show: showToast } = useToast();

  const gitCandidates = (connections ?? []).filter((c) => (c.kind === 'github' || c.kind === 'azure_devops') && c.hasCredentials && c.enabled);

  // Reset state after the dialog closes so the next open is clean.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setName(''); setDescription(''); setSource('git');
      setWorkspacePath(''); setGitUrl(''); setGitDefaultBranch('main'); setGitConnectionId('');
      setError('');
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

  const workspacePathError = useMemo(() => {
    if (source !== 'local') return '';
    const p = workspacePath.trim();
    if (!p) return '';
    if (!/^([a-zA-Z]:\\|\/|~)/.test(p)) return 'Use an absolute path (e.g., /Users/you/code or C:\\dev).';
    return '';
  }, [workspacePath, source]);

  const gitUrlError = useMemo(() => {
    if (source !== 'git') return '';
    const u = gitUrl.trim();
    if (!u) return '';
    if (!/^(https?:\/\/|git@|ssh:\/\/)/.test(u)) return 'Use an https:// or ssh (git@host:…) URL.';
    return '';
  }, [gitUrl, source]);

  const isDirty = !!(name || description || workspacePath || gitUrl);
  const isValid = name.trim().length >= 1 && !workspacePathError && !gitUrlError
    && (source === 'local' || !!gitUrl.trim());

  const handleClose = () => { setError(''); onClose(); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setError('');

    createProject.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        workspaceSource: source,
        ...(source === 'local'
          ? { workspacePath: workspacePath.trim() || undefined }
          : {
              gitUrl: gitUrl.trim(),
              gitDefaultBranch: gitDefaultBranch.trim() || 'main',
              gitConnectionId: gitConnectionId || null,
            }),
      },
      {
        onSuccess: (project) => {
          showToast(`Created "${name.trim()}"`, { variant: 'success' });
          // Git projects: kick the clone off right away so the workspace is usable
          // without a trip to Project → Settings.
          if (source === 'git') {
            apiPost(`/api/projects/${project.id}/git/clone`, {})
              .then(() => showToast('Repository cloned.', { variant: 'success' }))
              .catch((err) => showToast(`Clone failed: ${err instanceof Error ? err.message : 'unknown error'} — retry from Project → Settings.`, { variant: 'error' }));
          }
          handleClose();
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg || 'Failed to create project. Make sure the server is running.');
        },
      },
    );
  };

  // Clear error as the user edits.
  useEffect(() => {
    if (error && (name || description || workspacePath || gitUrl)) setError('');
  }, [name, description, workspacePath, gitUrl, error]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Create New Project"
      description="Set up a new project to orchestrate your AI agents."
      disableBackdropClose={isDirty}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <Input
          label="Project Name"
          placeholder="e.g. API Migration, Frontend Redesign"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
          autoComplete="off"
        />

        {/* Workspace source — toggle cards */}
        <div className="flex flex-col gap-2">
          <SmallLabel hint="Where agents read & write files.">Workspace</SmallLabel>
          <div className="grid grid-cols-2 gap-2">
            {([
              { v: 'git' as const, icon: GitBranch, label: 'Git repository', desc: 'cloned & mirrored by the server' },
              { v: 'local' as const, icon: FolderOpen, label: 'Local path', desc: 'a directory on the server' },
            ]).map(({ v, icon: Icon, label, desc }) => {
              const on = source === v;
              return (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setSource(v)}
                  className="flex items-center gap-3 text-left transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                  style={{
                    padding: '10px 12px', minHeight: 52, borderRadius: 'var(--radius-lg)', cursor: 'pointer',
                    background: on ? 'var(--color-accent-subtle)' : 'var(--color-bg-base)',
                    border: `1px solid ${on ? 'rgba(124,140,248,0.45)' : 'var(--color-border-subtle)'}`,
                  }}
                >
                  <span
                    aria-hidden="true"
                    className="flex items-center justify-center flex-shrink-0"
                    style={{
                      width: 30, height: 30, borderRadius: '50%',
                      background: on ? 'var(--color-accent)' : 'var(--color-bg-raised)',
                      color: on ? '#021526' : 'var(--color-text-secondary)',
                      transition: 'background .15s, color .15s',
                    }}
                  >
                    <Icon style={{ width: 14, height: 14 }} />
                  </span>
                  <span className="flex flex-col min-w-0" style={{ flex: 1, gap: 1 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{label}</span>
                    <span className="truncate" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{desc}</span>
                  </span>
                  {on && <Check aria-hidden="true" style={{ width: 14, height: 14, color: 'var(--color-accent)', flexShrink: 0 }} strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </div>

        {source === 'git' ? (
          <>
            <div className="flex flex-col gap-1.5">
              <SmallLabel htmlFor="qc-git-url">Git URL</SmallLabel>
              <input
                id="qc-git-url"
                type="text"
                placeholder="https://github.com/acme/app.git"
                value={gitUrl}
                onChange={(e) => setGitUrl(e.target.value)}
                autoComplete="off"
                style={{ ...monoInputStyle, borderColor: gitUrlError ? 'rgba(224,96,96,0.5)' : 'var(--color-border-default)' }}
              />
              {gitUrlError && (
                <span role="alert" style={{ fontSize: 11, color: 'var(--color-error)', fontFamily: 'var(--font-mono)' }}>{gitUrlError}</span>
              )}
            </div>

            <div className="grid gap-3" style={{ gridTemplateColumns: '2fr 1fr' }}>
              <div className="flex flex-col gap-1.5">
                <SmallLabel htmlFor="qc-git-conn">Auth</SmallLabel>
                <div style={{ position: 'relative' }}>
                  <KeyRound aria-hidden="true" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'var(--color-text-tertiary)', pointerEvents: 'none' }} />
                  <select
                    id="qc-git-conn"
                    value={gitConnectionId}
                    onChange={(e) => setGitConnectionId(e.target.value)}
                    style={{ ...monoInputStyle, paddingLeft: 32, cursor: 'pointer', appearance: 'none' }}
                  >
                    <option value="" style={{ background: 'var(--color-bg-surface)' }}>None (public repo)</option>
                    {gitCandidates.map((c) => (
                      <option key={c.id} value={c.id} style={{ background: 'var(--color-bg-surface)' }}>
                        {c.label} · {c.kind === 'github' ? 'GitHub' : 'Azure DevOps'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <SmallLabel htmlFor="qc-git-branch">Branch</SmallLabel>
                <input
                  id="qc-git-branch"
                  type="text"
                  value={gitDefaultBranch}
                  onChange={(e) => setGitDefaultBranch(e.target.value)}
                  autoComplete="off"
                  style={monoInputStyle}
                />
              </div>
            </div>
            {gitCandidates.length === 0 && (
              <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', margin: '-8px 0 0' }}>
                Private repo? Add a GitHub / Azure DevOps connection under Settings → Integrations first.
              </p>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <SmallLabel htmlFor="qc-workspace" hint="Blank → the server assigns /workspace/<project-slug>.">Workspace path</SmallLabel>
            <div id="qc-workspace">
              <FolderPickerInput value={workspacePath} onChange={setWorkspacePath} inputStyle={fpInputStyle} />
            </div>
            {workspacePathError && (
              <span role="alert" style={{ fontSize: 11, color: 'var(--color-error)', fontFamily: 'var(--font-mono)' }}>
                {workspacePathError}
              </span>
            )}
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <SmallLabel htmlFor="qc-description">Description <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></SmallLabel>
          <textarea
            id="qc-description"
            placeholder="What will this project accomplish?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2.5 text-[13.5px] text-text-primary placeholder:text-text-disabled resize-y transition-all duration-200 focus:outline-none"
            style={{
              background: 'var(--glass-bg)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              minHeight: 60,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(124,140,248, 0.5)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,140,248, 0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-default)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="px-3.5 py-2.5 text-[12.5px] text-[#e06060]"
            style={{
              background: 'rgba(224, 96, 96, 0.08)',
              border: '1px solid rgba(224, 96, 96, 0.2)',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {error}
          </div>
        )}

        <div
          className="flex items-center justify-end gap-3 pt-4"
          style={{ borderTop: '1px solid var(--color-border-subtle)' }}
        >
          <Button type="button" variant="ghost" size="md" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={createProject.isPending}
            disabled={!isValid}
          >
            {source === 'git' ? 'Create & Clone' : 'Create Project'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
