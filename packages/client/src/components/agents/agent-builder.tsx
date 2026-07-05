import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowLeft, ArrowRight, Trash2, RotateCcw } from 'lucide-react';
import type { Agent, AgentRole, CreateAgentInput, ModelConfig, AgentPermissions } from '@subagent/shared';
import { DEFAULT_MODEL_CONFIG, DEFAULT_PERMISSIONS, AGENT_COLORS, AGENT_ICONS } from '@subagent/shared';
import { Input } from '../ui/input';
import { Select } from '../ui/select';
import { Dialog } from '../ui/dialog';
import { useToast } from '../ui/toast';
import { PromptEditor } from './prompt-editor';
import { ModelConfigForm } from './model-config';
import { AgentKnowledge } from './agent-knowledge';
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
];

// Knowledge needs a persisted agent id to bind documents to, so it only appears when editing.
const KNOWLEDGE_STEP = { key: 'knowledge', label: 'Knowledge', desc: 'Docs for this agent' };

interface Draft {
  name: string;
  role: AgentRole;
  description: string;
  systemPrompt: string;
  templateId: string;
  modelConfig: ModelConfig;
  permissions: AgentPermissions;
  color: string;
  icon: string;
  allowedPaths: string;
  deniedPaths: string;
}

function draftKey(projectId: string, agentId: string | undefined) {
  return `agent-builder:${projectId}:${agentId ?? 'new'}`;
}

function readDraft(key: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as Draft;
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: Draft) {
  try { window.localStorage.setItem(key, JSON.stringify(draft)); } catch { /* ignore */ }
}

function clearDraft(key: string) {
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}

export function AgentBuilder({ projectId, agent, onClose }: AgentBuilderProps) {
  const { data: templates } = useTemplates();
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const deleteAgent = useDeleteAgent();
  const { show: showToast } = useToast();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1); // slide direction for animation
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);

  const initialDraft: Draft = useMemo(() => ({
    name: agent?.name ?? '',
    role: agent?.role ?? 'specialist',
    description: agent?.description ?? '',
    systemPrompt: agent?.systemPrompt ?? '',
    templateId: agent?.templateId ?? '',
    modelConfig: agent?.modelConfig ?? { ...DEFAULT_MODEL_CONFIG },
    permissions: agent?.permissions ?? { ...DEFAULT_PERMISSIONS },
    color: agent?.color ?? AGENT_COLORS.custom,
    icon: agent?.icon ?? 'Bot',
    allowedPaths: (agent?.permissions.allowedPaths ?? DEFAULT_PERMISSIONS.allowedPaths).join(', '),
    deniedPaths: (agent?.permissions.deniedPaths ?? DEFAULT_PERMISSIONS.deniedPaths).join(', '),
  }), [agent]);

  const storageKey = draftKey(projectId, agent?.id);

  const [name, setName] = useState(initialDraft.name);
  const [role, setRole] = useState<AgentRole>(initialDraft.role);
  const [description, setDescription] = useState(initialDraft.description);
  const [systemPrompt, setSystemPrompt] = useState(initialDraft.systemPrompt);
  const [templateId, setTemplateId] = useState(initialDraft.templateId);
  const [modelConfig, setModelConfig] = useState<ModelConfig>(initialDraft.modelConfig);
  const [permissions, setPermissions] = useState<AgentPermissions>(initialDraft.permissions);
  const [color, setColor] = useState(initialDraft.color);
  const [icon, setIcon] = useState(initialDraft.icon);
  const [allowedPaths, setAllowedPaths] = useState(initialDraft.allowedPaths);
  const [deniedPaths, setDeniedPaths] = useState(initialDraft.deniedPaths);
  const [draftRestored, setDraftRestored] = useState(false);
  const mountedRef = useRef(false);

  // Restore draft on mount (only when not currently editing into the API itself).
  useEffect(() => {
    const draft = readDraft(storageKey);
    if (!draft) return;
    if (mountedRef.current) return;
    mountedRef.current = true;
    setName(draft.name);
    setRole(draft.role);
    setDescription(draft.description);
    setSystemPrompt(draft.systemPrompt);
    setTemplateId(draft.templateId);
    setModelConfig(draft.modelConfig);
    setPermissions(draft.permissions);
    setColor(draft.color);
    setIcon(draft.icon);
    setAllowedPaths(draft.allowedPaths);
    setDeniedPaths(draft.deniedPaths);
    setDraftRestored(true);
    setTimeout(() => setDraftRestored(false), 4000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Persist draft on every change.
  useEffect(() => {
    if (!mountedRef.current) {
      // Only start persisting after the initial mount/restore so we don't overwrite a fresh restore.
      mountedRef.current = true;
      return;
    }
    writeDraft(storageKey, {
      name, role, description, systemPrompt, templateId, modelConfig,
      permissions, color, icon, allowedPaths, deniedPaths,
    });
  }, [storageKey, name, role, description, systemPrompt, templateId, modelConfig, permissions, color, icon, allowedPaths, deniedPaths]);

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

  const isDirty = useMemo(() => (
    name !== initialDraft.name ||
    role !== initialDraft.role ||
    description !== initialDraft.description ||
    systemPrompt !== initialDraft.systemPrompt ||
    templateId !== initialDraft.templateId ||
    JSON.stringify(modelConfig) !== JSON.stringify(initialDraft.modelConfig) ||
    JSON.stringify(permissions) !== JSON.stringify(initialDraft.permissions) ||
    color !== initialDraft.color ||
    icon !== initialDraft.icon ||
    allowedPaths !== initialDraft.allowedPaths ||
    deniedPaths !== initialDraft.deniedPaths
  ), [initialDraft, name, role, description, systemPrompt, templateId, modelConfig, permissions, color, icon, allowedPaths, deniedPaths]);

  // Warn on browser navigation away with unsaved changes.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleClose = () => {
    if (isDirty) {
      setConfirmCloseOpen(true);
      return;
    }
    clearDraft(storageKey);
    onClose();
  };

  const handleDiscardAndClose = () => {
    clearDraft(storageKey);
    setConfirmCloseOpen(false);
    onClose();
  };

  const handleReapplyTemplate = () => {
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
    showToast(`Applied template "${tmpl.name}"`, { variant: 'info' });
  };

  const submit = () => {
    const parsedPermissions: AgentPermissions = {
      ...permissions,
      allowedPaths: allowedPaths.split(',').map((s) => s.trim()).filter(Boolean),
      deniedPaths: deniedPaths.split(',').map((s) => s.trim()).filter(Boolean),
    };
    if (agent) {
      updateAgent.mutate(
        { id: agent.id, name, description, systemPrompt, modelConfig, permissions: parsedPermissions, color, icon },
        {
          onSuccess: () => {
            clearDraft(storageKey);
            showToast(`Saved "${name}"`, { variant: 'success' });
            onClose();
          },
          onError: (err) => showToast(err instanceof Error ? err.message : 'Save failed', { variant: 'error' }),
        },
      );
    } else {
      const input: CreateAgentInput = {
        projectId, role, name, description: description || undefined, systemPrompt,
        modelConfig, permissions: parsedPermissions, templateId: templateId || undefined, color, icon,
      };
      createAgent.mutate(input, {
        onSuccess: () => {
          clearDraft(storageKey);
          showToast(`Created "${name}"`, { variant: 'success' });
          onClose();
        },
        onError: (err) => showToast(err instanceof Error ? err.message : 'Create failed', { variant: 'error' }),
      });
    }
  };

  const colorOptions = Object.entries(AGENT_COLORS) as [string, string][];
  const iconOptions = Object.entries(AGENT_ICONS) as [string, string][];

  const steps = agent ? [...STEPS, KNOWLEDGE_STEP] : STEPS;
  const last = steps.length - 1;
  // Per-step gate before advancing.
  const canAdvance = step === 0 ? !!name.trim() : step === 1 ? !!systemPrompt.trim() : true;
  const canCreate = !!name.trim() && !!systemPrompt.trim();
  const saving = createAgent.isPending || updateAgent.isPending;
  const go = (to: number) => { setDir(to > step ? 1 : -1); setStep(Math.max(0, Math.min(last, to))); };

  return (
    <div className="flex flex-col sm:flex-row" style={{ minHeight: 364 }}>
      {/* ── Left rail: stepper ── */}
      <div
        className="shrink-0 flex flex-col"
        style={{ width: 210, borderRight: '1px solid var(--color-border-subtle)', paddingRight: 18, marginRight: 22, gap: 4 }}
      >
        <div className="flex items-center justify-between">
          <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 4 }}>
            {agent ? 'Edit Agent' : 'Create Agent'}
          </h2>
        </div>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
          step {step + 1} of {steps.length}
        </p>
        {(isDirty || draftRestored) && (
          <span
            aria-live="polite"
            style={{
              alignSelf: 'flex-start', fontSize: 10, fontFamily: 'var(--font-mono)',
              color: draftRestored ? 'var(--color-accent)' : 'var(--color-warning)',
              textTransform: 'uppercase', letterSpacing: '0.04em',
              marginBottom: 10,
            }}
          >
            {draftRestored ? 'draft restored' : 'unsaved'}
          </span>
        )}
        <nav aria-label="Agent setup steps">
          <ol style={{ display: 'flex', flexDirection: 'column', gap: 4, listStyle: 'none', margin: 0, padding: 0 }}>
            {steps.map((s, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <li key={s.key}>
                  <button
                    type="button"
                    onClick={() => go(i)}
                    aria-current={active ? 'step' : undefined}
                    className="flex items-center gap-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                    style={{
                      width: '100%',
                      padding: '10px 10px', borderRadius: 'var(--radius-md)',
                      background: active ? 'var(--color-accent-subtle)' : 'transparent',
                      border: 'none', cursor: 'pointer', minHeight: 44,
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--color-bg-raised)'; }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span
                      aria-hidden="true"
                      className="flex items-center justify-center shrink-0"
                      style={{
                        width: 24, height: 24, borderRadius: '50%', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)',
                        background: active ? 'var(--color-accent)' : done ? 'var(--color-success-subtle)' : 'var(--color-bg-raised)',
                        color: active ? '#021526' : done ? 'var(--color-success)' : 'var(--color-text-secondary)',
                        border: `1px solid ${active ? 'var(--color-accent)' : done ? 'rgba(109,181,138,0.4)' : 'var(--color-border-subtle)'}`,
                      }}
                    >
                      {done ? <Check style={{ width: 13, height: 13 }} /> : i + 1}
                    </span>
                    <div className="min-w-0">
                      <div style={{ fontSize: 13, fontWeight: active ? 600 : 500, color: active ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{s.label}</div>
                      <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{s.desc}</div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="flex-1" />
        {agent && (
          <button
            type="button"
            disabled={deleteAgent.isPending}
            onClick={() => setConfirmDeleteOpen(true)}
            className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ fontSize: 11.5, color: '#e06060', background: 'none', border: 'none', cursor: 'pointer', padding: '8px 4px', fontFamily: 'var(--font-mono)', borderRadius: 4 }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.85'; }}
          >
            <Trash2 style={{ width: 13, height: 13 }} aria-hidden="true" /> {deleteAgent.isPending ? 'Deleting…' : 'Delete agent'}
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
                    <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Backend Developer" autoFocus />
                    <Select label="Role" value={role} onChange={(e) => setRole(e.target.value as AgentRole)} disabled={!!agent}>
                      <option value="specialist">Specialist</option>
                      <option value="orchestrator">Orchestrator</option>
                    </Select>
                  </div>
                  <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Handles backend API development and database queries" />
                  <div style={{ flex: 1, minHeight: 12 }} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                        Color
                      </label>
                      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Agent color">
                        {colorOptions.map(([key, val]) => (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setColor(val)}
                            role="radio"
                            aria-checked={color === val}
                            aria-label={`Color ${key}`}
                            title={key}
                            className="rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8] focus-visible:ring-offset-1 focus-visible:ring-offset-transparent"
                            style={{
                              width: 28, height: 28, backgroundColor: val,
                              border: color === val ? '2px solid white' : '2px solid transparent',
                              transform: color === val ? 'scale(1.15)' : undefined,
                              boxShadow: color === val ? `0 0 8px ${val}60` : undefined,
                              cursor: 'pointer',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <Select label="Icon" value={icon} onChange={(e) => setIcon(e.target.value)}>
                      {iconOptions.map(([key, val]) => <option key={key} value={val}>{key}</option>)}
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
                  {agent && templateId && templates?.some((t) => t.id === templateId) && (
                    <button
                      type="button"
                      onClick={handleReapplyTemplate}
                      className="self-start inline-flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                      style={{
                        fontSize: 11, fontFamily: 'var(--font-mono)',
                        color: 'var(--color-accent)', background: 'var(--color-accent-subtle)',
                        border: '1px solid rgba(124,140,248,0.25)', borderRadius: 'var(--radius-sm)',
                        padding: '6px 10px', cursor: 'pointer',
                      }}
                    >
                      <RotateCcw style={{ width: 11, height: 11 }} aria-hidden="true" /> Re-apply template
                    </button>
                  )}
                  <PromptEditor value={systemPrompt} onChange={setSystemPrompt} originalValue={agent?.systemPrompt} />
                </>
              )}

              {/* Step 3 — Model */}
              {step === 2 && <ModelConfigForm config={modelConfig} onChange={setModelConfig} />}

              {/* Step 5 — Knowledge (edit mode only: documents bind to the agent id) */}
              {step === 4 && agent && <AgentKnowledge projectId={projectId} agentId={agent.id} />}

              {/* Step 4 — Permissions */}
              {step === 3 && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {([['canReadFiles', 'Read Files'], ['canWriteFiles', 'Write Files'], ['canCreateFiles', 'Create Files'], ['canDeleteFiles', 'Delete Files']] as const).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2.5 text-[12.5px] text-text-primary cursor-pointer px-3 py-2 transition-all duration-200"
                        style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', minHeight: 40 }}>
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
            onClick={() => (step === 0 ? handleClose() : go(step - 1))}
            className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', borderRadius: 'var(--radius-md)', background: 'none', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', fontSize: 13, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)' }}
          >
            {step === 0 ? 'Cancel' : <><ArrowLeft style={{ width: 14, height: 14 }} aria-hidden="true" /> Back</>}
          </button>
          <div className="flex-1" />
          {step < last ? (
            <button
              type="button"
              disabled={!canAdvance}
              onClick={() => go(step + 1)}
              className="flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                height: 36, padding: '0 18px', borderRadius: 'var(--radius-md)', border: 'none',
                background: canAdvance ? 'var(--color-accent)' : 'var(--color-bg-raised)',
                color: canAdvance ? '#021526' : 'var(--color-text-disabled)',
                fontSize: 13, fontWeight: 600,
                cursor: canAdvance ? 'pointer' : 'not-allowed',
                flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)',
              }}
            >
              Next <ArrowRight style={{ width: 14, height: 14 }} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!canCreate || saving}
              onClick={submit}
              aria-busy={saving || undefined}
              className="flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                height: 40, padding: '0 22px', borderRadius: 'var(--radius-md)', border: 'none',
                background: (canCreate && !saving) ? 'var(--color-accent)' : 'var(--color-bg-raised)',
                color: (canCreate && !saving) ? '#021526' : 'var(--color-text-disabled)',
                fontSize: 13.5, fontWeight: 600,
                cursor: (canCreate && !saving) ? 'pointer' : 'not-allowed',
                flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'var(--font-sans)',
              }}
            >
              {saving ? 'Saving…' : agent ? 'Save Changes' : 'Create Agent'}
            </button>
          )}
        </div>
      </div>

      {/* Confirm delete */}
      <Dialog
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Delete agent"
        description={agent ? `Permanently remove "${agent.name}". Its prompt, history, and permissions will be lost.` : undefined}
        maxWidth="440px"
      >
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDeleteOpen(false)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!agent) return;
              const id = agent.id;
              const targetName = agent.name;
              setConfirmDeleteOpen(false);
              deleteAgent.mutate({ id, projectId }, {
                onSuccess: () => {
                  clearDraft(storageKey);
                  showToast(`Deleted "${targetName}"`, { variant: 'success' });
                  onClose();
                },
                onError: (err) => showToast(err instanceof Error ? err.message : 'Delete failed', { variant: 'error' }),
              });
            }}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: '#e06060', color: '#021526', border: 'none', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Delete agent
          </button>
        </div>
      </Dialog>

      {/* Confirm discard on close */}
      <Dialog
        open={confirmCloseOpen}
        onClose={() => setConfirmCloseOpen(false)}
        title="Discard unsaved changes?"
        description="You have edits that haven't been saved. Your draft is kept locally and can be restored next time."
        maxWidth="440px"
      >
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmCloseOpen(false)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={() => { setConfirmCloseOpen(false); onClose(); }}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: 'var(--color-bg-raised)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border-default)', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Keep draft & close
          </button>
          <button
            type="button"
            onClick={handleDiscardAndClose}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: '#e06060', color: '#021526', border: 'none', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Discard
          </button>
        </div>
      </Dialog>
    </div>
  );
}
