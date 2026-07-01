import { Users2, Check, ShieldAlert } from 'lucide-react';
import { useGroups, useUpdateGroup, useMe } from '../../api/hooks/use-auth';

/**
 * Project access via permission groups — assign which groups can access THIS project (the inverse
 * of the Groups tab's project chips; access is stored on each group's `projectIds`). Admin only.
 */
export function ProjectSharing({ projectId }: { projectId: string }) {
  const me = useMe();
  const { data: groups } = useGroups();
  const updateGroup = useUpdateGroup();
  const isAdmin = me.data?.role === 'admin';

  const sectionStyle: React.CSSProperties = {
    background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
    borderLeft: '3px solid #7c8cf8', marginBottom: 12, borderRadius: 'var(--radius-md)',
  };
  const headerStyle: React.CSSProperties = { padding: '12px 16px', borderBottom: '1px solid var(--color-border-subtle)' };
  const titleStyle: React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' };

  if (!isAdmin) {
    return (
      <section style={sectionStyle}>
        <div style={headerStyle} className="flex items-center gap-2">
          <Users2 style={{ width: 12, height: 12, color: '#7c8cf8' }} aria-hidden="true" />
          <span style={titleStyle}>Access</span>
        </div>
        <div className="flex items-center gap-2" style={{ padding: '14px 16px', fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
          <ShieldAlert style={{ width: 13, height: 13 }} aria-hidden="true" /> Only admins can manage project access.
        </div>
      </section>
    );
  }

  const toggle = (groupId: string, current: string[], on: boolean) => {
    const next = on ? current.filter((p) => p !== projectId) : [...current, projectId];
    updateGroup.mutate({ id: groupId, projectIds: next });
  };

  return (
    <section style={sectionStyle}>
      <div style={headerStyle} className="flex items-center gap-2">
        <Users2 style={{ width: 12, height: 12, color: '#7c8cf8' }} aria-hidden="true" />
        <span style={titleStyle}>Access — Permission Groups</span>
      </div>
      <div className="flex flex-col gap-1.5" style={{ padding: '12px 16px' }}>
        <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', margin: '0 0 6px' }}>
          Members of a checked group can access this project. Admins always have access.
        </p>
        {(groups ?? []).map((g) => {
          const on = g.projectIds.includes(projectId);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggle(g.id, g.projectIds, on)}
              disabled={updateGroup.isPending}
              className="flex items-center justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                padding: '9px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', textAlign: 'left',
                background: on ? 'var(--color-accent-subtle)' : 'var(--color-bg-base)',
                border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
              }}
            >
              <span className="flex items-center gap-2.5" style={{ minWidth: 0 }}>
                <span className="flex items-center justify-center shrink-0" style={{ width: 24, height: 24, borderRadius: 'var(--radius-sm)', background: 'var(--color-accent-subtle)', color: '#7c8cf8' }}>
                  <Users2 style={{ width: 13, height: 13 }} aria-hidden="true" />
                </span>
                <span className="truncate" style={{ fontSize: 12.5, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                  {g.name} <span style={{ color: 'var(--color-text-disabled)', fontWeight: 400, fontFamily: 'var(--font-mono)', fontSize: 11 }}>· {g.role}</span>
                </span>
              </span>
              <span aria-hidden="true" className="flex items-center justify-center shrink-0" style={{
                width: 18, height: 18, borderRadius: 4,
                background: on ? 'var(--color-accent)' : 'transparent',
                border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border-default)'}`,
                color: '#021526',
              }}>
                {on && <Check style={{ width: 12, height: 12 }} />}
              </span>
            </button>
          );
        })}
        {(groups ?? []).length === 0 && (
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            No permission groups yet — create them in Settings → Groups.
          </span>
        )}
      </div>
    </section>
  );
}
