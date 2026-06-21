import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { PROVIDER_SCOPE_PREFIX } from '@subagent/shared';
import type { CatalogModel } from '../../api/hooks/use-gateway';
import { inputStyle } from './ui';

const ownerToken = (owner: string) => `${PROVIDER_SCOPE_PREFIX}${owner}`;

/**
 * Pick what a key may call: a whole provider (parent → all its models, incl. future ones) or
 * individual models. `value` holds exact model ids and/or `owner:<provider>` wildcards.
 * Empty value = all reachable models.
 */
export function ModelScopePicker({
  catalog, value, onChange,
}: { catalog: CatalogModel[]; value: string[]; onChange: (next: string[]) => void }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const groups = useMemo(() => {
    const map = new Map<string, CatalogModel[]>();
    for (const m of catalog) {
      if (search.trim() && !m.id.toLowerCase().includes(search.trim().toLowerCase())) continue;
      const arr = map.get(m.owned_by) ?? [];
      arr.push(m);
      map.set(m.owned_by, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalog, search]);

  const providerSelected = (owner: string) => value.includes(ownerToken(owner));
  const modelSelected = (m: CatalogModel) => providerSelected(m.owned_by) || value.includes(m.id);

  const toggleProvider = (owner: string, models: CatalogModel[]) => {
    if (providerSelected(owner)) {
      onChange(value.filter((v) => v !== ownerToken(owner)));
    } else {
      // Parent covers everything under it → drop any individual ids from this group.
      const ids = new Set(models.map((m) => m.id));
      onChange([...value.filter((v) => !ids.has(v)), ownerToken(owner)]);
    }
  };

  const toggleModel = (m: CatalogModel) => {
    if (providerSelected(m.owned_by)) return; // covered by the parent
    onChange(value.includes(m.id) ? value.filter((v) => v !== m.id) : [...value, m.id]);
  };

  const selectedCount = value.length;

  return (
    <div className="flex flex-col gap-2">
      <input placeholder="search models…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, height: 32 }} />
      <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-base)' }}>
        {groups.length === 0 && (
          <div style={{ padding: 12, fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            {catalog.length === 0 ? 'No models — add a provider key first.' : 'No models match.'}
          </div>
        )}
        {groups.map(([owner, models]) => {
          const isOpen = open[owner] ?? false;
          const parentOn = providerSelected(owner);
          return (
            <div key={owner} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              <div className="flex items-center gap-2" style={{ padding: '7px 10px' }}>
                <input type="checkbox" checked={parentOn} onChange={() => toggleProvider(owner, models)} style={{ cursor: 'pointer' }} />
                <button type="button" onClick={() => setOpen((o) => ({ ...o, [owner]: !isOpen }))}
                  className="flex items-center gap-1.5" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flex: 1, textAlign: 'left' }}>
                  {isOpen ? <ChevronDown style={{ width: 13, height: 13, color: 'var(--color-text-disabled)' }} /> : <ChevronRight style={{ width: 13, height: 13, color: 'var(--color-text-disabled)' }} />}
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{owner}</span>
                  <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                    {parentOn ? 'all models' : `${models.length} model${models.length === 1 ? '' : 's'}`}
                  </span>
                </button>
              </div>
              {isOpen && (
                <div style={{ padding: '0 10px 8px 30px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {models.map((m) => (
                    <label key={m.id} className="flex items-center gap-2"
                      style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: parentOn ? 'var(--color-text-disabled)' : 'var(--color-text-secondary)', cursor: parentOn ? 'default' : 'pointer' }}>
                      <input type="checkbox" checked={modelSelected(m)} disabled={parentOn} onChange={() => toggleModel(m)} style={{ cursor: parentOn ? 'default' : 'pointer' }} />
                      <span style={{ wordBreak: 'break-all' }}>{m.id}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
        {selectedCount === 0 ? 'all reachable models' : `${selectedCount} selection${selectedCount === 1 ? '' : 's'} (providers + models)`}
      </span>
    </div>
  );
}
