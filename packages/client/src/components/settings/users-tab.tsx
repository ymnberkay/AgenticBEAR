import { useState } from 'react';
import { UserPlus, Trash2, ShieldAlert } from 'lucide-react';
import type { UserRole } from '@subagent/shared';
import { useUsers, useCreateUser, useDeleteUser, useUpdateUser, useMe, useGroups } from '../../api/hooks/use-auth';
import { Section, inputStyle } from './ui';

const ROLES: UserRole[] = ['admin', 'contributor', 'viewer'];
const roleColor: Record<string, string> = {
  admin: 'var(--color-accent)', contributor: 'var(--color-success)', viewer: 'var(--color-text-tertiary)',
};

/** User management (admin only): create/remove users, set role, assign to permission groups. */
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
      <Section icon={<ShieldAlert style={{ width: 13, height: 13 }} />} color="var(--color-error)" title="Users">
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Only admins can manage users.</span>
      </Section>
    );
  }

  const canAdd = !!username.trim() && !!password;
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
    <Section icon={<UserPlus style={{ width: 13, height: 13 }} />} color="var(--color-accent)" title="Users">
      {/* Add user */}
      <div className="flex items-center gap-2" style={{ marginBottom: 14 }}>
        <input placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} style={{ ...inputStyle, flex: 1 }} />
        <input placeholder="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canAdd) add(); }} style={{ ...inputStyle, flex: 1 }} />
        <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} style={{ ...inputStyle, width: 'auto', minWidth: 120, cursor: 'pointer' }}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <button type="button" onClick={add} disabled={createUser.isPending || !canAdd} className="flex items-center justify-center gap-1.5"
          style={{ height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)', background: canAdd ? 'var(--color-accent)' : 'var(--color-bg-raised)', color: canAdd ? '#021526' : 'var(--color-text-disabled)', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: canAdd ? 'pointer' : 'default', flexShrink: 0, whiteSpace: 'nowrap' }}>
          <UserPlus style={{ width: 13, height: 13 }} /> Add
        </button>
      </div>
      {error && (
        <div className="flex items-center gap-2" style={{ fontSize: 11.5, color: 'var(--color-error)', fontFamily: 'var(--font-mono)', background: 'var(--color-error-subtle)', border: '1px solid rgba(224,96,96,0.25)', borderRadius: 'var(--radius-sm)', padding: '7px 10px', marginBottom: 10 }}>
          {error}
        </div>
      )}

      {/* List */}
      <div className="flex flex-col" style={{ gap: 8 }}>
        {(users ?? []).map((u) => {
          const isMe = me.data?.id === u.id;
          return (
            <div key={u.id} style={{ padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="flex items-center justify-center shrink-0" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.3)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    {u.username.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate" style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                    {u.username}{isMe && <span style={{ color: 'var(--color-text-disabled)', fontWeight: 400 }}> (you)</span>}
                  </span>
                </div>
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  <select value={u.role} onChange={(e) => updateUser.mutate({ id: u.id, role: e.target.value as UserRole })}
                    disabled={isMe} style={{ ...inputStyle, height: 28, width: 'auto', minWidth: 112, cursor: isMe ? 'default' : 'pointer', fontSize: 11.5, color: roleColor[u.role] }}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button type="button" onClick={() => { if (window.confirm(`Remove user "${u.username}"?`)) deleteUser.mutate(u.id); }} disabled={isMe} title="Remove"
                    className="flex items-center justify-center" style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid transparent', cursor: isMe ? 'default' : 'pointer', color: isMe ? 'var(--color-border-default)' : 'var(--color-text-disabled)' }}
                    onMouseEnter={(e) => { if (!isMe) { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.background = 'var(--color-error-subtle)'; } }}
                    onMouseLeave={(e) => { if (!isMe) { e.currentTarget.style.color = 'var(--color-text-disabled)'; e.currentTarget.style.background = 'none'; } }}>
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              </div>
              {/* Group membership (admins access everything, so skip) */}
              {u.role !== 'admin' && (groups ?? []).length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5" style={{ marginTop: 10 }}>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>groups:</span>
                  {(groups ?? []).map((g) => {
                    const on = u.groupIds.includes(g.id);
                    return (
                      <button key={g.id} type="button"
                        onClick={() => updateUser.mutate({ id: u.id, groupIds: on ? u.groupIds.filter((x) => x !== g.id) : [...u.groupIds, g.id] })}
                        style={{ fontSize: 11, fontFamily: 'var(--font-sans)', padding: '3px 9px', cursor: 'pointer', borderRadius: 'var(--radius-md)', transition: 'all .12s',
                          background: on ? 'var(--color-accent-subtle)' : 'var(--color-bg-surface)',
                          border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                          color: on ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                        {on ? '✓ ' : ''}{g.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
        {(users ?? []).length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', border: '1px dashed var(--color-border-default)', borderRadius: 'var(--radius-md)' }}>No users yet.</div>
        )}
      </div>
      <p style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 12, marginBottom: 0 }}>
        Roles: <b style={{ color: roleColor.admin }}>admin</b> (full access) · <b style={{ color: roleColor.contributor }}>contributor</b> (edits) · <b style={{ color: roleColor.viewer }}>viewer</b> (read-only). Project access comes from the user's groups.
      </p>
    </Section>
  );
}
