import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import type { ModelConfig } from '@subagent/shared';
import { useModelOptions, encodeModelValue, decodeModelValue, type ModelOption } from '../../hooks/use-model-options';

interface ModelConfigFormProps {
  config: ModelConfig;
  onChange: (config: ModelConfig) => void;
}

type FlatOption = ModelOption & { group: string };

export function ModelConfigForm({ config, onChange }: ModelConfigFormProps) {
  const groups = useModelOptions();
  const currentValue = encodeModelValue(config.model, config.providerId);
  const labelId = useId();

  const flat = useMemo<FlatOption[]>(
    () => groups.flatMap((g) => g.options.map((o) => ({ ...o, group: g.label }))),
    [groups],
  );
  const current = flat.find((o) => o.value === currentValue);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Focus the search box when opening.
  useEffect(() => { if (open) { setQuery(''); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? flat.filter((o) => `${o.label} ${o.model} ${o.group}`.toLowerCase().includes(q)) : flat;
    // Re-group for display.
    const byGroup = new Map<string, FlatOption[]>();
    for (const o of list) { if (!byGroup.has(o.group)) byGroup.set(o.group, []); byGroup.get(o.group)!.push(o); }
    return [...byGroup.entries()];
  }, [flat, query]);

  const pick = (o: FlatOption) => {
    const { model, providerId } = decodeModelValue(o.value);
    // null (not undefined) for built-ins so the server merge CLEARS any stale custom providerId.
    onChange({ ...config, model, providerId: providerId ?? null });
    setOpen(false);
  };

  return (
    <div>
      <h3 style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-secondary)', marginBottom: '10px' }}>
        Model Configuration
      </h3>

      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <span id={labelId} style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--color-text-secondary)' }}>Model</span>

          <div className="relative" ref={boxRef}>
            {/* Trigger */}
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-labelledby={labelId}
              onClick={() => setOpen((v) => !v)}
              className="w-full flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8] transition-all duration-200"
              style={{ height: 40, padding: '0 12px', fontSize: 13, color: 'var(--color-text-primary)', background: 'var(--glass-bg)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left' }}
            >
              <span className="truncate">
                {current ? current.label : (config.model || 'Select a model…')}
                {current && <span style={{ color: 'var(--color-text-tertiary)', marginLeft: 8, fontFamily: 'var(--font-mono)', fontSize: 11 }}>{current.group}</span>}
              </span>
              <ChevronDown style={{ width: 14, height: 14, flexShrink: 0, color: 'var(--color-text-tertiary)' }} aria-hidden="true" />
            </button>

            {/* Popover */}
            {open && (
              <div role="listbox" style={{ position: 'absolute', zIndex: 50, top: 'calc(100% + 6px)', left: 0, right: 0, background: 'var(--color-bg-raised, var(--color-bg-surface))', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg, 0 12px 32px rgba(0,0,0,0.45))', overflow: 'hidden' }}>
                <div style={{ position: 'relative', padding: 8, borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <Search aria-hidden="true" style={{ position: 'absolute', left: 18, top: '50%', transform: 'translateY(-50%)', width: 13, height: 13, color: 'var(--color-text-disabled)' }} />
                  <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search models…"
                    aria-label="Search models"
                    style={{ width: '100%', height: 32, padding: '0 10px 0 28px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', fontSize: 12.5, outline: 'none' }}
                  />
                </div>
                <div style={{ maxHeight: 280, overflowY: 'auto', padding: 4 }}>
                  {filtered.length === 0 && (
                    <div style={{ padding: '14px 10px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No models match.</div>
                  )}
                  {filtered.map(([group, opts]) => (
                    <div key={group}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)', padding: '6px 8px 3px' }}>{group}</div>
                      {opts.map((o) => {
                        const selected = o.value === currentValue;
                        return (
                          <button
                            key={o.value}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => pick(o)}
                            className="w-full flex items-center justify-between"
                            style={{ padding: '7px 8px', background: selected ? 'var(--color-accent-subtle)' : 'none', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left' }}
                            onMouseEnter={(e) => { if (!selected) e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
                            onMouseLeave={(e) => { if (!selected) e.currentTarget.style.background = 'none'; }}
                          >
                            <span className="truncate" style={{ fontSize: 12.5, color: selected ? 'var(--color-accent)' : 'var(--color-text-primary)' }}>
                              {o.label}
                              <span style={{ marginLeft: 8, fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{o.model}</span>
                            </span>
                            {selected && <Check style={{ width: 13, height: 13, color: 'var(--color-accent)', flexShrink: 0 }} aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {current && (
          <div className="flex items-center gap-3" style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)', paddingLeft: '2px' }}>
            {current.contextWindow ? (
              <>
                <span>Context: {(current.contextWindow / 1000).toFixed(0)}K tokens</span>
                <span style={{ color: 'var(--color-border-subtle)' }}>·</span>
              </>
            ) : null}
            <span>Input: ${current.costPer1kInput ?? 0}/1K</span>
            <span style={{ color: 'var(--color-border-subtle)' }}>·</span>
            <span>Output: ${current.costPer1kOutput ?? 0}/1K</span>
          </div>
        )}
      </div>
    </div>
  );
}
