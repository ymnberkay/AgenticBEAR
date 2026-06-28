import { Plus, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjects } from '../api/hooks/use-projects';
import { useUIStore } from '../stores/ui.store';
import { ProjectList } from '../components/dashboard/project-list';
import { QuickCreateDialog } from '../components/dashboard/quick-create-dialog';
import { UserMenu } from '../components/layout/user-menu';

export function DashboardPage() {
  const { data: projects, isLoading } = useProjects();
  const activeModal = useUIStore((s) => s.activeModal);
  const openModal = useUIStore((s) => s.openModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const paletteOpen = useUIStore((s) => s.commandPaletteOpen);

  const projectCount = projects?.length ?? 0;

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg-base)', position: 'relative' }}>
      {/* Calm static ambient — dot-grid + glow (no interaction) */}
      <div className="ambient" />
      {/* Top bar */}
      <div
        className="relative flex items-center animate-fade-in-up w-full"
        style={{
          borderBottom: '1px solid var(--color-border-subtle)',
          animationDelay: '30ms',
          padding: '0 32px',
          height: 56,
          background: 'rgba(2,21,38,0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        {/* Left: title */}
        <div className="flex items-center gap-2.5" style={{ flex: '1 1 0', minWidth: 0 }}>
          <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', lineHeight: 1 }}>
            Projects
          </h1>
          {!isLoading && (
            <span style={{
              fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)',
              background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-subtle)',
              padding: '2px 6px',
            }}>
              {projectCount}
            </span>
          )}
        </div>

        {/* Center: search bar — only shown when palette is closed */}
        <AnimatePresence>
          {!paletteOpen && (
            <motion.button
              layoutId="spotlight-bar"
              key="search-trigger"
              onClick={() => openModal('command-palette')}
              className="absolute flex items-center gap-2.5"
              style={{
                left: 'calc(50% - 160px)',
                width: 320,
                height: 34,
                padding: '0 14px',
                background: 'var(--color-bg-raised)',
                border: '1px solid var(--color-border-default)',
                color: 'var(--color-text-disabled)',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                cursor: 'pointer',
                borderRadius: 'var(--radius-md)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(124,140,248,0.35)';
                e.currentTarget.style.background = 'var(--color-bg-overlay)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border-default)';
                e.currentTarget.style.background = 'var(--color-bg-raised)';
              }}
            >
              <Search style={{ width: 13, height: 13, flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left' }}>Search or jump to...</span>
              <kbd style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
                padding: '1px 5px', color: 'var(--color-text-disabled)', flexShrink: 0,
              }}>
                ⌘K
              </kbd>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Right: new project + account menu */}
        <div className="flex items-center gap-3 justify-end" style={{ flex: '1 1 0', minWidth: 0 }}>
          <button
            onClick={() => openModal('create-project')}
            className="flex items-center gap-2 transition-all duration-150"
            style={{
              height: 34, padding: '0 16px', borderRadius: 'var(--radius-md)',
              background: 'var(--color-accent)', color: '#021526',
              fontSize: 13, fontWeight: 600,
              fontFamily: 'var(--font-sans)', border: 'none', whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-accent)'; }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            New Project
          </button>
          <div style={{ width: 1, height: 22, background: 'var(--color-border-subtle)' }} />
          <UserMenu />
        </div>
      </div>

      {/* Project grid */}
      <div
        className="flex-1 overflow-y-auto animate-fade-in-up"
        style={{ padding: '28px 32px', animationDelay: '90ms', position: 'relative', zIndex: 1 }}
      >
        <ProjectList
          projects={projects}
          isLoading={isLoading}
          onCreateProject={() => openModal('create-project')}
        />
      </div>

      <QuickCreateDialog open={activeModal === 'create-project'} onClose={closeModal} />
    </div>
  );
}
