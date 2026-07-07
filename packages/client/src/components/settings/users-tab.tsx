import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react';
import { UserPlus, Trash2, ShieldAlert, Eye, EyeOff, Gauge, Building2, Search, Loader2, Check } from 'lucide-react';
import type { UserRole } from '@subagent/shared';
import { useUsers, useUserUsage, useCreateUser, useDeleteUser, useUpdateUser, useMe, useGroups, useAuthMethods, useSearchEntraUsers, useAddEntraUser } from '../../api/hooks/use-auth';
import { useToast } from '../ui/toast';
import { Dialog } from '../ui/dialog';
import { Section, AddButton, inputStyle } from './ui';

const ROLES: UserRole[] = ['admin', 'contributor', 'viewer'];
const fmtTokens = (n: number) => n.toLocaleString('en-US');
const roleColor: Record<string, string> = {
  admin: 'var(--color-accent)', contributor: 'var(--color-success)', viewer: 'var(--color-text-secondary)',
};
const USERNAME_REGEX = /^[a-zA-Z0-9_.-]{3,32}$/;
const MIN_PASSWORD_LENGTH = 8;

/** Segmented source selector inside the add dialog (Static = local password, Entra = directory). */
function SourceTabs({ source, onChange, sources }: {
  source: string;
  onChange: (s: 'local' | 'entra') => void;
  sources: { id: 'local' | 'entra'; label: string; icon: typeof UserPlus }[];
}) {
  return (
    <div role="tablist" aria-label="User source" className="flex" style={{ gap: 4, padding: 3, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
      {sources.map((s) => {
        const active = source === s.id;
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(s.id)}
            className="flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              flex: 1, height: 32, borderRadius: 'var(--radius-sm)', border: 'none', cursor: 'pointer',
              background: active ? 'var(--color-accent-subtle)' : 'transparent',
              color: active ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              fontSize: 12, fontWeight: active ? 600 : 400,
            }}
          >
            <Icon style={{ width: 13, height: 13 }} aria-hidden="true" /> {s.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * "Add user" dialog. Source picker on top (static/local password account, or Entra directory
 * when the provider is enabled), then the per-source form. Entra: search by name/email,
 * pick a hit — the account is created pre-linked to the directory identity and the username
 * derives from the mail local-part.
 */
function AddUserDialog({ open, onClose, entraEnabled, onSaved }: {
  open: boolean;
  onClose: () => void;
  entraEnabled: boolean;
  onSaved: (msg: string) => void;
}) {
  const createUser = useCreateUser();
  const addEntra = useAddEntraUser();
  const [source, setSource] = useState<'local' | 'entra'>(entraEnabled ? 'entra' : 'local');
  const [role, setRole] = useState<UserRole>('contributor');
  const [error, setError] = useState('');
  // local
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  // entra
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const usernameId = useId();
  const passwordId = useId();
  const roleId = useId();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 350);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => {
    if (open) setSource(entraEnabled ? 'entra' : 'local');
  }, [open, entraEnabled]);

  const search = useSearchEntraUsers(source === 'entra' ? debounced : '');
  const results = search.data ?? [];

  const close = () => {
    setUsername(''); setPassword(''); setQuery(''); setDebounced('');
    setRole('contributor'); setError(''); setSubmitted(false);
    onClose();
  };

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

  const addLocal = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitted(true);
    if (!username.trim() || !password || usernameError || passwordError) return;
    createUser.mutate({ username: username.trim(), password, role }, {
      onSuccess: () => { onSaved('User created'); close(); },
      onError: (err) => setError(err instanceof Error ? err.message : 'Failed'),
    });
  };

  const addFromEntra = (u: { id: string; email: string; displayName: string }) => {
    setError('');
    addEntra.mutate({ id: u.id, email: u.email, displayName: u.displayName, role }, {
      onSuccess: (created) => { onSaved(`${created.username} added from Entra ID`); close(); },
      onError: (err) => setError(err instanceof Error ? err.message : 'Add failed'),
    });
  };

  const sources: { id: 'local' | 'entra'; label: string; icon: typeof UserPlus }[] = [
    ...(entraEnabled ? [{ id: 'entra' as const, label: 'Microsoft Entra ID', icon: Building2 }] : []),
    { id: 'local', label: 'Static (password)', icon: UserPlus },
  ];

  const fieldLabel: CSSProperties = {
    fontSize: 10.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.07em',
    textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 6, display: 'block',
  };

  return (
    <Dialog open={open} onClose={close} title="Add user" maxWidth="440px">
      <div className="flex flex-col" style={{ gap: 16 }}>
        {sources.length > 1 && (
          <div>
            <span style={fieldLabel}>Source</span>
            <SourceTabs source={source} onChange={(s) => { setSource(s); setError(''); }} sources={sources} />
          </div>
        )}

        {/* Role applies to whichever source creates the account */}
        <div>
          <label htmlFor={roleId} style={fieldLabel}>Role</label>
          <select id={roleId} value={role} onChange={(e) => setRole(e.target.value as UserRole)} style={{ ...inputStyle, cursor: 'pointer' }}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {source === 'entra' ? (
          <div className="flex flex-col">
            <span style={fieldLabel}>Directory search</span>
            <div className="relative">
              <Search aria-hidden="true" style={{ width: 13, height: 13, position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or email…"
                aria-label="Search Entra directory"
                autoFocus
                style={{ ...inputStyle, paddingLeft: 32 }}
              />
            </div>

            <div style={{ marginTop: 10, minHeight: 40 }}>
              {search.isFetching && (
                <div className="flex items-center gap-2" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                  <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} aria-hidden="true" /> Searching directory…
                </div>
              )}
              {!search.isFetching && debounced.trim().length < 2 && (
                <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>Type at least 2 characters to search your tenant.</div>
              )}
              {!search.isFetching && debounced.trim().length >= 2 && results.length === 0 && !search.isError && (
                <div style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>No directory users match “{debounced}”.</div>
              )}
              {search.isError && (
                <div role="alert" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-error)', background: 'var(--color-error-subtle)', border: '1px solid rgba(224,96,96,0.25)', borderRadius: 'var(--radius-sm)', padding: '8px 10px', lineHeight: 1.5 }}>
                  {search.error instanceof Error ? search.error.message : 'Directory search failed'}
                </div>
              )}

              {results.length > 0 && (
                <ul className="flex flex-col" style={{ gap: 6, listStyle: 'none', padding: 0, margin: 0, maxHeight: 280, overflowY: 'auto' }}>
                  {results.map((u) => (
                    <li key={u.id} className="flex items-center justify-between gap-3" style={{ padding: '9px 11px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-base)' }}>
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span aria-hidden="true" className="flex items-center justify-center shrink-0" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.3)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                          {(u.displayName || u.email).charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <div className="truncate" style={{ fontSize: 12.5, color: 'var(--color-text-primary)', fontWeight: 500 }}>{u.displayName || u.email}</div>
                          <div className="truncate" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                            {u.email} → <b style={{ color: 'var(--color-text-primary)' }}>{u.email.split('@')[0].toLowerCase()}</b>
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={addEntra.isPending}
                        onClick={() => addFromEntra(u)}
                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                        style={{
                          height: 28, padding: '0 14px', borderRadius: 999, flexShrink: 0,
                          cursor: addEntra.isPending ? 'progress' : 'pointer',
                          background: 'var(--color-accent)', border: 'none',
                          color: '#021526', fontSize: 11.5, fontWeight: 600,
                        }}
                      >
                        Add
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={addLocal} className="flex flex-col" style={{ gap: 14 }} autoComplete="off" noValidate>
            <div>
              <label htmlFor={usernameId} style={fieldLabel}>Username</label>
              <input
                id={usernameId}
                placeholder="e.g. jane.doe"
                value={username}
                required
                autoComplete="off"
                autoFocus
                aria-invalid={!!usernameError}
                aria-describedby={usernameError ? `${usernameId}-err` : undefined}
                onChange={(e) => setUsername(e.target.value)}
                style={{ ...inputStyle, borderColor: usernameError ? 'rgba(224,96,96,0.5)' : 'var(--color-border-default)' }}
              />
              {usernameError && (
                <span id={`${usernameId}-err`} role="alert" style={{ fontSize: 11, color: 'var(--color-error)', fontFamily: 'var(--font-mono)', marginTop: 5, display: 'block' }}>{usernameError}</span>
              )}
            </div>
            <div>
              <label htmlFor={passwordId} style={fieldLabel}>Temporary password</label>
              <div style={{ position: 'relative' }}>
                <input
                  id={passwordId}
                  placeholder={`min ${MIN_PASSWORD_LENGTH} characters`}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  aria-invalid={!!passwordError}
                  aria-describedby={passwordError ? `${passwordId}-err` : undefined}
                  onChange={(e) => setPassword(e.target.value)}
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
              <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', marginTop: 5, display: 'block' }}>
                The user sets their own password at first login.
              </span>
              {passwordError && (
                <span id={`${passwordId}-err`} role="alert" style={{ fontSize: 11, color: 'var(--color-error)', fontFamily: 'var(--font-mono)', marginTop: 3, display: 'block' }}>{passwordError}</span>
              )}
            </div>
            <div className="flex justify-end gap-2" style={{ marginTop: 2 }}>
              <button type="button" onClick={close}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{ height: 36, padding: '0 14px', borderRadius: 'var(--radius-md)', background: 'none', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', fontSize: 12.5, cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={createUser.isPending}
                aria-busy={createUser.isPending || undefined}
                className="flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{
                  height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)',
                  background: createUser.isPending ? 'var(--color-bg-raised)' : 'var(--color-accent)',
                  color: createUser.isPending ? 'var(--color-text-disabled)' : '#021526',
                  fontSize: 12.5, fontWeight: 600, border: 'none',
                  cursor: createUser.isPending ? 'progress' : 'pointer',
                }}
              >
                <UserPlus style={{ width: 13, height: 13 }} aria-hidden="true" /> {createUser.isPending ? 'Adding…' : 'Add user'}
              </button>
            </div>
          </form>
        )}

        {error && (
          <div role="alert" className="flex items-center gap-2" style={{ fontSize: 11.5, color: 'var(--color-error)', fontFamily: 'var(--font-mono)', background: 'var(--color-error-subtle)', border: '1px solid rgba(224,96,96,0.25)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
            {error}
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** Edit a single user: role, group membership, token budget, session/2FA actions. */
function EditUserDialog({ user, open, onClose, groups, usage, isMe, onSaved }: {
  user: import('@subagent/shared').User | null;
  open: boolean;
  onClose: () => void;
  groups: import('@subagent/shared').PermissionGroup[];
  usage: { totalTokens: number } | undefined;
  isMe: boolean;
  onSaved: (msg: string) => void;
}) {
  const updateUser = useUpdateUser();
  const { show: showToast } = useToast();
  const [role, setRole] = useState<UserRole>('contributor');
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [quota, setQuota] = useState<string>('');
  const [groupQuery, setGroupQuery] = useState('');

  useEffect(() => {
    if (!open || !user) return;
    setRole(user.role);
    setGroupIds(user.groupIds);
    setQuota(user.tokenQuota != null ? String(user.tokenQuota) : '');
    setGroupQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  if (!user) return null;
  const toggleGroup = (id: string) => setGroupIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const gq = groupQuery.trim().toLowerCase();
  const visibleGroups = gq ? groups.filter((g) => g.name.toLowerCase().includes(gq)) : groups;

  const save = () => {
    const q = quota.trim() === '' ? null : Math.max(0, parseInt(quota, 10) || 0);
    updateUser.mutate(
      { id: user.id, role, groupIds, tokenQuota: q },
      {
        onSuccess: () => { onSaved(`Updated ${user.username}`); onClose(); },
        onError: (err) => showToast(err instanceof Error ? err.message : 'Update failed', { variant: 'error' }),
      },
    );
  };

  const action = (patch: Parameters<typeof updateUser.mutate>[0], msg: string) =>
    updateUser.mutate(patch, {
      onSuccess: () => showToast(msg),
      onError: (err) => showToast(err instanceof Error ? err.message : 'Action failed', { variant: 'error' }),
    });

  return (
    <Dialog open={open} onClose={onClose} title="Edit user" maxWidth="480px">
      <div className="flex flex-col" style={{ gap: 16 }}>
        {/* Identity header — avatar + name + badges */}
        <div className="flex items-center gap-3" style={{ padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
          <span aria-hidden="true" className="flex items-center justify-center shrink-0" style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.35)', color: 'var(--color-accent)', fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            {user.username.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="truncate" style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>{user.username}{isMe && <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}> (you)</span>}</span>
              {(user.identityProviders ?? []).map((p) => (
                <span key={p} style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '1px 5px', borderRadius: 'var(--radius-sm)', background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.3)', color: 'var(--color-accent)' }}>{p}</span>
              ))}
              {user.totpEnabled && <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '1px 5px', borderRadius: 'var(--radius-sm)', background: 'rgba(109,181,138,0.12)', border: '1px solid rgba(109,181,138,0.3)', color: 'var(--color-success)' }}>2FA</span>}
            </div>
            {user.email && <div className="truncate" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{user.email}</div>}
          </div>
        </div>

        <div>
          <label htmlFor="edit-user-role" style={fieldLabelStyle}>Role</label>
          <select id="edit-user-role" value={role} onChange={(e) => setRole(e.target.value as UserRole)} disabled={isMe} title={isMe ? "You can't change your own role" : undefined}
            style={{ ...inputStyle, cursor: isMe ? 'not-allowed' : 'pointer' }}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {role !== 'admin' && groups.length > 0 && (
          <div>
            <label style={fieldLabelStyle}>Groups ({groupIds.length}/{groups.length})</label>
            {groups.length > 6 && (
              <div className="relative" style={{ marginBottom: 8 }}>
                <Search aria-hidden="true" style={{ width: 13, height: 13, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
                <input value={groupQuery} onChange={(e) => setGroupQuery(e.target.value)} placeholder="Search groups…" style={{ ...inputStyle, height: 32, paddingLeft: 30 }} />
              </div>
            )}
            <div className="flex flex-wrap gap-1.5" style={{ maxHeight: 150, overflowY: 'auto' }}>
              {visibleGroups.map((g) => {
                const on = groupIds.includes(g.id);
                return (
                  <button key={g.id} type="button" onClick={() => toggleGroup(g.id)} aria-pressed={on}
                    className="flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                    style={{ fontSize: 11, fontFamily: 'var(--font-sans)', padding: '4px 9px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                      background: on ? 'var(--color-accent-subtle)' : 'var(--color-bg-surface)',
                      border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                      color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)' }}>
                    {on && <Check style={{ width: 11, height: 11 }} />}{g.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {role !== 'admin' && (
          <div>
            <label htmlFor="edit-user-quota" className="flex items-center gap-1.5" style={fieldLabelStyle}>
              <Gauge style={{ width: 11, height: 11 }} aria-hidden="true" /> Token budget / month
            </label>
            <div className="flex items-center gap-2">
              <input id="edit-user-quota" type="number" min={0} step={1000} value={quota} onChange={(e) => setQuota(e.target.value)} placeholder="unlimited"
                style={{ ...inputStyle, width: 180 }} />
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
                {fmtTokens(usage?.totalTokens ?? 0)} used this month
              </span>
            </div>
          </div>
        )}

        {!isMe && (
          <div style={{ paddingTop: 12, borderTop: '1px solid var(--color-border-subtle)' }}>
            <span style={fieldLabelStyle}>Security actions</span>
            <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => action({ id: user.id, revokeSessions: true }, `Sessions revoked for ${user.username}`)}
              style={{ height: 30, padding: '0 11px', borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
              Revoke sessions
            </button>
            {user.totpEnabled && (
              <button type="button" onClick={() => action({ id: user.id, resetMfa: true }, `2FA reset for ${user.username}`)}
                style={{ height: 30, padding: '0 11px', borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
                Reset 2FA
              </button>
            )}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2" style={{ marginTop: 2 }}>
          <button type="button" onClick={onClose} style={{ height: 36, padding: '0 14px', borderRadius: 'var(--radius-md)', background: 'none', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={save} disabled={updateUser.isPending}
            style={{ height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-accent)', color: '#021526', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
            {updateUser.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}

const fieldLabelStyle: CSSProperties = {
  fontSize: 10.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 6, display: 'block',
};

/** User management (admin only): create/remove users, set role, assign to permission groups. */
export function UsersTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const me = useMe();
  const methods = useAuthMethods();
  const { data: users } = useUsers();
  const { data: groups } = useGroups();
  const { data: userUsage } = useUserUsage();
  const deleteUser = useDeleteUser();
  const { show: showToast } = useToast();

  const usageByUser = useMemo(() => new Map((userUsage ?? []).map((u) => [u.userId, u])), [userUsage]);

  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<import('@subagent/shared').User | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; username: string } | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const entraEnabled = (methods.data?.providers ?? []).some((p) => p.id === 'entra');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users ?? []).filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (q && !u.username.toLowerCase().includes(q) && !(u.email ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [users, query, roleFilter]);

  if (me.data && me.data.role !== 'admin') {
    return (
      <Section icon={<ShieldAlert style={{ width: 13, height: 13 }} aria-hidden="true" />} color="var(--color-error)" title="Users">
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>Only admins can manage users.</span>
      </Section>
    );
  }

  const groupNamesFor = (u: import('@subagent/shared').User) =>
    (groups ?? []).filter((g) => u.groupIds.includes(g.id)).map((g) => g.name);

  return (
    <Section
      icon={<UserPlus style={{ width: 13, height: 13 }} aria-hidden="true" />}
      color="var(--color-accent)"
      title="Users"
      action={<AddButton label="Add user" onClick={() => setAddOpen(true)} icon={<UserPlus style={{ width: 12, height: 12 }} aria-hidden="true" />} />}
    >
      <AddUserDialog open={addOpen} onClose={() => setAddOpen(false)} entraEnabled={entraEnabled} onSaved={onSaved} />
      <EditUserDialog
        user={editUser}
        open={!!editUser}
        onClose={() => setEditUser(null)}
        groups={groups ?? []}
        usage={editUser ? usageByUser.get(editUser.id) : undefined}
        isMe={me.data?.id === editUser?.id}
        onSaved={onSaved}
      />

      {/* Search + role filter */}
      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 12 }}>
        <div className="relative" style={{ flex: 1, minWidth: 180 }}>
          <Search aria-hidden="true" style={{ width: 13, height: 13, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search users by name or email…" aria-label="Search users" style={{ ...inputStyle, height: 34, paddingLeft: 30 }} />
        </div>
        <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)} aria-label="Filter by role"
          style={{ ...inputStyle, height: 34, width: 'auto', minWidth: 130, cursor: 'pointer' }}>
          <option value="all">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* List */}
      <div className="flex flex-col" style={{ gap: 8 }}>
        {filtered.map((u) => {
          const isMe = me.data?.id === u.id;
          const groupNames = groupNamesFor(u);
          return (
            <div key={u.id} className="flex items-center justify-between gap-3" style={{ padding: '10px 12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div className="flex items-center gap-2.5 min-w-0">
                <span aria-hidden="true" className="flex items-center justify-center shrink-0" style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.3)', color: 'var(--color-accent)', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                  {u.username.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate" style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                      {u.username}{isMe && <span style={{ color: 'var(--color-text-secondary)', fontWeight: 400 }}> (you)</span>}
                    </span>
                    {u.status === 'pending' && <span title="Awaiting email confirmation" style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '1px 5px', borderRadius: 'var(--radius-sm)', flexShrink: 0, background: 'var(--color-warning-subtle)', border: '1px solid rgba(226,176,74,0.35)', color: 'var(--color-warning)' }}>pending</span>}
                    {(u.identityProviders ?? []).map((p) => (
                      <span key={p} title={`Signs in via ${p === 'entra' ? 'Microsoft Entra ID' : p === 'github' ? 'GitHub' : 'SSO (OIDC)'}`} style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '1px 5px', borderRadius: 'var(--radius-sm)', flexShrink: 0, background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.3)', color: 'var(--color-accent)' }}>{p}</span>
                    ))}
                    {u.totpEnabled && <span title="Two-factor enabled" style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase', padding: '1px 5px', borderRadius: 'var(--radius-sm)', flexShrink: 0, background: 'rgba(109,181,138,0.12)', border: '1px solid rgba(109,181,138,0.3)', color: 'var(--color-success)' }}>2FA</span>}
                  </div>
                  <div className="truncate" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                    <span style={{ color: roleColor[u.role] }}>{u.role}</span>
                    {groupNames.length > 0 && ` · ${groupNames.join(', ')}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => setEditUser(u)}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                  style={{ height: 30, padding: '0 12px', borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11.5, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete({ id: u.id, username: u.username })}
                  disabled={isMe}
                  aria-label={isMe ? "You can't remove yourself" : `Remove user ${u.username}`}
                  title={isMe ? "You can't remove yourself" : 'Remove'}
                  className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                  style={{ width: 30, height: 30, borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid var(--color-border-subtle)', cursor: isMe ? 'not-allowed' : 'pointer', color: isMe ? 'var(--color-border-default)' : 'var(--color-text-secondary)' }}
                  onMouseEnter={(e) => { if (!isMe) { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.background = 'var(--color-error-subtle)'; } }}
                  onMouseLeave={(e) => { if (!isMe) { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'none'; } }}
                >
                  <Trash2 style={{ width: 13, height: 13 }} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', border: '1px dashed var(--color-border-default)', borderRadius: 'var(--radius-md)' }}>
            {(users ?? []).length === 0 ? 'No users yet.' : 'No users match the filters.'}
          </div>
        )}
      </div>

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
