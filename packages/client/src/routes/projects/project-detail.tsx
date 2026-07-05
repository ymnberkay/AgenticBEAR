import { Outlet, useParams, Link } from '@tanstack/react-router';
import { Settings, Search, Boxes, ChevronRight } from 'lucide-react';
import { BranchPill } from '../../components/layout/branch-pill';
import { motion, AnimatePresence } from 'framer-motion';
import { useProject } from '../../api/hooks/use-projects';
import { ProjectNav } from '../../components/layout/project-nav';
import { Skeleton } from '../../components/ui/skeleton';
import { useUIStore } from '../../stores/ui.store';

const statusConfig: Record<string, { color: string; label: string }> = {
  active:   { color: '#6db58a', label: 'active' },
  archived: { color: '#9ca8a2', label: 'archived' },
  draft:    { color: '#7c8cf8', label: 'draft' },
};

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: project, isLoading } = useProject(projectId);
  const paletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const openModal = useUIStore((s) => s.openModal);
  const navCollapsed = useUIStore((s) => s.projectNavCollapsed);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="shrink-0 px-6 py-3" style={{ background: 'var(--color-bg-nav)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <Skeleton height={14} width={200} />
        </div>
        <div className="flex-1 p-8" style={{ background: 'var(--color-bg-base)' }}>
          <Skeleton height={300} />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 px-6" style={{ background: 'var(--color-bg-base)' }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)' }}>project not found</p>
        <p style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', textAlign: 'center', maxWidth: 360 }}>
          The project may have been deleted or you may not have access.
        </p>
        <Link
          to="/"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            height: 36, padding: '0 16px',
            background: 'var(--color-accent)', color: '#021526',
            fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600,
            borderRadius: 'var(--radius-md)', textDecoration: 'none',
            marginTop: 8,
          }}
        >
          Back to projects
        </Link>
      </div>
    );
  }

  const status = statusConfig[project.status] ?? statusConfig.draft;

  return (
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div
        className="shrink-0"
        style={{
          background: 'rgba(2,21,38,0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <div className="relative flex items-center w-full" style={{ padding: '0 24px', height: 44 }}>
          {/* Left: breadcrumb — wordmark › project + status pill */}
          <div className="flex items-center gap-2" style={{ flex: '1 1 0', minWidth: 0 }}>
            <Link
              to="/"
              className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{ textDecoration: 'none', flexShrink: 0, borderRadius: 'var(--radius-sm)', padding: '3px 4px 3px 2px' }}
              onMouseEnter={(e) => { const t = e.currentTarget.querySelector('span'); if (t) (t as HTMLElement).style.color = 'var(--color-text-primary)'; }}
              onMouseLeave={(e) => { const t = e.currentTarget.querySelector('span'); if (t) (t as HTMLElement).style.color = 'var(--color-text-secondary)'; }}
            >
              <span
                aria-hidden="true"
                className="flex items-center justify-center"
                style={{
                  width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                  background: 'linear-gradient(135deg, rgba(124,140,248,0.30), rgba(124,140,248,0.10))',
                  border: '1px solid rgba(124,140,248,0.40)',
                  color: '#7c8cf8',
                }}
              >
                <Boxes style={{ width: 11, height: 11 }} />
              </span>
              <span style={{ fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--color-text-secondary)', transition: 'color .15s' }}>
                agenticbear
              </span>
            </Link>
            <ChevronRight aria-hidden="true" style={{ width: 12, height: 12, color: 'var(--color-text-disabled)', flexShrink: 0 }} />
            <span style={{ fontFamily: 'var(--font-sans)', fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.name}
            </span>
            <span
              className="flex items-center gap-1.5"
              style={{
                flexShrink: 0,
                fontSize: 10, fontWeight: 600, letterSpacing: '0.05em',
                fontFamily: 'var(--font-mono)',
                color: status.color, background: `${status.color}14`, border: `1px solid ${status.color}30`,
                padding: '2.5px 9px', borderRadius: 999,
              }}
            >
              <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: status.color, boxShadow: `0 0 5px ${status.color}88` }} />
              {status.label}
            </span>
            <BranchPill project={project} />
          </div>

          {/* Center: search bar */}
          <AnimatePresence>
            {!paletteOpen && (
              <motion.button
                layoutId="spotlight-bar"
                key="search-trigger"
                type="button"
                onClick={() => openModal('command-palette')}
                aria-label="Open command palette (Cmd+K)"
                aria-keyshortcuts="Meta+K"
                className="absolute flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{
                  left: 'calc(50% - 160px)',
                  width: 320, height: 32,
                  padding: '0 12px',
                  background: 'var(--color-bg-raised)',
                  border: '1px solid var(--color-border-default)',
                  color: 'var(--color-text-secondary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-md)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(124,140,248,0.35)'; e.currentTarget.style.background = 'var(--color-bg-overlay)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.background = 'var(--color-bg-raised)'; }}
              >
                <Search style={{ width: 12, height: 12, flexShrink: 0 }} aria-hidden="true" />
                <span style={{ flex: 1, textAlign: 'left' }}>Search or jump to...</span>
                <kbd aria-hidden="true" style={{ fontFamily: 'var(--font-mono)', fontSize: 9, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', padding: '2px 6px', color: 'var(--color-text-secondary)', flexShrink: 0, borderRadius: 'var(--radius-sm)' }}>
                  ⌘K
                </kbd>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Right: settings */}
          <div className="flex items-center justify-end" style={{ flex: '1 1 0', minWidth: 0 }}>
            <Link
              to="/projects/$projectId/settings"
              params={{ projectId: project.id }}
              className="flex items-center gap-2"
              style={{
                height: 30, padding: '0 13px', borderRadius: 'var(--radius-md)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-subtle)',
                background: 'var(--color-bg-surface)',
                fontFamily: 'var(--font-sans)', fontSize: 12.5, fontWeight: 500,
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.borderColor = 'var(--glass-border-hover)'; e.currentTarget.style.background = 'var(--color-bg-raised)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.background = 'var(--color-bg-surface)'; }}
            >
              <Settings style={{ width: 13, height: 13 }} />
              <span>Settings</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Content — left offset tracks the nav so it reflows when collapsed */}
      <div className="flex-1 relative min-h-0" style={{ background: 'var(--color-bg-base)' }}>
        <ProjectNav project={project} />
        <motion.div
          className="overflow-y-auto"
          animate={{ left: navCollapsed ? 64 : 236 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, background: 'var(--color-bg-base)', padding: '32px 40px' }}
        >
          {/* Calm static ambient — dot-grid + glow (no interaction) */}
          <div className="ambient ambient-soft" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <Outlet />
          </div>
        </motion.div>
      </div>
    </div>
  );
}
