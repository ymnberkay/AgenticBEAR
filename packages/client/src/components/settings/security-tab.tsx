import { useState, useEffect } from 'react';
import { ShieldCheck, Plus, Trash2 } from 'lucide-react';
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
      <Section icon={<ShieldCheck style={{ width: 13, height: 13 }} />} color="#6db58a" title="DLP — Egress Guard">
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 0, marginBottom: 12 }}>
          Giden promptlar (gateway + chat) sağlayıcıya gitmeden taranır; eşleşen gizli veri maskelenir.
          Yerleşik koruma: <span style={{ color: '#6db58a' }}>API key'ler/sırlar</span> + <span style={{ color: '#6db58a' }}>PII (e-posta, IBAN, TC kimlik, kredi kartı, telefon)</span>.
        </p>

        <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 6 }}>
          Özel kurallar (regex)
        </div>
        <div className="flex flex-col gap-2">
          {rules.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input placeholder="etiket (örn. proje-kodadı)" value={r.label} onChange={(e) => update(i, { label: e.target.value })} style={{ ...inputStyle, flex: 1 }} />
              <input placeholder="regex (örn. ACME-\d{4,})" value={r.pattern} onChange={(e) => update(i, { pattern: e.target.value })} style={{ ...inputStyle, flex: 2, fontFamily: 'var(--font-mono)' }} />
              <button type="button" onClick={() => setRules((rs) => rs.filter((_, idx) => idx !== i))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d88a8a', padding: 4, flexShrink: 0 }}>
                <Trash2 style={{ width: 13, height: 13 }} />
              </button>
            </div>
          ))}
          {rules.length === 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Özel kural yok — yerleşik koruma yine de aktif.</span>}
        </div>

        <div className="flex items-center gap-2" style={{ marginTop: 12 }}>
          <button type="button" onClick={() => setRules((rs) => [...rs, { label: '', pattern: '' }])} className="flex items-center gap-1.5"
            style={{ height: 30, padding: '0 12px', fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
            <Plus style={{ width: 12, height: 12 }} /> kural ekle
          </button>
          <button type="button" onClick={save} disabled={updateSettings.isPending}
            style={{ height: 30, padding: '0 16px', fontSize: 12.5, fontWeight: 600, background: '#6EACDA', color: '#021526', border: 'none', cursor: 'pointer' }}>
            {updateSettings.isPending ? 'kaydediliyor…' : 'kaydet'}
          </button>
        </div>

        <p style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 12, marginBottom: 0 }}>
          Eşleşen metin <code>[REDACTED:etiket]</code> ile değiştirilir. Geçersiz regex sessizce atlanır. Aksiyon (maskele/engelle) sunucu ayarındandır.
        </p>

        {/* Per-model DLP opt-out */}
        <div style={{ borderTop: '1px solid var(--color-border-subtle)', marginTop: 16, paddingTop: 14 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 6 }}>
            DLP uygulanmayacak modeller
          </div>
          {disabledModels.length > 0 && (
            <div className="flex flex-wrap gap-1.5" style={{ marginBottom: 8 }}>
              {disabledModels.map((m) => (
                <button key={m} type="button" onClick={() => toggleModel(m)} title="kaldır"
                  className="flex items-center gap-1" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', padding: '3px 8px', background: 'rgba(216,138,138,0.12)', border: '1px solid rgba(216,138,138,0.4)', color: '#d88a8a', cursor: 'pointer' }}>
                  {m} <Trash2 style={{ width: 11, height: 11 }} />
                </button>
              ))}
            </div>
          )}
          <select value="" onChange={(e) => { if (e.target.value) { toggleModel(e.target.value); } }}
            style={{ ...inputStyle, height: 32, cursor: 'pointer' }}>
            <option value="">+ model ekle (DLP kapat)</option>
            {(catalog ?? []).filter((m) => !disabledModels.includes(m.id)).map((m) => (
              <option key={m.id} value={m.id}>{m.id}</option>
            ))}
          </select>
          <p style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 8, marginBottom: 0 }}>
            Bu modellere giden isteklerde DLP taraması atlanır (gateway + chat). Değişiklik için <b>kaydet</b>.
          </p>
        </div>
      </Section>
    </div>
  );
}
