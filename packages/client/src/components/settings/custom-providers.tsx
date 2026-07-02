/**
 * Custom LLM providers — modern list + Dialog-based add/edit form.
 *
 * The old inline form was cramped and used raw `<select>`s; this rewrite:
 *   - moves the form into a focused Dialog surface so it can breathe
 *   - shows presets as clickable brand cards instead of a bare dropdown
 *   - uses pill toggles for provider kind + auth type
 *   - shows API key with an eye toggle (same pattern as Settings → Providers)
 *   - lays each model out on its own card with clearly-labelled cost / level fields
 *   - modernizes the provider list rows (icon badge, hover state, cleaner meta line)
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Boxes, Plus, Trash2, Pencil, Eye, EyeOff, KeyRound, ChevronDown, ChevronUp,
  Sparkles, Server, DollarSign, Layers, ExternalLink,
} from 'lucide-react';
import type { LLMModelDef, ProviderAuthType, ProviderKind } from '@subagent/shared';
import { PROVIDER_PRESETS } from '@subagent/shared';
import {
  useProviders, useCreateProvider, useUpdateProvider, useDeleteProvider,
  type ProviderView,
} from '../../api/hooks/use-providers';
import { useToast } from '../ui/toast';
import { Dialog } from '../ui/dialog';
import { Panel } from './gateway-ui';

// ── styles ─────────────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 12px',
  background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border-default)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-sans)', fontSize: 13,
  outline: 'none', borderRadius: 'var(--radius-md)',
  transition: 'border-color .15s, box-shadow .15s',
};
const monoInputStyle: React.CSSProperties = { ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12.5 };

// ── data ───────────────────────────────────────────────────────────────────────
interface ModelRow { id: string; label: string; inPer1M: string; outPer1M: string; level: string }
interface HeaderRow { key: string; value: string }
interface FormState {
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  authType: ProviderAuthType;
  headers: HeaderRow[];
  models: ModelRow[];
}
const EMPTY_FORM: FormState = {
  label: '', kind: 'openai-compatible', baseUrl: '', apiKey: '', authType: 'api_key',
  headers: [], models: [{ id: '', label: '', inPer1M: '', outPer1M: '', level: '' }],
};

function toHeaderRows(headers: Record<string, string> | undefined): HeaderRow[] {
  if (!headers) return [];
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}
function toHeaderObject(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) { const k = r.key.trim(); if (k) out[k] = r.value; }
  return out;
}
function toModelRows(models: LLMModelDef[]): ModelRow[] {
  if (models.length === 0) return [{ id: '', label: '', inPer1M: '', outPer1M: '', level: '' }];
  return models.map((m) => ({
    id: m.id, label: m.label,
    inPer1M: m.costPer1kInput ? String(m.costPer1kInput * 1000) : '',
    outPer1M: m.costPer1kOutput ? String(m.costPer1kOutput * 1000) : '',
    level: m.level ? String(m.level) : '',
  }));
}
function toModelDefs(rows: ModelRow[]): LLMModelDef[] {
  return rows.filter((r) => r.id.trim()).map((r) => ({
    id: r.id.trim(),
    label: r.label.trim() || r.id.trim(),
    costPer1kInput: r.inPer1M ? Number(r.inPer1M) / 1000 : 0,
    costPer1kOutput: r.outPer1M ? Number(r.outPer1M) / 1000 : 0,
    ...(r.level ? { level: Math.max(1, Math.min(10, Math.round(Number(r.level)))) } : {}),
  }));
}

/** Brand accent for a preset card. Local (Ollama / LM Studio) → green; hosted → indigo. */
const PRESET_ACCENT: Record<string, string> = {
  deepseek: '#7c8cf8', groq: '#e2b04a', openrouter: '#c0a0d8', ollama: '#6db58a', lmstudio: '#6db58a',
};

// ── small building blocks ─────────────────────────────────────────────────────
function FieldLabel({ children, hint, required }: { children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
        fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)',
      }}>
        {children}{required && <span aria-hidden="true" style={{ color: 'var(--color-error)', marginLeft: 3 }}>*</span>}
      </span>
      {hint && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{hint}</span>}
    </div>
  );
}

function PillToggle<T extends string>({
  value, onChange, options,
}: { value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[] }) {
  return (
    <div
      role="group"
      className="flex items-center"
      style={{
        gap: 2, padding: 3,
        background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
        borderRadius: 999,
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            title={o.hint}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              height: 28, padding: '0 12px', fontSize: 11.5, fontFamily: 'var(--font-mono)',
              background: on ? 'linear-gradient(180deg, rgba(124,140,248,0.22), rgba(124,140,248,0.10))' : 'transparent',
              border: on ? '1px solid rgba(124,140,248,0.4)' : '1px solid transparent',
              color: on ? '#7c8cf8' : 'var(--color-text-secondary)',
              borderRadius: 999, cursor: on ? 'default' : 'pointer', fontWeight: on ? 600 : 500,
              transition: 'background .15s, color .15s, border-color .15s',
              whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function PasswordInput({ id, value, onChange, placeholder, hint }: { id?: string; value: string; onChange: (v: string) => void; placeholder: string; hint?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          style={{ ...inputStyle, paddingRight: 40, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide API key' : 'Show API key'}
          aria-pressed={visible}
          style={{
            position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)',
            padding: 6, display: 'flex', borderRadius: 4,
          }}
        >
          {visible ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
        </button>
      </div>
      {hint && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{hint}</span>}
    </div>
  );
}

/**
 * Compact preset picker — a single trigger row that opens a floating menu of presets, each with
 * its own brand-accent icon and a "hosted / local" meta line. Replaces the older card grid so the
 * top of the dialog stays tidy.
 */
function PresetPicker({ onPick }: { onPick: (key: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = PROVIDER_PRESETS.find((p) => p.key === chosen);
  const accent = active ? (PRESET_ACCENT[active.key] ?? '#7c8cf8') : '#7c8cf8';

  const pick = (key: string | null) => {
    setChosen(key);
    setOpen(false);
    onPick(key);
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-2.5 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
        style={{
          height: 40, padding: '0 10px 0 8px',
          background: 'var(--color-bg-base)',
          border: `1px solid ${open ? 'rgba(124,140,248,0.4)' : 'var(--color-border-default)'}`,
          borderRadius: 'var(--radius-md)', cursor: 'pointer',
          transition: 'border-color .15s',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 26, height: 26, borderRadius: 7, flexShrink: 0,
            background: `linear-gradient(135deg, ${accent}30, ${accent}10)`,
            border: `1px solid ${accent}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
          }}
        >
          {active ? <Boxes style={{ width: 12, height: 12 }} /> : <Sparkles style={{ width: 12, height: 12 }} />}
        </span>
        <div className="flex flex-col min-w-0" style={{ flex: 1, textAlign: 'left' }}>
          <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>
            {active ? active.label : 'Blank — build from scratch'}
          </span>
          <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', lineHeight: 1.2, marginTop: 2 }}>
            {active ? (active.needsApiKey ? 'API key required' : 'Local / no key') : 'Pick a preset to prefill the form'}
          </span>
        </div>
        <ChevronDown
          style={{
            width: 14, height: 14, color: 'var(--color-text-secondary)',
            transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none', flexShrink: 0,
          }}
        />
      </button>

      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20,
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 12px 28px -12px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02) inset',
            overflow: 'hidden', maxHeight: 320, overflowY: 'auto',
          }}
        >
          {/* Blank first — always available */}
          <button
            type="button"
            onClick={() => pick(null)}
            role="option"
            aria-selected={chosen === null}
            className="flex items-center gap-2.5 w-full"
            style={{
              padding: '9px 12px', background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: '1px solid var(--color-border-subtle)', textAlign: 'left',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(124,140,248,0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span aria-hidden="true" style={{
              width: 24, height: 24, borderRadius: 6, flexShrink: 0,
              background: 'rgba(124,140,248,0.10)', border: '1px solid rgba(124,140,248,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c8cf8',
            }}>
              <Sparkles style={{ width: 11, height: 11 }} />
            </span>
            <div className="flex flex-col" style={{ minWidth: 0, flex: 1 }}>
              <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>Blank</span>
              <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', lineHeight: 1.2, marginTop: 2 }}>Build from scratch</span>
            </div>
          </button>

          {PROVIDER_PRESETS.map((p) => {
            const accent = PRESET_ACCENT[p.key] ?? '#7c8cf8';
            const isChosen = chosen === p.key;
            return (
              <button
                key={p.key}
                type="button"
                role="option"
                aria-selected={isChosen}
                onClick={() => pick(p.key)}
                className="flex items-center gap-2.5 w-full"
                style={{
                  padding: '9px 12px',
                  background: isChosen ? `${accent}12` : 'transparent',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  transition: 'background .15s',
                }}
                onMouseEnter={(e) => { if (!isChosen) e.currentTarget.style.background = `${accent}0d`; }}
                onMouseLeave={(e) => { if (!isChosen) e.currentTarget.style.background = 'transparent'; }}
              >
                <span aria-hidden="true" style={{
                  width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                  background: `linear-gradient(135deg, ${accent}30, ${accent}10)`,
                  border: `1px solid ${accent}55`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
                }}>
                  <Boxes style={{ width: 11, height: 11 }} />
                </span>
                <div className="flex flex-col" style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>{p.label}</span>
                  <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', lineHeight: 1.2, marginTop: 2 }}>
                    {p.needsApiKey ? 'API key required' : 'Local / no key'}
                  </span>
                </div>
                <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', flexShrink: 0 }}>
                  {p.models.length} model{p.models.length === 1 ? '' : 's'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export function CustomProvidersSection() {
  const { data: providers } = useProviders();
  const createProvider = useCreateProvider();
  const updateProvider = useUpdateProvider();
  const deleteProvider = useDeleteProvider();
  const { show: showToast } = useToast();

  const [editingId, setEditingId] = useState<string | null>(null); // null = closed, '' = new
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteTarget, setDeleteTarget] = useState<ProviderView | null>(null);
  const [labelError, setLabelError] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const open = editingId !== null;
  const isNew = editingId === '';

  const dialogTitle = isNew ? 'New provider' : 'Edit provider';

  function startNew() {
    setForm(EMPTY_FORM);
    setLabelError('');
    setShowAdvanced(false);
    setEditingId('');
  }

  function startEdit(p: ProviderView) {
    setForm({
      label: p.label,
      kind: p.kind,
      baseUrl: p.baseUrl ?? '',
      apiKey: '',
      authType: p.authType ?? 'api_key',
      headers: toHeaderRows(p.headers),
      models: toModelRows(p.models),
    });
    setLabelError('');
    setShowAdvanced(p.authType === 'bearer' || Object.keys(p.headers ?? {}).length > 0);
    setEditingId(p.id);
  }

  function applyPreset(key: string) {
    const preset = PROVIDER_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setForm({
      ...EMPTY_FORM,
      label: preset.label,
      kind: preset.kind,
      baseUrl: preset.baseUrl,
      models: toModelRows(preset.models),
    });
    setLabelError('');
  }

  function save() {
    setLabelError('');
    if (!form.label.trim()) {
      setLabelError('Give the provider a label.');
      return;
    }
    // Numeric validation on costs.
    const invalidCost = form.models.some((m) => {
      if (m.inPer1M && !Number.isFinite(Number(m.inPer1M))) return true;
      if (m.outPer1M && !Number.isFinite(Number(m.outPer1M))) return true;
      return false;
    });
    if (invalidCost) {
      showToast('Costs must be numbers (e.g. 3 for $3 per 1M tokens).', { variant: 'error' });
      return;
    }
    const payload = {
      label: form.label.trim(),
      kind: form.kind,
      baseUrl: form.baseUrl.trim() || undefined,
      authType: form.authType,
      headers: toHeaderObject(form.headers),
      models: toModelDefs(form.models),
      // Send apiKey only when the user typed something (empty = keep existing on edit).
      ...(form.apiKey ? { apiKey: form.apiKey } : {}),
    };
    if (isNew) {
      createProvider.mutate(
        { ...payload, apiKey: form.apiKey || undefined },
        {
          onSuccess: () => { setEditingId(null); showToast('Provider added', { variant: 'success' }); },
          onError: (err) => showToast(err instanceof Error ? err.message : 'Create failed', { variant: 'error' }),
        },
      );
    } else {
      updateProvider.mutate(
        { id: editingId!, input: payload },
        {
          onSuccess: () => { setEditingId(null); showToast('Provider saved', { variant: 'success' }); },
          onError: (err) => showToast(err instanceof Error ? err.message : 'Save failed', { variant: 'error' }),
        },
      );
    }
  }

  function updateModel(i: number, patch: Partial<ModelRow>) {
    setForm((f) => ({ ...f, models: f.models.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) }));
  }
  function updateHeader(i: number, patch: Partial<HeaderRow>) {
    setForm((f) => ({ ...f, headers: f.headers.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) }));
  }

  const modelCount = useMemo(() => form.models.filter((m) => m.id.trim()).length, [form.models]);
  const providerAccent = (p: ProviderView): string => {
    const preset = PROVIDER_PRESETS.find((x) => x.label.toLowerCase() === p.label.toLowerCase());
    return preset ? (PRESET_ACCENT[preset.key] ?? '#7c8cf8') : '#c0a0d8';
  };

  return (
    <Panel
      icon={<Boxes style={{ width: 12, height: 12 }} aria-hidden="true" />}
      color="#7c8cf8"
      title="Custom LLM providers"
      action={
        <button
          type="button"
          onClick={startNew}
          className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            height: 32, padding: '0 13px', fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 600,
            color: '#021526', background: 'var(--color-accent)', border: 'none',
            borderRadius: 'var(--radius-md)', cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-accent)'; }}
        >
          <Plus style={{ width: 13, height: 13 }} /> Add provider
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        <p style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', margin: 0 }}>
          Plug in DeepSeek, local Ollama/LM Studio, OpenRouter, or any OpenAI-/Anthropic-compatible endpoint.
          Per-model prices (USD / 1M tokens) drive cost tracking in the usage dashboard.
        </p>

        {/* Existing providers */}
        {(providers ?? []).length === 0 ? (
          <div style={{
            padding: '24px 20px', textAlign: 'center',
            background: 'var(--color-bg-base)', border: '1px dashed var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 10, background: 'rgba(192,160,216,0.12)', border: '1px solid rgba(192,160,216,0.3)', marginBottom: 10 }}>
              <Boxes style={{ width: 16, height: 16, color: '#c0a0d8' }} />
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', marginBottom: 4 }}>No custom providers yet</div>
            <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Click <b style={{ color: 'var(--color-accent)' }}>Add provider</b> to plug in DeepSeek, Ollama, OpenRouter and more.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {providers!.map((p) => {
              const accent = providerAccent(p);
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 group"
                  style={{
                    padding: '12px 14px',
                    background: 'var(--color-bg-base)',
                    border: '1px solid var(--color-border-subtle)',
                    borderRadius: 10, transition: 'border-color .15s, background .15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${accent}44`; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                      background: `linear-gradient(135deg, ${accent}2a, ${accent}0a)`,
                      border: `1px solid ${accent}44`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
                    }}
                  >
                    <Boxes style={{ width: 14, height: 14 }} />
                  </span>
                  <div className="flex flex-col min-w-0" style={{ flex: 1 }}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{p.label}</span>
                      <span style={{
                        fontSize: 9.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em',
                        color: 'var(--color-text-secondary)',
                        background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
                        borderRadius: 999, padding: '1px 8px', textTransform: 'uppercase',
                      }}>{p.kind}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap" style={{ marginTop: 3, fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                      <span className="truncate flex items-center gap-1" title={p.baseUrl || undefined}>
                        <Server style={{ width: 10, height: 10 }} />
                        {p.baseUrl || '—'}
                      </span>
                      <span className="flex items-center gap-1">
                        <Layers style={{ width: 10, height: 10 }} />
                        {p.models.length} model{p.models.length === 1 ? '' : 's'}
                      </span>
                      <span className="flex items-center gap-1" style={{ color: p.hasApiKey ? 'var(--color-success)' : 'var(--color-error)' }}>
                        <KeyRound style={{ width: 10, height: 10 }} />
                        {p.hasApiKey ? 'key set' : 'no key'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100" style={{ flexShrink: 0, transition: 'opacity .15s' }}>
                    <button
                      type="button" onClick={() => startEdit(p)}
                      aria-label={`Edit provider ${p.label}`} title="Edit"
                      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                      style={{
                        width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'none', border: '1px solid var(--color-border-subtle)',
                        color: 'var(--color-text-secondary)', cursor: 'pointer', borderRadius: 8,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(124,140,248,0.35)'; e.currentTarget.style.color = '#7c8cf8'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
                    >
                      <Pencil style={{ width: 13, height: 13 }} />
                    </button>
                    <button
                      type="button" onClick={() => setDeleteTarget(p)}
                      aria-label={`Delete provider ${p.label}`} title="Delete"
                      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                      style={{
                        width: 32, height: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        background: 'none', border: '1px solid var(--color-border-subtle)',
                        color: 'var(--color-error)', cursor: 'pointer', borderRadius: 8,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(224,96,96,0.4)'; e.currentTarget.style.background = 'rgba(224,96,96,0.08)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.background = 'none'; }}
                    >
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add/Edit dialog ────────────────────────────────────────────────── */}
      <Dialog
        open={open}
        onClose={() => setEditingId(null)}
        title={dialogTitle}
        description={isNew ? 'Plug an OpenAI- or Anthropic-compatible endpoint into the gateway.' : `Editing ${form.label}. Leave the API key blank to keep the existing one.`}
        maxWidth="820px"
        className="!max-h-[90vh]"
        disableBackdropClose
      >
        <div className="flex flex-col gap-5" style={{ maxHeight: '75vh', overflowY: 'auto', padding: '2px 2px 4px' }}>
          {/* Preset picker — only for new providers */}
          {isNew && (
            <div className="flex flex-col gap-1.5">
              <FieldLabel hint="Prefills base URL + models + list-price hints for a known provider.">Preset</FieldLabel>
              <PresetPicker
                onPick={(key) => {
                  if (key) applyPreset(key);
                  else { setForm({ ...EMPTY_FORM }); setLabelError(''); }
                }}
              />
            </div>
          )}

          {/* Basics: label + kind */}
          <div className="grid" style={{ gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'end' }}>
            <div className="flex flex-col gap-1.5">
              <FieldLabel required>Label</FieldLabel>
              <input
                id="cp-label"
                placeholder="e.g. DeepSeek"
                value={form.label}
                required
                aria-invalid={!!labelError}
                aria-describedby={labelError ? 'cp-label-err' : undefined}
                onChange={(e) => { setForm({ ...form, label: e.target.value }); if (labelError) setLabelError(''); }}
                style={{ ...inputStyle, borderColor: labelError ? 'rgba(224,96,96,0.5)' : 'var(--color-border-default)' }}
              />
              {labelError && (
                <span id="cp-label-err" role="alert" style={{ fontSize: 11, color: 'var(--color-error)', fontFamily: 'var(--font-mono)' }}>{labelError}</span>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <FieldLabel>Kind</FieldLabel>
              <PillToggle
                value={form.kind}
                onChange={(v) => setForm({ ...form, kind: v })}
                options={[
                  { value: 'openai-compatible', label: 'OpenAI-compatible', hint: 'DeepSeek, Ollama, LM Studio, Groq, OpenRouter…' },
                  { value: 'anthropic-compatible', label: 'Anthropic-compatible', hint: 'Custom Claude-shaped endpoint' },
                ]}
              />
            </div>
          </div>

          {/* Base URL */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel hint="Include the /v1 suffix if your endpoint expects it.">Base URL</FieldLabel>
            <input
              placeholder="https://api.deepseek.com/v1"
              value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              style={monoInputStyle}
            />
          </div>

          {/* API key */}
          <div className="flex flex-col gap-1.5">
            <FieldLabel>API key</FieldLabel>
            <PasswordInput
              id="cp-apikey"
              value={form.apiKey}
              onChange={(v) => setForm({ ...form, apiKey: v })}
              placeholder={isNew ? 'sk-… (blank for local endpoints)' : 'Leave blank to keep the existing key'}
              hint={!isNew && !form.apiKey ? 'An API key is currently set. Leave blank to keep it, or type a new one to replace it.' : undefined}
            />
          </div>

          {/* Advanced — thin divider header, tucks under the primary fields so it reads as
              a "you probably don't need this" sub-section rather than a callout. */}
          <div className="flex flex-col" style={{ borderTop: '1px solid var(--color-border-subtle)', paddingTop: 4 }}>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              aria-expanded={showAdvanced}
              className="flex items-center gap-2 w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                padding: '8px 4px', background: 'transparent', border: 'none', cursor: 'pointer',
                color: showAdvanced ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                fontSize: 11, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase',
                fontWeight: 700, borderRadius: 4,
              }}
            >
              {showAdvanced ? <ChevronUp style={{ width: 12, height: 12 }} /> : <ChevronDown style={{ width: 12, height: 12 }} />}
              Advanced
              <span style={{ letterSpacing: 0, textTransform: 'none', fontWeight: 400, color: 'var(--color-text-disabled)' }}>
                · auth style, custom headers
              </span>
            </button>
            {showAdvanced && (
              <div className="flex flex-col gap-4" style={{ paddingTop: 6 }}>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel hint="Use “Bearer” when a corporate LLM gateway (LiteLLM, Portkey…) fronts an Anthropic-compatible endpoint.">Auth style</FieldLabel>
                  <PillToggle
                    value={form.authType}
                    onChange={(v) => setForm({ ...form, authType: v })}
                    options={[
                      { value: 'api_key', label: 'Provider default' },
                      { value: 'bearer', label: 'Authorization: Bearer' },
                    ]}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <FieldLabel hint="Extra HTTP headers sent on every request. Rarely needed.">Custom headers</FieldLabel>
                  {form.headers.length === 0 && (
                    <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                      None. Add one for org routing, an anthropic-beta flag, etc.
                    </span>
                  )}
                  {form.headers.map((h, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input placeholder="Header name" value={h.key} onChange={(e) => updateHeader(i, { key: e.target.value })} style={{ ...monoInputStyle, flex: 2 }} />
                      <input placeholder="Value" value={h.value} onChange={(e) => updateHeader(i, { value: e.target.value })} style={{ ...monoInputStyle, flex: 3 }} />
                      <button
                        type="button"
                        onClick={() => setForm((f) => ({ ...f, headers: f.headers.filter((_, idx) => idx !== i) }))}
                        aria-label={`Remove header ${h.key || i + 1}`}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', padding: 6, flexShrink: 0, borderRadius: 6 }}
                      >
                        <Trash2 style={{ width: 13, height: 13 }} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, headers: [...f.headers, { key: '', value: '' }] }))}
                    className="flex items-center gap-1.5 w-fit"
                    style={{
                      fontSize: 11, fontFamily: 'var(--font-mono)', color: '#7c8cf8',
                      background: 'rgba(124,140,248,0.08)', border: '1px dashed rgba(124,140,248,0.3)',
                      cursor: 'pointer', padding: '5px 10px', borderRadius: 8,
                    }}
                  >
                    <Plus style={{ width: 11, height: 11 }} /> add header
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Models */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <FieldLabel hint="Prices are USD per 1M tokens (public list prices). Level 1–10 gives the router a hint about capability.">
                Models · {modelCount || 0}
              </FieldLabel>
            </div>

            <div className="flex flex-col gap-2">
              {form.models.map((m, i) => (
                <div
                  key={i}
                  style={{
                    padding: 12, background: 'var(--color-bg-base)',
                    border: '1px solid var(--color-border-subtle)', borderRadius: 10,
                  }}
                >
                  <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr auto', gap: 10, alignItems: 'end' }}>
                    <div className="flex flex-col gap-1">
                      <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Model id</span>
                      <input placeholder="deepseek-chat" value={m.id} onChange={(e) => updateModel(i, { id: e.target.value })} style={monoInputStyle} />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Display label</span>
                      <input placeholder="DeepSeek Chat" value={m.label} onChange={(e) => updateModel(i, { label: e.target.value })} style={inputStyle} />
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, models: f.models.filter((_, idx) => idx !== i) }))}
                      aria-label="Remove model"
                      style={{
                        background: 'none', border: '1px solid var(--color-border-subtle)',
                        color: 'var(--color-error)', cursor: 'pointer',
                        width: 36, height: 36, borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(224,96,96,0.4)'; e.currentTarget.style.background = 'rgba(224,96,96,0.08)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.background = 'none'; }}
                    >
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                  <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 90px', gap: 10, marginTop: 10 }}>
                    <div className="flex flex-col gap-1">
                      <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Input $/1M</span>
                      <div style={{ position: 'relative' }}>
                        <DollarSign aria-hidden="true" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: 'var(--color-text-disabled)' }} />
                        <input
                          placeholder="0.27" type="number" step="0.01" min="0" inputMode="decimal"
                          aria-label="Input cost per million tokens"
                          value={m.inPer1M} onChange={(e) => updateModel(i, { inPer1M: e.target.value })}
                          style={{ ...monoInputStyle, paddingLeft: 24 }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Output $/1M</span>
                      <div style={{ position: 'relative' }}>
                        <DollarSign aria-hidden="true" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: 'var(--color-text-disabled)' }} />
                        <input
                          placeholder="1.10" type="number" step="0.01" min="0" inputMode="decimal"
                          aria-label="Output cost per million tokens"
                          value={m.outPer1M} onChange={(e) => updateModel(i, { outPer1M: e.target.value })}
                          style={{ ...monoInputStyle, paddingLeft: 24 }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Level 1–10</span>
                      <input
                        placeholder="5" type="number" min={1} max={10}
                        title="Capability level 1–10 (router hint)"
                        value={m.level} onChange={(e) => updateModel(i, { level: e.target.value })}
                        style={{ ...monoInputStyle, textAlign: 'center' }}
                      />
                    </div>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, models: [...f.models, { id: '', label: '', inPer1M: '', outPer1M: '', level: '' }] }))}
                className="flex items-center gap-1.5 w-fit"
                style={{
                  fontSize: 11.5, fontFamily: 'var(--font-mono)', color: '#7c8cf8',
                  background: 'rgba(124,140,248,0.08)', border: '1px dashed rgba(124,140,248,0.3)',
                  cursor: 'pointer', padding: '6px 12px', borderRadius: 8,
                }}
              >
                <Plus style={{ width: 12, height: 12 }} /> add another model
              </button>
              <a
                href="https://openrouter.ai/models"
                target="_blank"
                rel="noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', textDecoration: 'none', marginTop: 2 }}
              >
                Tip: look up list prices <ExternalLink style={{ width: 10, height: 10 }} />
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border-subtle)' }}>
          <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            {isNew ? 'Nothing is saved until you click Add.' : 'Changes take effect immediately after saving.'}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setEditingId(null)}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{ height: 36, padding: '0 14px', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 12.5, fontFamily: 'var(--font-sans)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={createProvider.isPending || updateProvider.isPending}
              aria-busy={createProvider.isPending || updateProvider.isPending || undefined}
              className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                height: 36, padding: '0 16px',
                background: (createProvider.isPending || updateProvider.isPending) ? 'var(--color-bg-raised)' : 'var(--color-accent)',
                color: (createProvider.isPending || updateProvider.isPending) ? 'var(--color-text-disabled)' : '#021526',
                fontSize: 12.5, fontWeight: 600, border: 'none', borderRadius: 'var(--radius-md)',
                cursor: (createProvider.isPending || updateProvider.isPending) ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => { if (!createProvider.isPending && !updateProvider.isPending) e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
              onMouseLeave={(e) => { if (!createProvider.isPending && !updateProvider.isPending) e.currentTarget.style.background = 'var(--color-accent)'; }}
            >
              {isNew
                ? (createProvider.isPending ? 'Adding…' : <><Plus style={{ width: 13, height: 13 }} /> Add provider</>)
                : (updateProvider.isPending ? 'Saving…' : 'Save changes')}
            </button>
          </div>
        </div>
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete provider"
        description={deleteTarget ? `Remove "${deleteTarget.label}" and its stored API key. Apps using this provider will fail until reconfigured.` : undefined}
        maxWidth="440px"
      >
        <div className="flex items-center justify-end gap-2">
          <button
            type="button" onClick={() => setDeleteTarget(null)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!deleteTarget) return;
              const target = deleteTarget;
              setDeleteTarget(null);
              deleteProvider.mutate(target.id, {
                onSuccess: () => showToast(`Deleted "${target.label}"`, { variant: 'success' }),
                onError: (err) => showToast(err instanceof Error ? err.message : 'Delete failed', { variant: 'error' }),
              });
            }}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: '#e06060', color: '#021526', border: 'none', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Delete provider
          </button>
        </div>
      </Dialog>
    </Panel>
  );
}

