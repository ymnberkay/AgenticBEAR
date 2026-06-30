import { useState, useEffect, useMemo } from 'react';
import { Dialog } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { FolderPickerInput } from '../ui/folder-picker';
import { useToast } from '../ui/toast';
import { useCreateProject } from '../../api/hooks/use-projects';

interface QuickCreateDialogProps {
  open: boolean;
  onClose: () => void;
}

const fpInputStyle: React.CSSProperties = {
  height: 38, padding: '0 12px', fontSize: 13.5, color: 'var(--color-text-primary)',
  background: 'var(--glass-bg)', border: '1px solid var(--color-border-default)', outline: 'none',
  borderRadius: 'var(--radius-md)',
};

export function QuickCreateDialog({ open, onClose }: QuickCreateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [error, setError] = useState('');
  const createProject = useCreateProject();
  const { show: showToast } = useToast();

  // Reset state after the dialog closes so the next open is clean.
  useEffect(() => {
    if (open) return;
    const t = setTimeout(() => {
      setName('');
      setDescription('');
      setWorkspacePath('');
      setError('');
    }, 200);
    return () => clearTimeout(t);
  }, [open]);

  const workspacePathError = useMemo(() => {
    const p = workspacePath.trim();
    if (!p) return '';
    if (!/^([a-zA-Z]:\\|\/|~)/.test(p)) return 'Use an absolute path (e.g., /Users/you/code or C:\\dev).';
    return '';
  }, [workspacePath]);

  const isDirty = !!(name || description || workspacePath);

  const handleClose = () => {
    setError('');
    onClose();
  };

  const isValid = name.trim().length >= 1 && !workspacePathError;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setError('');

    createProject.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        workspacePath: workspacePath.trim() || undefined,
      },
      {
        onSuccess: () => {
          showToast(`Created "${name.trim()}"`, { variant: 'success' });
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
    if (error && (name || description || workspacePath)) setError('');
  }, [name, description, workspacePath, error]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Create New Project"
      description="Set up a new project to orchestrate your AI agents."
      disableBackdropClose={isDirty}
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-6" noValidate>
        <Input
          label="Project Name"
          placeholder="e.g. API Migration, Frontend Redesign"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
          autoComplete="off"
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="qc-workspace" className="text-[12.5px] font-medium text-text-secondary">
            Workspace Path
            <span className="text-text-secondary font-normal ml-1.5">(absolute path on your machine)</span>
          </label>
          <div id="qc-workspace">
            <FolderPickerInput value={workspacePath} onChange={setWorkspacePath} inputStyle={fpInputStyle} />
          </div>
          {workspacePathError && (
            <span role="alert" style={{ fontSize: 11, color: 'var(--color-error)', fontFamily: 'var(--font-mono)' }}>
              {workspacePathError}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="qc-description" className="text-[12.5px] font-medium text-text-secondary">
            Description
            <span className="text-text-secondary font-normal ml-1.5">(optional)</span>
          </label>
          <textarea
            id="qc-description"
            placeholder="What will this project accomplish?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 text-[13.5px] text-text-primary placeholder:text-text-disabled resize-y transition-all duration-200 focus:outline-none"
            style={{
              background: 'var(--glass-bg)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              minHeight: 72,
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
            Create Project
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
