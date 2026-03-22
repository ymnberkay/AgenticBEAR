import { Link, useMatchRoute } from '@tanstack/react-router';
import {
  Bot,
  Play,
  FolderOpen,
  Settings,
  ChevronLeft,
  ChevronRight,
  Hexagon,
  ArrowLeft,
} from 'lucide-react';
import type { Project } from '@subagent/shared';
import { useUIStore } from '../../stores/ui.store';
import { cn } from '../../lib/cn';

interface ProjectNavProps {
  project: Project;
}

const navItems = [
  { to: '/agents' as const, label: 'Agents', icon: Bot, description: 'Manage AI agents' },
  { to: '/runs' as const, label: 'Runs', icon: Play, description: 'Execution history' },
  { to: '/workspace' as const, label: 'Workspace', icon: FolderOpen, description: 'Files & changes' },
];

const statusConfig: Record<string, { color: string; glow: string }> = {
  active: { color: '#00d084', glow: 'rgba(0, 208, 132, 0.4)' },
  archived: { color: '#ff9f1c', glow: 'rgba(255, 159, 28, 0.4)' },
  draft: { color: '#9fb5ca', glow: 'rgba(159, 181, 202, 0.3)' },
};

export function ProjectNav({ project }: ProjectNavProps) {
  const collapsed = useUIStore((s) => s.projectNavCollapsed);
  const toggleNav = useUIStore((s) => s.toggleProjectNav);
  const matchRoute = useMatchRoute();
  const status = statusConfig[project.status] ?? statusConfig.draft;

  return (
    <nav
      className="flex flex-col h-full shrink-0 transition-all duration-300 ease-out relative overflow-hidden"
      style={{
        width: collapsed ? 'var(--nav-collapsed)' : 'var(--nav-width)',
        background: 'var(--color-bg-nav)',
        borderRight: '1px solid var(--color-border-subtle)',
      }}
    >
      {/* Back button + Project identity */}
      <div className="px-4 py-4" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <Link to="/" className="h-8 w-8 flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-[rgba(255,255,255,0.06)] transition-all duration-200">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div
              className="h-9 w-9 flex items-center justify-center"
              style={{
                background: 'var(--gradient-accent-subtle)',
                border: '1px solid rgba(0, 212, 255, 0.2)',
              }}
            >
              <Hexagon className="h-4 w-4 text-[#40d9ff]" />
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 text-[12px] text-text-tertiary hover:text-text-primary transition-colors duration-200 w-fit"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>All Projects</span>
            </Link>
            <div className="flex items-center gap-3">
              <div
                className="h-9 w-9 flex items-center justify-center shrink-0"
                style={{
                  background: 'var(--gradient-accent-subtle)',
                  border: '1px solid rgba(0, 212, 255, 0.2)',
                }}
              >
                <Hexagon className="h-4 w-4 text-[#40d9ff]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold text-text-primary truncate">
                  {project.name}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="h-[6px] w-[6px] rounded-full"
                    style={{
                      backgroundColor: status.color,
                      boxShadow: `0 0 6px ${status.glow}`,
                    }}
                  />
                  <span className="text-[11px] text-text-tertiary capitalize font-medium">
                    {project.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Nav section label */}
      {!collapsed && (
        <div className="px-5 pt-5 pb-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-text-disabled">
            Navigation
          </span>
        </div>
      )}

      {/* Nav items */}
      <div className="flex-1 py-2 px-3 flex flex-col gap-1.5">
        {navItems.map((item) => {
          const isActive = matchRoute({
            to: `/projects/$projectId${item.to}`,
            params: { projectId: project.id },
            fuzzy: true,
          });

          return (
            <Link
              key={item.to}
              to={`/projects/$projectId${item.to}`}
              params={{ projectId: project.id }}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 text-[13px] transition-all duration-200 relative group',
                isActive
                  ? 'text-white font-medium'
                  : 'text-text-tertiary hover:text-text-primary',
              )}
              style={
                isActive
                  ? {
                      background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(0, 230, 168, 0.12))',
                      border: '1px solid rgba(0, 212, 255, 0.2)',
                      boxShadow: '0 2px 8px rgba(0, 212, 255, 0.1)',
                    }
                  : {
                      background: 'transparent',
                      border: '1px solid transparent',
                    }
              }
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--color-bg-hover)';
                  e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                }
              }}
            >
              <item.icon
                className={cn(
                  'h-4 w-4 shrink-0 transition-colors duration-200',
                  isActive ? 'text-[#40d9ff]' : '',
                )}
              />
              {!collapsed && (
                <div className="flex flex-col min-w-0">
                  <span>{item.label}</span>
                  {!isActive && (
                    <span className="text-[10.5px] text-text-disabled group-hover:text-text-tertiary transition-colors duration-200">
                      {item.description}
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Bottom: project settings + collapse */}
      <div className="px-3 py-3 flex flex-col gap-1.5" style={{ borderTop: '1px solid var(--color-border-subtle)' }}>
        <Link
          to="/projects/$projectId/settings"
          params={{ projectId: project.id }}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 text-[13px] transition-all duration-200',
            matchRoute({
              to: '/projects/$projectId/settings',
              params: { projectId: project.id },
            })
              ? 'text-white font-medium'
              : 'text-text-tertiary hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)]',
          )}
          style={
            matchRoute({
              to: '/projects/$projectId/settings',
              params: { projectId: project.id },
            })
              ? {
                  background: 'linear-gradient(135deg, rgba(0, 212, 255, 0.15), rgba(0, 230, 168, 0.12))',
                  border: '1px solid rgba(0, 212, 255, 0.2)',
                }
              : { border: '1px solid transparent' }
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </Link>

        <button
          onClick={toggleNav}
          className="flex items-center gap-3 px-3 py-2 text-[13px] text-text-tertiary hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)] transition-all duration-200 w-full"
          style={{ border: '1px solid transparent' }}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 shrink-0" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
}
