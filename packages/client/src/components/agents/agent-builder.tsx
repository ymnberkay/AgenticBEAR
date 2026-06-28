import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowLeft, ArrowRight, Trash2 } from 'lucide-react';
import type { Agent, AgentRole, CreateAgentInput, ModelConfig, AgentPermissions } from '@subagent/shared';
import { DEFAULT_MODEL_CONFIG, DEFAULT_PERMISSIONS, AGENT_COLORS, AGENT_ICONS } from '@subagent/shared';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { PromptEditor } from './prompt-editor';
import { ModelConfigForm } from './model-config';
import { useTemplates } from '../../api/hooks/use-templates';
import { useCreateAgent, useUpdateAgent, useDeleteAgent } from '../../api/hooks/use-agents';

interface AgentBuilderProps {
  projectId: string;
  agent?: Agent;
  onClose: () => void;
}

const STEPS = [
  { key: 'identity', label: 'Identity', desc: 'Name, role & look' },
  { key: 'prompt', label: 'Prompt', desc: 'Template & instructions' },
  { key: 'model', label: 'Model', desc: 'Provider & parameters' },
  { key: 'permissions', label: 'Permissions', desc: 'Workspace access' },
] as const;

export function AgentBuilder({ projectId, agent, onClose }: AgentBuilderProps) {
  const { data: templates } = useTemplates();
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const deleteAgent = useDeleteAgent();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1); // slide direction for animation

  const [name, setName] = useState(agent?.name ?? '');
  const [role, setRole] = useState<AgentRole>(agent?.role ?? 'specialist');
  const [description, setDescription] = useState(agent?.description ?? '');
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '');
  const [templateId, setTemplateId] = useState(agent?.templateId ?? '');
  const [modelConfig, setModelConfig] = useState<ModelConfig>(agent?.modelConfig ?? { ...DEFAULT_MODEL_CONFIG });
  const [permissions, setPermissions] = useState<AgentPermissions>(agent?.permissions ?? { ...DEFAULT_PERMISSIONS });
  const [color, setColor] = useState(agent?.color ?? AGENT_COLORS.custom);
  const [icon, setIcon] = useState(agent?.icon ?? 'Bot');
  const [allowedPaths, setAllowedPaths] = useState((agent?.permissions.allowedPaths ?? DEFAULT_PERMISSIONS.allowedPaths).join(', '));
  const [deniedPaths, setDeniedPaths] = useState((agent?.permissions.deniedPaths ?? DEFAULT_PERMISSIONS.deniedPaths).join(', '));

  // Apply template when selected (only for new agents).
  useEffect(() => {
    if (agent) return;
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
  }, [templateId, templates, agent]);

  const submit = () => {
    const parsedPermissions: AgentPermissions = {
      ...permissions,
      allowedPaths: allowedPaths.split(',').map((s) => s.trim()).filter(Boolean),
      deniedPaths: deniedPaths.split(',').map((s) => s.trim()).filter(Boolean),
    };
    if (agent) {
      updateAgent.mutate(
        { id: agent.id, name, description, systemPrompt, modelConfig, permissions: parsedPermissions, color, icon },
        { onSuccess: onClose },
      );
    } else {
      const input: CreateAgentInput = {
        projectId, role, name, description: description || undefined, systemPrompt,
        modelConfig, permissions: parsedPermissions, templateId: templateId || undefined, color, icon,
      };
      createAgent.mutate(input, { onSuccess: onClose });
    }
  };

  const colorOptions = Object.entries(AGENT_COLORS) as [string, string][];
  const iconOptions = Object.entries(AGENT_ICONS) as [string, string][];

  const last = STEPS.length - 1;
  // Per-step gate before advancing.
  const canAdvance = step === 0 ? !!name.trim() : step === 1 ? !!systemPrompt.trim() : true;
  const canCreate = !!name.trim() && !!systemPrompt.trim();
  const saving = createAgent.isPending || updateAgent.isPending;
  const go = (to: number) => { setDir(to > step ? 1 : -1); setStep(Math.max(0, Math.min(last, to))); };

  return (
    <div className="flex" style={{ minHeight: 364 }}>
      {/* ── Left rail: stepper ── */}
      <div
        className="shrink-0 flex flex-col"
        style={{ width: 210, borderRight: '1px solid var(--color-border-subtle)', paddingRight: 18, marginRight: 22, gap: 4 }}
      >
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
          {agent ? 'Edit Agent' : 'Create Agent'}
        </h2>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 14 }}>
          step {step + 1} of {STEPS.length}
        </p>
        {STEPS.map((s, i) => {
          const active = i === step;
          const done = i < step;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => go(i)}
              className="flex items-center gap-3 text-left transition-colors duration-150"
              style={{
                padding: '9px 10px', borderRadius: 'var(--radius-md)', background: active ? 'var(--color-accent-subtle)' : 'transparent', border: 'none', cursor: 'pointer',
              }}
              onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--color-bg-raised)'; }}
              onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <span
                className="flex items-center justify-center shrink-0"
                style={{
                  width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  background: active ? 'var(--color-accent)' : done ? 'var(--color-success-subtle)' : 'var(--color-bg-raised)',
                  color: active ? '#021526' : done ? 'var(--color-success)' : 'var(--color-text-disabled)',
                  border: `1px solid ${active ? 'var(--color-accent)' : done ? 'rgba(109,181,138,0.4)' : 'var(--color-border-subtle)'}`,
                }}
              >
                {done ? <Check style={{ width: 13, height: 13 }} /> : i + 1}
              </span>
              <div className="min-w-0">
                <div style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{s.label}</div>
                <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{s.desc}</div>
              </div>
            </button>
          );
        })}
        <div className="flex-1" />
        {agent && (
          <button
            type="button"
            disabled={deleteAgent.isPending}
            onClick={() => { if (window.confirm(`Delete "${agent.name}"? This cannot be undone.`)) deleteAgent.mutate({ id: agent.id, projectId }, { onSuccess: onClose }); }}
            className="flex items-center gap-1.5"
            style={{ fontSize: 11.5, color: 'rgba(224,96,96,0.6)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 4px', fontFamily: 'var(--font-mono)' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-error)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(224,96,96,0.6)'; }}
          >
            <Trash2 style={{ width: 13, height: 13 }} /> {deleteAgent.isPending ? 'Deleting…' : 'Delete agent'}
          </button>
        )}
      </div>

      {/* ── Right: step content + nav ── */}
      <div className="flex-1 flex flex-col min-w-0">
        <div style={{ height: 320, overflowY: 'auto', overflowX: 'hidden', position: 'relative' }}>
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={step}
              custom={dir}
              initial={{ opacity: 0, x: dir * 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: dir * -40 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col h-full"
              style={{ gap: 18 }}
            >
              {/* Step 1 — Identity */}
              {step === 0 && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Backend Developer" />
                    <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as AgentRole)} disabled={!!agent}>
                      <option value="specialist">Specialist</option>
                      <option value="orchestrator">Orchestrator</option>
                    </Select>
                  </div>
                  <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Handles backend API development and database queries" />
                  <div style={{ flex: 1, minHeight: 12 }} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-tertiary)', marginBottom: 10 }}>Color</label>
                      <div className="flex flex-wrap gap-2">
                        {colorOptions.map(([key, val]) => (
                          <button key={key} type="button" onClick={() => setColor(val)} title={key}
                            className="h-6 w-6 rounded-full transition-all duration-200"
                            style={{ backgroundColor: val, border: color === val ? '2px solid white' : '2px solid transparent', transform: color === val ? 'scale(1.15)' : undefined, boxShadow: color === val ? `0 0 8px ${val}60` : undefined }} />
                        ))}
                      </div>
                    </div>
                    <Select label="Icon" value={icon} onChange={(e) => setIcon(e.target.value)}>
                      {iconOptions.map(([key, val]) => <option key={key} value={val}>{val} ({key})</option>)}
                    </Select>
                  </div>
                </>
              )}

              {/* Step 2 — Prompt */}
              {step === 1 && (
                <>
                  {!agent && templates && templates.length > 0 && (
                    <Select label="Start from Template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                      <option value="">— No template —</option>
                      {(() => {
                        const labels: Record<string, string> = { orchestrator: 'Orchestrator', backend: 'Backend', frontend: 'Frontend', mobile: 'Mobile', database: 'Database', devops: 'DevOps', qa: 'QA', security: 'Security', documentation: 'Documentation', design: 'Design', custom: 'Custom' };
                        const order = ['orchestrator', 'backend', 'frontend', 'mobile', 'database', 'devops', 'qa', 'security', 'documentation', 'design', 'custom'];
                        const grouped = order.reduce<Record<string, typeof templates>>((acc, cat) => { const items = templates.filter((t) => t.category === cat); if (items.length) acc[cat] = items; return acc; }, {});
                        return Object.entries(grouped).map(([cat, items]) => (
                          <optgroup key={cat} label={labels[cat] ?? cat}>{items.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>
                        ));
                      })()}
                    </Select>
                  )}
                  <PromptEditor value={systemPrompt} onChange={setSystemPrompt} />
                </>
              )}

              {/* Step 3 — Model */}
              {step === 2 && <ModelConfigForm config={modelConfig} onChange={setModelConfig} />}

              {/* Step 4 — Permissions */}
              {step === 3 && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {([['canReadFiles', 'Read Files'], ['canWriteFiles', 'Write Files'], ['canCreateFiles', 'Create Files'], ['canDeleteFiles', 'Delete Files']] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2.5 text-[12.5px] text-text-secondary cursor-pointer px-3 py-2 transition-all duration-200"
                        style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                        <input type="checkbox" checked={permissions[key]} onChange={(e) => setPermissions((p) => ({ ...p, [key]: e.target.checked }))} className="accent-[#7c8cf8] h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Allowed Paths" value={allowedPaths} onChange={(e) => setAllowedPaths(e.target.value)} placeholder="**/*" helperText="Comma-separated globs" />
                    <Input label="Denied Paths" value={deniedPaths} onChange={(e) => setDeniedPaths(e.target.value)} placeholder="node_modules/**, .git/**" helperText="Comma-separated globs" />
                  </div>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer nav */}
        <div className="flex items-center" style={{ gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--color-border-subtle)' }}>
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : go(step - 1))}
            className="flex items-center gap-1.5"
            style={{ height: 36, padding: '0 14px', borderRadius: 'var(--radius-md)', background: 'none', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', fontSize: 13, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}
          >
            {step === 0 ? 'Cancel' : <><ArrowLeft style={{ width: 14, height: 14 }} /> Back</>}
          </button>
          <div className="flex-1" />
          {step < last ? (
            <button
              type="button"
              disabled={!canAdvance}
              onClick={() => go(step + 1)}
              className="flex items-center justify-center gap-1.5"
              style={{ height: 36, padding: '0 18px', borderRadius: 'var(--radius-md)', border: 'none', background: canAdvance ? 'var(--color-accent)' : 'var(--color-bg-raised)', color: canAdvance ? '#021526' : 'var(--color-text-disabled)', fontSize: 13, fontWeight: 600, cursor: canAdvance ? 'pointer' : 'default', flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}
            >
              Next <ArrowRight style={{ width: 14, height: 14 }} />
            </button>
          ) : (
            <button
              type="button"
              disabled={!canCreate || saving}
              onClick={submit}
              className="flex items-center justify-center gap-1.5"
              style={{ height: 38, padding: '0 22px', borderRadius: 'var(--radius-md)', border: 'none', background: (canCreate && !saving) ? 'var(--color-accent)' : 'var(--color-bg-raised)', color: (canCreate && !saving) ? '#021526' : 'var(--color-text-disabled)', fontSize: 13.5, fontWeight: 600, cursor: (canCreate && !saving) ? 'pointer' : 'default', flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}
            >
              {saving ? 'Saving…' : agent ? 'Save Changes' : 'Create Agent'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
