import { Link, useMatchRoute } from '@tanstack/react-router';
import { Bot, ChevronRight, ChevronLeft, MessageSquare, Activity, ScrollText, CircleDot, FolderKanban, Target } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Project } from '@subagent/shared';
import { useUIStore } from '../../stores/ui.store';

interface ProjectNavProps {
  project: Project;
}

// Chat-centric: the project index ('') is the chat surface; agentic + monitor live alongside.
// Monitor folds in usage/cost (the former Analytics tab) plus a live event feed.
const navItems = [
  { to: '' as const,         label: 'Chat',     icon: MessageSquare, description: 'talk to agents',     exact: true  },
  { to: '/goals' as const,   label: 'Goals',    icon: Target,        description: 'project objectives', exact: false },
  { to: '/agents' as const,  label: 'Agents',   icon: Bot,           description: 'agentic workspace',  exact: false },
  { to: '/issues' as const,  label: 'Issues',   icon: CircleDot,     description: 'tracked work',       exact: false },
  { to: '/activity' as const,label: 'Activity', icon: ScrollText,    description: 'audit log',          exact: false },
  { to: '/monitor' as const, label: 'Monitor',  icon: Activity,      description: 'live + usage/cost',  exact: false },
];

const NAV_FULL = 236;
const NAV_COLLAPSED = 64;
const EASE = [0.16, 1, 0.3, 1] as const;
const DURATION = 0.24;

/** Modernized project sidebar — mirrors the Gateway sidebar aesthetic (icon badges,
 *  glossy active state, soft glow) and supports collapse/expand. */
export function ProjectNav({ project }: ProjectNavProps) {
  const collapsed = useUIStore((s) => s.projectNavCollapsed);
  const toggleNav = useUIStore((s) => s.toggleProjectNav);
  const matchRoute = useMatchRoute();

  return (
    <motion.nav
      animate={{ width: collapsed ? NAV_COLLAPSED : NAV_FULL }}
      transition={{ duration: DURATION, ease: EASE }}
      aria-label={`${project.name} navigation`}
      style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, zIndex: 10,
        // Lightly tinted, transparent enough for the page ambient to read through.
        background: 'linear-gradient(180deg, rgba(2,21,38,0.18) 0%, rgba(2,21,38,0.05) 100%)',
        borderRight: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        padding: collapsed ? '20px 8px' : '20px 14px',
        gap: 4,
      }}
    >
      {/* Identity header */}
      <div style={{ padding: collapsed ? '0 0 14px' : '0 6px 14px', display: 'flex', alignItems: 'center', gap: 10, justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <div
          aria-hidden="true"
          style={{
            width: 32, height: 32, borderRadius: 10, flexShrink: 0,
            background: 'linear-gradient(135deg, rgba(124,140,248,0.25), rgba(124,140,248,0.06))',
            border: '1px solid rgba(124,140,248,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px -12px rgba(124,140,248,0.7)',
          }}
        >
          <FolderKanban style={{ width: 15, height: 15, color: '#7c8cf8' }} aria-hidden="true" />
        </div>
        {!collapsed && (
          <div className="flex flex-col" style={{ minWidth: 0 }}>
            <span
              title={project.name}
              style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            >
              {project.name}
            </span>
            <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Project workspace
            </span>
          </div>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: collapsed ? '0 -8px 12px' : '0 -14px 12px' }} aria-hidden="true" />

      {!collapsed && (
        <span style={{ padding: '0 8px 8px', fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
          Navigation
        </span>
      )}

      <div className="flex flex-col" style={{ gap: 4, flex: 1 }}>
        {navItems.map((item) => {
          const isActive = matchRoute({ to: `/projects/$projectId${item.to}`, params: { projectId: project.id }, fuzzy: !item.exact });
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={`/projects/$projectId${item.to}`}
              params={{ projectId: project.id }}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              title={collapsed ? `${item.label} — ${item.description}` : undefined}
              className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                fontSize: 13, fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                padding: collapsed ? '10px 8px' : '10px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                background: isActive
                  ? 'linear-gradient(135deg, rgba(124,140,248,0.16) 0%, rgba(124,140,248,0.04) 100%)'
                  : 'transparent',
                border: isActive ? '1px solid rgba(124,140,248,0.35)' : '1px solid transparent',
                borderRadius: 10,
                transition: 'background .2s, color .2s, border-color .2s',
                fontFamily: 'var(--font-sans)', textDecoration: 'none',
                minHeight: 48,
                boxShadow: isActive ? '0 8px 18px -14px rgba(124,140,248,0.7), inset 0 1px 0 rgba(255,255,255,0.03)' : 'none',
              }}
              onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.color = 'var(--color-text-primary)'; } }}
              onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)'; } }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isActive
                    ? 'linear-gradient(135deg, rgba(124,140,248,0.28), rgba(124,140,248,0.10))'
                    : 'rgba(255,255,255,0.03)',
                  border: isActive ? '1px solid rgba(124,140,248,0.45)' : '1px solid var(--color-border-subtle)',
                  color: isActive ? '#7c8cf8' : 'var(--color-text-secondary)',
                  transition: 'background .2s, color .2s, border-color .2s',
                }}
              >
                <Icon style={{ width: 14, height: 14 }} aria-hidden="true" />
              </span>
              {!collapsed && (
                <div className="flex flex-col" style={{ minWidth: 0 }}>
                  <span style={{ lineHeight: 1.2, whiteSpace: 'nowrap' }}>{item.label}</span>
                  <span style={{ fontSize: 10.5, color: isActive ? 'rgba(124,140,248,0.7)' : 'var(--color-text-disabled)', lineHeight: 1.2, marginTop: 3, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    {item.description}
                  </span>
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Collapse toggle */}
      <button
        type="button"
        onClick={toggleNav}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
        style={{
          marginTop: 8,
          padding: collapsed ? '10px 8px' : '10px 12px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          borderRadius: 10,
          border: '1px solid var(--color-border-subtle)',
          background: 'rgba(255,255,255,0.02)',
          color: 'var(--color-text-secondary)',
          fontSize: 11, fontFamily: 'var(--font-mono)',
          cursor: 'pointer',
          transition: 'background .2s, color .2s, border-color .2s',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(124,140,248,0.08)'; e.currentTarget.style.color = '#7c8cf8'; e.currentTarget.style.borderColor = 'rgba(124,140,248,0.35)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; }}
      >
        {collapsed
          ? <ChevronRight style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden="true" />
          : <ChevronLeft style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden="true" />}
        {!collapsed && <span style={{ whiteSpace: 'nowrap' }}>collapse</span>}
      </button>
    </motion.nav>
  );
}
