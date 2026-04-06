import { Link, useMatchRoute } from '@tanstack/react-router';
import { Bot, ChevronRight, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Project } from '@subagent/shared';
import { useUIStore } from '../../stores/ui.store';

interface ProjectNavProps {
  project: Project;
}

const navItems = [
  { to: '/agents' as const, label: 'Agents', icon: Bot, description: 'manage ai agents' },
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
              const isActive = matchRoute({ to: `/projects/$projectId${item.to}`, params: { projectId: project.id }, fuzzy: true });
              return (
                <Link
                  key={item.to}
                  to={`/projects/$projectId${item.to}`}
                  params={{ projectId: project.id }}
                  title={item.label}
                  style={{
                    width: 32, height: 32,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: isActive ? '#fabd2f' : 'var(--color-text-disabled)',
                    background: isActive ? 'rgba(250,189,47,0.10)' : 'transparent',
                    borderLeft: isActive ? '2px solid #fabd2f' : '2px solid transparent',
                    transition: 'all 0.15s ease', flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'var(--color-bg-hover)'; } }}
                  onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.color = 'var(--color-text-disabled)'; e.currentTarget.style.background = 'transparent'; } }}
                >
                  <item.icon style={{ width: 14, height: 14 }} />
                </Link>
              );
            })}
            <div style={{ flex: 1 }} />
            <button
              onClick={toggleNav}
              title="Expand sidebar"
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--color-text-disabled)', background: 'transparent',
                border: '1px solid var(--color-border-subtle)', transition: 'all 0.15s ease', flexShrink: 0,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#fabd2f'; e.currentTarget.style.color = '#fabd2f'; e.currentTarget.style.background = 'rgba(250,189,47,0.08)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.color = 'var(--color-text-disabled)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <ChevronRight style={{ width: 12, height: 12 }} />
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
              <div style={{ fontSize: 11, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3 }}>
                {project.name}
              </div>
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', letterSpacing: '0.04em' }}>
                project workspace
              </div>
            </div>

            {/* Section label */}
            <div style={{ padding: '10px 14px 4px', flexShrink: 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
                Navigation
              </span>
            </div>

            {/* Nav items */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '2px 0 8px' }}>
              {navItems.map((item) => {
                const isActive = matchRoute({ to: `/projects/$projectId${item.to}`, params: { projectId: project.id }, fuzzy: true });
                return (
                  <Link
                    key={item.to}
                    to={`/projects/$projectId${item.to}`}
                    params={{ projectId: project.id }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      fontSize: 13, fontWeight: isActive ? 500 : 400,
                      color: isActive ? '#fabd2f' : 'var(--color-text-secondary)',
                      padding: '9px 14px',
                      background: isActive ? 'rgba(250,189,47,0.07)' : 'transparent',
                      borderLeft: isActive ? '2px solid #fabd2f' : '2px solid transparent',
                      transition: 'all 0.15s ease',
                      fontFamily: 'var(--font-sans)', textDecoration: 'none', whiteSpace: 'nowrap',
                    }}
                    onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'rgba(250,189,47,0.04)'; e.currentTarget.style.color = 'var(--color-text-primary)'; } }}
                    onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)'; } }}
                  >
                    <item.icon style={{ width: 14, height: 14, flexShrink: 0 }} />
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                      <span style={{ lineHeight: 1.2 }}>{item.label}</span>
                      <span style={{ fontSize: 10, color: isActive ? 'rgba(250,189,47,0.5)' : 'var(--color-text-disabled)', lineHeight: 1.2, marginTop: 2, fontFamily: 'var(--font-mono)' }}>
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
                onClick={toggleNav}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', fontSize: 11,
                  color: 'var(--color-text-disabled)', padding: '7px 14px', background: 'transparent',
                  borderLeft: '2px solid transparent', transition: 'all 0.15s ease', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-hover)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-disabled)'; }}
              >
                <ChevronLeft style={{ width: 12, height: 12, flexShrink: 0 }} />
                <span>collapse</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}
