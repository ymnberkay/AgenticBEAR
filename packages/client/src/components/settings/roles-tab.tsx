import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { KeyRound, Trash2, ShieldAlert, Check, Users2 } from 'lucide-react';
import type { Capability, CustomRole } from '@subagent/shared';
import { CAPABILITY_CATALOG, BUILTIN_ROLE_CAPS } from '@subagent/shared';
import { useRoles, useCreateRole, useUpdateRole, useDeleteRole, useMe, useGroups } from '../../api/hooks/use-auth';
import { useToast } from '../ui/toast';
import { Dialog } from '../ui/dialog';
import { Section, AddButton, inputStyle } from './ui';

const fieldLabel: CSSProperties = {
  fontSize: 10.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.07em',
  textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 6, display: 'block',
};

/** Capabilities grouped by their catalog area (stable order). */
const AREAS = CAPABILITY_CATALOG.reduce<{ area: string; caps: typeof CAPABILITY_CATALOG }[]>((acc, cap) => {
  const bucket = acc.find((a) => a.area === cap.area);
  if (bucket) bucket.caps.push(cap);
  else acc.push({ area: cap.area, caps: [cap] });
  return acc;
}, []);

/**
 * Grouped capability checkboxes in a responsive multi-column grid. Each area header carries a
 * "Select all" toggle that grants every capability in that area (the `admin.full` override is
 * excluded — it's a standalone switch that already implies everything and disables the rest).
 */
function CapabilityPicker({ selected, onToggle, onSetMany }: {
  selected: Set<Capability>;
  onToggle: (c: Capability) => void;
  onSetMany: (caps: Capability[], on: boolean) => void;
}) {
  const fullAdmin = selected.has('admin.full');
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 14, alignItems: 'start' }}>
      {AREAS.map(({ area, caps }) => {
        const grantable = caps.filter((c) => c.key !== 'admin.full').map((c) => c.key);
        const allOn = grantable.length > 0 && grantable.every((k) => selected.has(k));
        return (
          <div key={area} style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 10, background: 'var(--color-bg-base)' }}>
            <div className="flex items-center justify-between" style={{ marginBottom: 8, gap: 8 }}>
              <span style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{area}</span>
              <button
                type="button"
                disabled={fullAdmin || grantable.length === 0}
                onClick={() => onSetMany(grantable, !allOn)}
                title={allOn ? 'Clear all in this area' : 'Grant all in this area'}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{
                  fontSize: 9.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', textTransform: 'uppercase',
                  padding: '2px 8px', borderRadius: 999, cursor: fullAdmin ? 'not-allowed' : 'pointer',
                  background: allOn ? 'var(--color-accent-subtle)' : 'transparent',
                  border: `1px solid ${allOn ? 'var(--color-accent)' : 'var(--color-border-default)'}`,
                  color: allOn ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                  opacity: fullAdmin ? 0.4 : 1,
                }}
              >
                {allOn ? '✓ All' : 'All'}
              </button>
            </div>
            <div className="flex flex-col" style={{ gap: 4 }}>
              {caps.map((cap) => {
                const on = selected.has(cap.key);
                const disabled = fullAdmin && cap.key !== 'admin.full';
                return (
                  <button
                    key={cap.key}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    disabled={disabled}
                    onClick={() => onToggle(cap.key)}
                    className="flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                    style={{
                      padding: '7px 10px', borderRadius: 'var(--radius-sm)', textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
                      background: on ? 'var(--color-accent-subtle)' : 'transparent',
                      border: `1px solid ${on ? 'rgba(124,140,248,0.35)' : 'var(--color-border-subtle)'}`,
                      opacity: disabled ? 0.4 : 1,
                    }}
                  >
                    <span aria-hidden="true" className="flex items-center justify-center" style={{
                      width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                      background: on ? 'var(--color-accent)' : 'transparent',
                      border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border-default)'}`,
                    }}>
                      {on && <Check style={{ width: 11, height: 11, color: '#021526' }} />}
                    </span>
                    <span style={{ fontSize: 12.5, lineHeight: 1.3, color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
                      {cap.label}
                      {cap.key === 'admin.full' && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)', display: 'block' }}>overrides all</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Create / edit a custom role (name + capabilities). */
function RoleDialog({ open, onClose, editing, onSaved }: {
  open: boolean;
  onClose: () => void;
  editing: CustomRole | null;
  onSaved: (msg: string) => void;
}) {
  const createRole = useCreateRole();
  const updateRole = useUpdateRole();
  const { show: showToast } = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [caps, setCaps] = useState<Set<Capability>>(new Set());

  // Seed the form each time the dialog opens (for create or a specific role to edit).
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? '');
    setDescription(editing?.description ?? '');
    setCaps(new Set(editing?.capabilities ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const toggle = (c: Capability) => setCaps((prev) => {
    const next = new Set(prev);
    if (next.has(c)) next.delete(c); else next.add(c);
    return next;
  });
  const setMany = (list: Capability[], on: boolean) => setCaps((prev) => {
    const next = new Set(prev);
    for (const c of list) { if (on) next.add(c); else next.delete(c); }
    return next;
  });

  const close = () => onClose();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const capabilities = [...caps];
    const opts = {
      onSuccess: () => { onSaved(editing ? 'Role updated' : 'Role created'); close(); },
      onError: (err: unknown) => showToast(err instanceof Error ? err.message : 'Save failed', { variant: 'error' }),
    };
    if (editing) updateRole.mutate({ id: editing.id, name: name.trim(), description: description.trim(), capabilities }, opts);
    else createRole.mutate({ name: name.trim(), description: description.trim(), capabilities }, opts);
  };

  const pending = createRole.isPending || updateRole.isPending;
  return (
    <Dialog open={open} onClose={close} title={editing ? 'Edit role' : 'Add custom role'} maxWidth="min(760px, 94vw)">
      <form onSubmit={submit} className="flex flex-col" style={{ gap: 16 }}>
        <div className="flex flex-col sm:flex-row" style={{ gap: 14 }}>
          <div style={{ flex: '0 0 240px' }}>
            <label htmlFor="role-name" style={fieldLabel}>Role name</label>
            <input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. QA Reviewer" autoFocus style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="role-desc" style={fieldLabel}>Description</label>
            <input id="role-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this role for?" style={inputStyle} />
          </div>
        </div>
        <div>
          <span style={fieldLabel}>Capabilities</span>
          <CapabilityPicker selected={caps} onToggle={toggle} onSetMany={setMany} />
        </div>
        <div className="flex justify-end gap-2" style={{ marginTop: 2 }}>
          <button type="button" onClick={close} style={{ height: 36, padding: '0 14px', borderRadius: 'var(--radius-md)', background: 'none', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', fontSize: 12.5, cursor: 'pointer' }}>Cancel</button>
          <button type="submit" disabled={!name.trim() || pending}
            style={{ height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)', background: name.trim() ? 'var(--color-accent)' : 'var(--color-bg-raised)', color: name.trim() ? '#021526' : 'var(--color-text-disabled)', fontSize: 12.5, fontWeight: 600, border: 'none', cursor: name.trim() ? 'pointer' : 'default' }}>
            {pending ? 'Saving…' : editing ? 'Save role' : 'Create role'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Custom roles: named capability sets that groups can attach (alongside the built-ins). */
export function RolesTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const me = useMe();
  const { data: roles } = useRoles();
  const { data: groups } = useGroups();
  const deleteRole = useDeleteRole();
  const { show: showToast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CustomRole | null>(null);

  const groupsByRole = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups ?? []) m.set(g.role, (m.get(g.role) ?? 0) + 1);
    return m;
  }, [groups]);

  if (me.data && me.data.role !== 'admin') {
    return (
      <Section icon={<ShieldAlert style={{ width: 13, height: 13 }} />} color="var(--color-error)" title="Roles">
        <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Only admins can manage roles.</span>
      </Section>
    );
  }

  const openCreate = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (r: CustomRole) => { setEditing(r); setDialogOpen(true); };

  return (
    <Section
      icon={<KeyRound style={{ width: 13, height: 13 }} />}
      color="var(--color-accent)"
      title="Roles"
      action={<AddButton label="Add role" onClick={openCreate} />}
    >
      <RoleDialog open={dialogOpen} onClose={() => setDialogOpen(false)} editing={editing} onSaved={onSaved} />

      {/* Unified list: built-in roles (read-only) + custom roles (editable). */}
      <div className="flex flex-col" style={{ gap: 8 }}>
        {(['admin', 'contributor', 'viewer'] as const).map((r) => (
          <div key={r} className="flex items-center justify-between gap-3" style={{ padding: '12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span aria-hidden="true" className="flex items-center justify-center shrink-0" style={{ width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)' }}>
                <KeyRound style={{ width: 14, height: 14 }} />
              </span>
              <div className="min-w-0">
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', textTransform: 'capitalize' }}>{r}</div>
                <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                  {r === 'admin' ? 'Full access — all capabilities' : `${BUILTIN_ROLE_CAPS[r].length} capabilities`}
                </div>
              </div>
            </div>
            <span style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--color-text-tertiary)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 999, padding: '2px 8px', flexShrink: 0 }}>built-in</span>
          </div>
        ))}

        {(roles ?? []).map((r) => {
          const used = groupsByRole.get(r.id) ?? 0;
          return (
            <div key={r.id} style={{ padding: '12px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <div className="flex items-center justify-between gap-3">
                <button type="button" onClick={() => openEdit(r)} className="flex items-center gap-2.5 min-w-0 focus-visible:outline-none" style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, flex: 1 }}>
                  <span aria-hidden="true" className="flex items-center justify-center shrink-0" style={{ width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--color-accent-subtle)', border: '1px solid rgba(124,140,248,0.3)', color: 'var(--color-accent)' }}>
                    <KeyRound style={{ width: 14, height: 14 }} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate" style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>{r.name}</div>
                    <div className="truncate flex items-center gap-1.5" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                      {r.description
                        ? r.description
                        : r.capabilities.includes('admin.full') ? 'Full administrator' : `${r.capabilities.length} capabilit${r.capabilities.length === 1 ? 'y' : 'ies'}`}
                      {used > 0 && <span className="flex items-center gap-1 shrink-0"><Users2 style={{ width: 10, height: 10 }} /> {used}</span>}
                    </div>
                  </div>
                </button>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => openEdit(r)}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                    style={{ height: 30, padding: '0 11px', borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11.5, fontFamily: 'var(--font-mono)', cursor: 'pointer' }}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteRole.mutate(r.id, {
                      onSuccess: () => showToast(`Deleted "${r.name}"`),
                      onError: (err) => showToast(err instanceof Error ? err.message : 'Delete failed', { variant: 'error' }),
                    })}
                    aria-label={`Delete role ${r.name}`}
                    title={used > 0 ? `${used} group(s) use this role — they'll fall back to members' own role` : 'Delete role'}
                    className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                    style={{ width: 32, height: 32, borderRadius: 'var(--radius-sm)', background: 'none', border: '1px solid transparent', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-error)'; e.currentTarget.style.background = 'var(--color-error-subtle)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'none'; }}
                  >
                    <Trash2 style={{ width: 13, height: 13 }} aria-hidden="true" />
                  </button>
                </div>
              </div>
              {r.capabilities.length > 0 && !r.capabilities.includes('admin.full') && (
                <div className="flex flex-wrap gap-1" style={{ marginTop: 10 }}>
                  {r.capabilities.map((c) => {
                    const info = CAPABILITY_CATALOG.find((x) => x.key === c);
                    return (
                      <span key={c} style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 999, padding: '2px 8px' }}>
                        {info?.label ?? c}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
