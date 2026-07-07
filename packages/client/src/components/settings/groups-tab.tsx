import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Users2, Trash2, ShieldAlert, FolderGit2, Check, Gauge, Search } from 'lucide-react';
import type { CustomRole, PermissionGroup, User } from '@subagent/shared';
import { useGroups, useGroupUsage, useCreateGroup, useUpdateGroup, useDeleteGroup, useMe, useUsers, useUpdateUser, useRoles } from '../../api/hooks/use-auth';
import { useProjects } from '../../api/hooks/use-projects';
import { useToast } from '../ui/toast';
import { Dialog } from '../ui/dialog';
import { Section, AddButton, inputStyle } from './ui';

const ROLES = ['admin', 'contributor', 'viewer'] as const;
const roleColor: Record<string, string> = {
  admin: 'var(--color-accent)', contributor: 'var(--color-success)', viewer: 'var(--color-text-tertiary)',
};
const fmtTokens = (n: number) => n.toLocaleString('en-US');

const fieldLabel: CSSProperties = {
  fontSize: 10.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 6, display: 'block',
};

/** Built-in + custom role <option>s for a group's role select. */
function RoleOptions({ roles }: { roles: CustomRole[] }) {
  return (
    <>
      <optgroup label="Built-in">
        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
      </optgroup>
      {roles.length > 0 && (
        <optgroup label="Custom">
          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </optgroup>
      )}
    </>
  );
}

/** Searchable multi-select rendered as toggle chips. Shows a search box past 6 items. */
function ChipMultiSelect({ label, items, selected, onToggle, onSetAll, searchPlaceholder }: {
  label: string;
  items: { id: string; name: string }[];
  selected: string[];
  onToggle: (id: string) => void;
  onSetAll: (ids: string[]) => void;
  searchPlaceholder: string;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const visible = useMemo(() => (q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items), [items, q]);
  const allOn = items.length > 0 && selected.length === items.length;

  return (
    <div>
      <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
        <span style={fieldLabel}>{label} ({selected.length}/{items.length})</span>
        {items.length > 0 && (
          <button type="button" onClick={() => onSetAll(allOn ? [] : items.map((i) => i.id))}
            style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '2px 8px', borderRadius: 999, background: allOn ? 'var(--color-accent-subtle)' : 'transparent', border: `1px solid ${allOn ? 'var(--color-accent)' : 'var(--color-border-default)'}`, color: allOn ? 'var(--color-accent)' : 'var(--color-text-secondary)', cursor: 'pointer' }}>
            {allOn ? '✓ All' : 'All'}
          </button>
        )}
      </div>
      {items.length === 0 ? (
        <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>None available.</span>
      ) : (
        <>
          {items.length > 6 && (
            <div className="relative" style={{ marginBottom: 8 }}>
              <Search aria-hidden="true" style={{ width: 13, height: 13, position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} style={{ ...inputStyle, height: 32, paddingLeft: 30 }} />
            </div>
          )}
          <div className="flex flex-wrap gap-1.5" style={{ maxHeight: 170, overflowY: 'auto' }}>
            {visible.map((i) => {
              const on = selected.includes(i.id);
              return (
                <button key={i.id} type="button" onClick={() => onToggle(i.id)} aria-pressed={on}
                  className="flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                  style={{ fontSize: 11, fontFamily: 'var(--font-sans)', padding: '4px 9px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    background: on ? 'var(--color-accent-subtle)' : 'var(--color-bg-surface)',
                    border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                    color: on ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}>
                  {on && <Check style={{ width: 11, height: 11 }} />}{i.name}
                </button>
              );
            })}
            {visible.length === 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No matches.</span>}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Create or edit a permission group: name, role (built-in/custom), monthly quota, project access,
 * and direct member assignment — all in one dialog. On save it writes the group and reconciles
 * each user's membership (add/remove this group from their groupIds).
 */
function GroupDialog({ open, onClose, onSaved, editing, roles, projects, users }: {
  open: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
  editing: PermissionGroup | null;
  roles: CustomRole[];
  projects: { id: string; name: string }[];
  users: User[];
}) {
  const createGroup = useCreateGroup();
  const updateGroup = useUpdateGroup();
  const updateUser = useUpdateUser();
  const { show: showToast } = useToast();

  const [name, setName] = useState('');
  const [role, setRole] = useState('contributor');
  const [quota, setQuota] = useState('');
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setRole(editing?.role ?? 'contributor');
    setQuota(editing?.tokenQuota != null ? String(editing.tokenQuota) : '');
    setProjectIds(editing?.projectIds ?? []);
    setMemberIds(editing ? users.filter((u) => u.groupIds.includes(editing.id)).map((u) => u.id) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const close = () => onClose();
  // Non-admin users can be assigned (admins already access everything).
  const assignable = users.filter((u) => u.role !== 'admin');

  /** Add/remove this group from each user whose membership changed. */
  const reconcileMembers = (groupId: string) => {
    const before = new Set(users.filter((u) => u.groupIds.includes(groupId)).map((u) => u.id));
    const after = new Set(memberIds);
    const changed = users.filter((u) => before.has(u.id) !== after.has(u.id));
    for (const u of changed) {
      const nextGroups = after.has(u.id) ? [...u.groupIds, groupId] : u.groupIds.filter((x) => x !== groupId);
      updateUser.mutate({ id: u.id, groupIds: nextGroups },
        { onError: (err) => showToast(err instanceof Error ? err.message : `Failed to update ${u.username}`, { variant: 'error' }) });
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const tokenQuota = quota.trim() === '' ? null : Math.max(0, parseInt(quota, 10) || 0);
    const payload = { name: name.trim(), role, projectIds, tokenQuota };
    const opts = {
      onSuccess: (g: PermissionGroup) => { reconcileMembers(g.id); onSaved(editing ? 'Group updated' : 'Group created'); close(); },
      onError: (err: unknown) => showToast(err instanceof Error ? err.message : 'Save failed', { variant: 'error' }),
    };
    if (editing) updateGroup.mutate({ id: editing.id, ...payload }, opts);
    else createGroup.mutate(payload, opts);
  };

  const pending = createGroup.isPending || updateGroup.isPending;
  return (
    <Dialog open={open} onClose={close} title={editing ? `Edit · ${editing.name}` : 'Add permission group'} maxWidth="480px">
      <form onSubmit={submit} className="flex flex-col" style={{ gap: 16 }}>
        <div className="flex flex-col sm:flex-row" style={{ gap: 14 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor="grp-name" style={fieldLabel}>Group name</label>
            <input id="grp-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Frontend Team" autoFocus style={inputStyle} />
          </div>
          <div style={{ flex: '0 0 150px' }}>
            <label htmlFor="grp-role" style={fieldLabel}>Role</label>
            <select id="grp-role" value={role} onChange={(e) => setRole(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              <RoleOptions roles={roles} />
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="grp-quota" className="flex items-center gap-1.5" style={fieldLabel}>
            <Gauge style={{ width: 11, height: 11 }} aria-hidden="true" /> Token quota / month (shared)
          </label>
          <input id="grp-quota" type="number" min={0} step={1000} value={quota} onChange={(e) => setQuota(e.target.value)} placeholder="unlimited" style={{ ...inputStyle, width: 200 }} />
        </div>

        <ChipMultiSelect label="Project access" items={projects} selected={projectIds}
          onToggle={(id) => setProjectIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))}
          onSetAll={setProjectIds} searchPlaceholder="Search projects…" />

        <ChipMultiSelect label="Members" items={assignable.map((u) => ({ id: u.id, name: u.username }))} selected={memberIds}
          onToggle={(id) => setMemberIds((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]))}
          onSetAll={setMemberIds} searchPlaceholder="Search users…" />

        <div className="flex justify-end gap-2" style={{ marginTop: 2 }}>
          <button type="button" onClick={close} style={{ height: 36, padding: '0 14px', borderRadius: 'var(--radius-md)', background: 'none', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
          <button type="submit" disabled={!name.trim() || pending}
            style={{ height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)', background: name.trim() ? 'var(--color-accent)' : 'var(--color-bg-raised)', color: name.trim() ? '#021526' : 'var(--color-text-disabled)', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: name.trim() ? 'pointer' : 'default' }}>
            {pending ? 'Saving…' : editing ? 'Save changes' : 'Create group'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Permission groups: each grants a role + project access + shared quota; users belong to groups. */
export function GroupsTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const me = useMe();
  const { data: groups } = useGroups();
  const { data: groupUsage } = useGroupUsage();
  const { data: users } = useUsers();
  const { data: projects } = useProjects();
  const { data: roles } = useRoles();
  const deleteGroup = useDeleteGroup();
  const { show: showToast } = useToast();
  const usageByGroup = new Map((groupUsage ?? []).map((u) => [u.groupId, u]));
  const customRoles = roles ?? [];
  const roleName = (ref: string) => customRoles.find((r) => r.id === ref)?.name ?? ref;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PermissionGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string; memberCount: number } | null>(null);

  if (me.data && me.data.role !== 'admin') {
    return (
      <Section icon={<ShieldAlert style={{ width: 13, height: 13 }} />} color="var(--color-error)" title="Groups">
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Only admins can manage permission groups.</span>
      </Section>
    );
  }

  const allProjects = projects ?? [];
  const membersOf = (gid: string) => (users ?? []).filter((u) => u.groupIds.includes(gid));

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (g: PermissionGroup) => { setEditing(g); setDialogOpen(true); };

  return (
    <Section
      icon={<Users2 style={{ width: 13, height: 13 }} />}
      color="var(--color-agent-documentation)"
      title="Permission Groups"
      action={<AddButton label="Add group" onClick={openCreate} />}
    >
      <GroupDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onSaved={onSaved} editing={editing} roles={customRoles} projects={allProjects} users={users ?? []} />

      <div className="flex flex-col" style={{ gap: 8 }}>
        {(groups ?? []).map((g) => {
          const members = membersOf(g.id);
          const usage = usageByGroup.get(g.id);
          const used = usage?.totalTokens ?? 0;
          const quota = g.tokenQuota ?? null;
          return (
            <div key={g.id} className="flex items-center justify-between gap-3" style={{ padding: '12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <button type="button" onClick={() => openEdit(g)} className="flex items-center gap-2.5 min-w-0 focus-visible:outline-none" style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, flex: 1 }}>
                <span className="flex items-center justify-center shrink-0" style={{ width: 32, height: 32, borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.3)', color: roleColor[g.role] ?? 'var(--color-accent)' }}>
                  <Users2 style={{ width: 15, height: 15 }} />
                </span>
                <div className="min-w-0">
                  <div className="truncate" style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text-primary)' }}>{g.name}</div>
                  <div className="truncate flex items-center gap-2" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                    <span style={{ color: roleColor[g.role] ?? 'var(--color-accent)' }}>{roleName(g.role)}</span>
                    <span className="flex items-center gap-1"><Users2 style={{ width: 10, height: 10 }} /> {members.length}</span>
                    <span className="flex items-center gap-1"><FolderGit2 style={{ width: 10, height: 10 }} /> {g.projectIds.length}/{allProjects.length}</span>
                    <span className="flex items-center gap-1"><Gauge style={{ width: 10, height: 10 }} /> {quota ? `${fmtTokens(used)}/${fmtTokens(quota)}` : '∞'}</span>
                  </div>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => openEdit(g)}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                  style={{ height: 30, padding: '0 12px', borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11.5, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ id: g.id, name: g.name, memberCount: members.length })}
                  aria-label={`Delete group ${g.name}`}
                  title="Delete group"
                  className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                  style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid transparent', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.background = 'var(--color-error-subtle)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'none'; }}
                >
                  <Trash2 style={{ width: 13, height: 13 }} aria-hidden="true" />
                </button>
              </div>
            </div>
          );
        })}
        {(groups ?? []).length === 0 && (
          <div style={{ padding: '28px', textAlign: 'center', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', border: '1px dashed var(--color-border-default)', borderRadius: 'var(--radius-md)' }}>
            No groups yet — use “Add group” above.
          </div>
        )}
      </div>

      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete permission group"
        description={
          deleteTarget
            ? deleteTarget.memberCount > 0
              ? `${deleteTarget.memberCount} member${deleteTarget.memberCount === 1 ? '' : 's'} will lose project access tied to this group.`
              : 'This group will be permanently removed.'
            : undefined
        }
        maxWidth="440px"
      >
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!deleteTarget) return;
              const target = deleteTarget;
              setDeleteTarget(null);
              deleteGroup.mutate(target.id, {
                onSuccess: () => showToast(`Deleted "${target.name}"`, { variant: 'success' }),
                onError: (err) => showToast(err instanceof Error ? err.message : 'Delete failed', { variant: 'error' }),
              });
            }}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: '#e06060', color: '#021526', border: 'none', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Delete group
          </button>
        </div>
      </Dialog>
    </Section>
  );
}
