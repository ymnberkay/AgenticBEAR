import { useState, useEffect } from 'react';
import { ShieldCheck, Plus, Trash2, X } from 'lucide-react';
import type { DlpRule } from '@subagent/shared';
import { useSettings, useUpdateSettings } from '../../api/hooks/use-settings';
import { useModelCatalog } from '../../api/hooks/use-gateway';
import { Section, inputStyle } from './ui';

/** DLP / egress guard: built-in secret+PII protection (info) + org-defined custom regex rules. */
export function SecurityTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: catalog } = useModelCatalog();
  const [rules, setRules] = useState<DlpRule[]>([]);
  const [disabledModels, setDisabledModels] = useState<string[]>([]);

  useEffect(() => {
    if (settings) {
      setRules(settings.dlpCustomRules ?? []);
      setDisabledModels(settings.dlpDisabledModels ?? []);
    }
  }, [settings]);

  const update = (i: number, patch: Partial<DlpRule>) =>
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = () =>
    updateSettings.mutate(
      {
        dlpCustomRules: rules.filter((r) => r.pattern.trim()).map((r) => ({ label: r.label.trim() || 'custom', pattern: r.pattern.trim() })),
        dlpDisabledModels: disabledModels,
      },
      { onSuccess: () => onSaved('DLP settings saved') },
    );

  const toggleModel = (id: string) =>
    setDisabledModels((cur) => (cur.includes(id) ? cur.filter((m) => m !== id) : [...cur, id]));

  return (
    <div className="flex flex-col gap-3">
      <Section icon={<ShieldCheck style={{ width: 13, height: 13 }} />} color="var(--color-success)" title="DLP — Egress Guard">
        <p style={{ fontSize: 11.5, fontFamily: 'var(--font-sans)', color: 'var(--color-text-tertiary)', marginTop: 0, marginBottom: 14, lineHeight: 1.6 }}>
          Outgoing prompts (gateway + chat) are scanned before they reach the provider; matched sensitive data is masked.
          Built-in protection: <span style={{ color: 'var(--color-success)' }}>API keys / secrets</span> + <span style={{ color: 'var(--color-success)' }}>PII (email, IBAN, national ID, credit card, phone)</span>.
        </p>

        <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 8 }}>
          Custom rules (regex)
        </div>
        <div className="flex flex-col gap-2">
          {rules.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input placeholder="label (e.g. project-codename)" value={r.label} onChange={(e) => update(i, { label: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
              <input placeholder="regex (e.g. ACME-\d{4,})" value={r.pattern} onChange={(e) => update(i, { pattern: e.target.value })} style={{ ...inputStyle, flex: 2, fontFamily: 'var(--font-mono)' }} />
              <button type="button" onClick={() => setRules((rs) => rs.filter((_, idx) => idx !== i))} title="Remove rule"
                className="flex items-center justify-center" style={{ width: 30, height: 30, borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid transparent', cursor: 'pointer', color: 'var(--color-text-disabled)', flexShrink: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.background = 'var(--color-error-subtle)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; e.currentTarget.style.background = 'none'; }}>
                <Trash2 style={{ width: 13, height: 13 }} />
              </button>
            </div>
          ))}
          {rules.length === 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No custom rules — built-in protection is still active.</span>}
        </div>

        <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
          <button type="button" onClick={() => setRules((rs) => [...rs, { label: '', pattern: '' }])} className="flex items-center gap-1.5"
            style={{ height: 32, padding: '0 12px', fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 500, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
            <Plus style={{ width: 13, height: 13 }} /> Add rule
          </button>
          <button type="button" onClick={save} disabled={updateSettings.isPending}
            style={{ height: 32, padding: '0 18px', fontSize: 12.5, fontWeight: 600, background: 'var(--color-accent)', color: '#021526', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-accent)'; }}>
            {updateSettings.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>

        <p style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 12, marginBottom: 0 }}>
          Matches are replaced with <code>[REDACTED:label]</code>. Invalid regex is skipped silently. The action (mask/block) is a server setting.
        </p>

        {/* Per-model DLP opt-out */}
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: 16, paddingTop: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 8 }}>
            Models excluded from DLP
          </div>
          {disabledModels.length > 0 && (
            <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 10 }}>
              {disabledModels.map((m) => (
                <button key={m} type="button" onClick={() => toggleModel(m)} title="Re-enable DLP"
                  className="flex items-center gap-1" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', padding: '3px 8px', borderRadius: 'var(--radius-md)', background: 'var(--color-error-subtle)', border: '1px solid rgba(224,96,96,0.4)', color: 'var(--color-error)', cursor: 'pointer' }}>
                  {m} <X style={{ width: 11, height: 11 }} />
                </button>
              ))}
            </div>
          )}
          <select value="" onChange={(e) => { if (e.target.value) { toggleModel(e.target.value); } }}
            style={{ ...inputStyle, height: 34, cursor: 'pointer' }}>
            <option value="">+ Exclude a model from DLP…</option>
            {(catalog ?? []).filter((m) => !disabledModels.includes(m.id)).map((m) => (
              <option key={m.id} value={m.id}>{m.id}</option>
            ))}
          </select>
          <p style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 8, marginBottom: 0 }}>
            Requests to these models skip DLP scanning (gateway + chat). Click <b>Save</b> to apply.
          </p>
        </div>
      </Section>
    </div>
  );
}
