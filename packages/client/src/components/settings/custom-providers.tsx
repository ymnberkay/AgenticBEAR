import { useState } from 'react';
import { Boxes, Plus, Trash2, Pencil, X } from 'lucide-react';
import type { LLMModelDef, ProviderAuthType, ProviderKind } from '@subagent/shared';
import { PROVIDER_PRESETS } from '@subagent/shared';
import {
  useProviders,
  useCreateProvider,
  useUpdateProvider,
  useDeleteProvider,
  type ProviderView,
} from '../../api/hooks/use-providers';
import { useToast } from '../ui/toast';
import { Dialog } from '../ui/dialog';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 34,
  padding: '0 10px',
  background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border-default)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 12.5,
  outline: 'none',
  borderRadius: 'var(--radius-md)',
};

const KIND_LABELS: Record<ProviderKind, string> = {
  'openai-compatible': 'OpenAI-compatible (DeepSeek, Ollama, LM Studio, …)',
  'anthropic-compatible': 'Anthropic-compatible (custom endpoint)',
  anthropic: 'Anthropic (native)',
  openai: 'OpenAI (native)',
  gemini: 'Gemini (native)',
};

interface ModelRow {
  id: string;
  label: string;
  /** USD per 1M tokens (UI-friendly; stored as per-1K). */
  inPer1M: string;
  outPer1M: string;
  /** Capability level 1–10 for the router (weak/cheap → strong). */
  level: string;
}

interface HeaderRow {
  key: string;
  value: string;
}

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
  label: '',
  kind: 'openai-compatible',
  baseUrl: '',
  apiKey: '',
  authType: 'api_key',
  headers: [],
  models: [{ id: '', label: '', inPer1M: '', outPer1M: '', level: '' }],
};

function toHeaderRows(headers: Record<string, string> | undefined): HeaderRow[] {
  if (!headers) return [];
  return Object.entries(headers).map(([key, value]) => ({ key, value }));
}

function toHeaderObject(rows: HeaderRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (k) out[k] = r.value;
  }
  return out;
}

function toModelRows(models: LLMModelDef[]): ModelRow[] {
  if (models.length === 0) return [{ id: '', label: '', inPer1M: '', outPer1M: '', level: '' }];
  return models.map((m) => ({
    id: m.id,
    label: m.label,
    inPer1M: m.costPer1kInput ? String(m.costPer1kInput * 1000) : '',
    outPer1M: m.costPer1kOutput ? String(m.costPer1kOutput * 1000) : '',
    level: m.level ? String(m.level) : '',
  }));
}

function toModelDefs(rows: ModelRow[]): LLMModelDef[] {
  return rows
    .filter((r) => r.id.trim())
    .map((r) => ({
      id: r.id.trim(),
      label: r.label.trim() || r.id.trim(),
      costPer1kInput: r.inPer1M ? Number(r.inPer1M) / 1000 : 0,
      costPer1kOutput: r.outPer1M ? Number(r.outPer1M) / 1000 : 0,
      ...(r.level ? { level: Math.max(1, Math.min(10, Math.round(Number(r.level)))) } : {}),
    }));
}

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

  const open = editingId !== null;

  function startNew() {
    setForm(EMPTY_FORM);
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
    setEditingId(p.id);
  }

  function applyPreset(key: string) {
    const preset = PROVIDER_PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setForm((f) => ({
      ...f,
      label: preset.label,
      kind: preset.kind,
      baseUrl: preset.baseUrl,
      models: toModelRows(preset.models),
    }));
  }

  function save() {
    setLabelError('');
    const payload = {
      label: form.label.trim(),
      kind: form.kind,
      baseUrl: form.baseUrl.trim() || undefined,
      authType: form.authType,
      headers: toHeaderObject(form.headers),
      models: toModelDefs(form.models),
      // apiKey: empty string on edit keeps existing (server treats undefined as keep);
      // send only when the user typed something.
      ...(form.apiKey ? { apiKey: form.apiKey } : {}),
    };
    if (!payload.label) {
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
    if (editingId) {
      updateProvider.mutate(
        { id: editingId, input: payload },
        {
          onSuccess: () => { setEditingId(null); showToast('Provider saved', { variant: 'success' }); },
          onError: (err) => showToast(err instanceof Error ? err.message : 'Save failed', { variant: 'error' }),
        },
      );
    } else {
      createProvider.mutate(
        { ...payload, apiKey: form.apiKey || undefined },
        {
          onSuccess: () => { setEditingId(null); showToast('Provider added', { variant: 'success' }); },
          onError: (err) => showToast(err instanceof Error ? err.message : 'Create failed', { variant: 'error' }),
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

  return (
    <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid var(--color-agent-documentation)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
      <div className="flex items-center justify-between" style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div className="flex items-center gap-2.5">
          <Boxes style={{ width: 13, height: 13, color: 'var(--color-agent-documentation)', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
            Custom LLM Providers
          </span>
        </div>
        {!open && (
          <button type="button" onClick={startNew} className="flex items-center gap-1.5"
            style={{ height: 28, padding: '0 12px', fontSize: 11.5, fontFamily: 'var(--font-sans)', fontWeight: 600, color: '#021526', background: 'var(--color-accent)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-accent)'; }}>
            <Plus style={{ width: 12, height: 12 }} /> Add provider
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2" style={{ padding: '16px' }}>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', margin: 0 }}>
          Plug in DeepSeek, local Ollama/LM Studio, OpenRouter, or any OpenAI-/Anthropic-compatible endpoint.
          Per-model prices (USD / 1M tokens) drive cost tracking in cost-stats.
        </p>

        {/* Existing providers */}
        {(providers ?? []).map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-3"
            style={{ padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ minWidth: 0 }}>
              <div className="truncate" style={{ fontSize: 12.5, color: 'var(--color-text-primary)', fontWeight: 600 }}>
                {p.label} <span style={{ color: 'var(--color-text-disabled)', fontWeight: 400 }}>· {p.kind}</span>
              </div>
              <div className="truncate" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                {p.baseUrl || '—'} · {p.models.length} model{p.models.length === 1 ? '' : 's'} · {p.hasApiKey ? 'key set' : 'no key'}
              </div>
            </div>
            <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => startEdit(p)}
                aria-label={`Edit provider ${p.label}`}
                title="Edit"
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 8, borderRadius: 4, minWidth: 32, minHeight: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Pencil style={{ width: 13, height: 13 }} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setDeleteTarget(p)}
                aria-label={`Delete provider ${p.label}`}
                title="Delete"
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', padding: 8, borderRadius: 4, minWidth: 32, minHeight: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Trash2 style={{ width: 13, height: 13 }} aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}

        {/* Add/Edit form */}
        {open && (
          <div className="flex flex-col gap-3" style={{ padding: '14px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)' }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {editingId ? 'Edit provider' : 'New provider'}
              </span>
              <button type="button" onClick={() => setEditingId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-disabled)', padding: 2 }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            {!editingId && (
              <select defaultValue="" onChange={(e) => applyPreset(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">— start from a preset (optional) —</option>
                {PROVIDER_PRESETS.map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            )}

            <div className="flex flex-col gap-1">
              <label htmlFor="cp-label" className="sr-only">Label</label>
              <input
                id="cp-label"
                placeholder="Label (e.g. DeepSeek)"
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

            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ProviderKind })} style={{ ...inputStyle, cursor: 'pointer' }}>
              {(['openai-compatible', 'anthropic-compatible'] as ProviderKind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k]}</option>
              ))}
            </select>

            <input placeholder="Base URL (e.g. https://api.deepseek.com/v1)" value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} style={inputStyle} />

            <div className="flex flex-col gap-1">
              <label htmlFor="cp-apikey" className="sr-only">API key</label>
              <input
                id="cp-apikey"
                type="password"
                placeholder={editingId ? 'API key (leave blank to keep existing)' : 'API key (blank for local)'}
                value={form.apiKey}
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                autoComplete="off"
                spellCheck={false}
                style={inputStyle}
              />
              {editingId && !form.apiKey && (
                <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                  An API key is currently set. Leave blank to keep it.
                </span>
              )}
            </div>

            {/* Auth header style — for corporate gateways/proxies (Team/Enterprise) */}
            <div className="flex flex-col gap-1.5">
              <select value={form.authType} onChange={(e) => setForm({ ...form, authType: e.target.value as ProviderAuthType })} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="api_key">Auth: provider default (Anthropic → x-api-key, OpenAI → Bearer)</option>
                <option value="bearer">Auth: Authorization: Bearer (gateway / proxy)</option>
              </select>
              <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                Use “Bearer” for a Team/Enterprise LLM gateway (LiteLLM, Portkey, …) fronting an Anthropic-compatible endpoint.
              </span>
            </div>

            {/* Custom headers — org routing, anthropic-beta flags, etc. */}
            <div className="flex flex-col gap-2">
              <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Custom headers (optional)
              </span>
              {form.headers.map((h, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input placeholder="Header (e.g. anthropic-beta)" value={h.key} onChange={(e) => updateHeader(i, { key: e.target.value })} style={{ ...inputStyle, flex: 2 }} />
                  <input placeholder="Value" value={h.value} onChange={(e) => updateHeader(i, { value: e.target.value })} style={{ ...inputStyle, flex: 3 }} />
                  <button type="button" onClick={() => setForm((f) => ({ ...f, headers: f.headers.filter((_, idx) => idx !== i) }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', padding: 4, flexShrink: 0 }}>
                    <Trash2 style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setForm((f) => ({ ...f, headers: [...f.headers, { key: '', value: '' }] }))}
                className="flex items-center gap-1.5 w-fit"
                style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#7c8cf8', background: 'none', border: 'none', cursor: 'pointer' }}>
                <Plus style={{ width: 11, height: 11 }} /> add header
              </button>
            </div>

            {/* Models */}
            <div className="flex flex-col gap-2">
              <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Models · price $/1M tokens · level 1–10 (router)
              </span>
              {form.models.map((m, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input placeholder="model id" value={m.id} onChange={(e) => updateModel(i, { id: e.target.value })} style={{ ...inputStyle, flex: 2 }} />
                  <input placeholder="label" value={m.label} onChange={(e) => updateModel(i, { label: e.target.value })} style={{ ...inputStyle, flex: 2 }} />
                  <input
                    placeholder="in $/1M"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={m.inPer1M}
                    aria-label="Input cost per million tokens"
                    onChange={(e) => updateModel(i, { inPer1M: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <input
                    placeholder="out $/1M"
                    type="number"
                    step="0.01"
                    min="0"
                    inputMode="decimal"
                    value={m.outPer1M}
                    aria-label="Output cost per million tokens"
                    onChange={(e) => updateModel(i, { outPer1M: e.target.value })}
                    style={{ ...inputStyle, flex: 1 }}
                  />
                  <input placeholder="lvl" type="number" min={1} max={10} value={m.level} onChange={(e) => updateModel(i, { level: e.target.value })} style={{ ...inputStyle, width: 52, flexShrink: 0 }} title="Capability level 1–10 (router)" />
                  <button type="button" onClick={() => setForm((f) => ({ ...f, models: f.models.filter((_, idx) => idx !== i) }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', padding: 4, flexShrink: 0 }}>
                    <Trash2 style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setForm((f) => ({ ...f, models: [...f.models, { id: '', label: '', inPer1M: '', outPer1M: '', level: '' }] }))}
                className="flex items-center gap-1.5 w-fit"
                style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#7c8cf8', background: 'none', border: 'none', cursor: 'pointer' }}>
                <Plus style={{ width: 11, height: 11 }} /> add model
              </button>
            </div>

            <div className="flex items-center justify-end gap-2" style={{ paddingTop: 4 }}>
              <button type="button" onClick={() => setEditingId(null)}
                style={{ height: 34, padding: '0 14px', background: 'transparent', color: 'var(--color-text-secondary)', fontSize: 12.5, fontFamily: 'var(--font-sans)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={save} disabled={createProvider.isPending || updateProvider.isPending}
                style={{ height: 34, padding: '0 16px', background: 'var(--color-accent)', color: '#021526', fontSize: 12.5, fontWeight: 600, border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-accent)'; }}>
                {editingId ? 'Save changes' : 'Add provider'}
              </button>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete provider"
        description={deleteTarget ? `Remove "${deleteTarget.label}" and its stored API key. Apps using this provider will fail until reconfigured.` : undefined}
        maxWidth="440px"
      >
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
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
    </section>
  );
}
