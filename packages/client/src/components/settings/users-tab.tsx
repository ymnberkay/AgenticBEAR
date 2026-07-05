import { useId, useMemo, useState } from 'react';
import { UserPlus, Trash2, ShieldAlert, Eye, EyeOff, Gauge } from 'lucide-react';
import type { UserRole } from '@subagent/shared';
import { useUsers, useUserUsage, useCreateUser, useDeleteUser, useUpdateUser, useMe, useGroups } from '../../api/hooks/use-auth';
import { useToast } from '../ui/toast';
import { Dialog } from '../ui/dialog';
import { Section, inputStyle } from './ui';

const ROLES: UserRole[] = ['admin', 'contributor', 'viewer'];
const fmtTokens = (n: number) => n.toLocaleString('en-US');
const roleColor: Record<string, string> = {
  admin: 'var(--color-accent)', contributor: 'var(--color-success)', viewer: 'var(--color-text-secondary)',
};
const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;

/** User management (admin only): create/remove users, set role, assign to permission groups. */
export function UsersTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const me = useMe();
  const { data: users } = useUsers();
  const { data: groups } = useGroups();
  const { data: userUsage } = useUserUsage();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();
  const updateUser = useUpdateUser();
  const { show: showToast } = useToast();

  const usageByUser = useMemo(() => new Map((userUsage ?? []).map((u) => [u.userId, u])), [userUsage]);

  const usernameId = useId();
  const passwordId = useId();
  const roleId = useId();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('contributor');
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; username: string } | null>(null);

  if (me.data && me.data.role !== 'admin') {
    return (
      <Section icon={<ShieldAlert style={{ width: 13, height: 13 }} aria-hidden="true" />} color="var(--color-error)" title="Users">
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>Only admins can manage users.</span>
      </Section>
    );
  }

  const usernameError = useMemo(() => {
    if (!username.trim()) return submitted ? 'Username is required.' : '';
    if (!USERNAME_REGEX.test(username.trim())) return '3–32 chars: a–z, 0–9, underscore, dot, hyphen — no spaces or accented letters (ç, ğ, ı, ş…).';
    return '';
  }, [username, submitted]);

  const passwordError = useMemo(() => {
    if (!password) return submitted ? 'Password is required.' : '';
    if (password.length < MIN_PASSWORD_LENGTH) return `At least ${MIN_PASSWORD_LENGTH} characters.`;
    return '';
  }, [password, submitted]);

  const canAdd = !!username.trim() && !!password && !usernameError && !passwordError;

  const add = () => {
    setError('');
    setSubmitted(true);
    if (!canAdd) return;
    createUser.mutate(
      { username: username.trim(), password, role },
      {
        onSuccess: () => {
          setUsername(''); setPassword(''); setRole('contributor'); setSubmitted(false);
          onSaved('User created');
        },
        onError: (e) => {
          const msg = e instanceof Error ? e.message : 'Failed';
          setError(msg);
          showToast(msg, { variant: 'error' });
        },
      },
    );
  };

  return (
    <Section icon={<UserPlus style={{ width: 13, height: 13 }} aria-hidden="true" />} color="var(--color-accent)" title="Users">
      {/* Add user */}
      <form
        onSubmit={(e) => { e.preventDefault(); add(); }}
        className="flex flex-col gap-2"
        style={{ marginBottom: 14 }}
        autoComplete="off"
        noValidate
      >
        <div className="flex items-start gap-2">
          <div className="flex flex-col gap-1" style={{ flex: 1 }}>
            <label htmlFor={usernameId} className="sr-only">Username</label>
            <input
              id={usernameId}
              placeholder="username"
              value={username}
              required
              autoComplete="off"
              aria-invalid={!!usernameError}
              aria-describedby={usernameError ? `${usernameId}-err` : undefined}
              onChange={(e) => setUsername(e.target.value)}
              style={{ ...inputStyle, borderColor: usernameError ? 'rgba(224,96,96,0.5)' : 'var(--color-border-default)' }}
            />
            {usernameError && (
              <span id={`${usernameId}-err`} role="alert" style={{ fontSize: 11.5, color: 'var(--color-error)', fontFamily: 'var(--font-mono)' }}>
                {usernameError}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1" style={{ flex: 1, position: 'relative' }}>
            <label htmlFor={passwordId} className="sr-only">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id={passwordId}
                placeholder="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                aria-invalid={!!passwordError}
                aria-describedby={passwordError ? `${passwordId}-err` : undefined}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                style={{ ...inputStyle, paddingRight: 40, borderColor: passwordError ? 'rgba(224,96,96,0.5)' : 'var(--color-border-default)' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 6, display: 'flex', borderRadius: 4 }}
              >
                {showPassword ? <EyeOff style={{ width: 14, height: 14 }} aria-hidden="true" /> : <Eye style={{ width: 14, height: 14 }} aria-hidden="true" />}
              </button>
            </div>
            {passwordError && (
              <span id={`${passwordId}-err`} role="alert" style={{ fontSize: 11.5, color: 'var(--color-error)', fontFamily: 'var(--font-mono)' }}>
                {passwordError}
              </span>
            )}
          </div>

          <label htmlFor={roleId} className="sr-only">Role</label>
          <select id={roleId} value={role} onChange={(e) => setRole(e.target.value as UserRole)} style={{ ...inputStyle, width: 'auto', minWidth: 120, cursor: 'pointer' }}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>

          <button
            type="submit"
            disabled={createUser.isPending}
            aria-busy={createUser.isPending || undefined}
            className="flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              height: 38, padding: '0 16px', borderRadius: 'var(--radius-md)',
              background: createUser.isPending ? 'var(--color-bg-raised)' : 'var(--color-accent)',
              color: createUser.isPending ? 'var(--color-text-disabled)' : '#021526',
              fontSize: 12.5, fontWeight: 600, border: 'none',
              cursor: createUser.isPending ? 'progress' : 'pointer',
              flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            <UserPlus style={{ width: 13, height: 13 }} aria-hidden="true" /> {createUser.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
          username: 3–32 chars, a–z 0–9 _ . - only · password: min {MIN_PASSWORD_LENGTH} chars
        </span>
      </form>

      {error && (
        <div role="alert" className="flex items-center gap-2" style={{ fontSize: 11.5, color: 'var(--color-error)', fontFamily: 'var(--font-mono)', background: 'var(--color-error-subtle)', border: '1px solid rgba(224,96,96,0.25)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', marginBottom: 10 }}>
          {error}
        </div>
      )}

      {/* List */}
      <div className="flex flex-col" style={{ gap: 8 }}>
        {(users ?? []).map((u) => {
          const isMe = me.data?.id === u.id;
          return (
            <div key={u.id} style={{ padding: '12px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span aria-hidden="true" className="flex items-center justify-center shrink-0" style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.3)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                    {u.username.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate" style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                    {u.username}{isMe && <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}> (you)</span>}
                  </span>
                </div>
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  <label className="sr-only" htmlFor={`user-${u.id}-role`}>Role for {u.username}</label>
                  <select
                    id={`user-${u.id}-role`}
                    value={u.role}
                    onChange={(e) => updateUser.mutate(
                      { id: u.id, role: e.target.value as UserRole },
                      { onError: (err) => showToast(err instanceof Error ? err.message : 'Update failed', { variant: 'error' }) },
                    )}
                    disabled={isMe}
                    title={isMe ? "You can't change your own role" : undefined}
                    style={{ ...inputStyle, height: 30, width: 'auto', minWidth: 112, cursor: isMe ? 'not-allowed' : 'pointer', fontSize: 11.5, color: roleColor[u.role] }}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete({ id: u.id, username: u.username })}
                    disabled={isMe}
                    aria-label={isMe ? "You can't remove yourself" : `Remove user ${u.username}`}
                    title={isMe ? "You can't remove yourself" : 'Remove'}
                    className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                    style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid transparent', cursor: isMe ? 'not-allowed' : 'pointer', color: isMe ? 'var(--color-border-default)' : 'var(--color-text-secondary)' }}
                    onMouseEnter={(e) => { if (!isMe) { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.background = 'var(--color-error-subtle)'; } }}
                    onMouseLeave={(e) => { if (!isMe) { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'none'; } }}
                  >
                    <Trash2 style={{ width: 13, height: 13 }} aria-hidden="true" />
                  </button>
                </div>
              </div>
              {u.role !== 'admin' && (groups ?? []).length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5" style={{ marginTop: 10 }}>
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>groups:</span>
                  {(groups ?? []).map((g) => {
                    const on = u.groupIds.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => updateUser.mutate(
                          { id: u.id, groupIds: on ? u.groupIds.filter((x) => x !== g.id) : [...u.groupIds, g.id] },
                          { onError: (err) => showToast(err instanceof Error ? err.message : 'Update failed', { variant: 'error' }) },
                        )}
                        aria-pressed={on}
                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                        style={{
                          fontSize: 11, fontFamily: 'var(--font-sans)',
                          padding: '4px 9px', cursor: 'pointer', borderRadius: 'var(--radius-md)', transition: 'all .12s',
                          background: on ? 'var(--color-accent-subtle)' : 'var(--color-bg-surface)',
                          border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                          color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                          minHeight: 26,
                        }}
                      >
                        {on ? '✓ ' : ''}{g.name}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Personal monthly token budget (admins are exempt) */}
              {u.role !== 'admin' && (() => {
                const usage = usageByUser.get(u.id);
                const used = usage?.totalTokens ?? 0;
                const quota = u.tokenQuota ?? null;
                const pct = quota && quota > 0 ? Math.min(100, (used / quota) * 100) : 0;
                const over = quota != null && used >= quota;
                return (
                  <div style={{ marginTop: 10 }}>
                    <div className="flex items-center gap-2" style={{ marginBottom: 6 }}>
                      <span className="flex items-center gap-1.5" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', flexShrink: 0 }}>
                        <Gauge style={{ width: 11, height: 11 }} aria-hidden="true" /> Token budget / month
                      </span>
                      <input
                        type="number" min={0} step={1000}
                        defaultValue={u.tokenQuota ?? ''}
                        placeholder="unlimited"
                        key={u.tokenQuota ?? 'unlimited'}
                        aria-label={`Monthly token budget for ${u.username}`}
                        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                        onBlur={(e) => {
                          const raw = e.target.value.trim();
                          const v = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
                          if ((v ?? null) !== (u.tokenQuota ?? null)) {
                            updateUser.mutate(
                              { id: u.id, tokenQuota: v },
                              { onError: (err) => showToast(err instanceof Error ? err.message : 'Update failed', { variant: 'error' }) },
                            );
                          }
                        }}
                        style={{ ...inputStyle, height: 28, width: 150, fontSize: 11.5 }}
                        title="Personal monthly token budget for this user. Blank = unlimited. Enforced on top of any group quota."
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
            </div>
          );
        })}
        {(users ?? []).length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', border: '1px dashed var(--color-border-default)', borderRadius: 'var(--radius-md)' }}>
            No users yet.
          </div>
        )}
      </div>
      <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginTop: 12, marginBottom: 0 }}>
        Roles: <b style={{ color: roleColor.admin }}>admin</b> (full access) · <b style={{ color: roleColor.contributor }}>contributor</b> (edits) · <b style={{ color: roleColor.viewer }}>viewer</b> (read-only). Project access comes from the user's groups.
      </p>

      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Remove user"
        description={confirmDelete ? `Permanently remove "${confirmDelete.username}". They will lose access immediately.` : undefined}
        maxWidth="420px"
      >
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(null)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirmDelete) return;
              const target = confirmDelete;
              setConfirmDelete(null);
              deleteUser.mutate(target.id, {
                onSuccess: () => showToast(`Removed "${target.username}"`, { variant: 'success' }),
                onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to remove', { variant: 'error' }),
              });
            }}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: '#e06060', color: '#021526', border: 'none', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Remove user
          </button>
        </div>
      </Dialog>
    </Section>
  );
}
