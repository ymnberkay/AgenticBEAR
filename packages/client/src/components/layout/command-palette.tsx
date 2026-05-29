import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, FolderOpen, Plus, Settings, FileCode2,
  LayoutDashboard, Bot, Zap,
} from 'lucide-react';
import { useUIStore } from '../../stores/ui.store';
import { useProjects } from '../../api/hooks/use-projects';
import { useKeyboardShortcut } from '../../hooks/use-keyboard-shortcut';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
  category: 'Navigation' | 'Actions' | 'Projects' | 'Shortcuts';
}

const categoryColor: Record<string, string> = {
  Navigation: '#6EACDA',
  Actions:    '#6db58a',
  Projects:   '#6EACDA',
  Shortcuts:  '#e2b04a',
};

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const closeModal = useUIStore((s) => s.closeModal);
  const openModal = useUIStore((s) => s.openModal);
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcut('meta+k', toggleCommandPalette);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      // Slash shortcuts
      {
        id: 'slash-agents',
        label: '/agents',
        description: 'Jump to agents of a project',
        shortcut: '/agents',
        icon: <Bot style={{ width: 14, height: 14 }} />,
        action: () => {
          if (projects?.[0]) {
            navigate({ to: '/projects/$projectId/agents', params: { projectId: projects[0].id } });
            closeModal();
          }
        },
        category: 'Shortcuts',
      },
      {
        id: 'slash-new',
        label: '/new',
        description: 'Create a new project',
        shortcut: '/new',
        icon: <Plus style={{ width: 14, height: 14 }} />,
        action: () => { openModal('create-project'); },
        category: 'Shortcuts',
      },
      {
        id: 'slash-templates',
        label: '/templates',
        description: 'Browse agent templates',
        shortcut: '/templates',
        icon: <Zap style={{ width: 14, height: 14 }} />,
        action: () => { navigate({ to: '/templates' }); closeModal(); },
        category: 'Shortcuts',
      },
      {
        id: 'slash-settings',
        label: '/settings',
        description: 'Open global settings',
        shortcut: '/settings',
        icon: <Settings style={{ width: 14, height: 14 }} />,
        action: () => { navigate({ to: '/settings' }); closeModal(); },
        category: 'Shortcuts',
      },
      // Navigation
      {
        id: 'dashboard',
        label: 'Go to Dashboard',
        icon: <LayoutDashboard style={{ width: 14, height: 14 }} />,
        action: () => { navigate({ to: '/' }); closeModal(); },
        category: 'Navigation',
      },
      {
        id: 'templates',
        label: 'Browse Templates',
        icon: <FileCode2 style={{ width: 14, height: 14 }} />,
        action: () => { navigate({ to: '/templates' }); closeModal(); },
        category: 'Navigation',
      },
      {
        id: 'settings',
        label: 'Open Settings',
        icon: <Settings style={{ width: 14, height: 14 }} />,
        action: () => { navigate({ to: '/settings' }); closeModal(); },
        category: 'Navigation',
      },
      // Actions
      {
        id: 'new-project',
        label: 'Create New Project',
        icon: <Plus style={{ width: 14, height: 14 }} />,
        action: () => { openModal('create-project'); },
        category: 'Actions',
      },
    ];

    projects?.forEach((p) => {
      items.push({
        id: `project-${p.id}`,
        label: p.name,
        description: p.workspacePath || p.description,
        icon: <FolderOpen style={{ width: 14, height: 14 }} />,
        action: () => {
          navigate({ to: '/projects/$projectId', params: { projectId: p.id } });
          closeModal();
        },
        category: 'Projects',
      });
    });

    return items;
  }, [projects, navigate, closeModal, openModal]);

  const filtered = useMemo(() => {
    if (!query) return commands;
    const lower = query.toLowerCase();

    // slash prefix: only show shortcut items
    if (lower.startsWith('/')) {
      return commands.filter(
        (c) => c.category === 'Shortcuts' && c.shortcut?.startsWith(lower),
      );
    }

    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(lower) ||
        c.description?.toLowerCase().includes(lower) ||
        c.category.toLowerCase().includes(lower),
    );
  }, [commands, query]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      filtered[selectedIndex].action();
    } else if (e.key === 'Escape') {
      closeModal();
    }
  };

  // Group results
  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [filtered]);

  // Flat list for keyboard index alignment
  const flat = filtered;

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop blur */}
          <motion.div
            className="fixed inset-0 z-[70]"
            style={{ background: 'rgba(13,11,9,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={closeModal}
          />

          {/* Spotlight container */}
          <div
            className="fixed inset-0 z-[71] flex items-start justify-center"
            style={{ paddingTop: '22vh' }}
            onClick={closeModal}
          >
            <motion.div
              layoutId="spotlight-bar"
              style={{
                width: '100%',
                maxWidth: 600,
                background: '#031d38',
                border: '1px solid #03346E',
                borderTop: '1px solid rgba(110,172,218,0.35)',
                boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(110,172,218,0.06)',
                overflow: 'hidden',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{
                layout: { duration: 0.28, ease: [0.16, 1, 0.3, 1] },
                opacity: { duration: 0.15 },
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4" style={{ height: 52, borderBottom: '1px solid #03346E' }}>
                <Search style={{ width: 15, height: 15, flexShrink: 0, color: '#6EACDA' }} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search or type / for commands..."
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: 15,
                    color: '#E2E2B6',
                    fontFamily: 'var(--font-sans)',
                    letterSpacing: '-0.01em',
                  }}
                />
                {query ? (
                  <button
                    onClick={() => setQuery('')}
                    style={{
                      fontSize: 10,
                      fontFamily: 'var(--font-mono)',
                      color: '#9ca8a2',
                      background: '#042a52',
                      border: '1px solid #03346E',
                      padding: '2px 6px',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    clear
                  </button>
                ) : (
                  <kbd style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    color: '#3d4a50',
                    background: '#042a52',
                    border: '1px solid #03346E',
                    padding: '2px 6px',
                    flexShrink: 0,
                  }}>
                    esc
                  </kbd>
                )}
              </div>

              {/* Slash hint bar (shown when empty) */}
              {!query && (
                <div
                  className="flex items-center gap-3 px-4 py-2 overflow-x-auto"
                  style={{ borderBottom: '1px solid #2a2827', background: '#232120' }}
                >
                  <span style={{ fontSize: 10, color: '#3d4a50', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    shortcuts:
                  </span>
                  {['/agents', '/new', '/templates', '/settings'].map((s) => (
                    <button
                      key={s}
                      onClick={() => setQuery(s)}
                      style={{
                        fontSize: 11,
                        fontFamily: 'var(--font-mono)',
                        color: '#e2b04a',
                        background: 'rgba(254,128,25,0.08)',
                        border: '1px solid rgba(254,128,25,0.2)',
                        padding: '2px 8px',
                        cursor: 'pointer',
                        flexShrink: 0,
                        transition: 'all 0.12s',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(254,128,25,0.16)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(254,128,25,0.08)'; }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Results */}
              <div style={{ maxHeight: 360, overflowY: 'auto', padding: '6px 0' }}>
                {flat.length === 0 && (
                  <div style={{ padding: '48px 16px', textAlign: 'center' }}>
                    <p style={{ fontSize: 13, color: '#3d4a50', fontFamily: 'var(--font-mono)' }}>
                      no results for "{query}"
                    </p>
                  </div>
                )}

                {Array.from(grouped.entries()).map(([category, items]) => (
                  <div key={category}>
                    {/* Category header */}
                    <div style={{
                      padding: '8px 16px 4px',
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      fontFamily: 'var(--font-mono)',
                      color: '#3d4a50',
                    }}>
                      {category}
                    </div>

                    {items.map((item) => {
                      const flatIdx = flat.indexOf(item);
                      const isSelected = flatIdx === selectedIndex;
                      return (
                        <button
                          key={item.id}
                          onClick={item.action}
                          onMouseEnter={() => setSelectedIndex(flatIdx)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            width: 'calc(100% - 12px)',
                            margin: '0 6px',
                            padding: '8px 10px',
                            background: isSelected ? '#042a52' : 'transparent',
                            borderLeft: isSelected ? '2px solid #6EACDA' : '2px solid transparent',
                              color: isSelected ? '#E2E2B6' : '#9ca8a2',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'all 0.1s',
                          }}
                        >
                          <span style={{ color: isSelected ? categoryColor[category] : '#3d4a50', flexShrink: 0 }}>
                            {item.icon}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 13,
                              fontWeight: item.shortcut ? 500 : 400,
                              fontFamily: item.shortcut ? 'var(--font-mono)' : 'var(--font-sans)',
                              color: isSelected ? (item.shortcut ? '#e2b04a' : '#E2E2B6') : (item.shortcut ? '#e2b04a' : '#9ca8a2'),
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              lineHeight: 1.3,
                            }}>
                              {item.label}
                            </div>
                            {item.description && (
                              <div style={{
                                fontSize: 11,
                                color: '#3d4a50',
                                fontFamily: 'var(--font-mono)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                marginTop: 2,
                              }}>
                                {item.description}
                              </div>
                            )}
                          </div>
                          <span style={{
                            fontSize: 10,
                            fontFamily: 'var(--font-mono)',
                            color: isSelected ? categoryColor[category] : '#03346E',
                            background: isSelected ? `${categoryColor[category]}18` : 'transparent',
                            border: `1px solid ${isSelected ? `${categoryColor[category]}30` : 'transparent'}`,
                            padding: '1px 6px',
                            flexShrink: 0,
                            letterSpacing: '0.04em',
                            textTransform: 'uppercase',
                          }}>
                            {category}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div
                className="flex items-center justify-between px-4 py-2"
                style={{ borderTop: '1px solid #2a2827', background: '#232120' }}
              >
                <div className="flex items-center gap-4" style={{ fontSize: 10, color: '#3d4a50', fontFamily: 'var(--font-mono)' }}>
                  {[
                    { key: '↑↓', label: 'navigate' },
                    { key: '↵', label: 'select' },
                    { key: 'esc', label: 'close' },
                    { key: '/', label: 'commands' },
                  ].map(({ key, label }) => (
                    <span key={key} className="flex items-center gap-1.5">
                      <kbd style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        background: '#042a52',
                        border: '1px solid #03346E',
                        padding: '1px 5px',
                        color: '#637070',
                      }}>
                        {key}
                      </kbd>
                      {label}
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: 10, color: '#3d4a50', fontFamily: 'var(--font-mono)' }}>
                  {flat.length} result{flat.length !== 1 ? 's' : ''}
                </span>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
