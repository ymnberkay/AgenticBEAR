import { useState, useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { Trash2, Copy, Check, Settings, Wifi, WifiOff } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useProject, useUpdateProject, useDeleteProject } from '../../api/hooks/use-projects';
import { FolderPickerInput } from '../../components/ui/folder-picker';
import { useToast, Toast } from '../../components/ui/toast';
import { apiGet } from '../../api/client';
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
};

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', display: 'block', marginBottom: 6 }}>
      {children}
    </label>
  );
}

export function ProjectSettingsPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: project } = useProject(projectId);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const { show: showToast, toast } = useToast();

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

  const mcpUrl = `http://localhost:3001/mcp/projects/${projectId}`;
  const claudeCmd = `claude mcp add agenticbear --transport sse ${mcpUrl}`;
  const codexCmd = `codex mcp add agenticbear --transport sse ${mcpUrl}`;

  const copyToClipboard = (text: string, type: 'id' | 'url') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description);
      setWorkspacePath(project.workspacePath ?? '');
      setStatus(project.status);
    }
  }, [project]);

  if (!project) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateProject.mutate(
      { id: projectId, name, description, workspacePath, status },
      { onSuccess: () => showToast('Project settings saved') },
    );
  };

  const handleDelete = () => {
    if (window.confirm(`Delete "${project.name}"? This cannot be undone.`)) {
      deleteProject.mutate(projectId);
    }
  };

  return (
    <div style={{ maxWidth: 560 }}>

      {/* Page header */}
      <div className="flex items-center gap-2" style={{ marginBottom: 28 }}>
        <Settings style={{ width: 13, height: 13, color: '#6EACDA', flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
          Project Settings
        </span>
      </div>

      {/* General section */}
      <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid #6EACDA', marginBottom: 12 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
            General
          </span>
        </div>

        <form onSubmit={handleSave}>
          <div className="flex flex-col gap-5" style={{ padding: '16px' }}>
            <div>
              <FieldLabel>Name</FieldLabel>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ ...fieldStyle, height: 36, padding: '0 12px' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(110,172,218,0.5)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
              />
            </div>

            <div>
              <FieldLabel>Description</FieldLabel>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{ ...fieldStyle, padding: '8px 12px', resize: 'none' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(110,172,218,0.5)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
              />
            </div>

            <div>
              <FieldLabel>Workspace Path</FieldLabel>
              <FolderPickerInput
                value={workspacePath}
                onChange={setWorkspacePath}
                inputStyle={{ ...fieldStyle, height: 36, padding: '0 12px', fontFamily: 'var(--font-mono)', fontSize: 12 }}
              />
              <p style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 5 }}>
                agents will read and write files in this directory
              </p>
            </div>

            <div>
              <FieldLabel>Status</FieldLabel>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                style={{ ...fieldStyle, height: 36, padding: '0 12px', cursor: 'pointer', appearance: 'none' }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(110,172,218,0.5)'; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
              >
                <option value="active" style={{ background: '#031d38' }}>Active</option>
                <option value="draft" style={{ background: '#031d38' }}>Draft</option>
                <option value="archived" style={{ background: '#031d38' }}>Archived</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end" style={{ padding: '10px 16px', borderTop: '1px solid var(--color-border-subtle)' }}>
            <button
              type="submit"
              disabled={updateProject.isPending}
              style={{
                height: 32, padding: '0 18px',
                background: updateProject.isPending ? '#03346E' : '#6EACDA',
                color: '#021526',
                fontSize: 12, fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                border: 'none', cursor: updateProject.isPending ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { if (!updateProject.isPending) e.currentTarget.style.background = '#ffd561'; }}
              onMouseLeave={(e) => { if (!updateProject.isPending) e.currentTarget.style.background = '#6EACDA'; }}
            >
              {updateProject.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </section>

      {/* MCP Integration section */}
      <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid #6EACDA', marginBottom: 12 }}>
        <div className="flex items-center justify-between" style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
            MCP Integration
          </span>
          <div className="flex items-center gap-1.5">
            {mcpStatus && mcpStatus.count > 0 ? (
              <>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#6db58a', boxShadow: '0 0 4px #6db58a' }} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: '#6db58a' }}>
                  {mcpStatus.count} connected
                </span>
                <Wifi style={{ width: 11, height: 11, color: '#6db58a' }} />
              </>
            ) : (
              <>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-text-disabled)' }} />
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                  no connections
                </span>
                <WifiOff style={{ width: 11, height: 11, color: 'var(--color-text-disabled)' }} />
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2" style={{ padding: '12px 16px' }}>
          {/* Project ID */}
          <div
            className="flex items-center justify-between gap-3"
            style={{ padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)' }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Project ID
              </div>
              <div className="truncate" style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                {projectId}
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(projectId, 'id')}
              style={{ flexShrink: 0, color: copied === 'id' ? '#6db58a' : 'var(--color-text-disabled)', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'color 0.15s', padding: '4px' }}
              title="Copy"
            >
              {copied === 'id' ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
            </button>
          </div>

          {/* MCP URL */}
          <div
            className="flex items-center justify-between gap-3"
            style={{ padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)' }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                MCP URL — VS Code / Cursor
              </div>
              <div className="truncate" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                {mcpUrl}
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(mcpUrl, 'url')}
              style={{ flexShrink: 0, color: copied === 'url' ? '#6db58a' : 'var(--color-text-disabled)', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'color 0.15s', padding: '4px' }}
              title="Copy"
            >
              {copied === 'url' ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
            </button>
          </div>

          {/* Claude Code CLI */}
          <div
            className="flex items-center justify-between gap-3"
            style={{ padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)' }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Claude Code CLI
              </div>
              <div className="truncate" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                {claudeCmd}
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(claudeCmd, 'claude')}
              style={{ flexShrink: 0, color: copied === 'claude' ? '#6db58a' : 'var(--color-text-disabled)', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'color 0.15s', padding: '4px' }}
              title="Copy"
            >
              {copied === 'claude' ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
            </button>
          </div>

          {/* Codex CLI */}
          <div
            className="flex items-center justify-between gap-3"
            style={{ padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)' }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Codex CLI
              </div>
              <div className="truncate" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                {codexCmd}
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(codexCmd, 'codex')}
              style={{ flexShrink: 0, color: copied === 'codex' ? '#6db58a' : 'var(--color-text-disabled)', background: 'transparent', border: 'none', cursor: 'pointer', transition: 'color 0.15s', padding: '4px' }}
              title="Copy"
            >
              {copied === 'codex' ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
            </button>
          </div>
        </div>
      </section>

      <Toast toast={toast} />

      {/* Danger zone */}
      <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid rgba(251,73,52,0.5)' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'rgba(251,73,52,0.7)' }}>
            Danger Zone
          </span>
        </div>
        <div className="flex items-center justify-between gap-4" style={{ padding: '14px 16px' }}>
          <div>
            <div style={{ fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 500, color: 'var(--color-text-secondary)', marginBottom: 2 }}>
              Delete this project
            </div>
            <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
              permanently removes all agents and data
            </div>
          </div>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleteProject.isPending}
            className="flex items-center gap-1.5 shrink-0"
            style={{
              height: 30, padding: '0 14px',
              fontSize: 11, fontFamily: 'var(--font-mono)',
              color: 'rgba(251,73,52,0.7)',
              background: 'transparent',
              border: '1px solid rgba(251,73,52,0.25)',
              cursor: deleteProject.isPending ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s',
              opacity: deleteProject.isPending ? 0.5 : 1,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(251,73,52,0.08)'; e.currentTarget.style.borderColor = 'rgba(251,73,52,0.4)'; e.currentTarget.style.color = '#e06060'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(251,73,52,0.25)'; e.currentTarget.style.color = 'rgba(251,73,52,0.7)'; }}
          >
            <Trash2 style={{ width: 11, height: 11 }} />
            {deleteProject.isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </section>
    </div>
  );
}
