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
      <div className="flex items-center justify-between px-6 sm:px-10 lg:px-12 py-5 sm:py-6 gap-4" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              boxShadow: '0 2px 10px rgba(99, 102, 241, 0.3)',
            }}
          >
            <Command className="h-4.5 w-4.5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-[18px] font-bold text-[#e2e2e8] tracking-tight truncate">
              Projects
            </h1>
            {!isLoading && (
              <p className="text-[12px] text-[#5a5a6e] mt-0.5">
                {projectCount} {projectCount === 1 ? 'project' : 'projects'}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Search hint */}
          <button
            onClick={() => openModal('command-palette')}
            className="hidden sm:flex items-center gap-2 h-[38px] rounded-lg px-3.5 text-[13px] text-[#5a5a6e] transition-all duration-200"
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
            }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span>Search</span>
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded ml-2" style={{ background: 'rgba(255, 255, 255, 0.06)' }}>
              ⌘K
            </kbd>
          </button>

          {/* New Project button */}
          <button
            onClick={() => openModal('create-project')}
            className="flex items-center gap-2 h-[38px] rounded-lg text-white text-[13.5px] font-medium px-5 whitespace-nowrap transition-all duration-200 hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              boxShadow: '0 2px 12px rgba(99, 102, 241, 0.25)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = '0 4px 20px rgba(99, 102, 241, 0.35)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = '0 2px 12px rgba(99, 102, 241, 0.25)';
            }}
          >
            <Plus className="h-4 w-4 shrink-0" />
            New Project
          </button>
        </div>
      </div>

      {/* Project grid */}
      <div className="flex-1 overflow-y-auto px-6 sm:px-10 lg:px-12 py-8">
        <ProjectList
          projects={projects}
          isLoading={isLoading}
          onCreateProject={() => openModal('create-project')}
        />
      </div>

      {/* Bottom-left settings button */}
      <div className="fixed bottom-6 left-6 z-10">
        <button
          onClick={() => navigate({ to: '/settings' })}
          className="flex items-center gap-2 h-[38px] rounded-lg px-3.5 text-[#5a5a6e] text-[13px] font-medium transition-all duration-200"
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            backdropFilter: 'blur(12px)',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget;
            el.style.borderColor = 'rgba(255, 255, 255, 0.14)';
            el.style.background = 'rgba(255, 255, 255, 0.07)';
            el.style.color = '#e2e2e8';
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget;
            el.style.borderColor = 'rgba(255, 255, 255, 0.07)';
            el.style.background = 'rgba(255, 255, 255, 0.04)';
            el.style.color = '#5a5a6e';
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
