import { Plus, Settings, Search, Command } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { useProjects } from '../api/hooks/use-projects';
import { useUIStore } from '../stores/ui.store';
import { ProjectList } from '../components/dashboard/project-list';
import { QuickCreateDialog } from '../components/dashboard/quick-create-dialog';

export function DashboardPage() {
  const { data: projects, isLoading } = useProjects();
  const activeModal = useUIStore((s) => s.activeModal);
  const openModal = useUIStore((s) => s.openModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const navigate = useNavigate();

  const projectCount = projects?.length ?? 0;

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg-base)' }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-4 animate-fade-in-up"
        style={{
          borderBottom: '1px solid var(--color-border-subtle)',
          animationDelay: '30ms',
          padding: '20px 48px',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-9 w-9 flex items-center justify-center shrink-0"
            style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.10)',
            }}
          >
            <Command className="h-4.5 w-4.5 text-text-secondary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[18px] font-bold text-text-primary tracking-tight truncate">
              Projects
            </h1>
            {!isLoading && (
              <p className="text-[12px] text-text-tertiary mt-0.5">
                {projectCount} {projectCount === 1 ? 'project' : 'projects'}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Search */}
          <button
            onClick={() => openModal('command-palette')}
            className="flex items-center gap-2.5 text-[13px] text-text-tertiary transition-all duration-200"
            style={{
              background: 'var(--glass-bg)',
              border: '1px solid var(--glass-border)',
              height: '40px',
              padding: '0 20px',
              minWidth: '130px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--glass-border-hover)';
              e.currentTarget.style.background = 'var(--glass-bg-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--glass-border)';
              e.currentTarget.style.background = 'var(--glass-bg)';
            }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span>Search</span>
          </button>

          {/* New Project button */}
          <button
            onClick={() => openModal('create-project')}
            className="flex items-center gap-2 text-[13.5px] font-semibold whitespace-nowrap transition-all duration-200 hover:bg-white/90"
            style={{
              background: 'white',
              color: '#0a0a0a',
              height: '40px',
              padding: '0 24px',
            }}
          >
            <Plus className="h-4 w-4 shrink-0" />
            New Project
          </button>
        </div>
      </div>

      {/* Project grid */}
      <div
        className="flex-1 overflow-y-auto animate-fade-in-up"
        style={{ padding: '32px 48px', animationDelay: '90ms' }}
      >
        <ProjectList
          projects={projects}
          isLoading={isLoading}
          onCreateProject={() => openModal('create-project')}
        />
      </div>

      {/* Bottom-left settings button */}
      <div className="fixed z-10 animate-fade-in-up" style={{ bottom: '28px', left: '48px', animationDelay: '160ms' }}>
        <button
          onClick={() => navigate({ to: '/settings' })}
          className="flex items-center gap-2.5 text-text-tertiary text-[13px] font-medium transition-all duration-200"
          style={{
            height: '40px',
            padding: '0 20px',
            background: 'var(--glass-bg)',
            border: '1px solid var(--glass-border)',
            backdropFilter: 'blur(12px)',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            el.style.borderColor = 'var(--glass-border-hover)';
            el.style.background = 'var(--glass-bg-hover)';
            el.style.color = 'var(--color-text-primary)';
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget;
            el.style.borderColor = 'var(--glass-border)';
            el.style.background = 'var(--glass-bg)';
            el.style.color = 'var(--color-text-tertiary)';
          }}
          title="Global Settings"
        >
          <Settings className="h-4 w-4 shrink-0" />
          <span>Settings</span>
        </button>
      </div>

      <QuickCreateDialog
        open={activeModal === 'create-project'}
        onClose={closeModal}
      />
    </div>
  );
}
