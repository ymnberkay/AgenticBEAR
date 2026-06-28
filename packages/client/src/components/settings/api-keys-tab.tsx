import { useState } from 'react';
import { Zap, KeyRound, Plus, Trash2, Copy, Check, X } from 'lucide-react';
import { PROVIDER_SCOPE_PREFIX } from '@subagent/shared';
import {
  useGatewayKeys, useCreateGatewayKey, useDeleteGatewayKey, useModelCatalog, useSetGatewayKeyCacheScope, useSetGatewayKeyGroup,
} from '../../api/hooks/use-gateway';
import { useGroups } from '../../api/hooks/use-auth';
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
  const setKeyGroup = useSetGatewayKeyGroup();
  const { data: catalog } = useModelCatalog();
  const { data: groups } = useGroups();

  const [copied, setCopied] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);

  // Creation form
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<string[]>([]);
  const [expiryDays, setExpiryDays] = useState(0);
  const [faqMode, setFaqMode] = useState(false);
  const [groupId, setGroupId] = useState<string>('');

  const baseUrl = `${window.location.origin}/v1`;
  const exampleModel = catalog?.[0]?.id ?? 'claude-sonnet-4-20250514';

  const copy = (text: string, tag: string) => {
    navigator.clipboard.writeText(text);
    setCopied(tag);
    setTimeout(() => setCopied(null), 1500);
  };

  const resetForm = () => { setName(''); setScope([]); setExpiryDays(0); setFaqMode(false); setGroupId(''); setFormOpen(false); };

  const submit = () => {
    const expiresAt = expiryDays === 0 ? null : new Date(Date.now() + expiryDays * 86_400_000).toISOString();
    createKey.mutate(
      { name: name.trim(), allowedModels: scope, expiresAt, cacheScope: faqMode ? 'lastUser' : 'conversation', groupId: groupId || null },
      { onSuccess: (k) => { setCreatedKey(k.key); resetForm(); } },
    );
  };

  const groupName = (id: string | null) => (id ? groups?.find((g) => g.id === id)?.name ?? 'group' : null);

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
            <pre style={{ margin: 0, padding: 12, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--color-text-secondary)', overflowX: 'auto', whiteSpace: 'pre' }}>{snippet}</pre>
          </div>
        </div>
      </Section>

      {/* API keys */}
      <Section icon={<KeyRound style={{ width: 13, height: 13 }} />} color="#d88aa0" title="API Keys"
        action={!formOpen && (
          <button type="button" onClick={() => setFormOpen(true)} className="flex items-center gap-1.5"
            style={{ height: 28, padding: '0 12px', fontSize: 11.5, fontFamily: 'var(--font-sans)', fontWeight: 600, color: '#021526', background: 'var(--color-accent)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-accent)'; }}>
            <Plus style={{ width: 12, height: 12 }} /> New key
          </button>
        )}>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 0, marginBottom: 12 }}>
          Keys your internal apps use to call the gateway. Until the first key exists the gateway is open.
        </p>

        {createdKey && (
          <div style={{ padding: 12, marginBottom: 12, background: 'var(--color-success-subtle)', border: '1px solid rgba(109,181,138,0.4)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: 11, color: 'var(--color-success)', fontFamily: 'var(--font-mono)', marginBottom: 6 }}>New key — copy now, shown only once:</div>
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
          <div style={{ padding: 14, marginBottom: 14, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)' }}>
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

              <div className="flex flex-col gap-1.5">
                <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Group (token quota)</label>
                <select value={groupId} onChange={(e) => setGroupId(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer', width: 'auto', minWidth: 180 }}>
                  <option value="">No group (unlimited)</option>
                  {(groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}{g.tokenQuota ? ` · ${g.tokenQuota.toLocaleString()} tok/mo` : ''}</option>)}
                </select>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                  Calls with this key count against the group's shared monthly token quota.
                </span>
              </div>

              <label className="flex items-start gap-2" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={faqMode} onChange={(e) => setFaqMode(e.target.checked)} style={{ marginTop: 2 }} />
                <span>
                  <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>FAQ mode (cache by question only)</span>
                  <span style={{ display: 'block', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                    For chatbots that ask the same question repeatedly: ignores history and caches by the last question only → repeated questions hit cache. Leave off for context-dependent assistants.
                  </span>
                </span>
              </label>

              <div className="flex items-center gap-2">
                <button type="button" disabled={createKey.isPending} onClick={submit} className="flex items-center gap-1.5"
                  style={{ height: 34, padding: '0 16px', background: 'var(--color-accent)', color: '#021526', fontSize: 12.5, fontWeight: 600, border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-accent)'; }}>
                  <Plus style={{ width: 13, height: 13 }} /> {createKey.isPending ? 'Creating…' : 'Create key'}
                </button>
                <button type="button" onClick={resetForm} style={{ height: 34, padding: '0 14px', background: 'none', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', fontSize: 12.5, fontFamily: 'var(--font-sans)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        {/* Key list */}
        <div className="flex flex-col gap-1.5">
          {(keys ?? []).map((k) => {
            const exp = expiryLabel(k.expiresAt);
            return (
              <div key={k.id} className="flex items-center justify-between gap-3" style={{ padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>{k.name || '(unnamed)'}</span>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                    {k.keyPrefix}… · {scopeLabel(k.allowedModels)} · <span style={{ color: exp.expired ? 'var(--color-error)' : 'var(--color-text-disabled)' }}>{exp.text}</span>{k.lastUsedAt ? ' · used' : ' · never used'}
                    {k.groupId ? <> · <span style={{ color: 'var(--color-accent)' }}>{groupName(k.groupId)}</span></> : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  <select value={k.groupId ?? ''} onChange={(e) => setKeyGroup.mutate({ id: k.id, groupId: e.target.value || null })}
                    title="Group (token quota)"
                    style={{ ...inputStyle, height: 26, width: 'auto', minWidth: 96, fontSize: 10.5, cursor: 'pointer' }}>
                    <option value="">no group</option>
                    {(groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <button type="button"
                    onClick={() => setCacheScope.mutate({ id: k.id, cacheScope: k.cacheScope === 'lastUser' ? 'conversation' : 'lastUser' })}
                    title="FAQ mode: cache by question only (ignore history)"
                    style={{ height: 26, padding: '0 10px', fontSize: 10.5, fontFamily: 'var(--font-mono)', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                      background: k.cacheScope === 'lastUser' ? 'var(--color-success-subtle)' : 'none',
                      border: `1px solid ${k.cacheScope === 'lastUser' ? 'rgba(109,181,138,0.5)' : 'var(--color-border-subtle)'}`,
                      color: k.cacheScope === 'lastUser' ? 'var(--color-success)' : 'var(--color-text-disabled)' }}>
                    FAQ {k.cacheScope === 'lastUser' ? 'on' : 'off'}
                  </button>
                  <button type="button" onClick={() => deleteKey.mutate(k.id)} title="Revoke"
                    className="flex items-center justify-center" style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid transparent', cursor: 'pointer', color: 'var(--color-text-disabled)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.background = 'var(--color-error-subtle)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; e.currentTarget.style.background = 'none'; }}>
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
