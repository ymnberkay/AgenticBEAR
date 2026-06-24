import { useState } from 'react';
import { UserPlus, Trash2, ShieldAlert } from 'lucide-react';
import type { UserRole } from '@subagent/shared';
import { useUsers, useCreateUser, useDeleteUser, useUpdateUser, useMe, useGroups } from '../../api/hooks/use-auth';
import { Section, inputStyle } from './ui';

const ROLES: UserRole[] = ['admin', 'contributor', 'viewer'];

/** User management (admin only). Add/remove users, set role. Groups + project access: next stage. */
export function UsersTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const me = useMe();
  const { data: users } = useUsers();
  const { data: groups } = useGroups();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  const updateUser = useUpdateUser();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('contributor');
  const [error, setError] = useState('');

  if (me.data && me.data.role !== 'admin') {
    return (
      <Section icon={<ShieldAlert style={{ width: 13, height: 13 }} />} color="#d88a8a" title="Users">
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
          Yalnızca admin kullanıcılar kullanıcı yönetebilir.
        </span>
      </Section>
    );
  }

  const add = () => {
    setError('');
    createUser.mutate(
      { username: username.trim(), password, role },
      {
        onSuccess: () => { setUsername(''); setPassword(''); setRole('contributor'); onSaved('User created'); },
        onError: (e) => setError(e instanceof Error ? e.message : 'Failed'),
      },
    );
  };

  return (
    <Section icon={<UserPlus style={{ width: 13, height: 13 }} />} color="#7c8cf8" title="Users">
      {/* Add user */}
      <div className="flex items-center gap-2" style={{ marginBottom: 12 }}>
        <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} style={{ ...inputStyle, width: 'auto', minWidth: 120, cursor: 'pointer' }}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button type="button" onClick={add} disabled={createUser.isPending || !username || !password} className="flex items-center gap-1.5"
          style={{ height: 36, padding: '0 14px', background: '#7c8cf8', color: '#021526', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer', flexShrink: 0 }}>
          <UserPlus style={{ width: 13, height: 13 }} /> add
        </button>
      </div>
      {error && <div style={{ fontSize: 11.5, color: '#d88a8a', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>{error}</div>}

      {/* List */}
      <div className="flex flex-col gap-2">
        {(users ?? []).map((u) => (
          <div key={u.id} style={{ padding: '8px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)' }}>
            <div className="flex items-center justify-between gap-3">
              <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>
                {u.username}{me.data?.id === u.id ? ' (you)' : ''}
              </span>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <select value={u.role} onChange={(e) => updateUser.mutate({ id: u.id, role: e.target.value as UserRole })}
                  disabled={me.data?.id === u.id} style={{ ...inputStyle, height: 28, width: 'auto', minWidth: 110, cursor: 'pointer', fontSize: 11.5 }}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button type="button" onClick={() => deleteUser.mutate(u.id)} disabled={me.data?.id === u.id} title="Remove"
                  style={{ background: 'none', border: 'none', cursor: me.data?.id === u.id ? 'default' : 'pointer', color: me.data?.id === u.id ? 'var(--color-border-default)' : '#d88a8a' }}>
                  <Trash2 style={{ width: 13, height: 13 }} />
                </button>
              </div>
            </div>
            {/* Group membership (skip for admins — they access everything) */}
            {u.role !== 'admin' && (groups ?? []).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" style={{ marginTop: 8 }}>
                <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>gruplar:</span>
                {(groups ?? []).map((g) => {
                  const on = u.groupIds.includes(g.id);
                  return (
                    <button key={g.id} type="button"
                      onClick={() => updateUser.mutate({ id: u.id, groupIds: on ? u.groupIds.filter((x) => x !== g.id) : [...u.groupIds, g.id] })}
                      style={{ fontSize: 11, fontFamily: 'var(--font-mono)', padding: '2px 8px', cursor: 'pointer',
                        background: on ? 'rgba(192,160,216,0.15)' : 'var(--color-bg-surface)',
                        border: `1px solid ${on ? 'rgba(192,160,216,0.5)' : 'var(--color-border-subtle)'}`,
                        color: on ? '#c0a0d8' : 'var(--color-text-disabled)' }}>
                      {on ? '✓ ' : ''}{g.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 12, marginBottom: 0 }}>
        Roller: admin (tam yetki) · contributor (düzenler) · viewer (okur). Grup + proje-bazlı erişim sonraki aşamada.
      </p>
    </Section>
  );
}
