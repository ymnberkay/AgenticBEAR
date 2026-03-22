import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  FolderOpen,
  Plus,
  Settings,
  FileCode2,
  LayoutDashboard,
  ArrowRight,
} from 'lucide-react';
import { useUIStore } from '../../stores/ui.store';
import { useProjects } from '../../api/hooks/use-projects';
import { useKeyboardShortcut } from '../../hooks/use-keyboard-shortcut';
import { cn } from '../../lib/cn';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  category: string;
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
  const inputRef = useRef<HTMLInputElement>(null);

  useKeyboardShortcut('meta+k', toggleCommandPalette);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const commands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      {
        id: 'dashboard',
        label: 'Go to Dashboard',
        icon: <LayoutDashboard className="h-4 w-4" />,
        action: () => { navigate({ to: '/' }); closeModal(); },
        category: 'Navigation',
      },
      {
        id: 'new-project',
        label: 'Create New Project',
        icon: <Plus className="h-4 w-4" />,
        action: () => { openModal('create-project'); },
        category: 'Actions',
      },
      {
        id: 'templates',
        label: 'Browse Templates',
        icon: <FileCode2 className="h-4 w-4" />,
        action: () => { navigate({ to: '/templates' }); closeModal(); },
        category: 'Navigation',
      },
      {
        id: 'settings',
        label: 'Open Settings',
        icon: <Settings className="h-4 w-4" />,
        action: () => { navigate({ to: '/settings' }); closeModal(); },
        category: 'Navigation',
      },
    ];

    projects?.forEach((p) => {
      items.push({
        id: `project-${p.id}`,
        label: p.name,
        description: p.description || p.workspacePath,
        icon: <FolderOpen className="h-4 w-4" />,
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
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(lower) ||
        c.description?.toLowerCase().includes(lower) ||
        c.category.toLowerCase().includes(lower),
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

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

  const categoryColors: Record<string, string> = {
    Navigation: 'rgba(138, 173, 204, 0.15)',
    Actions: 'rgba(107, 191, 160, 0.15)',
    Projects: 'rgba(212, 146, 78, 0.15)',
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[70]"
            style={{ background: 'rgba(5, 4, 3, 0.82)', backdropFilter: 'blur(10px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            onClick={closeModal}
          />
          {/* Container — click outside modal card closes palette */}
          <div
            className="fixed inset-0 z-[71] flex items-start justify-center pt-[14vh] px-4"
            onClick={closeModal}
          >
            <motion.div
              className="w-full max-w-[540px] overflow-hidden"
              style={{
                background: 'var(--color-bg-raised)',
                border: '1px solid var(--color-border-default)',
                boxShadow: '0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(212,146,78,0.08), 0 0 40px rgba(212,146,78,0.06)',
              }}
              initial={{ opacity: 0, scale: 0.96, y: -12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -12 }}
              transition={{ duration: 0.14, ease: [0.16, 1, 0.3, 1] }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search input */}
              <div
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
              >
                <Search className="h-4 w-4 shrink-0" style={{ color: 'var(--color-accent)' }} />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search commands, projects..."
                  className="w-full bg-transparent text-[14px] text-text-primary placeholder:text-text-disabled outline-none tracking-tight"
                />
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    className="text-[10px] text-text-disabled hover:text-text-tertiary transition-colors px-1.5 py-0.5 shrink-0"
                    style={{ border: '1px solid var(--color-border-subtle)' }}
                  >
                    clear
                  </button>
                )}
              </div>

              {/* Results */}
              <div className="max-h-[340px] overflow-y-auto py-2">
                {filtered.length === 0 && (
                  <div className="px-4 py-12 text-center">
                    <Search className="h-6 w-6 text-text-disabled mx-auto mb-2.5" />
                    <p className="text-[13px] text-text-disabled">No results for "{query}"</p>
                  </div>
                )}
                {filtered.map((item, i) => (
                  <button
                    key={item.id}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-all duration-120 mx-2"
                    style={{
                      width: 'calc(100% - 16px)',
                      background: i === selectedIndex
                        ? 'var(--color-bg-overlay)'
                        : 'transparent',
                      border: `1px solid ${i === selectedIndex ? 'var(--color-border-subtle)' : 'transparent'}`,
                      color: i === selectedIndex
                        ? 'var(--color-text-primary)'
                        : 'var(--color-text-secondary)',
                    }}
                  >
                    <span
                      className="shrink-0 transition-colors duration-150"
                      style={{ color: i === selectedIndex ? 'var(--color-accent)' : 'var(--color-text-tertiary)' }}
                    >
                      {item.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate leading-snug">{item.label}</div>
                      {item.description && (
                        <div className="text-[11px] text-text-disabled truncate mt-0.5 font-mono">
                          {item.description}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className="text-[10px] font-medium px-2 py-0.5"
                        style={{
                          background: categoryColors[item.category] ?? 'var(--color-bg-hover)',
                          color: 'var(--color-text-tertiary)',
                          border: '1px solid var(--color-border-subtle)',
                        }}
                      >
                        {item.category}
                      </span>
                      {i === selectedIndex && (
                        <ArrowRight className="h-3 w-3 text-text-tertiary" />
                      )}
                    </div>
                  </button>
                ))}
              </div>

              {/* Footer */}
              <div
                className="flex items-center justify-between px-4 py-2.5"
                style={{ borderTop: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}
              >
                <div className="flex items-center gap-4 text-[10px] text-text-disabled">
                  <span className="flex items-center gap-1.5">
                    <kbd
                      className="font-mono px-1.5 py-0.5 text-[9px]"
                      style={{ background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-subtle)' }}
                    >
                      ↑↓
                    </kbd>
                    navigate
                  </span>
                  <span className="flex items-center gap-1.5">
                    <kbd
                      className="font-mono px-1.5 py-0.5 text-[9px]"
                      style={{ background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-subtle)' }}
                    >
                      ↵
                    </kbd>
                    select
                  </span>
                  <span className="flex items-center gap-1.5">
                    <kbd
                      className="font-mono px-1.5 py-0.5 text-[9px]"
                      style={{ background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-subtle)' }}
                    >
                      esc
                    </kbd>
                    close
                  </span>
                </div>
                <span className="text-[10px] text-text-disabled">
                  {filtered.length} result{filtered.length !== 1 ? 's' : ''}
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
