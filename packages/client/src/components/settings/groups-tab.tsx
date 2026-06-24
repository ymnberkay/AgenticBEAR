import { useState } from 'react';
import { Users2, Plus, Trash2, ShieldAlert } from 'lucide-react';
import type { UserRole } from '@subagent/shared';
import { useGroups, useCreateGroup, useUpdateGroup, useDeleteGroup, useMe } from '../../api/hooks/use-auth';
import { useProjects } from '../../api/hooks/use-projects';
import { Section, inputStyle } from './ui';

const ROLES: UserRole[] = ['admin', 'contributor', 'viewer'];

/** Permission groups: each grants a role + access to a set of projects. Users belong to groups. */
export function GroupsTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const me = useMe();
  const { data: groups } = useGroups();
  const { data: projects } = useProjects();
  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const deleteGroup = useDeleteGroup();

  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('contributor');

  if (me.data && me.data.role !== 'admin') {
    return (
      <Section icon={<ShieldAlert style={{ width: 13, height: 13 }} />} color="#d88a8a" title="Groups">
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Yalnızca admin grupları yönetebilir.</span>
      </Section>
    );
  }

  const projectName = (id: string) => projects?.find((p) => p.id === id)?.name ?? id.slice(0, 6);

  const toggleProject = (groupId: string, current: string[], pid: string) => {
    const next = current.includes(pid) ? current.filter((x) => x !== pid) : [...current, pid];
    updateGroup.mutate({ id: groupId, projectIds: next });
  };

  return (
    <Section icon={<Users2 style={{ width: 13, height: 13 }} />} color="#c0a0d8" title="Permission Groups">
      {/* Create group */}
      <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
        <input placeholder="grup adı (örn. Frontend Ekibi)" value={name} onChange={(e) => setName(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} style={{ ...inputStyle, width: 'auto', minWidth: 120, cursor: 'pointer' }}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button type="button" disabled={createGroup.isPending || !name.trim()} className="flex items-center gap-1.5"
          onClick={() => createGroup.mutate({ name: name.trim(), role }, { onSuccess: () => { setName(''); setRole('contributor'); onSaved('Group created'); } })}
          style={{ height: 36, padding: '0 14px', background: '#6EACDA', color: '#021526', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer', flexShrink: 0 }}>
          <Plus style={{ width: 13, height: 13 }} /> add
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {(groups ?? []).map((g) => (
          <div key={g.id} style={{ padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)' }}>
            <div className="flex items-center justify-between gap-3" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)', fontWeight: 600 }}>{g.name}</span>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <select value={g.role} onChange={(e) => updateGroup.mutate({ id: g.id, role: e.target.value as UserRole })}
                  style={{ ...inputStyle, height: 26, width: 'auto', minWidth: 105, cursor: 'pointer', fontSize: 11.5 }}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button type="button" onClick={() => deleteGroup.mutate(g.id)} title="sil" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d88a8a' }}>
                  <Trash2 style={{ width: 13, height: 13 }} />
                </button>
              </div>
            </div>
            <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginBottom: 4 }}>
              Erişebileceği projeler ({g.projectIds.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(projects ?? []).map((p) => {
                const on = g.projectIds.includes(p.id);
                return (
                  <button key={p.id} type="button" onClick={() => toggleProject(g.id, g.projectIds, p.id)}
                    style={{ fontSize: 11, fontFamily: 'var(--font-mono)', padding: '3px 8px', cursor: 'pointer',
                      background: on ? 'rgba(110,172,218,0.15)' : 'var(--color-bg-surface)',
                      border: `1px solid ${on ? 'rgba(110,172,218,0.5)' : 'var(--color-border-subtle)'}`,
                      color: on ? '#6EACDA' : 'var(--color-text-disabled)' }}>
                    {on ? '✓ ' : ''}{p.name}
                  </button>
                );
              })}
              {(projects ?? []).length === 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Proje yok.</span>}
            </div>
          </div>
        ))}
        {(groups ?? []).length === 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Henüz grup yok.</span>}
      </div>

      <p style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 12, marginBottom: 0 }}>
        Kullanıcıları gruplara <b>Users</b> sekmesinden atarsın. Admin tüm projelere erişir; diğerleri yalnızca gruplarının projelerine.
      </p>
    </Section>
  );
}
