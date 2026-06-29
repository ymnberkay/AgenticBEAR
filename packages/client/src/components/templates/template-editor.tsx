import { useState } from 'react';
import type { PromptTemplate, TemplateCategory, ModelConfig } from '@subagent/shared';
import { DEFAULT_MODEL_CONFIG, AGENT_COLORS, AGENT_ICONS } from '@subagent/shared';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { Dialog } from '../ui/dialog';
import { useToast } from '../ui/toast';
import { PromptEditor } from '../agents/prompt-editor';
import { ModelConfigForm } from '../agents/model-config';
import { useCreateTemplate, useUpdateTemplate, useDeleteTemplate } from '../../api/hooks/use-templates';

interface TemplateEditorProps {
  template?: PromptTemplate;
  onClose: () => void;
}

const categories: TemplateCategory[] = [
  'orchestrator', 'backend', 'frontend', 'database',
  'devops', 'qa', 'documentation', 'design', 'custom',
];

export function TemplateEditor({ template, onClose }: TemplateEditorProps) {
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const { show: showToast } = useToast();

  const [name, setName] = useState(template?.name ?? '');
  const [category, setCategory] = useState<TemplateCategory>(template?.category ?? 'custom');
  const [description, setDescription] = useState(template?.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(template?.systemPrompt ?? '');
  const [modelConfig, setModelConfig] = useState<ModelConfig>(
    template?.defaultModelConfig ?? { ...DEFAULT_MODEL_CONFIG },
  );
  const [icon, setIcon] = useState(template?.suggestedIcon ?? 'Bot');
  const [color, setColor] = useState(template?.suggestedColor ?? AGENT_COLORS.custom);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (template) {
      updateTemplate.mutate(
        {
          id: template.id,
          name,
          category,
          description,
          systemPrompt,
          defaultModelConfig: modelConfig,
          suggestedIcon: icon,
          suggestedColor: color,
        },
        {
          onSuccess: () => { showToast(`Saved "${name}"`, { variant: 'success' }); onClose(); },
          onError: (err) => showToast(err instanceof Error ? err.message : 'Save failed', { variant: 'error' }),
        },
      );
    } else {
      createTemplate.mutate(
        {
          name,
          category,
          description,
          systemPrompt,
          defaultModelConfig: modelConfig,
          suggestedIcon: icon,
          suggestedColor: color,
        },
        {
          onSuccess: () => { showToast(`Created "${name}"`, { variant: 'success' }); onClose(); },
          onError: (err) => showToast(err instanceof Error ? err.message : 'Create failed', { variant: 'error' }),
        },
      );
    }
  };

  const confirmAndDelete = () => {
    if (!template) return;
    setConfirmDelete(false);
    const tplName = template.name;
    deleteTemplate.mutate(template.id, {
      onSuccess: () => { showToast(`Deleted "${tplName}"`, { variant: 'success' }); onClose(); },
      onError: (err) => showToast(err instanceof Error ? err.message : 'Delete failed', { variant: 'error' }),
    });
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-white/80 tracking-tight">
          {template ? 'Edit Template' : 'New Template'}
        </h2>
        {template && !template.isBuiltIn && (
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={() => setConfirmDelete(true)}
            loading={deleteTemplate.isPending}
          >
            Delete
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Backend Developer"
        />
        <Select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value as TemplateCategory)}
        >
          {categories.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0).toUpperCase() + c.slice(1)}
            </option>
          ))}
        </Select>
      </div>

      <Input
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Template for backend development agents"
      />

      <Separator />

      <PromptEditor value={systemPrompt} onChange={setSystemPrompt} originalValue={template?.systemPrompt} />

      <Separator />

      <ModelConfigForm config={modelConfig} onChange={setModelConfig} />

      <Separator />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-medium uppercase text-text-secondary tracking-[0.08em] block mb-1.5">
            Color
          </label>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Template color">
            {Object.entries(AGENT_COLORS).map(([key, val]) => (
              <button
                key={key}
                type="button"
                onClick={() => setColor(val)}
                role="radio"
                aria-checked={color === val}
                aria-label={`Color ${key}`}
                className="rounded-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{
                  width: 24, height: 24,
                  backgroundColor: val,
                  border: color === val ? '2px solid white' : '2px solid transparent',
                  transform: color === val ? 'scale(1.15)' : undefined,
                  cursor: 'pointer',
                }}
                title={key}
              />
            ))}
          </div>
        </div>
        <Select
          label="Icon"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
        >
          {Object.entries(AGENT_ICONS).map(([key, _val]) => (
            <option key={key} value={key}>
              {key}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center justify-end gap-1.5 pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={createTemplate.isPending || updateTemplate.isPending}
          disabled={!name.trim() || !systemPrompt.trim()}
        >
          {template ? 'Save Changes' : 'Create Template'}
        </Button>
      </div>

      <Dialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Delete template?"
        description={template ? `Permanently delete "${template.name}". Agents created from this template will keep their copy of the prompt.` : undefined}
        maxWidth="440px"
      >
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(false)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmAndDelete}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: '#e06060', color: '#021526', border: 'none', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Delete template
          </button>
        </div>
      </Dialog>
    </form>
  );
}
