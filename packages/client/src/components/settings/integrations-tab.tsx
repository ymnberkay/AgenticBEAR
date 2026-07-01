import { useState } from 'react';
import { Plug, Plus, Trash2, X, ShieldAlert, KeyRound } from 'lucide-react';
import type { IntegrationKind } from '@subagent/shared';
import { useConnections, useCreateConnection, useDeleteConnection, useUpdateConnection } from '../../api/hooks/use-integrations';
import { useMe } from '../../api/hooks/use-auth';
import { Section, inputStyle } from './ui';

const KIND_LABEL: Record<IntegrationKind, string> = {
  github: 'GitHub Issues',
  jira: 'Jira',
  azure_devops: 'Azure Boards',
  sonarqube: 'SonarQube / SonarCloud',
};

/** Per-kind config fields + base URL + token guidance. */
const KIND_SPEC: Record<IntegrationKind, { baseUrlPlaceholder: string; fields: { key: string; label: string; placeholder: string }[]; tokenHelp: string }> = {
  github: { baseUrlPlaceholder: 'https://api.github.com', fields: [{ key: 'owner', label: 'Owner', placeholder: 'org-or-user' }, { key: 'repo', label: 'Repo', placeholder: 'repository' }], tokenHelp: 'GitHub PAT (repo scope).' },
  jira: { baseUrlPlaceholder: 'https://your.atlassian.net', fields: [{ key: 'projectKey', label: 'Project key', placeholder: 'ENG' }, { key: 'email', label: 'Account email', placeholder: 'you@org.com' }], tokenHelp: 'Jira API token.' },
  azure_devops: { baseUrlPlaceholder: 'https://dev.azure.com/your-org', fields: [{ key: 'project', label: 'Project', placeholder: 'MyProject' }], tokenHelp: 'Azure DevOps PAT (Work Items: read & write).' },
  sonarqube: { baseUrlPlaceholder: 'https://sonarcloud.io', fields: [], tokenHelp: 'SonarQube user token (Read only on projects to scan is sufficient).' },
};

export function IntegrationsTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const me = useMe();
  const { data: connections } = useConnections();
  const createConn = useCreateConnection();
  const updateConn = useUpdateConnection();
  const deleteConn = useDeleteConnection();
  /** Connection id currently being edited inline (for labels vocabulary). */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVocab, setEditVocab] = useState('');

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<IntegrationKind>('github');
  const [label, setLabel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [config, setConfig] = useState<Record<string, string>>({});
  /** Comma- or newline-separated vocabulary; serialized as string[] on save. */
  const [labelsVocab, setLabelsVocab] = useState('');

  if (me.data && me.data.role !== 'admin') {
    return (
      <Section icon={<ShieldAlert style={{ width: 13, height: 13 }} />} color="var(--color-error)" title="Integrations">
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Only admins can manage integrations.</span>
      </Section>
    );
  }

  const spec = KIND_SPEC[kind];
  const reset = () => { setOpen(false); setLabel(''); setBaseUrl(''); setToken(''); setConfig({}); setLabelsVocab(''); setKind('github'); };

  const parseVocab = (s: string): string[] => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

  const submit = () => {
    if (!label.trim()) return;
    createConn.mutate(
      {
        kind, label: label.trim(), baseUrl: baseUrl.trim() || spec.baseUrlPlaceholder,
        config, token: token.trim() || undefined, enabled: true,
        labelsVocabulary: parseVocab(labelsVocab),
      },
      { onSuccess: () => { reset(); onSaved('Integration added'); } },
    );
  };

  return (
    <Section
      icon={<Plug style={{ width: 13, height: 13 }} />} color="#7c8cf8" title="Issue Tracker Integrations"
      action={!open && (
        <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-1.5"
          style={{ height: 28, padding: '0 12px', fontSize: 11.5, fontWeight: 600, color: '#021526', background: 'var(--color-accent)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
          <Plus style={{ width: 12, height: 12 }} /> Add
        </button>
      )}
    >
      <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 0, marginBottom: 12 }}>
        Connect GitHub Issues, Jira, or Azure Boards. Link a connection to a project (in its Issues tab) to auto-open agent-filed issues there.
      </p>

      {open && (
        <div className="flex flex-col gap-3" style={{ padding: 14, marginBottom: 12, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)' }}>
          <div className="flex items-center justify-between">
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>New connection</span>
            <button type="button" onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-disabled)' }}><X style={{ width: 14, height: 14 }} /></button>
          </div>
          <select value={kind} onChange={(e) => { setKind(e.target.value as IntegrationKind); setConfig({}); }} style={{ ...inputStyle, cursor: 'pointer' }}>
            {(Object.keys(KIND_LABEL) as IntegrationKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <input placeholder="Label (e.g. Acme GitHub)" value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} />
          <input placeholder={`Base URL — ${spec.baseUrlPlaceholder}`} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} style={inputStyle} />
          <div className="flex items-center gap-2">
            {spec.fields.map((f) => (
              <input key={f.key} placeholder={`${f.label} — ${f.placeholder}`} value={config[f.key] ?? ''}
                onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
            ))}
          </div>
          <input type="password" placeholder={`Token — ${spec.tokenHelp}`} value={token} onChange={(e) => setToken(e.target.value)} style={inputStyle} />
          <div className="flex flex-col gap-1.5">
            <label style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Custom labels (optional)</label>
            <textarea
              placeholder="frontend, backend, urgent, security…"
              value={labelsVocab}
              onChange={(e) => setLabelsVocab(e.target.value)}
              rows={2}
              style={{ ...inputStyle, height: 'auto', padding: '8px 11px', resize: 'vertical' }}
            />
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
              Comma- or newline-separated. Offered as autocomplete when filing an issue. Users and agents can still add others.
            </span>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button type="button" onClick={reset} style={{ height: 32, padding: '0 14px', background: 'none', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', fontSize: 12.5, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={submit} disabled={!label.trim() || createConn.isPending}
              style={{ height: 32, padding: '0 16px', background: 'var(--color-accent)', color: '#021526', fontSize: 12.5, fontWeight: 600, border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
              {createConn.isPending ? 'Adding…' : 'Add connection'}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {(connections ?? []).map((c) => {
          const isEditing = editingId === c.id;
          return (
            <div key={c.id} className="flex flex-col gap-2" style={{ padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div className="flex items-center justify-between gap-3">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, color: 'var(--color-text-primary)', fontWeight: 600 }}>
                    {c.label} <span style={{ color: 'var(--color-text-disabled)', fontWeight: 400 }}>· {KIND_LABEL[c.kind]}</span>
                  </div>
                  <div className="truncate flex items-center gap-2" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                    {c.baseUrl || '—'} · {Object.entries(c.config).map(([k, v]) => `${k}=${v}`).join(' ') || 'no config'}
                    <span className="flex items-center gap-1" style={{ color: c.hasCredentials ? 'var(--color-success)' : 'var(--color-error)' }}>
                      <KeyRound style={{ width: 10, height: 10 }} /> {c.hasCredentials ? 'token set' : 'no token'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                  <button type="button"
                    onClick={() => { if (isEditing) { setEditingId(null); } else { setEditingId(c.id); setEditVocab(c.labelsVocabulary.join(', ')); } }}
                    title={isEditing ? 'Close labels' : 'Edit labels'}
                    style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: isEditing ? 'var(--color-accent)' : 'var(--color-text-secondary)', background: 'none', border: '1px solid var(--color-border-subtle)', cursor: 'pointer', borderRadius: 'var(--radius-sm)', padding: '4px 8px' }}>
                    labels · {c.labelsVocabulary.length}
                  </button>
                  <button type="button" onClick={() => deleteConn.mutate(c.id)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', padding: 4 }}>
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              </div>

              {!isEditing && c.labelsVocabulary.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.labelsVocabulary.map((l) => (
                    <span key={l} style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 999, padding: '2px 8px' }}>
                      {l}
                    </span>
                  ))}
                </div>
              )}

              {isEditing && (
                <div className="flex flex-col gap-1.5">
                  <textarea
                    placeholder="frontend, backend, urgent…"
                    value={editVocab}
                    onChange={(e) => setEditVocab(e.target.value)}
                    rows={2}
                    style={{ ...inputStyle, height: 'auto', padding: '8px 11px', resize: 'vertical' }}
                  />
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={() => setEditingId(null)} style={{ height: 26, padding: '0 10px', background: 'none', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', fontSize: 11, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Cancel</button>
                    <button type="button"
                      onClick={() => updateConn.mutate({ id: c.id, labelsVocabulary: parseVocab(editVocab) }, { onSuccess: () => { setEditingId(null); onSaved('Labels saved'); } })}
                      disabled={updateConn.isPending}
                      style={{ height: 26, padding: '0 12px', background: 'var(--color-accent)', color: '#021526', fontSize: 11, fontWeight: 600, border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                      {updateConn.isPending ? 'Saving…' : 'Save labels'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {(connections ?? []).length === 0 && !open && (
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No integrations yet.</span>
        )}
      </div>
    </Section>
  );
}
