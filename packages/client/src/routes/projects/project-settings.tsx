import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from '@tanstack/react-router';
import { Trash2, Copy, Check, Settings, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useProject, useUpdateProject, useDeleteProject } from '../../api/hooks/use-projects';
import { FolderPickerInput } from '../../components/ui/folder-picker';
import { useToast } from '../../components/ui/toast';
import { Dialog } from '../../components/ui/dialog';
import { Skeleton } from '../../components/ui/skeleton';
import { apiGet } from '../../api/client';
import { ProjectSharing } from '../../components/settings/project-sharing';
import type { ProjectStatus } from '@subagent/shared';

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
  const { show: showToast } = useToast();

  const { data: mcpStatus } = useQuery({
    queryKey: ['mcp-connections', projectId],
    queryFn: () => apiGet<{ count: number }>(`/api/mcp/projects/${projectId}/connections`),
    refetchInterval: 5000,
    enabled: !!projectId,
  });

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [copied, setCopied] = useState<'id' | 'url' | 'claude' | 'codex' | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');

  // Derive MCP URL from window origin so deployed environments don't show localhost.
  const mcpBase = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001';
  const mcpUrl = `${mcpBase}/mcp/projects/${projectId}`;
  const claudeCmd = `claude mcp add agenticbear --transport sse ${mcpUrl}`;
  const codexCmd = `codex mcp add agenticbear --transport sse ${mcpUrl}`;

  const copyToClipboard = async (text: string, type: 'id' | 'url' | 'claude' | 'codex') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
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
    }
  }, [project]);

  const isDirty = useMemo(() => {
    if (!project) return false;
    return (
      name !== project.name ||
      description !== project.description ||
      workspacePath !== (project.workspacePath ?? '') ||
      status !== project.status
    );
  }, [project, name, description, workspacePath, status]);

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
      <div style={{ maxWidth: 560 }}>
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
    updateProject.mutate(
      { id: projectId, name, description, workspacePath, status },
      {
        onSuccess: () => showToast('Project settings saved', { variant: 'success' }),
        onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to save settings', { variant: 'error' }),
      },
    );
  };

  const handleConfirmDelete = () => {
    if (confirmName !== project.name) return;
    deleteProject.mutate(projectId, {
      onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to delete', { variant: 'error' }),
    });
  };

  return (
    <div style={{ maxWidth: 560 }}>

      {/* Page header */}
      <div className="flex items-center gap-2" style={{ marginBottom: 28 }}>
        <Settings style={{ width: 13, height: 13, color: '#7c8cf8', flexShrink: 0 }} aria-hidden="true" />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
          Project Settings
        </span>
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

            <div>
              <FieldLabel>Workspace Path</FieldLabel>
              <FolderPickerInput
                value={workspacePath}
                onChange={setWorkspacePath}
                inputStyle={{ ...fieldStyle, height: 38, padding: '0 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
              <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginTop: 6 }}>
                Agents will read and write files in this directory.
              </p>
            </div>

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
                <option value="active" style={{ background: '#031d38' }}>Active</option>
                <option value="draft" style={{ background: '#031d38' }}>Draft</option>
                <option value="archived" style={{ background: '#031d38' }}>Archived</option>
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

      {/* MCP Integration section */}
      <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid #7c8cf8', marginBottom: 12, borderRadius: 'var(--radius-md)' }}>
        <div className="flex items-center justify-between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
            MCP Integration
          </span>
          <div className="flex items-center gap-1.5" aria-live="polite">
            {mcpStatus && mcpStatus.count > 0 ? (
              <>
                <div aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: '#6db58a', boxShadow: '0 0 4px #6db58a' }} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#6db58a' }}>
                  {mcpStatus.count} connected
                </span>
                <Wifi style={{ width: 11, height: 11, color: '#6db58a' }} aria-hidden="true" />
              </>
            ) : (
              <>
                <div aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-secondary)' }} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                  no connections
                </span>
                <WifiOff style={{ width: 11, height: 11, color: 'var(--color-text-secondary)' }} aria-hidden="true" />
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2" style={{ padding: '12px 16px' }}>
          {[
            { key: 'id' as const, label: 'Project ID', value: projectId },
            { key: 'url' as const, label: 'MCP URL — VS Code / Cursor', value: mcpUrl },
            { key: 'claude' as const, label: 'Claude Code CLI', value: claudeCmd },
            { key: 'codex' as const, label: 'Codex CLI', value: codexCmd },
          ].map(({ key, label, value }) => (
            <div
              key={key}
              className="flex items-center justify-between gap-3"
              style={{ padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginBottom: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  {label}
                </div>
                <div className="truncate" style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                  {value}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(value, key)}
                aria-label={copied === key ? `${label} copied` : `Copy ${label}`}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{
                  flexShrink: 0, color: copied === key ? '#6db58a' : 'var(--color-text-secondary)',
                  background: 'transparent', border: 'none', cursor: 'pointer', transition: 'color 0.15s',
                  padding: '8px', borderRadius: 'var(--radius-sm)', minWidth: 32, minHeight: 32,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {copied === key ? (
                  <Check style={{ width: 14, height: 14 }} aria-hidden="true" />
                ) : (
                  <Copy style={{ width: 14, height: 14 }} aria-hidden="true" />
                )}
                <span className="sr-only" aria-live="polite">{copied === key ? 'Copied' : ''}</span>
              </button>
            </div>
          ))}
        </div>
      </section>

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
