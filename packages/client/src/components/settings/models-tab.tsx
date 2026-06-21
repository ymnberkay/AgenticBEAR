import { useState } from 'react';
import { Boxes, RefreshCw } from 'lucide-react';
import { useModelCatalog, useRefreshModelCatalog } from '../../api/hooks/use-gateway';
import { Section, inputStyle, Pager, PAGE_SIZE } from './ui';

/** The catalog of models reachable through the configured providers (live-discovered). */
export function ModelsTab() {
  const { data: catalog } = useModelCatalog();
  const refreshCatalog = useRefreshModelCatalog();

  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('all');
  const [page, setPage] = useState(1);

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

  return (
    <Section
      icon={<Boxes style={{ width: 13, height: 13 }} />} color="#6EACDA" title={`Reachable Models (${list.length})`}
      action={
        <button type="button" onClick={() => refreshCatalog.mutate()} disabled={refreshCatalog.isPending}
          className="flex items-center gap-1.5"
          style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#6EACDA', background: 'none', border: 'none', cursor: refreshCatalog.isPending ? 'wait' : 'pointer' }}>
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
        <div className="flex flex-col gap-1">
          {items.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-3" style={{ padding: '6px 10px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)' }}>
              <code style={{ fontSize: 12, color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{m.id}</code>
              <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', flexShrink: 0 }}>{m.owned_by}</span>
            </div>
          ))}
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
