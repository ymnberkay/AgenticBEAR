import { Link, useMatchRoute } from '@tanstack/react-router';
import {
  Bot,
  Play,
  FolderOpen,
  Settings,
  ChevronRight,
  ChevronLeft,
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
  active: { color: '#6bbfa0', glow: 'rgba(107, 191, 160, 0.4)' },
  archived: { color: '#d4924e', glow: 'rgba(212, 146, 78, 0.4)' },
  draft: { color: '#6a5a48', glow: 'rgba(106, 90, 72, 0.3)' },
};

export function ProjectNav({ project }: ProjectNavProps) {
  const collapsed = useUIStore((s) => s.projectNavCollapsed);
  const toggleNav = useUIStore((s) => s.toggleProjectNav);
  const matchRoute = useMatchRoute();
  const status = statusConfig[project.status] ?? statusConfig.draft;

  /* ── COLLAPSED STATE ── */
  if (collapsed) {
    return (
      <nav
        className="flex flex-col h-full shrink-0 transition-all duration-300 ease-out items-center py-3 gap-1"
        style={{
          width: 'var(--nav-collapsed)',
          background: 'var(--color-bg-nav)',
          borderRight: '1px solid var(--color-border-subtle)',
        }}
      >
        {/* Expand button — top */}
        <button
          onClick={toggleNav}
          title="Expand sidebar"
          className="h-8 w-8 flex items-center justify-center text-text-tertiary transition-all duration-200 mb-1"
          style={{ border: '1px solid var(--color-border-subtle)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-accent-subtle)';
            e.currentTarget.style.borderColor = 'var(--color-accent)';
            e.currentTarget.style.color = 'var(--color-accent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
            e.currentTarget.style.color = 'var(--color-text-tertiary)';
          }}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>

        {/* Back to all projects */}
        <Link
          to="/"
          title="All Projects"
          className="h-8 w-8 flex items-center justify-center text-text-disabled hover:text-text-tertiary transition-all duration-200"
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Link>

        {/* Project icon (initial letter) */}
        <div
          className="h-8 w-8 flex items-center justify-center my-1 text-[11px] font-bold text-[#d4924e] shrink-0"
          style={{
            background: 'var(--gradient-accent-subtle)',
            border: '1px solid rgba(212, 146, 78, 0.2)',
          }}
        >
          {project.name.charAt(0).toUpperCase()}
        </div>

        <div
          className="w-7 my-1"
          style={{ height: '1px', background: 'var(--color-border-subtle)' }}
        />

        {/* Nav icons */}
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
              title={item.label}
              className={cn(
                'h-8 w-8 flex items-center justify-center transition-all duration-200',
                isActive ? 'text-[#d4924e]' : 'text-text-disabled hover:text-text-secondary',
              )}
              style={
                isActive
                  ? {
                      background: 'rgba(212, 146, 78, 0.12)',
                      border: '1px solid rgba(212, 146, 78, 0.2)',
                    }
                  : { border: '1px solid transparent' }
              }
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = 'var(--color-bg-hover)';
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = 'transparent';
              }}
            >
              <item.icon className="h-3.5 w-3.5" />
            </Link>
          );
        })}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Settings icon */}
        <Link
          to="/projects/$projectId/settings"
          params={{ projectId: project.id }}
          title="Settings"
          className={cn(
            'h-8 w-8 flex items-center justify-center transition-all duration-200',
            matchRoute({ to: '/projects/$projectId/settings', params: { projectId: project.id } })
              ? 'text-[#d4924e]'
              : 'text-text-disabled hover:text-text-secondary',
          )}
          style={
            matchRoute({ to: '/projects/$projectId/settings', params: { projectId: project.id } })
              ? { background: 'rgba(212, 146, 78, 0.12)', border: '1px solid rgba(212, 146, 78, 0.2)' }
              : { border: '1px solid transparent' }
          }
          onMouseEnter={(e) => {
            if (!matchRoute({ to: '/projects/$projectId/settings', params: { projectId: project.id } }))
              e.currentTarget.style.background = 'var(--color-bg-hover)';
          }}
          onMouseLeave={(e) => {
            if (!matchRoute({ to: '/projects/$projectId/settings', params: { projectId: project.id } }))
              e.currentTarget.style.background = 'transparent';
          }}
        >
          <Settings className="h-3.5 w-3.5" />
        </Link>
      </nav>
    );
  }

  /* ── EXPANDED STATE ── */
  return (
    <nav
      className="flex flex-col h-full shrink-0 transition-all duration-300 ease-out"
      style={{
        width: 'var(--nav-width)',
        background: 'var(--color-bg-nav)',
        borderRight: '1px solid var(--color-border-subtle)',
      }}
    >
      {/* Header: breadcrumb path + collapse */}
      <div style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div className="flex items-center gap-0">
          {/* Back chevron — goes home */}
          <Link
            to="/"
            title="All Projects"
            className="flex items-center justify-center h-12 w-10 shrink-0 text-text-disabled hover:text-text-secondary transition-colors duration-200"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>

          {/* Breadcrumb path */}
          <div className="flex-1 min-w-0 py-3">
            <div className="flex items-center gap-1 text-[12.5px] leading-tight truncate">
              <span className="text-text-tertiary font-medium shrink-0">AgenticBEAR</span>
              <span className="text-text-disabled mx-0.5">/</span>
              <span className="text-text-primary font-semibold truncate">{project.name}</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className="h-[5px] w-[5px] rounded-full shrink-0"
                style={{ backgroundColor: status.color, boxShadow: `0 0 5px ${status.glow}` }}
              />
              <span className="text-[10px] text-text-tertiary capitalize tracking-wide">
                {project.status}
              </span>
            </div>
          </div>

          {/* Collapse button */}
          <button
            onClick={toggleNav}
            title="Collapse sidebar"
            className="flex items-center justify-center h-12 w-9 shrink-0 text-text-disabled hover:text-text-secondary transition-colors duration-200"
          >
            <ChevronLeft className="h-3.5 w-3.5 opacity-50 hover:opacity-100" />
          </button>
        </div>
      </div>

      {/* Nav section label */}
      <div style={{ padding: '16px 14px 6px' }}>
        <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-text-disabled)' }}>
          Navigation
        </span>
      </div>

      {/* Nav items */}
      <div className="flex-1 flex flex-col" style={{ padding: '0 6px 8px', gap: '2px' }}>
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
              className="flex items-center gap-2.5 transition-all duration-200 relative group"
              style={{
                fontSize: '13px',
                fontWeight: isActive ? 500 : 400,
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                padding: '9px 10px',
                background: isActive
                  ? 'linear-gradient(135deg, rgba(212, 146, 78, 0.12), rgba(107, 191, 160, 0.08))'
                  : 'transparent',
                border: isActive
                  ? '1px solid rgba(212, 146, 78, 0.18)'
                  : '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--color-bg-hover)';
                  e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }
              }}
            >
              <item.icon
                className="shrink-0 transition-colors duration-200"
                style={{
                  width: '15px',
                  height: '15px',
                  color: isActive ? '#d4924e' : 'var(--color-text-tertiary)',
                }}
              />
              <div className="flex flex-col min-w-0">
                <span style={{ lineHeight: '1.2' }}>{item.label}</span>
                <span
                  className="group-hover:text-text-tertiary transition-colors duration-200"
                  style={{ fontSize: '10.5px', color: 'var(--color-text-disabled)', lineHeight: '1.2', marginTop: '2px' }}
                >
                  {item.description}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Bottom: settings only */}
      <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '10px' }}>
        {(() => {
          const isSettingsActive = !!matchRoute({ to: '/projects/$projectId/settings', params: { projectId: project.id } });
          return (
            <Link
              to="/projects/$projectId/settings"
              params={{ projectId: project.id }}
              className="flex items-center gap-2.5 transition-all duration-200"
              style={{
                fontSize: '13px',
                fontWeight: isSettingsActive ? 500 : 400,
                color: isSettingsActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                padding: '9px 10px',
                background: isSettingsActive
                  ? 'linear-gradient(135deg, rgba(212, 146, 78, 0.12), rgba(107, 191, 160, 0.08))'
                  : 'transparent',
                border: isSettingsActive
                  ? '1px solid rgba(212, 146, 78, 0.18)'
                  : '1px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isSettingsActive) {
                  e.currentTarget.style.background = 'var(--color-bg-hover)';
                  e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
                  e.currentTarget.style.color = 'var(--color-text-primary)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSettingsActive) {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'transparent';
                  e.currentTarget.style.color = 'var(--color-text-secondary)';
                }
              }}
            >
              <Settings
                className="shrink-0"
                style={{
                  width: '15px',
                  height: '15px',
                  color: isSettingsActive ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                }}
              />
              <span>Settings</span>
            </Link>
          );
        })()}
      </div>
    </nav>
  );
}
