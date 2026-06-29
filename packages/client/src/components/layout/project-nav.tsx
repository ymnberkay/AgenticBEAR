import { Link, useMatchRoute } from '@tanstack/react-router';
import { Bot, ChevronRight, ChevronLeft, MessageSquare, Activity, ScrollText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Project } from '@subagent/shared';
import { useUIStore } from '../../stores/ui.store';

interface ProjectNavProps {
  project: Project;
}

// Chat-centric: the project index ('') is the chat surface; agentic + monitor live alongside.
// Monitor folds in usage/cost (the former Analytics tab) plus a live event feed.
const navItems = [
  { to: '' as const, label: 'Chat', icon: MessageSquare, description: 'talk to agents', exact: true },
  { to: '/agents' as const, label: 'Agents', icon: Bot, description: 'agentic workspace', exact: false },
  { to: '/activity' as const, label: 'Activity', icon: ScrollText, description: 'audit log', exact: false },
  { to: '/monitor' as const, label: 'Monitor', icon: Activity, description: 'live + usage/cost', exact: false },
];

const NAV_FULL = 200;
const NAV_COLLAPSED = 56;
const EASE = [0.16, 1, 0.3, 1] as const;
const DURATION = 0.24;

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
        background: 'var(--color-bg-nav)',
        borderRight: '1px solid var(--color-border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {collapsed ? (
          /* ── Collapsed ── */
          <motion.div
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, paddingTop: 12, paddingBottom: 12, gap: 4 }}
          >
            {navItems.map((item) => {
              const isActive = matchRoute({ to: `/projects/$projectId${item.to}`, params: { projectId: project.id }, fuzzy: !item.exact });
              return (
                <Link
                  key={item.to}
                  to={`/projects/$projectId${item.to}`}
                  params={{ projectId: project.id }}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  title={item.label}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                  style={{
                    width: 40, height: 40,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isActive ? '#7c8cf8' : 'var(--color-text-secondary)',
                    background: isActive ? 'rgba(124,140,248,0.10)' : 'transparent',
                    borderLeft: isActive ? '2px solid #7c8cf8' : '2px solid transparent',
                    transition: 'all 0.15s ease', flexShrink: 0,
                    borderRadius: 'var(--radius-sm)',
                  }}
                  onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.color = 'var(--color-text-primary)'; e.currentTarget.style.background = 'var(--color-bg-hover)'; } }}
                  onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent'; } }}
                >
                  <item.icon style={{ width: 16, height: 16 }} aria-hidden="true" />
                </Link>
              );
            })}
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={toggleNav}
              aria-label="Expand sidebar"
              aria-expanded={!collapsed}
              title="Expand sidebar"
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text-secondary)', background: 'transparent',
                border: '1px solid var(--color-border-subtle)', transition: 'all 0.15s ease',
                flexShrink: 0, cursor: 'pointer', borderRadius: 'var(--radius-sm)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#7c8cf8'; e.currentTarget.style.color = '#7c8cf8'; e.currentTarget.style.background = 'rgba(124,140,248,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <ChevronRight style={{ width: 14, height: 14 }} aria-hidden="true" />
            </button>
          </motion.div>
        ) : (
          /* ── Expanded ── */
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
          >
            {/* Project identity */}
            <div style={{ padding: '16px 14px 14px', borderBottom: '1px solid var(--color-border-subtle)', marginBottom: 4, flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }} title={project.name}>
                {project.name}
              </div>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', letterSpacing: '0.04em' }}>
                project workspace
              </div>
            </div>

            {/* Section label */}
            <div style={{ padding: '10px 14px 4px', flexShrink: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                Navigation
              </span>
            </div>

            {/* Nav items */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '2px 0 8px' }}>
              {navItems.map((item) => {
                const isActive = matchRoute({ to: `/projects/$projectId${item.to}`, params: { projectId: project.id }, fuzzy: !item.exact });
                return (
                  <Link
                    key={item.to}
                    to={`/projects/$projectId${item.to}`}
                    params={{ projectId: project.id }}
                    aria-current={isActive ? 'page' : undefined}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      fontSize: 13, fontWeight: isActive ? 500 : 400,
                      color: isActive ? '#7c8cf8' : 'var(--color-text-secondary)',
                      padding: '10px 14px',
                      background: isActive ? 'rgba(124,140,248,0.07)' : 'transparent',
                      borderLeft: isActive ? '2px solid #7c8cf8' : '2px solid transparent',
                      transition: 'all 0.15s ease',
                      fontFamily: 'var(--font-sans)', textDecoration: 'none', whiteSpace: 'nowrap',
                      minHeight: 44,
                    }}
                    onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(124,140,248,0.04)'; e.currentTarget.style.color = 'var(--color-text-primary)'; } }}
                    onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)'; } }}
                  >
                    <item.icon style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden="true" />
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ lineHeight: 1.2 }}>{item.label}</span>
                      <span style={{ fontSize: 10, color: isActive ? 'rgba(124,140,248,0.6)' : 'var(--color-text-secondary)', lineHeight: 1.2, marginTop: 2, fontFamily: 'var(--font-mono)' }}>
                        {item.description}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Collapse button */}
            <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: '6px 0', flexShrink: 0 }}>
              <button
                type="button"
                onClick={toggleNav}
                aria-label="Collapse sidebar"
                aria-expanded={!collapsed}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', fontSize: 11,
                  color: 'var(--color-text-secondary)', padding: '10px 14px', background: 'transparent',
                  borderLeft: '2px solid transparent', transition: 'all 0.15s ease',
                  fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap', cursor: 'pointer',
                  border: 'none', minHeight: 36,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
              >
                <ChevronLeft style={{ width: 12, height: 12, flexShrink: 0 }} aria-hidden="true" />
                <span>collapse</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
