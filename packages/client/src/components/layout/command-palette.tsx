import { useState, useMemo, useRef, useEffect, useId } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, FolderOpen, Plus, Settings, FileCode2,
  LayoutDashboard, Bot, Zap, Boxes,
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
  Navigation: '#7c8cf8',
  Actions:    '#6db58a',
  Projects:   '#7c8cf8',
  Shortcuts:  '#e2b04a',
};

const RECENT_KEY = 'cmdk:recent';
const MAX_RECENT = 5;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function pushRecent(id: string) {
  try {
    const list = [id, ...readRecent().filter((x) => x !== id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const closeModal = useUIStore((s) => s.closeModal);
  const openModal = useUIStore((s) => s.openModal);
  const toggleCommandPalette = useUIStore((s) => s.toggleCommandPalette);
  const navigate = useNavigate();
  const { data: projects } = useProjects();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [usingMouse, setUsingMouse] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);
  const inputId = useId();
  const listboxId = useId();

  useKeyboardShortcut('meta+k', toggleCommandPalette);

  useEffect(() => {
    if (open) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 40);
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
        previouslyFocusedRef.current?.focus?.();
      };
    }
  }, [open]);

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      { id: 'slash-agents', label: '/agents', description: 'Jump to agents of a project', shortcut: '/agents',
        icon: <Bot style={{ width: 14, height: 14 }} />,
        action: () => {
          if (projects?.[0]) {
            navigate({ to: '/projects/$projectId/agents', params: { projectId: projects[0].id } });
            closeModal();
          }
        }, category: 'Shortcuts' },
      { id: 'slash-new', label: '/new', description: 'Create a new project', shortcut: '/new',
        icon: <Plus style={{ width: 14, height: 14 }} />,
        action: () => { openModal('create-project'); }, category: 'Shortcuts' },
      { id: 'slash-templates', label: '/templates', description: 'Browse agent templates', shortcut: '/templates',
        icon: <Zap style={{ width: 14, height: 14 }} />,
        action: () => { navigate({ to: '/templates' }); closeModal(); }, category: 'Shortcuts' },
      { id: 'slash-gateway', label: '/gateway', description: 'Gateway — keys, models, usage', shortcut: '/gateway',
        icon: <Boxes style={{ width: 14, height: 14 }} />,
        action: () => { navigate({ to: '/gateway' }); closeModal(); }, category: 'Shortcuts' },
      { id: 'slash-settings', label: '/settings', description: 'Open global settings', shortcut: '/settings',
        icon: <Settings style={{ width: 14, height: 14 }} />,
        action: () => { navigate({ to: '/settings' }); closeModal(); }, category: 'Shortcuts' },
      { id: 'dashboard', label: 'Go to Dashboard',
        icon: <LayoutDashboard style={{ width: 14, height: 14 }} />,
        action: () => { navigate({ to: '/' }); closeModal(); }, category: 'Navigation' },
      { id: 'templates', label: 'Browse Templates',
        icon: <FileCode2 style={{ width: 14, height: 14 }} />,
        action: () => { navigate({ to: '/templates' }); closeModal(); }, category: 'Navigation' },
      { id: 'gateway', label: 'Open Gateway',
        icon: <Boxes style={{ width: 14, height: 14 }} />,
        action: () => { navigate({ to: '/gateway' }); closeModal(); }, category: 'Navigation' },
      { id: 'settings', label: 'Open Settings',
        icon: <Settings style={{ width: 14, height: 14 }} />,
        action: () => { navigate({ to: '/settings' }); closeModal(); }, category: 'Navigation' },
      { id: 'new-project', label: 'Create New Project',
        icon: <Plus style={{ width: 14, height: 14 }} />,
        action: () => { openModal('create-project'); }, category: 'Actions' },
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
    if (!query) {
      // Surface recent items first when no query.
      const recentIds = readRecent();
      if (recentIds.length === 0) return commands;
      const byId = new Map(commands.map((c) => [c.id, c]));
      const recent = recentIds.map((id) => byId.get(id)).filter(Boolean) as CommandItem[];
      const rest = commands.filter((c) => !recentIds.includes(c.id));
      return [...recent, ...rest];
    }
    const lower = query.toLowerCase();
    if (lower.startsWith('/')) {
      return commands.filter((c) => c.category === 'Shortcuts' && c.shortcut?.startsWith(lower));
    }
    return commands.filter((c) =>
      c.label.toLowerCase().includes(lower) ||
      c.description?.toLowerCase().includes(lower) ||
      c.category.toLowerCase().includes(lower),
    );
  }, [commands, query]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  // Scroll selected item into view on keyboard nav.
  useEffect(() => {
    if (usingMouse || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-cmd-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex, usingMouse]);

  const runItem = (item: CommandItem) => {
    pushRecent(item.id);
    item.action();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    setUsingMouse(false);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelectedIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelectedIndex(filtered.length - 1);
    } else if (e.key === 'PageDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 5, filtered.length - 1));
    } else if (e.key === 'PageUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 5, 0));
    } else if (e.key === 'Enter' && filtered[selectedIndex]) {
      e.preventDefault();
      runItem(filtered[selectedIndex]);
    } else if (e.key === 'Escape') {
      closeModal();
    }
  };

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return map;
  }, [filtered]);

  const flat = filtered;

  const onBackdropMouseDown = (e: React.MouseEvent) => { mouseDownTargetRef.current = e.target; };
  const onBackdropClick = (e: React.MouseEvent) => {
    if (mouseDownTargetRef.current === e.currentTarget && e.target === e.currentTarget) closeModal();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[70]"
            style={{ background: 'rgba(13,11,9,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            aria-hidden="true"
          />

          <div
            className="fixed inset-0 z-[71] flex items-start justify-center"
            style={{ paddingTop: '22vh' }}
            onMouseDown={onBackdropMouseDown}
            onClick={onBackdropClick}
          >
            <motion.div
              layoutId="spotlight-bar"
              role="dialog"
              aria-modal="true"
              aria-label="Command palette"
              style={{
                width: '100%',
                maxWidth: 600,
                background: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-default)',
                borderTop: '1px solid rgba(124,140,248,0.35)',
                borderRadius: 'var(--radius-lg)',
                boxShadow: '0 32px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(124,140,248,0.06)',
                overflow: 'hidden',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ layout: { duration: 0.28, ease: [0.16, 1, 0.3, 1] }, opacity: { duration: 0.15 } }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search input (combobox) */}
              <div className="flex items-center gap-3 px-4" style={{ height: 52, borderBottom: '1px solid #03346E' }}>
                <Search style={{ width: 15, height: 15, flexShrink: 0, color: '#7c8cf8' }} aria-hidden="true" />
                <label htmlFor={inputId} className="sr-only">Search commands</label>
                <input
                  ref={inputRef}
                  id={inputId}
                  type="text"
                  role="combobox"
                  aria-expanded="true"
                  aria-controls={listboxId}
                  aria-autocomplete="list"
                  aria-activedescendant={flat[selectedIndex] ? `${listboxId}-${selectedIndex}` : undefined}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search or type / for commands..."
                  autoComplete="off"
                  style={{
                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                    fontSize: 15, color: '#E2E2B6', fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em',
                  }}
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                    style={{
                      fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)',
                      background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-default)',
                      borderRadius: 'var(--radius-sm)', padding: '4px 8px', cursor: 'pointer', flexShrink: 0,
                      minHeight: 24,
                    }}
                  >
                    clear
                  </button>
                ) : (
                  <kbd
                    aria-label="Press Escape to close"
                    style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--color-text-secondary)',
                      background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-default)',
                      borderRadius: 'var(--radius-sm)', padding: '2px 6px', flexShrink: 0,
                    }}
                  >
                    esc
                  </kbd>
                )}
              </div>

              {!query && (
                <div
                  className="flex items-center gap-3 px-4 py-2 overflow-x-auto"
                  style={{ borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-muted)' }}
                >
                  <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    shortcuts:
                  </span>
                  {['/agents', '/new', '/templates', '/gateway', '/settings'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setQuery(s)}
                      aria-label={`Filter by ${s}`}
                      style={{
                        fontSize: 11, fontFamily: 'var(--font-mono)',
                        color: 'var(--color-accent)', background: 'var(--color-accent-subtle)',
                        border: '1px solid rgba(124,140,248,0.25)',
                        borderRadius: 'var(--radius-sm)', padding: '4px 10px',
                        cursor: 'pointer', flexShrink: 0, transition: 'all 0.12s', minHeight: 24,
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(124,140,248,0.18)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-accent-subtle)'; }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

              <div
                ref={listRef}
                id={listboxId}
                role="listbox"
                aria-label="Command results"
                style={{ maxHeight: 360, overflowY: 'auto', padding: '6px 0' }}
                onMouseMove={() => setUsingMouse(true)}
              >
                {flat.length === 0 && (
                  <div style={{ padding: '48px 16px', textAlign: 'center' }} role="status" aria-live="polite">
                    <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      No results for "{query}"
                    </p>
                  </div>
                )}

                {Array.from(grouped.entries()).map(([category, items]) => (
                  <div key={category} role="group" aria-label={category}>
                    <div style={{
                      padding: '8px 16px 4px', fontSize: 9, fontWeight: 600,
                      letterSpacing: '0.1em', textTransform: 'uppercase',
                      fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)',
                    }}>
                      {category}
                    </div>

                    {items.map((item) => {
                      const flatIdx = flat.indexOf(item);
                      const isSelected = flatIdx === selectedIndex;
                      return (
                        <button
                          key={item.id}
                          id={`${listboxId}-${flatIdx}`}
                          role="option"
                          aria-selected={isSelected}
                          data-cmd-index={flatIdx}
                          type="button"
                          onClick={() => runItem(item)}
                          onMouseEnter={() => { if (usingMouse) setSelectedIndex(flatIdx); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            width: 'calc(100% - 12px)', margin: '0 6px', padding: '10px 10px',
                            background: isSelected ? '#042a52' : 'transparent',
                            borderLeft: isSelected ? '2px solid #7c8cf8' : '2px solid transparent',
                            color: isSelected ? '#E2E2B6' : '#c1c8c5',
                            cursor: 'pointer', textAlign: 'left',
                            transition: 'all 0.1s', minHeight: 40, border: 'none',
                          }}
                        >
                          <span style={{ color: isSelected ? categoryColor[category] : 'var(--color-text-secondary)', flexShrink: 0 }} aria-hidden="true">
                            {item.icon}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: 13,
                              fontWeight: item.shortcut ? 500 : 400,
                              fontFamily: item.shortcut ? 'var(--font-mono)' : 'var(--font-sans)',
                              color: isSelected ? (item.shortcut ? '#e2b04a' : '#E2E2B6') : (item.shortcut ? '#e2b04a' : 'var(--color-text-primary)'),
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3,
                            }}>
                              {item.label}
                            </div>
                            {item.description && (
                              <div style={{
                                fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2,
                              }}>
                                {item.description}
                              </div>
                            )}
                          </div>
                          <span style={{
                            fontSize: 10, fontFamily: 'var(--font-mono)',
                            color: isSelected ? categoryColor[category] : 'var(--color-text-secondary)',
                            background: isSelected ? `${categoryColor[category]}18` : 'transparent',
                            border: `1px solid ${isSelected ? `${categoryColor[category]}30` : 'transparent'}`,
                            padding: '2px 7px', flexShrink: 0,
                            letterSpacing: '0.04em', textTransform: 'uppercase',
                            borderRadius: 'var(--radius-sm)',
                          }} aria-hidden="true">
                            {category}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div
                className="flex items-center justify-between px-4 py-2"
                style={{ borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-muted)' }}
              >
                <div className="flex items-center gap-4" style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  {[
                    { key: '↑↓', label: 'navigate', aria: 'Arrow up and down' },
                    { key: '↵', label: 'select', aria: 'Enter' },
                    { key: 'esc', label: 'close', aria: 'Escape' },
                    { key: '/', label: 'commands', aria: 'Slash' },
                  ].map(({ key, label, aria }) => (
                    <span key={key} className="flex items-center gap-1.5">
                      <kbd aria-label={aria} style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9,
                        background: '#042a52', border: '1px solid #03346E',
                        padding: '2px 6px', color: 'var(--color-text-primary)',
                        borderRadius: 'var(--radius-sm)',
                      }}>
                        {key}
                      </kbd>
                      {label}
                    </span>
                  ))}
                </div>
                <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }} aria-live="polite">
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
