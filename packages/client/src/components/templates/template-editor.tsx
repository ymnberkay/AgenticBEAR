import { useState } from 'react';
import type { PromptTemplate, TemplateCategory, ModelConfig, AgentPermissions } from '@subagent/shared';
import { DEFAULT_MODEL_CONFIG, DEFAULT_PERMISSIONS, AGENT_COLORS, AGENT_ICONS } from '@subagent/shared';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
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

  const [name, setName] = useState(template?.name ?? '');
  const [category, setCategory] = useState<TemplateCategory>(template?.category ?? 'custom');
  const [description, setDescription] = useState(template?.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(template?.systemPrompt ?? '');
  const [modelConfig, setModelConfig] = useState<ModelConfig>(
    template?.defaultModelConfig ?? { ...DEFAULT_MODEL_CONFIG },
  );
  const [icon, setIcon] = useState(template?.suggestedIcon ?? 'Bot');
  const [color, setColor] = useState(template?.suggestedColor ?? AGENT_COLORS.custom);

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
        { onSuccess: onClose },
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
        { onSuccess: onClose },
      );
    }
  };

  const handleDelete = () => {
    if (!template) return;
    if (window.confirm('Delete this template?')) {
      deleteTemplate.mutate(template.id, { onSuccess: onClose });
    }
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
            onClick={handleDelete}
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

      <PromptEditor value={systemPrompt} onChange={setSystemPrompt} />

      <Separator />

      <ModelConfigForm config={modelConfig} onChange={setModelConfig} />

      <Separator />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-[10px] font-medium uppercase text-white/20 tracking-[0.08em] block mb-1.5">
            Color
          </label>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(AGENT_COLORS).map(([key, val]) => (
              <button
                key={key}
                type="button"
                onClick={() => setColor(val)}
                className="h-5 w-5 rounded-[3px] border-2 transition-all duration-150"
                style={{
                  backgroundColor: val,
                  borderColor: color === val ? 'white' : 'transparent',
                  transform: color === val ? 'scale(1.15)' : undefined,
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
          {Object.entries(AGENT_ICONS).map(([key, val]) => (
            <option key={key} value={val}>
              {val} ({key})
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
    </form>
  );
}
