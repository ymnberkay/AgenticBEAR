import { useMemo, useState, type CSSProperties } from 'react';
import { ShieldCheck, Trash2, AlertCircle, Lock, Check, Ban } from 'lucide-react';
import type { DlpRule } from '@subagent/shared';
import { useSettings, useUpdateSettings } from '../../api/hooks/use-settings';
import { useModelCatalog } from '../../api/hooks/use-gateway';
import { useToast } from '../ui/toast';
import { Dialog } from '../ui/dialog';
import { Section, AddButton, inputStyle } from './ui';

/** Built-in detectors, shown read-only so operators know what's already covered. */
const BUILTIN_RULES: { group: string; items: string[] }[] = [
  { group: 'Secrets', items: ['Private keys', 'Anthropic key', 'OpenAI key', 'AgenticBEAR key', 'AWS key', 'GitHub token', 'Google key', 'Slack token', 'JWT'] },
  { group: 'PII', items: ['Email', 'IBAN', 'National ID (TC)', 'Phone (TR)', 'Credit card'] },
];

const fieldLabel: CSSProperties = {
  fontSize: 10.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 6, display: 'block',
};

function validateRegex(pattern: string): string {
  if (!pattern.trim()) return '';
  try { new RegExp(pattern); return ''; }
  catch (e) { return e instanceof Error ? e.message : 'Invalid regex'; }
}

/** Create or edit one custom DLP rule (label + validated regex). */
function RuleDialog({ open, onClose, editing, onSave }: {
  open: boolean;
  onClose: () => void;
  editing: { index: number; rule: DlpRule } | null;
  onSave: (rule: DlpRule, index: number | null) => void;
}) {
  const [label, setLabel] = useState('');
  const [pattern, setPattern] = useState('');

  const seedKey = editing ? String(editing.index) : 'new';
  const [seededFor, setSeededFor] = useState('');
  if (open && seededFor !== seedKey) {
    setSeededFor(seedKey);
    setLabel(editing?.rule.label ?? '');
    setPattern(editing?.rule.pattern ?? '');
  }

  const patternError = validateRegex(pattern);
  const close = () => { setSeededFor(''); onClose(); };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim() || patternError) return;
    onSave({ label: label.trim() || 'custom', pattern: pattern.trim() }, editing ? editing.index : null);
    close();
  };

  return (
    <Dialog open={open} onClose={close} title={editing ? 'Edit DLP rule' : 'Add DLP rule'} maxWidth="440px">
      <form onSubmit={submit} className="flex flex-col" style={{ gap: 16 }}>
        <div>
          <label htmlFor="dlp-label" style={fieldLabel}>Label</label>
          <input id="dlp-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. project-codename" autoComplete="off" style={inputStyle} autoFocus />
        </div>
        <div>
          <label htmlFor="dlp-pattern" style={fieldLabel}>Regex pattern</label>
          <input id="dlp-pattern" value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder="e.g. ACME-\d{4,}" autoComplete="off" spellCheck={false}
            aria-invalid={!!patternError}
            style={{ ...inputStyle, fontFamily: 'var(--font-mono)', borderColor: patternError ? 'rgba(224,96,96,0.5)' : 'var(--color-border-default)' }} />
          {patternError && (
            <span role="alert" className="flex items-center gap-1" style={{ fontSize: 11, color: 'var(--color-error)', fontFamily: 'var(--font-mono)', marginTop: 5 }}>
              <AlertCircle style={{ width: 11, height: 11 }} aria-hidden="true" /> {patternError}
            </span>
          )}
        </div>
        <div className="flex justify-end gap-2" style={{ marginTop: 2 }}>
          <button type="button" onClick={close} style={{ height: 36, padding: '0 14px', borderRadius: 'var(--radius-md)', background: 'none', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
          <button type="submit" disabled={!pattern.trim() || !!patternError}
            style={{ height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)', background: pattern.trim() && !patternError ? 'var(--color-accent)' : 'var(--color-bg-raised)', color: pattern.trim() && !patternError ? '#021526' : 'var(--color-text-disabled)', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: pattern.trim() && !patternError ? 'pointer' : 'default' }}>
            {editing ? 'Save rule' : 'Add rule'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Manage which models skip the DLP guard — grouped by provider, each provider selectable whole. */
function ExcludeModelsDialog({ open, onClose, catalog, excluded, onSave }: {
  open: boolean;
  onClose: () => void;
  catalog: { id: string; owned_by: string }[];
  excluded: string[];
  onSave: (ids: string[]) => void;
}) {
  const [sel, setSel] = useState<Set<string>>(new Set(excluded));
  const seedKey = excluded.join(',');
  const [seededFor, setSeededFor] = useState('');
  if (open && seededFor !== seedKey) { setSeededFor(seedKey); setSel(new Set(excluded)); }

  const byProvider = useMemo(() => {
    const m = new Map<string, { id: string }[]>();
    for (const c of catalog) { (m.get(c.owned_by) ?? m.set(c.owned_by, []).get(c.owned_by)!).push({ id: c.id }); }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalog]);

  const toggle = (id: string) => setSel((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const setProvider = (ids: string[], on: boolean) => setSel((prev) => { const n = new Set(prev); for (const id of ids) on ? n.add(id) : n.delete(id); return n; });

  const close = () => { setSeededFor(''); onClose(); };
  return (
    <Dialog open={open} onClose={close} title="Models excluded from DLP" maxWidth="520px">
      <div className="flex flex-col" style={{ gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, alignItems: 'start', maxHeight: 380, overflowY: 'auto' }}>
          {byProvider.map(([provider, models]) => {
            const ids = models.map((m) => m.id);
            const allOn = ids.length > 0 && ids.every((id) => sel.has(id));
            return (
              <div key={provider} style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 10, background: 'var(--color-bg-base)' }}>
                <div className="flex items-center justify-between" style={{ marginBottom: 8, gap: 8 }}>
                  <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', fontWeight: 600 }}>{provider}/</span>
                  <button type="button" onClick={() => setProvider(ids, !allOn)}
                    style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 8px', borderRadius: 999, background: allOn ? 'var(--color-error-subtle)' : 'transparent', border: `1px solid ${allOn ? 'rgba(224,96,96,0.5)' : 'var(--color-border-default)'}`, color: allOn ? 'var(--color-error)' : 'var(--color-text-secondary)', cursor: 'pointer' }}>
                    {allOn ? '✓ All' : 'All'}
                  </button>
                </div>
                <div className="flex flex-col" style={{ gap: 3 }}>
                  {models.map((m) => {
                    const on = sel.has(m.id);
                    const shortId = m.id.includes('/') ? m.id.split('/').slice(1).join('/') : m.id;
                    return (
                      <button key={m.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(m.id)}
                        className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                        style={{ padding: '5px 7px', borderRadius: 'var(--radius-sm)', textAlign: 'left', cursor: 'pointer',
                          background: on ? 'var(--color-error-subtle)' : 'transparent',
                          border: `1px solid ${on ? 'rgba(224,96,96,0.35)' : 'var(--color-border-subtle)'}` }}>
                        <span aria-hidden="true" className="flex items-center justify-center" style={{ width: 15, height: 15, borderRadius: 4, flexShrink: 0, background: on ? 'var(--color-error)' : 'transparent', border: `1px solid ${on ? 'var(--color-error)' : 'var(--color-border-default)'}` }}>
                          {on && <Check style={{ width: 10, height: 10, color: '#021526' }} />}
                        </span>
                        <span className="truncate" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>{shortId}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {catalog.length === 0 && <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No models available.</span>}
        </div>
        <div className="flex items-center justify-between gap-2" style={{ marginTop: 2 }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>{sel.size} model{sel.size === 1 ? '' : 's'} excluded</span>
          <div className="flex gap-2">
            <button type="button" onClick={close} style={{ height: 36, padding: '0 14px', borderRadius: 'var(--radius-md)', background: 'none', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={() => { onSave([...sel]); close(); }}
              style={{ height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-accent)', color: '#021526', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
              Save
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/** DLP / egress guard: built-in detectors (read-only) + org-defined custom rules + model exclusions. */
export function SecurityTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: catalog } = useModelCatalog();
  const { show: showToast } = useToast();

  const rules = settings?.dlpCustomRules ?? [];
  const disabledModels = settings?.dlpDisabledModels ?? [];

  const [ruleDialog, setRuleDialog] = useState<{ open: boolean; editing: { index: number; rule: DlpRule } | null }>({ open: false, editing: null });
  const [excludeOpen, setExcludeOpen] = useState(false);

  const persist = (patch: Parameters<typeof updateSettings.mutate>[0], msg: string) =>
    updateSettings.mutate(patch, {
      onSuccess: () => onSaved(msg),
      onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to save', { variant: 'error' }),
    });

  const saveRule = (rule: DlpRule, index: number | null) => {
    const next = index === null ? [...rules, rule] : rules.map((r, i) => (i === index ? rule : r));
    persist({ dlpCustomRules: next }, index === null ? 'Rule added' : 'Rule updated');
  };
  const deleteRule = (index: number) => persist({ dlpCustomRules: rules.filter((_, i) => i !== index) }, 'Rule removed');

  return (
    <div className="flex flex-col gap-3">
      <RuleDialog open={ruleDialog.open} onClose={() => setRuleDialog({ open: false, editing: null })} editing={ruleDialog.editing} onSave={saveRule} />
      <ExcludeModelsDialog open={excludeOpen} onClose={() => setExcludeOpen(false)} catalog={catalog ?? []} excluded={disabledModels}
        onSave={(ids) => persist({ dlpDisabledModels: ids }, 'Excluded models updated')} />

      <Section
        icon={<ShieldCheck style={{ width: 13, height: 13 }} />}
        color="var(--color-success)"
        title="DLP — Egress Guard"
        action={<AddButton label="Add rule" onClick={() => setRuleDialog({ open: true, editing: null })} />}
      >
        {/* Built-in detectors (read-only) */}
        <div className="flex items-center gap-1.5" style={{ marginBottom: 8 }}>
          <Lock style={{ width: 11, height: 11, color: 'var(--color-success)' }} aria-hidden="true" />
          <span style={fieldLabel}>Built-in detectors</span>
        </div>
        <div className="flex flex-col" style={{ gap: 8, marginBottom: 20 }}>
          {BUILTIN_RULES.map((grp) => (
            <div key={grp.group} className="flex items-start gap-2 flex-wrap">
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-disabled)', paddingTop: 3, minWidth: 56 }}>{grp.group}</span>
              <div className="flex flex-wrap gap-1.5" style={{ flex: 1 }}>
                {grp.items.map((it) => (
                  <span key={it} style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-success)', background: 'rgba(109,181,138,0.1)', border: '1px solid rgba(109,181,138,0.25)', borderRadius: 999, padding: '2px 9px' }}>{it}</span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Custom rules */}
        <div style={{ ...fieldLabel, marginBottom: 8 }}>Custom rules</div>
        <div className="flex flex-col" style={{ gap: 6 }}>
          {rules.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3" style={{ padding: '9px 11px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div className="min-w-0">
                <div className="truncate" style={{ fontSize: 12.5, color: 'var(--color-text-primary)', fontWeight: 500 }}>{r.label}</div>
                <div className="truncate" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{r.pattern}</div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => setRuleDialog({ open: true, editing: { index: i, rule: r } })}
                  style={{ height: 28, padding: '0 11px', borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>Edit</button>
                <button type="button" onClick={() => deleteRule(i)} aria-label={`Remove rule ${r.label}`} title="Remove rule"
                  className="flex items-center justify-center"
                  style={{ width: 30, height: 30, borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid transparent', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.background = 'var(--color-error-subtle)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'none'; }}>
                  <Trash2 style={{ width: 13, height: 13 }} aria-hidden="true" />
                </button>
              </div>
            </div>
          ))}
          {rules.length === 0 && <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No custom rules — built-in detectors are still active.</span>}
        </div>

        {/* Model exclusions */}
        <div className="flex items-center justify-between" style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-border-subtle)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <Ban style={{ width: 13, height: 13, color: 'var(--color-text-secondary)', flexShrink: 0 }} aria-hidden="true" />
            <div className="min-w-0">
              <div style={{ fontSize: 12.5, color: 'var(--color-text-primary)', fontWeight: 500 }}>Models excluded from DLP</div>
              <div className="truncate" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                {disabledModels.length === 0 ? 'None — every model is scanned' : `${disabledModels.length} model${disabledModels.length === 1 ? '' : 's'} skip scanning`}
              </div>
            </div>
          </div>
          <button type="button" onClick={() => setExcludeOpen(true)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 30, padding: '0 12px', borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11.5, fontFamily: 'var(--font-mono)', cursor: 'pointer', flexShrink: 0 }}>
            Manage
          </button>
        </div>
      </Section>
    </div>
  );
}
