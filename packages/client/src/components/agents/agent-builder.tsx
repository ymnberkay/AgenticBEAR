import { useState, useEffect } from 'react';
import type { Agent, AgentRole, CreateAgentInput, ModelConfig, AgentPermissions } from '@subagent/shared';
import { CLAUDE_MODELS, DEFAULT_MODEL_CONFIG, DEFAULT_PERMISSIONS, AGENT_COLORS, AGENT_ICONS } from '@subagent/shared';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Button } from '../ui/button';
import { Separator } from '../ui/separator';
import { PromptEditor } from './prompt-editor';
import { ModelConfigForm } from './model-config';
import { useTemplates } from '../../api/hooks/use-templates';
import { useCreateAgent, useUpdateAgent } from '../../api/hooks/use-agents';

interface AgentBuilderProps {
  projectId: string;
  agent?: Agent;
  onClose: () => void;
}

export function AgentBuilder({ projectId, agent, onClose }: AgentBuilderProps) {
  const { data: templates } = useTemplates();
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();

  const [name, setName] = useState(agent?.name ?? '');
  const [role, setRole] = useState<AgentRole>(agent?.role ?? 'specialist');
  const [description, setDescription] = useState(agent?.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '');
  const [templateId, setTemplateId] = useState(agent?.templateId ?? '');
  const [modelConfig, setModelConfig] = useState<ModelConfig>(
    agent?.modelConfig ?? { ...DEFAULT_MODEL_CONFIG },
  );
  const [permissions, setPermissions] = useState<AgentPermissions>(
    agent?.permissions ?? { ...DEFAULT_PERMISSIONS },
  );
  const [color, setColor] = useState(agent?.color ?? AGENT_COLORS.custom);
  const [icon, setIcon] = useState(agent?.icon ?? 'Bot');
  const [allowedPaths, setAllowedPaths] = useState(
    (agent?.permissions.allowedPaths ?? DEFAULT_PERMISSIONS.allowedPaths).join(', '),
  );
  const [deniedPaths, setDeniedPaths] = useState(
    (agent?.permissions.deniedPaths ?? DEFAULT_PERMISSIONS.deniedPaths).join(', '),
  );

  // Apply template when selected
  useEffect(() => {
    if (!templateId || !templates) return;
    const tmpl = templates.find((t) => t.id === templateId);
    if (!tmpl) return;
    setSystemPrompt(tmpl.systemPrompt);
    setModelConfig(tmpl.defaultModelConfig);
    setPermissions(tmpl.defaultPermissions);
    setColor(tmpl.suggestedColor);
    setIcon(tmpl.suggestedIcon);
    setAllowedPaths(tmpl.defaultPermissions.allowedPaths.join(', '));
    setDeniedPaths(tmpl.defaultPermissions.deniedPaths.join(', '));
  }, [templateId, templates]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedPermissions: AgentPermissions = {
      ...permissions,
      allowedPaths: allowedPaths.split(',').map((s) => s.trim()).filter(Boolean),
      deniedPaths: deniedPaths.split(',').map((s) => s.trim()).filter(Boolean),
    };

    if (agent) {
      updateAgent.mutate(
        {
          id: agent.id,
          name,
          description,
          systemPrompt,
          modelConfig,
          permissions: parsedPermissions,
          color,
          icon,
        },
        { onSuccess: onClose },
      );
    } else {
      const input: CreateAgentInput = {
        projectId,
        role,
        name,
        description: description || undefined,
        systemPrompt,
        modelConfig,
        permissions: parsedPermissions,
        templateId: templateId || undefined,
        color,
        icon,
      };
      createAgent.mutate(input, { onSuccess: onClose });
    }
  };

  const colorOptions = Object.entries(AGENT_COLORS) as [string, string][];
  const iconOptions = Object.entries(AGENT_ICONS) as [string, string][];

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-7" style={{ maxWidth: '560px' }}>
      <h2 className="text-[16px] font-bold text-text-primary tracking-tight">
        {agent ? 'Edit Agent' : 'Create Agent'}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Backend Developer"
        />
        <Select
          label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as AgentRole)}
          disabled={!!agent}
        >
          <option value="specialist">Specialist</option>
          <option value="orchestrator">Orchestrator</option>
        </Select>
      </div>

      <Input
        label="Description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Handles backend API development and database queries"
      />

      {/* Template selector */}
      {!agent && templates && templates.length > 0 && (
        <Select
          label="Start from Template"
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
        >
          <option value="">— No template —</option>
          {(() => {
            const categoryLabels: Record<string, string> = {
              orchestrator: 'Orchestrator',
              backend: 'Backend',
              frontend: 'Frontend',
              mobile: 'Mobile',
              database: 'Database',
              devops: 'DevOps / Infrastructure',
              qa: 'QA / Testing',
              security: 'Security',
              documentation: 'Documentation',
              design: 'Design',
              custom: 'Custom',
            };
            const order = ['orchestrator', 'backend', 'frontend', 'mobile', 'database', 'devops', 'qa', 'security', 'documentation', 'design', 'custom'];
            const grouped = order.reduce<Record<string, typeof templates>>((acc, cat) => {
              const items = templates.filter((t) => t.category === cat);
              if (items.length > 0) acc[cat] = items;
              return acc;
            }, {});
            return Object.entries(grouped).map(([cat, items]) => (
              <optgroup key={cat} label={categoryLabels[cat] ?? cat}>
                {items.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
            ));
          })()}
        </Select>
      )}

      <Separator />

      {/* System Prompt */}
      <PromptEditor value={systemPrompt} onChange={setSystemPrompt} />

      <Separator />

      {/* Model config */}
      <ModelConfigForm config={modelConfig} onChange={setModelConfig} />

      <Separator />

      {/* Permissions */}
      <div>
        <h3 className="text-[11px] font-semibold uppercase text-text-tertiary tracking-wider mb-3">Permissions</h3>
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              ['canReadFiles', 'Read Files'],
              ['canWriteFiles', 'Write Files'],
              ['canCreateFiles', 'Create Files'],
              ['canDeleteFiles', 'Delete Files'],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="flex items-center gap-2.5 text-[12.5px] text-text-secondary cursor-pointer px-3 py-2 hover:bg-[rgba(255,255,255,0.04)] transition-all duration-200"
              style={{ border: '1px solid transparent' }}
            >
              <input
                type="checkbox"
                checked={permissions[key]}
                onChange={(e) =>
                  setPermissions((p) => ({ ...p, [key]: e.target.checked }))
                }
                className="rounded accent-[#fabd2f] h-3.5 w-3.5 shrink-0"
              />
              <span className="truncate">{label}</span>
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Input
            label="Allowed Paths"
            value={allowedPaths}
            onChange={(e) => setAllowedPaths(e.target.value)}
            placeholder="**/*"
            helperText="Comma-separated glob patterns"
          />
          <Input
            label="Denied Paths"
            value={deniedPaths}
            onChange={(e) => setDeniedPaths(e.target.value)}
            placeholder="node_modules/**, .git/**"
            helperText="Comma-separated glob patterns"
          />
        </div>
      </div>

      <Separator />

      {/* Color & Icon */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-[11px] font-semibold uppercase text-text-tertiary tracking-wider block mb-2.5">
            Color
          </label>
          <div className="flex flex-wrap gap-2">
            {colorOptions.map(([key, val]) => (
              <button
                key={key}
                type="button"
                onClick={() => setColor(val)}
                className="h-6 w-6 transition-all duration-200"
                style={{
                  backgroundColor: val,
                  border: color === val ? '2px solid white' : '2px solid transparent',
                  transform: color === val ? 'scale(1.15)' : undefined,
                  boxShadow: color === val ? `0 0 8px ${val}60` : undefined,
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
          {iconOptions.map(([key, val]) => (
            <option key={key} value={val}>
              {val} ({key})
            </option>
          ))}
        </Select>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <button
          type="submit"
          disabled={createAgent.isPending || updateAgent.isPending || !name.trim() || !systemPrompt.trim()}
          className="flex items-center gap-2 font-semibold whitespace-nowrap transition-all duration-200 hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: 'white',
            color: '#0a0a0a',
            fontSize: '13.5px',
            height: '40px',
            padding: '0 24px',
          }}
        >
          {createAgent.isPending || updateAgent.isPending
            ? 'Saving…'
            : agent
              ? 'Save Changes'
              : 'Create Agent'}
        </button>
      </div>
    </form>
  );
}
