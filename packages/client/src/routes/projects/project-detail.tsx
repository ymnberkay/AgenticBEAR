import { Outlet, useParams, Link } from '@tanstack/react-router';
import { Settings, Search } from 'lucide-react';
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
      <div className="flex flex-col items-center justify-center h-full gap-2" style={{ background: 'var(--color-bg-base)' }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>project not found</p>
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
          {/* Left: breadcrumb */}
          <div className="flex items-center gap-2" style={{ flex: '1 1 0', minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            <Link
              to="/"
              style={{ color: 'var(--color-text-disabled)', textDecoration: 'none', flexShrink: 0, transition: 'color 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#7c8cf8'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; }}
            >
              agenticbear
            </Link>
            <span style={{ color: 'var(--color-border-default)' }}>/</span>
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.name}
            </span>
            <span
              style={{
                flexShrink: 0,
                fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                fontFamily: 'var(--font-mono)',
                color: status.color, background: `${status.color}12`, border: `1px solid ${status.color}28`,
                padding: '2px 7px',
              }}
            >
              {status.label}
            </span>
          </div>

          {/* Center: search bar */}
          <AnimatePresence>
            {!paletteOpen && (
              <motion.button
                layoutId="spotlight-bar"
                key="search-trigger"
                onClick={() => openModal('command-palette')}
                className="absolute flex items-center gap-2.5"
                style={{
                  left: 'calc(50% - 160px)',
                  width: 320, height: 30,
                  padding: '0 12px',
                  background: 'var(--color-bg-raised)',
                  border: '1px solid var(--color-border-default)',
                  color: 'var(--color-text-disabled)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-md)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(124,140,248,0.35)'; e.currentTarget.style.background = 'var(--color-bg-overlay)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.background = 'var(--color-bg-raised)'; }}
              >
                <Search style={{ width: 12, height: 12, flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: 'left' }}>Search or jump to...</span>
                <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 9, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', padding: '1px 5px', color: 'var(--color-text-disabled)', flexShrink: 0 }}>
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
          animate={{ left: navCollapsed ? 56 : 200 }}
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
