import { Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjects } from '../api/hooks/use-projects';
import { useUIStore } from '../stores/ui.store';
import { ProjectList } from '../components/dashboard/project-list';
import { QuickCreateDialog } from '../components/dashboard/quick-create-dialog';
import { UserMenu } from '../components/layout/user-menu';
import { AreaSwitcher } from '../components/layout/area-switcher';

export function DashboardPage() {
  const { data: projects, isLoading } = useProjects();
  const activeModal = useUIStore((s) => s.activeModal);
  const openModal = useUIStore((s) => s.openModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const paletteOpen = useUIStore((s) => s.commandPaletteOpen);

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg-base)', position: 'relative' }}>
      {/* Calm static ambient — dot-grid + glow (no interaction) */}
      <div className="ambient" />
      {/* Top bar — search center, account menu right */}
      <div
        className="relative flex items-center animate-fade-in-up w-full"
        style={{
          borderBottom: '1px solid var(--color-border-subtle)',
          animationDelay: '30ms',
          padding: '0 32px',
          height: 56,
          background: 'rgba(2,21,38,0.78)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        {/* Left — product-area switcher (Agentic | Gateway) */}
        <div className="flex items-center" style={{ flex: '1 1 0', minWidth: 0 }}>
          <AreaSwitcher active="agentic" />
        </div>

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
                left: 'calc(50% - 190px)',
                width: 380, height: 36, padding: '0 14px',
                background: 'var(--color-bg-raised)',
                border: '1px solid var(--color-border-default)',
                color: 'var(--color-text-secondary)',
                fontFamily: 'var(--font-sans)', fontSize: 13,
                cursor: 'pointer', borderRadius: 'var(--radius-md)',
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
              <Search style={{ width: 13, height: 13, flexShrink: 0 }} aria-hidden="true" />
              <span style={{ flex: 1, textAlign: 'left' }}>Search or jump to...</span>
              <kbd style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
                padding: '2px 6px', color: 'var(--color-text-secondary)', flexShrink: 0,
                borderRadius: 'var(--radius-sm)',
              }} aria-hidden="true">
                ⌘K
              </kbd>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Right — account menu (New Project moved down to the project toolbar) */}
        <div className="flex items-center justify-end" style={{ flex: '1 1 0', minWidth: 0 }}>
          <UserMenu />
        </div>
      </div>

      {/* Body */}
      <div
        className="flex-1 overflow-y-auto animate-fade-in-up"
        style={{ padding: '24px 32px 32px', animationDelay: '90ms', position: 'relative', zIndex: 1 }}
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
