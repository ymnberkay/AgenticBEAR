import { useState } from 'react';
import { Dialog } from '../ui/dialog';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useCreateProject } from '../../api/hooks/use-projects';

interface QuickCreateDialogProps {
  open: boolean;
  onClose: () => void;
}

export function QuickCreateDialog({ open, onClose }: QuickCreateDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const createProject = useCreateProject();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');

    createProject.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        workspacePath: `/workspace/${name.trim().toLowerCase().replace(/\s+/g, '-')}`,
      },
      {
        onSuccess: () => {
          setName('');
          setDescription('');
          setError('');
          onClose();
        },
        onError: (err) => {
          console.error('Create project error:', err);
          const msg = err instanceof Error ? err.message : String(err);
          setError(msg || 'Failed to create project. Make sure the server is running.');
        },
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} title="Create New Project" description="Set up a new project to orchestrate your AI agents.">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <Input
          label="Project Name"
          placeholder="e.g. API Migration, Frontend Redesign"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />

        <div className="flex flex-col gap-1.5">
          <label className="text-[12.5px] font-medium text-[#8b8b9e]">
            Description
            <span className="text-[#3a3a4a] font-normal ml-1.5">(optional)</span>
          </label>
          <textarea
            placeholder="What will this project accomplish?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg px-3 py-2.5 text-[13.5px] text-[#e2e2e8] placeholder:text-[#3a3a4a] resize-none transition-all duration-200 focus:outline-none"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.1)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        {error && (
          <div
            className="rounded-lg px-3.5 py-2.5 text-[12.5px] text-[#ef4444]"
            style={{
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
            }}
          >
            {error}
          </div>
        )}

        <div
          className="flex items-center justify-end gap-3 pt-4"
          style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}
        >
          <Button type="button" variant="ghost" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={createProject.isPending}
            disabled={!name.trim()}
          >
            Create Project
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
