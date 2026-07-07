import { useState } from 'react';
import { Plug, Trash2, ShieldAlert, KeyRound, GitBranch } from 'lucide-react';
import type { IntegrationKind } from '@subagent/shared';
import { useConnections, useCreateConnection, useDeleteConnection, useUpdateConnection } from '../../api/hooks/use-integrations';
import { useMe } from '../../api/hooks/use-auth';
import { Dialog } from '../ui/dialog';
import { Section, AddButton, inputStyle } from './ui';

const KIND_LABEL: Record<IntegrationKind, string> = {
  github: 'GitHub',
  jira: 'Jira',
  azure_devops: 'Azure DevOps',
  sonarqube: 'SonarQube / SonarCloud',
};

/** What each connection kind can be used for — shown as chips on the row. */
const KIND_CAPS: Record<IntegrationKind, string[]> = {
  github: ['git', 'issues'],
  azure_devops: ['git · Repos', 'issues · Boards'],
  jira: ['issues'],
  sonarqube: ['code scan'],
};

/** GitHub / Azure DevOps double as git credentials (clone & push) for git-backed workspaces. */
const GIT_KINDS: IntegrationKind[] = ['github', 'azure_devops'];

/** All four providers can serve as issue trackers (GitHub Issues, Azure Boards, Jira, Sonar). */
const ISSUE_KINDS: IntegrationKind[] = ['github', 'azure_devops', 'jira', 'sonarqube'];
const ISSUE_KIND_LABEL: Partial<Record<IntegrationKind, string>> = {
  github: 'GitHub (Issues)',
  azure_devops: 'Azure DevOps (Boards)',
};

/** Per-kind config fields + base URL + token guidance. */
const KIND_SPEC: Record<IntegrationKind, { baseUrlPlaceholder: string; fields: { key: string; label: string; placeholder: string }[]; tokenHelp: string }> = {
  github: { baseUrlPlaceholder: 'https://api.github.com', fields: [{ key: 'owner', label: 'Owner', placeholder: 'org-or-user' }, { key: 'repo', label: 'Repo', placeholder: 'repository' }], tokenHelp: 'GitHub PAT — repo scope covers both git (clone/push) and issues.' },
  jira: { baseUrlPlaceholder: 'https://your.atlassian.net', fields: [{ key: 'projectKey', label: 'Project key', placeholder: 'ENG' }, { key: 'email', label: 'Account email', placeholder: 'you@org.com' }], tokenHelp: 'Jira API token.' },
  azure_devops: { baseUrlPlaceholder: 'https://dev.azure.com/your-org', fields: [{ key: 'project', label: 'Project', placeholder: 'MyProject' }], tokenHelp: 'Azure DevOps PAT — Code read & write for Repos, Work Items read & write for Boards.' },
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

  /** Which section's add-form is open — git and issue sections share one form state. */
  const [openIn, setOpenIn] = useState<null | 'git' | 'issues'>(null);
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
  const reset = () => { setOpenIn(null); setLabel(''); setBaseUrl(''); setToken(''); setConfig({}); setLabelsVocab(''); setKind('github'); };
  const openForm = (section: 'git' | 'issues') => {
    reset();
    setOpenIn(section);
    setKind(section === 'git' ? 'github' : 'jira');
  };

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

  const addButton = (section: 'git' | 'issues') => (
    <AddButton label="Add" onClick={() => openForm(section)} />
  );

  const fieldLabelStyle = { fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', letterSpacing: '0.07em', textTransform: 'uppercase' as const, marginBottom: 6, display: 'block' };

  /** Shared add-form dialog. Git section restricts kinds to GitHub / Azure DevOps and hides issue-only fields. */
  const addForm = (section: 'git' | 'issues') => (
    <Dialog
      open={openIn === section}
      onClose={reset}
      title={section === 'git' ? 'Add git connection' : 'Add issue-tracker connection'}
      maxWidth="480px"
    >
      <div className="flex flex-col gap-4">
        <div className="flex" style={{ gap: 12 }}>
          <div style={{ flex: '0 0 180px' }}>
            <label style={fieldLabelStyle}>Provider</label>
            <select value={kind} onChange={(e) => { setKind(e.target.value as IntegrationKind); setConfig({}); }} style={{ ...inputStyle, cursor: 'pointer' }}>
              {(section === 'git' ? GIT_KINDS : ISSUE_KINDS).map((k) => (
                <option key={k} value={k}>
                  {section === 'git' && k === 'azure_devops' ? 'Azure DevOps (Repos)' : ISSUE_KIND_LABEL[k] ?? KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={fieldLabelStyle}>Label</label>
            <input placeholder={section === 'git' ? 'e.g. Acme Repos' : 'e.g. Acme Jira'} value={label} onChange={(e) => setLabel(e.target.value)} style={inputStyle} autoFocus />
          </div>
        </div>
        <div>
          <label style={fieldLabelStyle}>Base URL</label>
          <input placeholder={spec.baseUrlPlaceholder} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} style={inputStyle} />
        </div>
        {spec.fields.length > 0 && (
          <div className="flex items-start" style={{ gap: 12 }}>
            {spec.fields.map((f) => (
              <div key={f.key} style={{ flex: 1 }}>
                <label style={fieldLabelStyle}>{f.label}</label>
                <input placeholder={f.placeholder} value={config[f.key] ?? ''}
                  onChange={(e) => setConfig((c) => ({ ...c, [f.key]: e.target.value }))} style={inputStyle} />
              </div>
            ))}
          </div>
        )}
        <div>
          <label style={fieldLabelStyle}>Token</label>
          <input type="password" placeholder="Personal access token" value={token} onChange={(e) => setToken(e.target.value)} style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} />
        </div>
        {section === 'issues' && (
          <div>
            <label style={fieldLabelStyle}>Custom labels (optional)</label>
            <textarea
              placeholder="frontend, backend, urgent, security…"
              value={labelsVocab}
              onChange={(e) => setLabelsVocab(e.target.value)}
              rows={2}
              style={{ ...inputStyle, height: 'auto', padding: '8px 11px', resize: 'vertical' }}
            />
          </div>
        )}
        <div className="flex items-center gap-2 justify-end" style={{ marginTop: 2 }}>
          <button type="button" onClick={reset} style={{ height: 36, padding: '0 14px', background: 'none', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', fontSize: 12.5, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={submit} disabled={!label.trim() || createConn.isPending}
            style={{ height: 36, padding: '0 16px', background: label.trim() ? 'var(--color-accent)' : 'var(--color-bg-raised)', color: label.trim() ? '#021526' : 'var(--color-text-disabled)', fontSize: 12.5, fontWeight: 600, border: 'none', borderRadius: 'var(--radius-md)', cursor: label.trim() ? 'pointer' : 'default' }}>
            {createConn.isPending ? 'Adding…' : 'Add connection'}
          </button>
        </div>
      </div>
    </Dialog>
  );

  const renderRows = (list: NonNullable<typeof connections>) => (
    <div className="flex flex-col gap-2">
      {list.map((c) => {
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
                  <div className="flex flex-wrap gap-1" style={{ marginTop: 5 }}>
                    {KIND_CAPS[c.kind].map((cap) => (
                      <span key={cap} style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', color: 'var(--color-accent)', background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.25)', borderRadius: 999, padding: '1px 8px' }}>
                        {cap}
                      </span>
                    ))}
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
    </div>
  );

  const gitConnections = (connections ?? []).filter((c) => GIT_KINDS.includes(c.kind));
  const issueConnections = (connections ?? []).filter((c) => !GIT_KINDS.includes(c.kind));

  return (
    <div className="flex flex-col gap-4">
      {/* ── Git integrations — PATs for cloning/pushing git-backed workspaces ── */}
      <Section
        icon={<GitBranch style={{ width: 13, height: 13 }} />} color="var(--color-success)" title="Git Integrations"
        action={addButton('git')}
      >
        {addForm('git')}
        {renderRows(gitConnections)}
        {gitConnections.length === 0 && openIn !== 'git' && (
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No git connections yet.</span>
        )}
      </Section>

      {/* ── Issue trackers ── */}
      <Section
        icon={<Plug style={{ width: 13, height: 13 }} />} color="#7c8cf8" title="Issue Tracker Integrations"
        action={addButton('issues')}
      >
        {addForm('issues')}
        {renderRows(issueConnections)}
        {issueConnections.length === 0 && openIn !== 'issues' && (
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No issue-tracker connections yet.</span>
        )}
      </Section>
    </div>
  );
}
