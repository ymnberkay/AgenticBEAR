import { useState } from 'react';
import { Boxes, Plus, Trash2, Pencil, X } from 'lucide-react';
import type { LLMModelDef, ProviderKind } from '@subagent/shared';
import { PROVIDER_PRESETS } from '@subagent/shared';
import {
  useProviders,
  useCreateProvider,
  useUpdateProvider,
  useDeleteProvider,
  type ProviderView,
} from '../../api/hooks/use-providers';

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
}

interface FormState {
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey: string;
  models: ModelRow[];
}

const EMPTY_FORM: FormState = {
  label: '',
  kind: 'openai-compatible',
  baseUrl: '',
  apiKey: '',
  models: [{ id: '', label: '', inPer1M: '', outPer1M: '' }],
};

function toModelRows(models: LLMModelDef[]): ModelRow[] {
  if (models.length === 0) return [{ id: '', label: '', inPer1M: '', outPer1M: '' }];
  return models.map((m) => ({
    id: m.id,
    label: m.label,
    inPer1M: m.costPer1kInput ? String(m.costPer1kInput * 1000) : '',
    outPer1M: m.costPer1kOutput ? String(m.costPer1kOutput * 1000) : '',
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
    }));
}

export function CustomProvidersSection() {
  const { data: providers } = useProviders();
  const createProvider = useCreateProvider();
  const updateProvider = useUpdateProvider();
  const deleteProvider = useDeleteProvider();

  const [editingId, setEditingId] = useState<string | null>(null); // null = closed, '' = new
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const open = editingId !== null;

  function startNew() {
    setForm(EMPTY_FORM);
    setEditingId('');
  }

  function startEdit(p: ProviderView) {
    setForm({ label: p.label, kind: p.kind, baseUrl: p.baseUrl ?? '', apiKey: '', models: toModelRows(p.models) });
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
    const payload = {
      label: form.label.trim(),
      kind: form.kind,
      baseUrl: form.baseUrl.trim() || undefined,
      models: toModelDefs(form.models),
      // apiKey: empty string on edit keeps existing (server treats undefined as keep);
      // send only when the user typed something.
      ...(form.apiKey ? { apiKey: form.apiKey } : {}),
    };
    if (!payload.label) return;
    if (editingId) {
      updateProvider.mutate({ id: editingId, input: payload }, { onSuccess: () => setEditingId(null) });
    } else {
      createProvider.mutate({ ...payload, apiKey: form.apiKey || undefined }, { onSuccess: () => setEditingId(null) });
    }
  }

  function updateModel(i: number, patch: Partial<ModelRow>) {
    setForm((f) => ({ ...f, models: f.models.map((m, idx) => (idx === i ? { ...m, ...patch } : m)) }));
  }

  return (
    <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid #d88aa0' }}>
      <div className="flex items-center justify-between" style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div className="flex items-center gap-2.5">
          <Boxes style={{ width: 13, height: 13, color: '#d88aa0', flexShrink: 0 }} />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
            Custom LLM Providers
          </span>
        </div>
        {!open && (
          <button type="button" onClick={startNew} className="flex items-center gap-1.5"
            style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#6EACDA', background: 'none', border: 'none', cursor: 'pointer' }}>
            <Plus style={{ width: 12, height: 12 }} /> add provider
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
            style={{ padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)' }}>
            <div style={{ minWidth: 0 }}>
              <div className="truncate" style={{ fontSize: 12.5, color: 'var(--color-text-primary)', fontWeight: 600 }}>
                {p.label} <span style={{ color: 'var(--color-text-disabled)', fontWeight: 400 }}>· {p.kind}</span>
              </div>
              <div className="truncate" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                {p.baseUrl || '—'} · {p.models.length} model{p.models.length === 1 ? '' : 's'} · {p.hasApiKey ? 'key set' : 'no key'}
              </div>
            </div>
            <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
              <button type="button" onClick={() => startEdit(p)} title="Edit"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-disabled)', padding: 4 }}>
                <Pencil style={{ width: 13, height: 13 }} />
              </button>
              <button type="button" onClick={() => deleteProvider.mutate(p.id)} title="Delete"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d88a8a', padding: 4 }}>
                <Trash2 style={{ width: 13, height: 13 }} />
              </button>
            </div>
          </div>
        ))}

        {/* Add/Edit form */}
        {open && (
          <div className="flex flex-col gap-3" style={{ padding: '14px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)' }}>
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

            <input placeholder="Label (e.g. DeepSeek)" value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })} style={inputStyle} />

            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as ProviderKind })} style={{ ...inputStyle, cursor: 'pointer' }}>
              {(['openai-compatible', 'anthropic-compatible'] as ProviderKind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k]}</option>
              ))}
            </select>

            <input placeholder="Base URL (e.g. https://api.deepseek.com/v1)" value={form.baseUrl}
              onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} style={inputStyle} />

            <input type="password" placeholder={editingId ? 'API key (leave blank to keep)' : 'API key (blank for local)'}
              value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} style={inputStyle} />

            {/* Models */}
            <div className="flex flex-col gap-2">
              <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Models · price $/1M tokens
              </span>
              {form.models.map((m, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input placeholder="model id" value={m.id} onChange={(e) => updateModel(i, { id: e.target.value })} style={{ ...inputStyle, flex: 2 }} />
                  <input placeholder="label" value={m.label} onChange={(e) => updateModel(i, { label: e.target.value })} style={{ ...inputStyle, flex: 2 }} />
                  <input placeholder="in" value={m.inPer1M} onChange={(e) => updateModel(i, { inPer1M: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                  <input placeholder="out" value={m.outPer1M} onChange={(e) => updateModel(i, { outPer1M: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
                  <button type="button" onClick={() => setForm((f) => ({ ...f, models: f.models.filter((_, idx) => idx !== i) }))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d88a8a', padding: 4, flexShrink: 0 }}>
                    <Trash2 style={{ width: 12, height: 12 }} />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setForm((f) => ({ ...f, models: [...f.models, { id: '', label: '', inPer1M: '', outPer1M: '' }] }))}
                className="flex items-center gap-1.5 w-fit"
                style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#6EACDA', background: 'none', border: 'none', cursor: 'pointer' }}>
                <Plus style={{ width: 11, height: 11 }} /> add model
              </button>
            </div>

            <div className="flex items-center justify-end gap-2" style={{ paddingTop: 4 }}>
              <button type="button" onClick={() => setEditingId(null)}
                style={{ height: 32, padding: '0 14px', background: 'transparent', color: 'var(--color-text-disabled)', fontSize: 12.5, border: '1px solid var(--color-border-default)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="button" onClick={save} disabled={createProvider.isPending || updateProvider.isPending}
                style={{ height: 32, padding: '0 16px', background: '#6EACDA', color: '#021526', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                {editingId ? 'Save changes' : 'Add provider'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
