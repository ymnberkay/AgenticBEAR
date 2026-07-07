import { useEffect, useId, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Boxes, RefreshCw, Gauge, Check, AlertCircle, ChevronDown,
  Infinity as InfinityIcon, RotateCcw, Search, X, SlidersHorizontal,
} from 'lucide-react';
import type { ModelLimit } from '@subagent/shared';
import { useModelCatalog, useRefreshModelCatalog, type CatalogModel } from '../../api/hooks/use-gateway';
import { useSettings, useUpdateSettings } from '../../api/hooks/use-settings';
import { useToast } from '../ui/toast';
import { inputStyle, Pager, PAGE_SIZE } from './ui';
import { Panel } from './gateway-ui';
import { formatModelId } from '../../lib/format';

/** Recipes the user can apply with one click. Blank fields = no limit. */
const PRESETS: { id: string; label: string; description: string; values: ModelLimit }[] = [
  { id: 'none', label: 'No limit', description: 'Unlimited rate, concurrency, and duration.', values: {} },
  {
    id: 'conservative',
    label: 'Conservative',
    description: 'Safe defaults for low-quota or flaky providers.',
    values: { requestsPerSecond: 2, maxConcurrent: 2, timeoutMs: 60_000 },
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Reasonable production defaults.',
    values: { requestsPerSecond: 10, maxConcurrent: 5, timeoutMs: 30_000 },
  },
];

function activePresetId(limit: ModelLimit | undefined): string | null {
  if (!limit || Object.keys(limit).length === 0) return 'none';
  for (const p of PRESETS) {
    if (p.id === 'none') continue;
    if (
      p.values.requestsPerSecond === limit.requestsPerSecond &&
      p.values.maxConcurrent === limit.maxConcurrent &&
      p.values.timeoutMs === limit.timeoutMs
    ) {
      return p.id;
    }
  }
  return null;
}

function summarizeLimit(limit: ModelLimit | undefined): string {
  if (!limit || Object.keys(limit).length === 0) return 'Unlimited';
  const parts: string[] = [];
  if (limit.requestsPerSecond) parts.push(`${limit.requestsPerSecond}/s`);
  if (limit.maxConcurrent) parts.push(`${limit.maxConcurrent} conc`);
  if (limit.timeoutMs) parts.push(`${Math.round(limit.timeoutMs / 1000)}s`);
  return parts.length > 0 ? parts.join(' · ') : 'Unlimited';
}

/** The catalog of reachable models (live-discovered) + per-model rate limits & timeouts. */
export function ModelsTab({ onSaved }: { onSaved?: (msg: string) => void } = {}) {
  const { data: catalog } = useModelCatalog();
  const refreshCatalog = useRefreshModelCatalog();
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { show: showToast } = useToast();

  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('all');
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState<'all' | 'limited'>('all');
  const [limits, setLimits] = useState<Record<string, ModelLimit>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savedMark, setSavedMark] = useState<string | null>(null);
  const [errorMark, setErrorMark] = useState<string | null>(null);

  useEffect(() => { if (settings?.modelLimits) setLimits(settings.modelLimits); }, [settings?.modelLimits]);

  const list = catalog ?? [];
  const providerOptions = useMemo(
    () => Array.from(new Set(list.map((m) => m.owned_by))).sort(),
    [list],
  );
  const limitedCount = useMemo(() => Object.keys(limits).length, [limits]);

  const filtered = useMemo(() => {
    return list.filter((m) => {
      if (provider !== 'all' && m.owned_by !== provider) return false;
      if (scope === 'limited' && !limits[m.id]) return false;
      if (search.trim() && !m.id.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [list, provider, scope, search, limits]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pg = Math.min(page, totalPages);
  const items = filtered.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE);

  const commit = (modelId: string, next: ModelLimit) => {
    const cleaned: ModelLimit = {};
    if (next.requestsPerSecond) cleaned.requestsPerSecond = next.requestsPerSecond;
    if (next.maxConcurrent) cleaned.maxConcurrent = next.maxConcurrent;
    if (next.timeoutMs) cleaned.timeoutMs = next.timeoutMs;

    const nextMap = { ...limits };
    if (Object.keys(cleaned).length === 0) delete nextMap[modelId];
    else nextMap[modelId] = cleaned;
    setLimits(nextMap);

    updateSettings.mutate(
      { modelLimits: nextMap },
      {
        onSuccess: () => {
          setSavedMark(modelId);
          setErrorMark(null);
          setTimeout(() => setSavedMark((cur) => (cur === modelId ? null : cur)), 1400);
          onSaved?.('Model limits saved');
        },
        onError: (err) => {
          setErrorMark(modelId);
          showToast(err instanceof Error ? err.message : 'Failed to save model limits', { variant: 'error' });
        },
      },
    );
  };

  // ── Curated allowlist (which models appear in pickers/gateway) ──
  // When curation is ON, the allowlist is authoritative (empty = none enabled), so models from a
  // newly-added provider start disabled. When OFF (never curated), empty = all enabled. Curation
  // flips on automatically the first time a provider is added.
  const curationOn = !!settings?.modelCurationEnabled;
  const enabledList = settings?.enabledModels ?? [];
  const allEnabled = !curationOn && enabledList.length === 0;
  const isEnabled = (id: string) => allEnabled || enabledList.includes(id);
  const toggleEnabled = (id: string) => {
    const allIds = list.map((m) => m.id);
    const base = curationOn || enabledList.length ? enabledList : allIds; // materialize "all" before editing
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    // Collapse to the "all" sentinel ([]) only when curation is OFF; with curation ON, [] = none.
    const normalized = !curationOn && allIds.length > 0 && allIds.every((x) => next.includes(x)) ? [] : next;
    updateSettings.mutate(
      { enabledModels: normalized },
      { onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to update enabled models', { variant: 'error' }) },
    );
  };

  return (
    <Panel
      icon={<Boxes style={{ width: 12, height: 12 }} aria-hidden="true" />}
      color="#7c8cf8"
      title={`Reachable models · ${list.length}`}
      action={
        <button
          type="button"
          onClick={() => refreshCatalog.mutate(undefined, {
            onSuccess: () => showToast('Model catalog refreshed', { variant: 'success' }),
            onError: (err) => showToast(err instanceof Error ? err.message : 'Refresh failed', { variant: 'error' }),
          })}
          disabled={refreshCatalog.isPending}
          aria-busy={refreshCatalog.isPending || undefined}
          aria-label={refreshCatalog.isPending ? 'Refreshing model catalog' : 'Refresh model catalog'}
          className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            fontSize: 11, fontFamily: 'var(--font-mono)', color: '#7c8cf8',
            background: 'transparent', border: '1px solid rgba(124,140,248,0.3)',
            cursor: refreshCatalog.isPending ? 'wait' : 'pointer',
            padding: '0 12px', borderRadius: 999, height: 28,
          }}
        >
          <RefreshCw className={refreshCatalog.isPending ? 'animate-spin' : ''} style={{ width: 12, height: 12 }} aria-hidden="true" />
          {refreshCatalog.isPending ? 'refreshing…' : 'refresh'}
        </button>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 360 }}>
            <Search aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'var(--color-text-secondary)' }} />
            <label className="sr-only" htmlFor="models-search">Search models</label>
            <input
              id="models-search"
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search models…"
              autoComplete="off"
              style={{ ...inputStyle, height: 34, paddingLeft: 30, paddingRight: 28 }}
            />
            {search && (
              <button
                type="button"
                onClick={() => { setSearch(''); setPage(1); }}
                aria-label="Clear search"
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 6, borderRadius: 4 }}
              >
                <X style={{ width: 11, height: 11 }} aria-hidden="true" />
              </button>
            )}
          </div>

          <label className="sr-only" htmlFor="models-provider">Provider</label>
          <select
            id="models-provider"
            value={provider}
            onChange={(e) => { setProvider(e.target.value); setPage(1); }}
            style={{ ...inputStyle, height: 34, width: 'auto', minWidth: 140, cursor: 'pointer' }}
          >
            <option value="all">All providers</option>
            {providerOptions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>

          <div className="flex items-center" style={{ gap: 3, padding: 3, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 999 }} role="group" aria-label="Limit scope">
            {([
              { id: 'all' as const, label: `All (${list.length})` },
              { id: 'limited' as const, label: `Configured (${limitedCount})` },
            ]).map((opt) => {
              const isActive = scope === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { setScope(opt.id); setPage(1); }}
                  aria-pressed={isActive}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                  style={{
                    height: 28, padding: '0 12px', fontSize: 11.5,
                    fontFamily: 'var(--font-mono)',
                    background: isActive ? 'var(--color-accent-subtle)' : 'transparent',
                    border: `1px solid ${isActive ? 'var(--color-accent)' : 'transparent'}`,
                    color: isActive ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                    borderRadius: 999, cursor: 'pointer',
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        <p
          className="flex items-center gap-1.5"
          style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', margin: 0 }}
        >
          <Gauge style={{ width: 11, height: 11 }} aria-hidden="true" />
          Per-model limits apply to both the gateway and agentic calls. Unlimited unless configured here.
        </p>

        {/* Enablement: which models are reachable via pickers + the gateway. */}
        <div className="flex items-center justify-between flex-wrap gap-2" style={{ padding: '8px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
            {curationOn
              ? `${enabledList.length} of ${list.length} enabled · new providers start disabled`
              : `All ${list.length} enabled (no curation yet)`}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => updateSettings.mutate({ enabledModels: curationOn ? list.map((m) => m.id) : [] }, { onError: (err) => showToast(err instanceof Error ? err.message : 'Failed', { variant: 'error' }) })}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{ height: 28, padding: '0 12px', fontSize: 11, fontFamily: 'var(--font-mono)', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', borderRadius: 999, cursor: 'pointer' }}
            >
              Enable all
            </button>
            <button
              type="button"
              onClick={() => updateSettings.mutate({ enabledModels: [], modelCurationEnabled: true }, { onError: (err) => showToast(err instanceof Error ? err.message : 'Failed', { variant: 'error' }) })}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{ height: 28, padding: '0 12px', fontSize: 11, fontFamily: 'var(--font-mono)', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', borderRadius: 999, cursor: 'pointer' }}
            >
              Disable all
            </button>
          </div>
        </div>

        {/* List */}
        <div className="flex flex-col gap-2">
          {items.map((m) => {
            const lim = limits[m.id];
            const isExpanded = expanded === m.id;
            const isSaved = savedMark === m.id;
            const isErrored = errorMark === m.id;
            const isLimited = !!lim && Object.keys(lim).length > 0;
            return (
              <ModelRow
                key={m.id}
                model={m}
                limit={lim}
                isLimited={isLimited}
                isExpanded={isExpanded}
                isSaved={isSaved}
                isErrored={isErrored}
                enabled={isEnabled(m.id)}
                onToggleEnabled={() => toggleEnabled(m.id)}
                onToggle={() => setExpanded((cur) => (cur === m.id ? null : m.id))}
                onCommit={(next) => commit(m.id, next)}
              />
            );
          })}
          {filtered.length === 0 && (
            <div
              className="py-8 text-center"
              style={{
                background: 'var(--color-bg-base)',
                border: '1px dashed var(--color-border-default)',
                borderRadius: 'var(--radius-md)',
                fontSize: 12, fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
              }}
            >
              {list.length === 0
                ? 'No models yet — add a provider key or custom provider.'
                : scope === 'limited'
                  ? 'No models have custom limits yet.'
                  : 'No models match this search.'}
            </div>
          )}
        </div>

        <Pager page={pg} total={totalPages} onPage={setPage} />
      </div>
    </Panel>
  );
}

interface ModelRowProps {
  model: CatalogModel;
  limit: ModelLimit | undefined;
  isLimited: boolean;
  isExpanded: boolean;
  isSaved: boolean;
  isErrored: boolean;
  enabled: boolean;
  onToggleEnabled: () => void;
  onToggle: () => void;
  onCommit: (next: ModelLimit) => void;
}

function ModelRow({ model, limit, isLimited, isExpanded, isSaved, isErrored, enabled, onToggleEnabled, onToggle, onCommit }: ModelRowProps) {
  const panelId = useId();
  const summary = summarizeLimit(limit);

  return (
    <div
      style={{
        background: 'var(--color-bg-base)',
        border: `1px solid ${isExpanded ? 'rgba(124,140,248,0.35)' : 'var(--color-border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
        transition: 'border-color 0.15s',
        opacity: enabled ? 1 : 0.55,
      }}
    >
      <div className="flex items-center">
        <label
          title={enabled ? 'Enabled — shown in pickers & gateway. Click to disable.' : 'Disabled — hidden from pickers & gateway. Click to enable.'}
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', paddingLeft: 12, cursor: 'pointer' }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={onToggleEnabled}
            aria-label={`Enable ${model.id}`}
            style={{ width: 15, height: 15, accentColor: '#7c8cf8', cursor: 'pointer' }}
          />
        </label>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-controls={panelId}
        className="flex items-center gap-3 flex-1 min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8] focus-visible:ring-inset"
        style={{
          padding: '12px 14px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          minHeight: 56,
        }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <code
              title={model.id}
              style={{
                fontSize: 12.5, fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}
            >
              {formatModelId(model.id, model.owned_by)}
            </code>
            <span
              style={{
                fontSize: 10, fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 'var(--radius-sm)',
                padding: '2px 6px',
                letterSpacing: '0.04em',
              }}
            >
              {model.owned_by}
            </span>
          </div>
        </div>

        {/* Status pill */}
        <span
          className="flex items-center gap-1.5 shrink-0"
          style={{
            fontSize: 11, fontFamily: 'var(--font-mono)',
            color: isLimited ? '#7c8cf8' : 'var(--color-text-secondary)',
            background: isLimited ? 'rgba(124,140,248,0.10)' : 'var(--color-bg-surface)',
            border: `1px solid ${isLimited ? 'rgba(124,140,248,0.3)' : 'var(--color-border-subtle)'}`,
            borderRadius: 999,
            padding: '4px 10px',
            whiteSpace: 'nowrap',
          }}
        >
          {!isLimited && <InfinityIcon style={{ width: 11, height: 11 }} aria-hidden="true" />}
          {isLimited && <SlidersHorizontal style={{ width: 11, height: 11 }} aria-hidden="true" />}
          {summary}
        </span>

        {/* Save indicator */}
        <span
          aria-live="polite"
          style={{
            width: 14, height: 14, flexShrink: 0,
            color: isSaved ? 'var(--color-success)' : isErrored ? 'var(--color-error)' : 'transparent',
            transition: 'color 0.2s',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {isSaved ? (
            <Check style={{ width: 14, height: 14 }} aria-label="Saved" />
          ) : isErrored ? (
            <AlertCircle style={{ width: 14, height: 14 }} aria-label="Save failed" />
          ) : null}
        </span>

        <ChevronDown
          style={{
            width: 14, height: 14, flexShrink: 0,
            color: 'var(--color-text-secondary)',
            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.18s ease',
          }}
          aria-hidden="true"
        />
      </button>
      </div>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            id={panelId}
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <LimitEditor
              limit={limit}
              onCommit={onCommit}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface LimitEditorProps {
  limit: ModelLimit | undefined;
  onCommit: (next: ModelLimit) => void;
}

function LimitEditor({ limit, onCommit }: LimitEditorProps) {
  // Local field state mirrors what's stored so users can clear / type freely
  // without immediately persisting on every keystroke.
  const [rps, setRps] = useState(limit?.requestsPerSecond?.toString() ?? '');
  const [conc, setConc] = useState(limit?.maxConcurrent?.toString() ?? '');
  const [timeoutSec, setTimeoutSec] = useState(
    limit?.timeoutMs ? String(Math.round(limit.timeoutMs / 100) / 10) : '',
  );

  // Resync if the limit changes from outside (e.g. preset applied).
  useEffect(() => {
    setRps(limit?.requestsPerSecond?.toString() ?? '');
    setConc(limit?.maxConcurrent?.toString() ?? '');
    setTimeoutSec(limit?.timeoutMs ? String(Math.round(limit.timeoutMs / 100) / 10) : '');
  }, [limit?.requestsPerSecond, limit?.maxConcurrent, limit?.timeoutMs]);

  const rpsId = useId();
  const concId = useId();
  const timeoutId = useId();

  const activePreset = activePresetId(limit);

  const applyPreset = (id: string) => {
    const p = PRESETS.find((x) => x.id === id);
    if (!p) return;
    onCommit(p.values);
  };

  const buildAndCommit = (next: { rps?: string; conc?: string; timeoutSec?: string }) => {
    const r = next.rps ?? rps;
    const c = next.conc ?? conc;
    const t = next.timeoutSec ?? timeoutSec;
    const numeric: ModelLimit = {};
    const rN = parseFloat(r);
    const cN = parseFloat(c);
    const tN = parseFloat(t);
    if (Number.isFinite(rN) && rN > 0) numeric.requestsPerSecond = rN;
    if (Number.isFinite(cN) && cN > 0) numeric.maxConcurrent = Math.round(cN);
    if (Number.isFinite(tN) && tN > 0) numeric.timeoutMs = Math.round(tN * 1000);
    onCommit(numeric);
  };

  const clearAll = () => {
    setRps('');
    setConc('');
    setTimeoutSec('');
    onCommit({});
  };

  const fieldStyle: React.CSSProperties = {
    height: 36,
    width: '100%',
    padding: '0 12px',
    background: 'var(--color-bg-surface)',
    border: '1px solid var(--color-border-default)',
    color: 'var(--color-text-primary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    borderRadius: 'var(--radius-sm)',
    outline: 'none',
    textAlign: 'right',
  };

  return (
    <div
      style={{
        borderTop: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-surface)',
        padding: '14px 16px',
      }}
    >
      {/* Presets */}
      <div className="flex flex-col gap-2" style={{ marginBottom: 14 }}>
        <span
          style={{
            fontSize: 10, fontWeight: 600,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-secondary)',
          }}
        >
          Quick presets
        </span>
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Limit presets">
          {PRESETS.map((p) => {
            const isActive = activePreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p.id)}
                aria-pressed={isActive}
                title={p.description}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{
                  height: 30, padding: '0 14px',
                  fontSize: 12, fontFamily: 'var(--font-sans)',
                  fontWeight: 500,
                  background: isActive ? 'var(--color-accent-subtle)' : 'var(--color-bg-base)',
                  border: `1px solid ${isActive ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  borderRadius: 999,
                  cursor: 'pointer',
                  transition: 'all 0.12s',
                }}
              >
                {p.label}
              </button>
            );
          })}
          {activePreset === null && (
            <span
              style={{
                fontSize: 10.5, fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)',
                marginLeft: 4,
              }}
            >
              Custom
            </span>
          )}
        </div>
      </div>

      {/* Three labeled fields with units */}
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        }}
      >
        <LimitField
          id={rpsId}
          label="Rate limit"
          helper="Requests allowed per second."
          unit="req / s"
          placeholder="∞"
          value={rps}
          onChange={setRps}
          onCommit={() => buildAndCommit({ rps })}
          inputStyle={fieldStyle}
          min={0}
          step={0.5}
        />
        <LimitField
          id={concId}
          label="Max concurrent"
          helper="In-flight calls at once."
          unit="calls"
          placeholder="∞"
          value={conc}
          onChange={setConc}
          onCommit={() => buildAndCommit({ conc })}
          inputStyle={fieldStyle}
          min={0}
          step={1}
        />
        <LimitField
          id={timeoutId}
          label="Timeout"
          helper="Abort after this many seconds."
          unit="sec"
          placeholder="∞"
          value={timeoutSec}
          onChange={setTimeoutSec}
          onCommit={() => buildAndCommit({ timeoutSec })}
          inputStyle={fieldStyle}
          min={0}
          step={1}
        />
      </div>

      {/* Footer actions */}
      <div
        className="flex items-center justify-between flex-wrap gap-2"
        style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border-subtle)' }}
      >
        <span
          style={{
            fontSize: 11, fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-secondary)',
          }}
        >
          Saves automatically when you leave a field.
        </span>
        <button
          type="button"
          onClick={clearAll}
          disabled={!limit || Object.keys(limit).length === 0}
          className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            height: 30, padding: '0 14px',
            background: 'transparent',
            border: '1px solid var(--color-border-default)',
            color: 'var(--color-text-primary)',
            fontSize: 11.5, fontFamily: 'var(--font-mono)',
            borderRadius: 999,
            cursor: limit && Object.keys(limit).length > 0 ? 'pointer' : 'not-allowed',
            opacity: limit && Object.keys(limit).length > 0 ? 1 : 0.5,
          }}
        >
          <RotateCcw style={{ width: 11, height: 11 }} aria-hidden="true" />
          Reset to unlimited
        </button>
      </div>
    </div>
  );
}

interface LimitFieldProps {
  id: string;
  label: string;
  helper: string;
  unit: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  inputStyle: React.CSSProperties;
  min?: number;
  step?: number;
}

function LimitField({
  id, label, helper, unit, placeholder, value, onChange, onCommit, inputStyle, min, step,
}: LimitFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        style={{
          fontSize: 10.5, fontWeight: 600,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-secondary)',
        }}
      >
        {label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={value}
          placeholder={placeholder}
          aria-describedby={`${id}-helper`}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          onBlur={onCommit}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(124,140,248, 0.5)';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,140,248, 0.1)';
          }}
          onBlurCapture={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-default)';
            e.currentTarget.style.boxShadow = 'none';
          }}
          style={{ ...inputStyle, paddingRight: 56 }}
        />
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
            fontSize: 10.5, fontFamily: 'var(--font-mono)',
            color: 'var(--color-text-secondary)',
            letterSpacing: '0.04em',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {unit}
        </span>
      </div>
      <span
        id={`${id}-helper`}
        style={{
          fontSize: 10.5, fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-secondary)',
        }}
      >
        {helper}
      </span>
    </div>
  );
}
