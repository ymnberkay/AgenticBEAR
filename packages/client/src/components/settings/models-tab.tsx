import { useState, useEffect } from 'react';
import { Boxes, RefreshCw, Gauge } from 'lucide-react';
import type { ModelLimit } from '@subagent/shared';
import { useModelCatalog, useRefreshModelCatalog } from '../../api/hooks/use-gateway';
import { useSettings, useUpdateSettings } from '../../api/hooks/use-settings';
import { Section, inputStyle, Pager, PAGE_SIZE } from './ui';

const numOrUndef = (v: string): number | undefined => {
  const n = Number(v);
  return v.trim() === '' || !Number.isFinite(n) || n <= 0 ? undefined : n;
};

/** Compact numeric input used for the per-model limit fields. */
function LimitInput({ value, placeholder, onCommit, width = 64 }: { value: number | undefined; placeholder: string; onCommit: (v: number | undefined) => void; width?: number }) {
  return (
    <input
      type="number" min={0} defaultValue={value ?? ''} placeholder={placeholder}
      key={value ?? 'none'}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      onBlur={(e) => onCommit(numOrUndef(e.target.value))}
      style={{ ...inputStyle, height: 28, width, fontSize: 11.5, textAlign: 'center', fontFamily: 'var(--font-mono)' }}
    />
  );
}

/** The catalog of reachable models (live-discovered) + per-model rate limits & timeouts. */
export function ModelsTab({ onSaved }: { onSaved?: (msg: string) => void } = {}) {
  const { data: catalog } = useModelCatalog();
  const refreshCatalog = useRefreshModelCatalog();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();

  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('all');
  const [page, setPage] = useState(1);
  const [limits, setLimits] = useState<Record<string, ModelLimit>>({});

  useEffect(() => { if (settings?.modelLimits) setLimits(settings.modelLimits); }, [settings?.modelLimits]);

  const list = catalog ?? [];
  const providerOptions = Array.from(new Set(list.map((m) => m.owned_by))).sort();
  const filtered = list.filter(
    (m) =>
      (provider === 'all' || m.owned_by === provider) &&
      (search.trim() === '' || m.id.toLowerCase().includes(search.trim().toLowerCase())),
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pg = Math.min(page, totalPages);
  const items = filtered.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE);

  const commit = (modelId: string, patch: Partial<ModelLimit>) => {
    const next = { ...limits };
    const merged: ModelLimit = { ...next[modelId], ...patch };
    // Drop empty dimensions; remove the whole entry if nothing's set.
    (Object.keys(merged) as (keyof ModelLimit)[]).forEach((k) => { if (!merged[k]) delete merged[k]; });
    if (Object.keys(merged).length === 0) delete next[modelId];
    else next[modelId] = merged;
    setLimits(next);
    updateSettings.mutate({ modelLimits: next }, { onSuccess: () => onSaved?.('Model limits saved') });
  };

  return (
    <Section
      icon={<Boxes style={{ width: 13, height: 13 }} />} color="#7c8cf8" title={`Reachable Models (${list.length})`}
      action={
        <button type="button" onClick={() => refreshCatalog.mutate()} disabled={refreshCatalog.isPending}
          className="flex items-center gap-1.5"
          style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#7c8cf8', background: 'none', border: 'none', cursor: refreshCatalog.isPending ? 'wait' : 'pointer' }}>
          <RefreshCw className={refreshCatalog.isPending ? 'animate-spin' : ''} style={{ width: 12, height: 12 }} />
          {refreshCatalog.isPending ? 'refreshing…' : 'refresh'}
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input placeholder="search models…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={{ ...inputStyle, height: 32 }} />
          <select value={provider} onChange={(e) => { setProvider(e.target.value); setPage(1); }}
            style={{ ...inputStyle, height: 32, width: 'auto', minWidth: 130, cursor: 'pointer' }}>
            <option value="all">all providers</option>
            {providerOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        <p className="flex items-center gap-1.5" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', margin: '2px 0 0' }}>
          <Gauge style={{ width: 11, height: 11 }} /> Per-model limits apply to both the gateway and agentic calls. Blank = no limit. Saved on blur.
        </p>

        {/* Header row */}
        <div className="flex items-center gap-2" style={{ padding: '2px 10px', fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
          <span style={{ flex: 1 }}>model</span>
          <span style={{ width: 64, textAlign: 'center' }}>req/s</span>
          <span style={{ width: 64, textAlign: 'center' }}>max conc</span>
          <span style={{ width: 72, textAlign: 'center' }}>timeout s</span>
        </div>

        <div className="flex flex-col gap-1">
          {items.map((m) => {
            const lim = limits[m.id] ?? {};
            const limited = lim.requestsPerSecond || lim.maxConcurrent || lim.timeoutMs;
            return (
              <div key={m.id} className="flex items-center gap-2" style={{ padding: '5px 10px', background: 'var(--color-bg-base)', border: `1px solid ${limited ? 'rgba(124,140,248,0.35)' : 'var(--color-border-subtle)'}`, borderRadius: 'var(--radius-sm)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <code style={{ fontSize: 12, color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{m.id}</code>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginLeft: 8 }}>{m.owned_by}</span>
                </div>
                <LimitInput value={lim.requestsPerSecond} placeholder="∞" onCommit={(v) => commit(m.id, { requestsPerSecond: v })} />
                <LimitInput value={lim.maxConcurrent} placeholder="∞" onCommit={(v) => commit(m.id, { maxConcurrent: v })} />
                <LimitInput value={lim.timeoutMs ? lim.timeoutMs / 1000 : undefined} placeholder="∞" width={72}
                  onCommit={(v) => commit(m.id, { timeoutMs: v ? Math.round(v * 1000) : undefined })} />
              </div>
            );
          })}
          {filtered.length === 0 && (
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
              {list.length === 0 ? 'No models yet — add a provider key or custom provider.' : 'No models match.'}
            </span>
          )}
        </div>
        <Pager page={pg} total={totalPages} onPage={setPage} />
      </div>
    </Section>
  );
}
