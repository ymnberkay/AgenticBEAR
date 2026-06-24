import { useState } from 'react';
import { Zap, KeyRound, Plus, Trash2, Copy, Check, X } from 'lucide-react';
import { PROVIDER_SCOPE_PREFIX } from '@subagent/shared';
import {
  useGatewayKeys, useCreateGatewayKey, useDeleteGatewayKey, useModelCatalog, useSetGatewayKeyCacheScope,
} from '../../api/hooks/use-gateway';
import { ModelScopePicker } from './model-scope-picker';
import { Section, inputStyle } from './ui';

const EXPIRY_OPTIONS = [
  { label: 'Never', days: 0 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
];

/** Human summary of a key's model scope: "all models" / "anthropic + 2 models" / etc. */
function scopeLabel(allowedModels: string[]): string {
  if (allowedModels.length === 0) return 'all models';
  const providers = allowedModels.filter((m) => m.startsWith(PROVIDER_SCOPE_PREFIX)).map((m) => m.slice(PROVIDER_SCOPE_PREFIX.length));
  const models = allowedModels.filter((m) => !m.startsWith(PROVIDER_SCOPE_PREFIX));
  const parts: string[] = [];
  if (providers.length) parts.push(providers.join(', '));
  if (models.length) parts.push(`${models.length} model${models.length === 1 ? '' : 's'}`);
  return parts.join(' + ') || 'all models';
}

function expiryLabel(expiresAt: string | null): { text: string; expired: boolean } {
  if (!expiresAt) return { text: 'no expiry', expired: false };
  const ts = Date.parse(expiresAt);
  if (ts <= Date.now()) return { text: 'expired', expired: true };
  return { text: `expires ${new Date(ts).toLocaleDateString()}`, expired: false };
}

/** Issue and manage gateway API keys (the OpenAI SDK example is kept here as reference). */
export function ApiKeysTab() {
  const { data: keys } = useGatewayKeys();
  const createKey = useCreateGatewayKey();
  const deleteKey = useDeleteGatewayKey();
  const setCacheScope = useSetGatewayKeyCacheScope();
  const { data: catalog } = useModelCatalog();

  const [copied, setCopied] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  // Creation form
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<string[]>([]);
  const [expiryDays, setExpiryDays] = useState(0);
  const [faqMode, setFaqMode] = useState(false);

  const baseUrl = `${window.location.origin}/v1`;
  const exampleModel = catalog?.[0]?.id ?? 'claude-sonnet-4-20250514';

  const copy = (text: string, tag: string) => {
    navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(null), 1500);
  };

  const resetForm = () => { setName(''); setScope([]); setExpiryDays(0); setFaqMode(false); setFormOpen(false); };

  const submit = () => {
    const expiresAt = expiryDays === 0 ? null : new Date(Date.now() + expiryDays * 86_400_000).toISOString();
    createKey.mutate(
      { name: name.trim(), allowedModels: scope, expiresAt, cacheScope: faqMode ? 'lastUser' : 'conversation' },
      { onSuccess: (k) => { setCreatedKey(k.key); resetForm(); } },
    );
  };

  const snippet = `from openai import OpenAI
client = OpenAI(base_url="${baseUrl}", api_key="${createdKey ?? 'agb_live_...'}")
resp = client.chat.completions.create(
    model="${exampleModel}",
    messages=[{"role": "user", "content": "Hello"}],
)
print(resp.choices[0].message.content)`;

  return (
    <div className="flex flex-col gap-3">
      {/* Example (reference) */}
      <Section icon={<Zap style={{ width: 13, height: 13 }} />} color="#e2b04a" title="Example — OpenAI-compatible">
        <div className="flex flex-col gap-3">
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>Base URL</div>
            <div className="flex items-center justify-between gap-2" style={{ ...inputStyle, display: 'flex', alignItems: 'center' }}>
              <span className="truncate">{baseUrl}</span>
              <button type="button" onClick={() => copy(baseUrl, 'url')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === 'url' ? '#6db58a' : 'var(--color-text-disabled)' }}>
                {copied === 'url' ? <Check style={{ width: 13, height: 13 }} /> : <Copy style={{ width: 13, height: 13 }} />}
              </button>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>Python (OpenAI SDK)</span>
              <button type="button" onClick={() => copy(snippet, 'snip')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === 'snip' ? '#6db58a' : '#7c8cf8', fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                {copied === 'snip' ? 'copied' : 'copy'}
              </button>
            </div>
            <pre style={{ margin: 0, padding: 12, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--color-text-secondary)', overflowX: 'auto', whiteSpace: 'pre' }}>{snippet}</pre>
          </div>
        </div>
      </Section>

      {/* API keys */}
      <Section icon={<KeyRound style={{ width: 13, height: 13 }} />} color="#d88aa0" title="API Keys"
        action={!formOpen && (
          <button type="button" onClick={() => setFormOpen(true)} className="flex items-center gap-1.5"
            style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#7c8cf8', background: 'none', border: 'none', cursor: 'pointer' }}>
            <Plus style={{ width: 12, height: 12 }} /> create new API key
          </button>
        )}>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 0, marginBottom: 12 }}>
          Keys your internal apps use to call the gateway. Until the first key exists the gateway is open.
        </p>

        {createdKey && (
          <div style={{ padding: 12, marginBottom: 12, background: 'rgba(109,181,138,0.08)', border: '1px solid rgba(109,181,138,0.4)' }}>
            <div style={{ fontSize: 11, color: '#6db58a', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>New key — copy now, shown only once:</div>
            <div className="flex items-center justify-between gap-2">
              <code style={{ fontSize: 12, color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>{createdKey}</code>
              <button type="button" onClick={() => copy(createdKey, 'newkey')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === 'newkey' ? '#6db58a' : 'var(--color-text-disabled)', flexShrink: 0 }}>
                {copied === 'newkey' ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
              </button>
            </div>
          </div>
        )}

        {/* Creation form */}
        {formOpen && (
          <div style={{ padding: 14, marginBottom: 14, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>New API key</span>
              <button type="button" onClick={resetForm} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-disabled)' }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Name</label>
                <input placeholder="e.g. billing-app" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Models</label>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: -4 }}>
                  Select a provider to allow all its models, or pick individual ones. Empty = all.
                </span>
                <ModelScopePicker catalog={catalog ?? []} value={scope} onChange={setScope} />
              </div>

              <div className="flex flex-col gap-1.5">
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Expires</label>
                <select value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value))}
                  style={{ ...inputStyle, cursor: 'pointer', width: 'auto', minWidth: 140 }}>
                  {EXPIRY_OPTIONS.map((o) => <option key={o.days} value={o.days}>{o.label}</option>)}
                </select>
              </div>

              <label className="flex items-start gap-2" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={faqMode} onChange={(e) => setFaqMode(e.target.checked)} style={{ marginTop: 2 }} />
                <span>
                  <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>FAQ mode (cache by question only)</span>
                  <span style={{ display: 'block', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                    Aynı soruyu tekrar soran chatbot'lar için: geçmişi yok sayar, sadece son soruya göre cache'ler → tekrar eden sorular hit eder. Bağlam-bağımlı asistanlarda kapalı tut.
                  </span>
                </span>
              </label>

              <div className="flex items-center gap-2">
                <button type="button" disabled={createKey.isPending} onClick={submit} className="flex items-center gap-1.5"
                  style={{ height: 34, padding: '0 16px', background: '#7c8cf8', color: '#021526', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                  <Plus style={{ width: 13, height: 13 }} /> {createKey.isPending ? 'creating…' : 'create key'}
                </button>
                <button type="button" onClick={resetForm} style={{ height: 34, padding: '0 14px', background: 'none', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-disabled)', fontSize: 12.5, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Key list */}
        <div className="flex flex-col gap-1.5">
          {(keys ?? []).map((k) => {
            const exp = expiryLabel(k.expiresAt);
            return (
              <div key={k.id} className="flex items-center justify-between gap-3" style={{ padding: '9px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)' }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>{k.name || '(unnamed)'}</span>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                    {k.keyPrefix}… · {scopeLabel(k.allowedModels)} · <span style={{ color: exp.expired ? '#d88a8a' : 'var(--color-text-disabled)' }}>{exp.text}</span>{k.lastUsedAt ? ' · used' : ' · never used'}
                  </div>
                </div>
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  <button type="button"
                    onClick={() => setCacheScope.mutate({ id: k.id, cacheScope: k.cacheScope === 'lastUser' ? 'conversation' : 'lastUser' })}
                    title="FAQ mode: cache by question only (ignore history)"
                    style={{ height: 24, padding: '0 8px', fontSize: 10.5, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                      background: k.cacheScope === 'lastUser' ? 'rgba(109,181,138,0.15)' : 'none',
                      border: `1px solid ${k.cacheScope === 'lastUser' ? 'rgba(109,181,138,0.5)' : 'var(--color-border-subtle)'}`,
                      color: k.cacheScope === 'lastUser' ? '#6db58a' : 'var(--color-text-disabled)' }}>
                    FAQ {k.cacheScope === 'lastUser' ? 'on' : 'off'}
                  </button>
                  <button type="button" onClick={() => deleteKey.mutate(k.id)} title="Revoke" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d88a8a' }}>
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              </div>
            );
          })}
          {(keys ?? []).length === 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No keys yet — gateway is open.</span>}
        </div>
      </Section>
    </div>
  );
}
