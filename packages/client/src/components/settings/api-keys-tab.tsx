import { useEffect, useState, type CSSProperties } from 'react';
import { Zap, KeyRound, Trash2, Copy, Check, AlertTriangle, RotateCw } from 'lucide-react';
import { PROVIDER_SCOPE_PREFIX, type CreateGatewayKeyInput, type PermissionGroup } from '@subagent/shared';
import {
  useGatewayKeys, useCreateGatewayKey, useDeleteGatewayKey, useRegenerateGatewayKey, useModelCatalog, useSetGatewayKeyCacheScope, useSetGatewayKeyGroup, useSetGatewayKeyLimits, type CatalogModel,
} from '../../api/hooks/use-gateway';
import { useGroups } from '../../api/hooks/use-auth';
import { useToast } from '../ui/toast';
import { Dialog } from '../ui/dialog';
import { ModelScopePicker } from './model-scope-picker';
import { AddButton, inputStyle } from './ui';
import { Panel } from './gateway-ui';

const EXPIRY_OPTIONS = [
  { label: 'Never', days: 0 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
];

const dialogFieldLabel: CSSProperties = {
  fontSize: 10.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 6, display: 'block',
};

/** Create a gateway API key — a focused modal (name, model scope, expiry, group, rate limit, FAQ mode). */
function CreateKeyDialog({ open, onClose, catalog, groups, pending, onSubmit }: {
  open: boolean;
  onClose: () => void;
  catalog: CatalogModel[];
  groups: PermissionGroup[];
  pending: boolean;
  onSubmit: (input: CreateGatewayKeyInput) => void;
}) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState<string[]>([]);
  const [expiryDays, setExpiryDays] = useState(0);
  const [faqMode, setFaqMode] = useState(false);
  const [groupId, setGroupId] = useState('');
  const [rateLimit, setRateLimit] = useState('');
  const [nameError, setNameError] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(''); setScope([]); setExpiryDays(0); setFaqMode(false); setGroupId(''); setRateLimit(''); setNameError('');
  }, [open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setNameError('Give the key a name so you can find it later.'); return; }
    const expiresAt = expiryDays === 0 ? null : new Date(Date.now() + expiryDays * 86_400_000).toISOString();
    const rl = parseFloat(rateLimit);
    onSubmit({
      name: name.trim(), allowedModels: scope, expiresAt,
      cacheScope: faqMode ? 'lastUser' : 'conversation', groupId: groupId || null,
      rateLimitPerMin: Number.isFinite(rl) && rl > 0 ? Math.round(rl) : null,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} title="New API key" maxWidth="500px">
      <form onSubmit={submit} className="flex flex-col" style={{ gap: 16 }}>
        <div>
          <label htmlFor="new-key-name" style={dialogFieldLabel}>Name</label>
          <input id="new-key-name" required autoFocus autoComplete="off" placeholder="e.g. billing-app"
            value={name} onChange={(e) => { setName(e.target.value); if (nameError) setNameError(''); }}
            aria-invalid={!!nameError}
            style={{ ...inputStyle, borderColor: nameError ? 'rgba(224,96,96,0.5)' : 'var(--color-border-default)' }} />
          {nameError && <span role="alert" style={{ fontSize: 11, color: 'var(--color-error)', fontFamily: 'var(--font-mono)', marginTop: 5, display: 'block' }}>{nameError}</span>}
        </div>

        <div>
          <label style={dialogFieldLabel}>Models</label>
          <ModelScopePicker catalog={catalog} value={scope} onChange={setScope} />
        </div>

        <div className="flex flex-wrap" style={{ gap: 14 }}>
          <div style={{ flex: '1 1 140px' }}>
            <label htmlFor="new-key-expiry" style={dialogFieldLabel}>Expires</label>
            <select id="new-key-expiry" value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value))} style={{ ...inputStyle, cursor: 'pointer' }}>
              {EXPIRY_OPTIONS.map((o) => <option key={o.days} value={o.days}>{o.label}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 180px' }}>
            <label htmlFor="new-key-group" style={dialogFieldLabel}>Group (token quota)</label>
            <select id="new-key-group" value={groupId} onChange={(e) => setGroupId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <option value="">No group (unlimited)</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.tokenQuota ? ` · ${g.tokenQuota.toLocaleString()} tok/mo` : ''}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 120px' }}>
            <label htmlFor="new-key-rate" style={dialogFieldLabel}>Rate limit</label>
            <div style={{ position: 'relative' }}>
              <input id="new-key-rate" type="number" min={0} step={1} inputMode="numeric" placeholder="∞"
                value={rateLimit} onChange={(e) => setRateLimit(e.target.value)}
                style={{ ...inputStyle, paddingRight: 52, textAlign: 'right' }} />
              <span aria-hidden="true" style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }}>/ min</span>
            </div>
          </div>
        </div>

        <label className="flex items-start gap-2" style={{ cursor: 'pointer', padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
          <input type="checkbox" checked={faqMode} onChange={(e) => setFaqMode(e.target.checked)} style={{ marginTop: 2, accentColor: '#7c8cf8' }} />
          <span>
            <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>FAQ mode (cache by question only)</span>
            <span style={{ display: 'block', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              For chatbots asking the same question repeatedly — ignores history, caches by the last question.
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2" style={{ marginTop: 2 }}>
          <button type="button" onClick={onClose} style={{ height: 36, padding: '0 14px', borderRadius: 'var(--radius-md)', background: 'none', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
          <button type="submit" disabled={pending}
            style={{ height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-accent)', color: '#021526', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: pending ? 'wait' : 'pointer' }}>
            {pending ? 'Creating…' : 'Create key'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

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
  const regenerateKey = useRegenerateGatewayKey();
  const setCacheScope = useSetGatewayKeyCacheScope();
  const setKeyGroup = useSetGatewayKeyGroup();
  const setKeyLimits = useSetGatewayKeyLimits();
  const { data: catalog } = useModelCatalog();
  const { data: groups } = useGroups();
  const { show: showToast } = useToast();

  const [copied, setCopied] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  // Delete confirm
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  // Regenerate (rotate secret) confirm
  const [regenTarget, setRegenTarget] = useState<{ id: string; name: string } | null>(null);

  // Create-key dialog
  const [formOpen, setFormOpen] = useState(false);

  const baseUrl = `${window.location.origin}/v1`;
  const exampleModel = catalog?.[0]?.id ?? 'claude-sonnet-4-20250514';
  const keysExist = (keys ?? []).length > 0;

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      showToast('Could not copy. Select and copy manually.', { variant: 'error' });
    }
  };

  const submit = (input: CreateGatewayKeyInput) => {
    createKey.mutate(input, {
      onSuccess: (k) => {
        setCreatedKey(k.key);
        setAcknowledged(false);
        setFormOpen(false);
      },
      onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to create key', { variant: 'error' }),
    });
  };

  const confirmRevoke = () => {
    if (!revokeTarget) return;
    const id = revokeTarget.id;
    const name = revokeTarget.name;
    setRevokeTarget(null);
    deleteKey.mutate(id, {
      onSuccess: () => showToast(`Deleted "${name}"`, { variant: 'success' }),
      onError: (err) => showToast(err instanceof Error ? err.message : 'Delete failed', { variant: 'error' }),
    });
  };

  const confirmRegenerate = () => {
    if (!regenTarget) return;
    const id = regenTarget.id;
    const name = regenTarget.name;
    setRegenTarget(null);
    regenerateKey.mutate(id, {
      onSuccess: (k) => {
        setCreatedKey(k.key); // reuse the one-time reveal modal
        setAcknowledged(false);
        showToast(`Regenerated "${name}" — copy the new key now`, { variant: 'success' });
      },
      onError: (err) => showToast(err instanceof Error ? err.message : 'Regenerate failed', { variant: 'error' }),
    });
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
      {!keysExist && (
        <div
          role="alert"
          className="flex items-start gap-2"
          style={{
            padding: '10px 14px',
            background: 'var(--color-warning-subtle)',
            border: '1px solid rgba(226,176,74,0.4)',
            borderRadius: 'var(--radius-md)',
            color: 'var(--color-warning)',
            fontSize: 12.5,
            fontFamily: 'var(--font-mono)',
          }}
        >
          <AlertTriangle style={{ width: 14, height: 14, flexShrink: 0, marginTop: 2 }} aria-hidden="true" />
          <span>
            Gateway is currently <strong>open to any caller</strong>. Create your first API key to require authentication.
          </span>
        </div>
      )}

      {/* Example (reference) */}
      <Panel icon={<Zap style={{ width: 12, height: 12 }} aria-hidden="true" />} color="#7c8cf8" title="Example — OpenAI-compatible">
        <div className="flex flex-col gap-3">
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>Base URL</div>
            <div className="flex items-center justify-between gap-2" style={{ ...inputStyle, display: 'flex', alignItems: 'center' }}>
              <span className="truncate">{baseUrl}</span>
              <button
                type="button"
                onClick={() => copy(baseUrl, 'url')}
                aria-label={copied === 'url' ? 'Base URL copied' : 'Copy base URL'}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === 'url' ? '#6db58a' : 'var(--color-text-secondary)', padding: 6, borderRadius: 4 }}
              >
                {copied === 'url' ? <Check style={{ width: 13, height: 13 }} aria-hidden="true" /> : <Copy style={{ width: 13, height: 13 }} aria-hidden="true" />}
              </button>
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>Python (OpenAI SDK)</span>
              <button
                type="button"
                onClick={() => copy(snippet, 'snip')}
                aria-label={copied === 'snip' ? 'Snippet copied' : 'Copy snippet'}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied === 'snip' ? '#6db58a' : '#7c8cf8', fontSize: 11, fontFamily: 'var(--font-mono)', padding: '4px 8px', borderRadius: 4 }}
              >
                {copied === 'snip' ? 'copied' : 'copy'}
              </button>
            </div>
            <pre style={{ margin: 0, padding: 12, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--color-text-primary)', overflowX: 'auto', whiteSpace: 'pre' }}>{snippet}</pre>
          </div>
        </div>
      </Panel>

      {/* API keys */}
      <Panel
        icon={<KeyRound style={{ width: 12, height: 12 }} aria-hidden="true" />}
        color="#7c8cf8"
        title="API keys"
        action={<AddButton label="New key" onClick={() => setFormOpen(true)} icon={<KeyRound style={{ width: 12, height: 12 }} aria-hidden="true" />} />}
      >
        <CreateKeyDialog open={formOpen} onClose={() => setFormOpen(false)} catalog={catalog ?? []} groups={groups ?? []} pending={createKey.isPending} onSubmit={submit} />

        {/* Key list */}
        <div className="flex flex-col gap-1.5">
          {(keys ?? []).map((k) => {
            const exp = expiryLabel(k.expiresAt);
            return (
              <div key={k.id} className="flex items-center justify-between gap-3" style={{ padding: '12px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>{k.name || '(unnamed)'}</span>
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                    <span title="Key prefix only — full key is shown once at creation">{k.keyPrefix}…</span> · {scopeLabel(k.allowedModels)} · <span style={{ color: exp.expired ? 'var(--color-error)' : 'var(--color-text-secondary)' }}>{exp.text}</span>
                    {k.lastUsedAt ? ` · last used ${new Date(k.lastUsedAt).toLocaleString()}` : ' · never used'}
                    {k.groupId ? <> · <span style={{ color: 'var(--color-accent)' }}>{groupName(k.groupId)}</span></> : ''}
                    {k.rateLimitPerMin ? ` · ${k.rateLimitPerMin}/min` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  <KeyLimitsEditor
                    keyId={k.id}
                    rateLimitPerMin={k.rateLimitPerMin}
                    onSave={(limits) => setKeyLimits.mutate({ id: k.id, ...limits })}
                  />
                  <label className="sr-only" htmlFor={`key-${k.id}-group`}>Group for {k.name || 'key'}</label>
                  <select id={`key-${k.id}-group`} value={k.groupId ?? ''} onChange={(e) => setKeyGroup.mutate({ id: k.id, groupId: e.target.value || null })}
                    title="Group (token quota)"
                    style={{ ...inputStyle, height: 30, width: 'auto', minWidth: 96, fontSize: 10.5, cursor: 'pointer' }}>
                    <option value="">no group</option>
                    {(groups ?? []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                  <button type="button"
                    onClick={() => setCacheScope.mutate({ id: k.id, cacheScope: k.cacheScope === 'lastUser' ? 'conversation' : 'lastUser' })}
                    aria-pressed={k.cacheScope === 'lastUser'}
                    title="FAQ mode: cache by question only (ignore history)"
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                    style={{ height: 30, padding: '0 10px', fontSize: 10.5, fontFamily: 'var(--font-mono)', cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                      background: k.cacheScope === 'lastUser' ? 'var(--color-success-subtle)' : 'none',
                      border: `1px solid ${k.cacheScope === 'lastUser' ? 'rgba(109,181,138,0.5)' : 'var(--color-border-subtle)'}`,
                      color: k.cacheScope === 'lastUser' ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>
                    FAQ {k.cacheScope === 'lastUser' ? 'on' : 'off'}
                  </button>
                  <button type="button" onClick={() => setRegenTarget({ id: k.id, name: k.name || '(unnamed)' })}
                    aria-label={`Regenerate key ${k.name || 'unnamed'}`}
                    title="Regenerate — issue a new secret for this key (old one stops working)"
                    className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                    style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid transparent', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent)'; e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'none'; }}>
                    <RotateCw style={{ width: 13, height: 13 }} aria-hidden="true" />
                  </button>
                  <button type="button" onClick={() => setRevokeTarget({ id: k.id, name: k.name || '(unnamed)' })}
                    aria-label={`Delete key ${k.name || 'unnamed'}`}
                    title="Delete this key permanently"
                    className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                    style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid transparent', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.background = 'var(--color-error-subtle)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'none'; }}>
                    <Trash2 style={{ width: 13, height: 13 }} aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
          {(keys ?? []).length === 0 && (
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
              No keys yet — gateway is open until you create one.
            </span>
          )}
        </div>
      </Panel>

      {/* One-time key reveal — modal that requires acknowledgement */}
      <Dialog
        open={!!createdKey}
        onClose={() => acknowledged && setCreatedKey(null)}
        title="Save your new API key now"
        description="This key is shown only once. You won't be able to retrieve it again."
        maxWidth="520px"
        disableBackdropClose
      >
        {createdKey && (
          <>
            <div style={{
              padding: 14,
              background: 'var(--color-warning-subtle)',
              border: '1px solid rgba(226,176,74,0.4)',
              borderRadius: 'var(--radius-md)',
              marginBottom: 16,
            }}>
              <div className="flex items-center justify-between gap-3">
                <code
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12,
                    color: 'var(--color-text-primary)', wordBreak: 'break-all',
                    flex: 1,
                  }}
                >
                  {createdKey}
                </code>
                <button
                  type="button"
                  onClick={() => copy(createdKey, 'newkey')}
                  aria-label={copied === 'newkey' ? 'Key copied' : 'Copy key'}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8] flex items-center gap-1.5 shrink-0"
                  style={{
                    height: 32, padding: '0 12px',
                    background: copied === 'newkey' ? 'var(--color-success-subtle)' : 'var(--color-bg-surface)',
                    border: `1px solid ${copied === 'newkey' ? 'rgba(109,181,138,0.5)' : 'var(--color-border-default)'}`,
                    color: copied === 'newkey' ? 'var(--color-success)' : 'var(--color-text-primary)',
                    fontSize: 12, fontWeight: 600,
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  }}
                >
                  {copied === 'newkey' ? <Check style={{ width: 13, height: 13 }} aria-hidden="true" /> : <Copy style={{ width: 13, height: 13 }} aria-hidden="true" />}
                  <span aria-live="polite">{copied === 'newkey' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
            <label className="flex items-start gap-2" style={{ cursor: 'pointer', marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                style={{ marginTop: 2 }}
              />
              <span style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
                I've saved this key somewhere safe.
              </span>
            </label>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!acknowledged}
                onClick={() => setCreatedKey(null)}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{
                  height: 36, padding: '0 16px',
                  background: acknowledged ? 'var(--color-accent)' : 'var(--color-bg-raised)',
                  color: acknowledged ? '#021526' : 'var(--color-text-disabled)',
                  fontSize: 12.5, fontWeight: 600, border: 'none',
                  borderRadius: 'var(--radius-md)',
                  cursor: acknowledged ? 'pointer' : 'not-allowed',
                }}
              >
                Done
              </button>
            </div>
          </>
        )}
      </Dialog>

      {/* Delete confirm */}
      <Dialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title="Delete API key"
        description={revokeTarget ? `Apps using "${revokeTarget.name}" will be unable to call the gateway. This cannot be undone.` : undefined}
        maxWidth="440px"
      >
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setRevokeTarget(null)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmRevoke}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: '#e06060', color: '#021526', border: 'none', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Delete key
          </button>
        </div>
      </Dialog>

      {/* Regenerate confirm */}
      <Dialog
        open={!!regenTarget}
        onClose={() => setRegenTarget(null)}
        title="Regenerate API key"
        description={regenTarget ? `A new secret will be issued for "${regenTarget.name}". The current key stops working immediately — update any apps using it. The key's name, scope, group and limits are kept.` : undefined}
        maxWidth="460px"
      >
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setRegenTarget(null)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmRegenerate}
            className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: 'var(--color-accent)', color: '#021526', border: 'none', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            <RotateCw style={{ width: 13, height: 13 }} aria-hidden="true" /> Regenerate
          </button>
        </div>
      </Dialog>
    </div>
  );
}

/** Compact inline editor for a key's per-minute rate limit (blur to save). */
function KeyLimitsEditor({ keyId, rateLimitPerMin, onSave }: {
  keyId: string;
  rateLimitPerMin: number | null;
  onSave: (limits: { rateLimitPerMin?: number | null }) => void;
}) {
  const [rl, setRl] = useState(rateLimitPerMin?.toString() ?? '');
  useEffect(() => {
    setRl(rateLimitPerMin?.toString() ?? '');
  }, [rateLimitPerMin]);

  const commitRl = () => {
    const n = parseFloat(rl);
    const next = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    if (next !== rateLimitPerMin) onSave({ rateLimitPerMin: next });
  };

  const box: React.CSSProperties = { ...inputStyle, height: 30, width: 62, fontSize: 10.5, textAlign: 'right', padding: '0 7px' };
  return (
    <div className="flex items-center gap-1" title="Per-key rate limit (requests/min). Blank = unlimited.">
      <input aria-label={`Rate limit (requests/min) for key ${keyId}`} type="number" min={0} step={1} placeholder="∞/m" value={rl}
        onChange={(e) => setRl(e.target.value)} onBlur={commitRl}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} style={box} />
    </div>
  );
}
