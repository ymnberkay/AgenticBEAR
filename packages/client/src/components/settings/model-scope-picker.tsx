import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, Check, Minus, Search, Boxes, X } from 'lucide-react';
import { PROVIDER_SCOPE_PREFIX } from '@subagent/shared';
import type { CatalogModel } from '../../api/hooks/use-gateway';

const ownerToken = (owner: string) => `${PROVIDER_SCOPE_PREFIX}${owner}`;

/**
 * System-styled checkbox — same gradient tile / Check icon / Minus indeterminate as the Issues
 * and Goals pages. Local to this file (lift to a shared component if a fourth caller shows up).
 */
function PickerCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
  ariaLabel,
  size = 16,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  size?: number;
}) {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = checked || indeterminate;
  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, flexShrink: 0, cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: 6,
        boxShadow: focused ? '0 0 0 2px rgba(124,140,248,0.45)' : 'none',
        transition: 'box-shadow .15s', opacity: disabled ? 0.55 : 1,
      }}
    >
      <input
        type="checkbox"
        aria-label={ariaLabel}
        aria-checked={indeterminate ? 'mixed' : checked}
        checked={checked}
        disabled={disabled}
        ref={(el) => { if (el) el.indeterminate = indeterminate; }}
        onChange={(e) => onChange(e.target.checked)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, padding: 0, opacity: 0, cursor: disabled ? 'not-allowed' : 'pointer' }}
      />
      <span
        aria-hidden="true"
        style={{
          width: size, height: size, borderRadius: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: active
            ? 'linear-gradient(180deg, rgba(124,140,248,0.95) 0%, rgba(124,140,248,0.78) 100%)'
            : hover && !disabled
              ? 'rgba(124,140,248,0.10)'
              : 'var(--color-bg-base)',
          border: active
            ? '1px solid rgba(124,140,248,0.75)'
            : hover && !disabled
              ? '1px solid rgba(124,140,248,0.45)'
              : '1px solid var(--color-border-default)',
          boxShadow: active
            ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 6px 14px -8px rgba(124,140,248,0.7)'
            : 'inset 0 1px 0 rgba(255,255,255,0.02)',
          transition: 'background .15s, border-color .15s, box-shadow .15s',
        }}
      >
        {indeterminate ? (
          <Minus style={{ width: size - 4, height: size - 4, color: '#021526', strokeWidth: 3 }} aria-hidden="true" />
        ) : checked ? (
          <Check style={{ width: size - 4, height: size - 4, color: '#021526', strokeWidth: 3 }} aria-hidden="true" />
        ) : null}
      </span>
    </label>
  );
}

/** Chip that shows one active picker selection with an inline remove button. */
function SelectionChip({ label, onRemove, tone }: { label: string; onRemove: () => void; tone: 'provider' | 'model' }) {
  const color = tone === 'provider' ? '#6db58a' : '#7c8cf8';
  return (
    <span
      className="flex items-center gap-1"
      style={{
        fontSize: 11, fontFamily: 'var(--font-mono)',
        color, background: `${color}18`, border: `1px solid ${color}55`,
        borderRadius: 999, padding: '2px 4px 2px 8px', whiteSpace: 'nowrap',
      }}
    >
      {tone === 'provider' && <span aria-hidden="true" style={{ fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', opacity: 0.75, marginRight: 4 }}>all</span>}
      <span>{label}</span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 2, display: 'flex' }}>
        <X style={{ width: 10, height: 10 }} />
      </button>
    </span>
  );
}

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

  /** How many models in `models` are individually ticked (excl. the parent wildcard). */
  const individualCount = (owner: string, models: CatalogModel[]) => {
    const ids = new Set(models.map((m) => m.id));
    return value.filter((v) => ids.has(v)).length;
  };
  const providerState = (owner: string, models: CatalogModel[]): 'off' | 'all' | 'partial' => {
    if (providerSelected(owner)) return 'all';
    const n = individualCount(owner, models);
    if (n === 0) return 'off';
    return n === models.length ? 'all' : 'partial';
  };

  const setProvider = (owner: string, models: CatalogModel[], next: 'on' | 'off') => {
    const ids = new Set(models.map((m) => m.id));
    if (next === 'on') {
      // Parent wildcard covers everything → drop any per-model ticks in this group.
      onChange([...value.filter((v) => !ids.has(v)), ownerToken(owner)]);
    } else {
      onChange(value.filter((v) => v !== ownerToken(owner) && !ids.has(v)));
    }
  };

  const toggleModel = (m: CatalogModel) => {
    if (providerSelected(m.owned_by)) return; // covered by the parent
    onChange(value.includes(m.id) ? value.filter((v) => v !== m.id) : [...value, m.id]);
  };

  const selectionEntries: { key: string; label: string; tone: 'provider' | 'model'; onRemove: () => void }[] = useMemo(() => {
    return value.map((v) => {
      if (v.startsWith(PROVIDER_SCOPE_PREFIX)) {
        const owner = v.slice(PROVIDER_SCOPE_PREFIX.length);
        return { key: v, label: owner, tone: 'provider' as const, onRemove: () => onChange(value.filter((x) => x !== v)) };
      }
      return { key: v, label: v, tone: 'model' as const, onRemove: () => onChange(value.filter((x) => x !== v)) };
    });
  }, [value, onChange]);

  const totalCatalog = catalog.length;
  const totalPickable = catalog.length; // pre-search
  const showingCount = groups.reduce((s, [, m]) => s + m.length, 0);

  return (
    <div className="flex flex-col gap-2">
      {/* Selection strip */}
      <div
        className="flex items-center gap-2 flex-wrap"
        style={{
          padding: value.length === 0 ? '8px 12px' : '8px 10px',
          background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)', minHeight: 40,
        }}
      >
        {value.length === 0 ? (
          <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            No scope set — key can call any reachable model.
          </span>
        ) : (
          <>
            {selectionEntries.map((e) => (
              <SelectionChip key={e.key} label={e.label} tone={e.tone} onRemove={e.onRemove} />
            ))}
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => onChange([])}
              style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
              clear all
            </button>
          </>
        )}
      </div>

      {/* Search */}
      <div style={{ position: 'relative' }}>
        <Search aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'var(--color-text-secondary)' }} />
        <input
          type="search"
          placeholder="Search models…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: '100%', height: 34, padding: '0 32px 0 30px',
            background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
            color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontSize: 12,
            outline: 'none', borderRadius: 'var(--radius-md)',
          }}
        />
        {search && (
          <button type="button" onClick={() => setSearch('')} aria-label="Clear search"
            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 4, borderRadius: 4 }}>
            <X style={{ width: 12, height: 12 }} />
          </button>
        )}
      </div>

      {/* Provider groups */}
      <div style={{
        maxHeight: 320, overflowY: 'auto',
        border: '1px solid var(--color-border-subtle)',
        background: 'var(--color-bg-surface)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden auto',
      }}>
        {groups.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            {catalog.length === 0
              ? <>No models discovered — add a provider key first.</>
              : <>No models match <span style={{ color: 'var(--color-text-primary)' }}>{search}</span>. <button type="button" onClick={() => setSearch('')} style={{ color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Clear</button>.</>}
          </div>
        ) : groups.map(([owner, models]) => {
          const isOpen = open[owner] ?? false;
          const state = providerState(owner, models);
          const checked = state === 'all';
          const indeterminate = state === 'partial';
          const individual = individualCount(owner, models);
          return (
            <div key={owner} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
              {/* Provider header row */}
              <div
                onClick={() => setOpen((o) => ({ ...o, [owner]: !isOpen }))}
                className="flex items-center gap-2.5 group"
                style={{
                  padding: '10px 12px', cursor: 'pointer',
                  background: state === 'all'
                    ? 'linear-gradient(90deg, rgba(109,181,138,0.10), transparent 55%)'
                    : state === 'partial'
                      ? 'linear-gradient(90deg, rgba(124,140,248,0.08), transparent 55%)'
                      : 'transparent',
                  transition: 'background .15s',
                }}
              >
                <PickerCheckbox
                  ariaLabel={checked ? `Deselect all ${owner} models` : `Select all ${owner} models`}
                  checked={checked}
                  indeterminate={indeterminate}
                  onChange={(next) => setProvider(owner, models, next ? 'on' : 'off')}
                />
                <span
                  aria-hidden="true"
                  style={{
                    width: 24, height: 24, flexShrink: 0, borderRadius: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: state === 'all'
                      ? 'linear-gradient(135deg, rgba(109,181,138,0.28), rgba(109,181,138,0.08))'
                      : state === 'partial'
                        ? 'linear-gradient(135deg, rgba(124,140,248,0.28), rgba(124,140,248,0.08))'
                        : 'rgba(255,255,255,0.03)',
                    border: state === 'all'
                      ? '1px solid rgba(109,181,138,0.4)'
                      : state === 'partial'
                        ? '1px solid rgba(124,140,248,0.4)'
                        : '1px solid var(--color-border-subtle)',
                    color: state === 'all' ? '#6db58a' : state === 'partial' ? '#7c8cf8' : 'var(--color-text-secondary)',
                    transition: 'all .15s',
                  }}
                >
                  <Boxes style={{ width: 12, height: 12 }} />
                </span>
                <div className="flex flex-col" style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.2 }}>{owner}</span>
                  <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', lineHeight: 1.2, marginTop: 2 }}>
                    {state === 'all'
                      ? `all ${models.length} model${models.length === 1 ? '' : 's'} + future`
                      : state === 'partial'
                        ? `${individual}/${models.length} selected`
                        : `${models.length} model${models.length === 1 ? '' : 's'}`}
                  </span>
                </div>
                <span aria-hidden="true" style={{ color: 'var(--color-text-disabled)', flexShrink: 0 }}>
                  {isOpen
                    ? <ChevronDown style={{ width: 14, height: 14 }} />
                    : <ChevronRight style={{ width: 14, height: 14 }} />}
                </span>
              </div>

              {/* Model rows */}
              {isOpen && (
                <div style={{ padding: '4px 10px 10px 40px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {models.map((m) => {
                    const isSelected = modelSelected(m);
                    const isCoveredByParent = providerSelected(m.owned_by);
                    return (
                      <label
                        key={m.id}
                        className="flex items-center gap-2.5"
                        style={{
                          padding: '5px 8px', borderRadius: 6, cursor: isCoveredByParent ? 'default' : 'pointer',
                          background: isSelected && !isCoveredByParent ? 'rgba(124,140,248,0.06)' : 'transparent',
                          transition: 'background .15s',
                        }}
                        onMouseEnter={(e) => { if (!isCoveredByParent && !isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
                        onMouseLeave={(e) => { if (!isCoveredByParent && !isSelected) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <PickerCheckbox
                          ariaLabel={`Select ${m.id}`}
                          checked={isSelected}
                          disabled={isCoveredByParent}
                          onChange={() => toggleModel(m)}
                        />
                        <code
                          title={m.id}
                          style={{
                            fontSize: 11.5, fontFamily: 'var(--font-mono)',
                            color: isCoveredByParent ? 'var(--color-text-disabled)' : 'var(--color-text-primary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            flex: 1, minWidth: 0,
                          }}
                        >
                          {m.id}
                        </code>
                        {isCoveredByParent && (
                          <span style={{
                            fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase',
                            color: '#6db58a', background: 'rgba(109,181,138,0.12)',
                            border: '1px solid rgba(109,181,138,0.35)',
                            borderRadius: 999, padding: '1px 6px', flexShrink: 0,
                          }}>
                            via provider
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="flex items-center justify-between" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
        <span>
          {value.length === 0
            ? 'All reachable models'
            : `${value.filter((v) => v.startsWith(PROVIDER_SCOPE_PREFIX)).length} provider · ${value.filter((v) => !v.startsWith(PROVIDER_SCOPE_PREFIX)).length} model selection${value.filter((v) => !v.startsWith(PROVIDER_SCOPE_PREFIX)).length === 1 ? '' : 's'}`}
        </span>
        <span>{search ? `${showingCount}/${totalCatalog} shown` : `${totalPickable} models`}</span>
      </div>
    </div>
  );
}
