import { useState, useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { Trash2, Copy, Check } from 'lucide-react';
import { useProject, useUpdateProject, useDeleteProject } from '../../api/hooks/use-projects';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { Select } from '../../components/ui/select';
import { Button } from '../../components/ui/button';
import type { ProjectStatus } from '@subagent/shared';

export function ProjectSettingsPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: project } = useProject(projectId);
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('active');
  const [copied, setCopied] = useState<'id' | 'url' | null>(null);

  const mcpUrl = `http://localhost:3001/mcp/projects/${projectId}`;

  const copyToClipboard = (text: string, type: 'id' | 'url') => {
    navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  };

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description);
      setWorkspacePath(project.workspacePath);
      setStatus(project.status);
    }
  }, [project]);

  if (!project) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateProject.mutate({
      id: projectId,
      name,
      description,
      workspacePath,
      status,
    });
  };

  const handleDelete = () => {
    if (window.confirm(`Delete "${project.name}"? This cannot be undone.`)) {
      deleteProject.mutate(projectId);
    }
  };

  return (
    <div style={{ maxWidth: '440px', paddingLeft: '48px' }}>
      <span className="text-[10px] font-medium uppercase text-text-tertiary tracking-[0.08em]">
        Project Settings
      </span>

      <form onSubmit={handleSave} className="flex flex-col gap-4 mt-3">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />

        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
        />

        <Input
          label="Workspace Path"
          value={workspacePath}
          onChange={(e) => setWorkspacePath(e.target.value)}
          className="font-mono text-[12px]"
        />

        <Select
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value as ProjectStatus)}
        >
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="archived">Archived</option>
        </Select>

        <div className="flex items-center justify-end pt-3 border-t border-border-default">
          <button
            type="submit"
            disabled={updateProject.isPending}
            className="flex items-center gap-2 text-[13.5px] font-semibold whitespace-nowrap transition-all duration-200 hover:bg-white/90 disabled:opacity-60"
            style={{
              background: 'white',
              color: '#0a0a0a',
              height: '40px',
              padding: '0 24px',
            }}
          >
            {updateProject.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </form>

      <div className="h-px bg-bg-raised my-6" />

      {/* MCP Integration */}
      <div style={{ marginBottom: '24px' }}>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-disabled)',
          }}
        >
          MCP Integration
        </span>

        <div className="flex flex-col gap-2 mt-3">
          {/* Project ID */}
          <div
            className="flex items-center justify-between gap-3"
            style={{
              padding: '10px 12px',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div className="min-w-0">
              <div style={{ fontSize: '10px', color: 'var(--color-text-disabled)', marginBottom: '2px' }}>
                Project ID
              </div>
              <div
                className="truncate"
                style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}
              >
                {projectId}
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(projectId, 'id')}
              className="shrink-0 transition-colors duration-200"
              style={{ color: copied === 'id' ? 'var(--color-accent)' : 'var(--color-text-disabled)' }}
              title="Kopyala"
            >
              {copied === 'id' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          {/* MCP URL */}
          <div
            className="flex items-center justify-between gap-3"
            style={{
              padding: '10px 12px',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-subtle)',
            }}
          >
            <div className="min-w-0">
              <div style={{ fontSize: '10px', color: 'var(--color-text-disabled)', marginBottom: '2px' }}>
                MCP URL (VS Code / Cursor)
              </div>
              <div
                className="truncate"
                style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}
              >
                {mcpUrl}
              </div>
            </div>
            <button
              type="button"
              onClick={() => copyToClipboard(mcpUrl, 'url')}
              className="shrink-0 transition-colors duration-200"
              style={{ color: copied === 'url' ? 'var(--color-accent)' : 'var(--color-text-disabled)' }}
              title="Kopyala"
            >
              {copied === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>
      </div>

      <div className="h-px bg-bg-raised my-6" />

      <div className="flex items-center justify-between border border-error/15 bg-error/5 px-4 py-3">
        <div>
          <h4 className="text-[12px] font-medium text-error">Danger Zone</h4>
          <p className="text-[11px] text-text-tertiary mt-0.5">
            Permanently delete this project and all its data.
          </p>
        </div>
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 className="h-3 w-3" />}
          onClick={handleDelete}
          loading={deleteProject.isPending}
        >
          Delete
        </Button>
      </div>
    </div>
  );
}
