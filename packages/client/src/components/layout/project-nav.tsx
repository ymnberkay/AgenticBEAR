import { Link, useMatchRoute } from '@tanstack/react-router';
import {
  Bot,
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
];

export function ProjectNav({ project }: ProjectNavProps) {
  const collapsed = useUIStore((s) => s.projectNavCollapsed);
  const toggleNav = useUIStore((s) => s.toggleProjectNav);
  const matchRoute = useMatchRoute();

  /* ── COLLAPSED STATE ── */
  if (collapsed) {
    return (
      <nav
        className="flex flex-col h-full shrink-0 transition-all duration-300 ease-out items-center pt-6 pb-3 gap-1"
        style={{
          width: 'var(--nav-collapsed)',
          background: 'var(--color-bg-nav)',
          borderRight: '1px solid var(--color-border-subtle)',
        }}
      >
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

        {/* Expand button — bottom */}
        <button
          onClick={toggleNav}
          title="Expand sidebar"
          className="h-8 w-8 flex items-center justify-center text-text-tertiary transition-all duration-200"
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

      {/* Bottom: collapse button */}
      <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '10px' }}>
        <button
          onClick={toggleNav}
          title="Collapse sidebar"
          className="flex items-center gap-2.5 w-full transition-all duration-200 text-text-disabled hover:text-text-secondary"
          style={{
            fontSize: '13px',
            padding: '9px 10px',
            border: '1px solid transparent',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-bg-hover)';
            e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'transparent';
          }}
        >
          <ChevronLeft
            className="shrink-0"
            style={{ width: '15px', height: '15px' }}
          />
          <span>Collapse</span>
        </button>
      </div>
    </nav>
  );
}
