import { useState } from 'react';
import { Users2, Plus, Trash2, ShieldAlert, FolderGit2, Check, Gauge } from 'lucide-react';
import type { UserRole } from '@subagent/shared';
import { useGroups, useGroupUsage, useCreateGroup, useUpdateGroup, useDeleteGroup, useMe, useUsers } from '../../api/hooks/use-auth';
import { useProjects } from '../../api/hooks/use-projects';
import { Section, inputStyle } from './ui';

const ROLES: UserRole[] = ['admin', 'contributor', 'viewer'];
const roleColor: Record<string, string> = {
  admin: 'var(--color-accent)', contributor: 'var(--color-success)', viewer: 'var(--color-text-tertiary)',
};

const fmtTokens = (n: number) => n.toLocaleString('en-US');

/** Permission groups: each grants a role + access to a set of projects. Users belong to groups. */
export function GroupsTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const me = useMe();
  const { data: groups } = useGroups();
  const { data: groupUsage } = useGroupUsage();
  const { data: users } = useUsers();
  const { data: projects } = useProjects();
  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const deleteGroup = useDeleteGroup();
  const usageByGroup = new Map((groupUsage ?? []).map((u) => [u.groupId, u]));

  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('contributor');

  if (me.data && me.data.role !== 'admin') {
    return (
      <Section icon={<ShieldAlert style={{ width: 13, height: 13 }} />} color="var(--color-error)" title="Groups">
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Only admins can manage permission groups.</span>
      </Section>
    );
  }

  const allProjects = projects ?? [];
  const membersOf = (gid: string) => (users ?? []).filter((u) => u.groupIds.includes(gid));

  const toggleProject = (groupId: string, current: string[], pid: string) => {
    const next = current.includes(pid) ? current.filter((x) => x !== pid) : [...current, pid];
    updateGroup.mutate({ id: groupId, projectIds: next });
  };

  return (
    <Section icon={<Users2 style={{ width: 13, height: 13 }} />} color="var(--color-agent-documentation)" title="Permission Groups">
      {/* Create group */}
      <div className="flex items-center gap-2" style={{ marginBottom: 16 }}>
        <input placeholder="Group name (e.g. Frontend Team)" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) createGroup.mutate({ name: name.trim(), role }, { onSuccess: () => { setName(''); setRole('contributor'); onSaved('Group created'); } }); }}
          style={{ ...inputStyle, flex: 1 }} />
        <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} style={{ ...inputStyle, width: 'auto', minWidth: 130, cursor: 'pointer' }}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button type="button" disabled={createGroup.isPending || !name.trim()} className="flex items-center justify-center gap-1.5"
          onClick={() => createGroup.mutate({ name: name.trim(), role }, { onSuccess: () => { setName(''); setRole('contributor'); onSaved('Group created'); } })}
          style={{ height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)', background: name.trim() ? 'var(--color-accent)' : 'var(--color-bg-raised)', color: name.trim() ? '#021526' : 'var(--color-text-disabled)', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: name.trim() ? 'pointer' : 'default', flexShrink: 0, whiteSpace: 'nowrap' }}>
          <Plus style={{ width: 13, height: 13 }} /> Create
        </button>
      </div>

      <div className="flex flex-col" style={{ gap: 10 }}>
        {(groups ?? []).map((g) => {
          const members = membersOf(g.id);
          const allOn = allProjects.length > 0 && g.projectIds.length === allProjects.length;
          return (
            <div key={g.id} style={{ padding: '14px 16px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
              {/* Header: name (inline rename) + role + members + delete */}
              <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
                <span className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.3)', color: roleColor[g.role] }}>
                  <Users2 style={{ width: 15, height: 15 }} />
                </span>
                <input
                  defaultValue={g.name}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== g.name) updateGroup.mutate({ id: g.id, name: v }); else e.target.value = g.name; }}
                  style={{ flex: 1, minWidth: 0, background: 'transparent', border: '1px solid transparent', borderRadius: 'var(--radius-sm)', padding: '4px 8px', fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', outline: 'none' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.background = 'var(--color-bg-surface)'; }}
                  onMouseEnter={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; }}
                  onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = 'transparent'; }}
                  title="Click to rename"
                />
                <span className="flex items-center gap-1.5 shrink-0" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                  {members.length} member{members.length === 1 ? '' : 's'}
                </span>
                <select value={g.role} onChange={(e) => updateGroup.mutate({ id: g.id, role: e.target.value as UserRole })}
                  style={{ ...inputStyle, height: 28, width: 'auto', minWidth: 112, cursor: 'pointer', fontSize: 11.5, color: roleColor[g.role] }}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button type="button" onClick={() => { if (window.confirm(`Delete group "${g.name}"?`)) deleteGroup.mutate(g.id); }} title="Delete group"
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid transparent', cursor: 'pointer', color: 'var(--color-text-disabled)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.background = 'var(--color-error-subtle)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; e.currentTarget.style.background = 'none'; }}>
                  <Trash2 style={{ width: 13, height: 13 }} />
                </button>
              </div>

              {/* Token quota (shared monthly pool) */}
              {(() => {
                const u = usageByGroup.get(g.id);
                const used = u?.totalTokens ?? 0;
                const quota = g.tokenQuota ?? null;
                const pct = quota && quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
                const over = quota != null && used >= quota;
                return (
                  <div style={{ marginBottom: 12 }}>
                    <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                      <span className="flex items-center gap-1.5" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', flexShrink: 0 }}>
                        <Gauge style={{ width: 11, height: 11 }} /> Token quota / month
                      </span>
                      <input
                        type="number" min={0} step={1000}
                        defaultValue={g.tokenQuota ?? ''}
                        placeholder="unlimited"
                        key={g.tokenQuota ?? 'unlimited'}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const v = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
                          if ((v ?? null) !== (g.tokenQuota ?? null)) updateGroup.mutate({ id: g.id, tokenQuota: v });
                        }}
                        style={{ ...inputStyle, height: 28, width: 150, fontSize: 11.5 }}
                        title="Shared monthly token budget for this group. Blank = unlimited."
                      />
                      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: over ? 'var(--color-error)' : 'var(--color-text-tertiary)', marginLeft: 'auto' }}>
                        {fmtTokens(used)} {quota ? `/ ${fmtTokens(quota)}` : '/ ∞'} this month
                      </span>
                    </div>
                    {quota ? (
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--color-bg-surface)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: over ? 'var(--color-error)' : 'var(--color-accent)', transition: 'width .3s' }} />
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {/* Members */}
              {members.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5" style={{ marginBottom: 12 }}>
                  {members.map((u) => (
                    <span key={u.id} className="flex items-center gap-1.5" title={`${u.username} · ${u.role}`}
                      style={{ fontSize: 11, fontFamily: 'var(--font-mono)', padding: '2px 8px 2px 3px', borderRadius: 'var(--radius-xl)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}>
                      <span className="flex items-center justify-center" style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--color-accent-subtle)', color: 'var(--color-accent)', fontSize: 9, fontWeight: 700 }}>{u.username.charAt(0).toUpperCase()}</span>
                      {u.username}
                    </span>
                  ))}
                </div>
              )}

              {/* Project access */}
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span className="flex items-center gap-1.5" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                  <FolderGit2 style={{ width: 11, height: 11 }} /> Project access ({g.projectIds.length}/{allProjects.length})
                </span>
                {allProjects.length > 0 && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => updateGroup.mutate({ id: g.id, projectIds: allProjects.map((p) => p.id) })}
                      style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 7px', borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid var(--color-border-subtle)', color: allOn ? 'var(--color-accent)' : 'var(--color-text-tertiary)', cursor: 'pointer' }}>All</button>
                    <button type="button" onClick={() => updateGroup.mutate({ id: g.id, projectIds: [] })}
                      style={{ fontSize: 10, fontFamily: 'var(--font-mono)', padding: '2px 7px', borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>None</button>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allProjects.map((p) => {
                  const on = g.projectIds.includes(p.id);
                  return (
                    <button key={p.id} type="button" onClick={() => toggleProject(g.id, g.projectIds, p.id)}
                      className="flex items-center gap-1"
                      style={{ fontSize: 11, fontFamily: 'var(--font-sans)', padding: '4px 9px', borderRadius: 'var(--radius-md)', cursor: 'pointer', transition: 'all .12s',
                        background: on ? 'var(--color-accent-subtle)' : 'var(--color-bg-surface)',
                        border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                        color: on ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                      {on && <Check style={{ width: 11, height: 11 }} />}{p.name}
                    </button>
                  );
                })}
                {allProjects.length === 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No projects yet.</span>}
              </div>
            </div>
          );
        })}
        {(groups ?? []).length === 0 && (
          <div style={{ padding: '28px', textAlign: 'center', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', border: '1px dashed var(--color-border-default)', borderRadius: 'var(--radius-md)' }}>
            No groups yet — create one above.
          </div>
        )}
      </div>

      <p style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 14, marginBottom: 0 }}>
        Assign users to groups from the <b style={{ color: 'var(--color-text-tertiary)' }}>Users</b> tab. Admins access every project; others only their groups' projects.
      </p>
    </Section>
  );
}
