import { useState, useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { Trash2 } from 'lucide-react';
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
    <div className="max-w-md">
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
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={updateProject.isPending}
          >
            Save Changes
          </Button>
        </div>
      </form>

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
