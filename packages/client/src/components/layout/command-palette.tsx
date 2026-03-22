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

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[70]"
            style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.1 }}
            onClick={closeModal}
          />
          <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[16vh]">
            <motion.div
              className="w-full max-w-[520px] rounded-xl overflow-hidden"
              style={{
                background: 'var(--color-bg-surface)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6), 0 0 40px rgba(99, 102, 241, 0.05)',
              }}
              initial={{ opacity: 0, scale: 0.97, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -8 }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
            >
              {/* Search */}
              <div
                className="flex items-center gap-3 px-4 py-3.5"
                style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.07)' }}
              >
                <Search className="h-4 w-4 text-[#5a5a6e] shrink-0" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search commands, projects..."
                  className="w-full bg-transparent text-[14px] text-[#e2e2e8] placeholder:text-[#3a3a4a] outline-none"
                />
              </div>

              {/* Results */}
              <div className="max-h-[320px] overflow-y-auto py-1.5">
                {filtered.length === 0 && (
                  <div className="px-4 py-10 text-center text-[13px] text-[#3a3a4a]">
                    No results found
                  </div>
                )}
                {filtered.map((item, i) => (
                  <button
                    key={item.id}
                    onClick={item.action}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-all duration-150 mx-1.5 rounded-xl',
                      i === selectedIndex
                        ? 'text-[#e2e2e8]'
                        : 'text-[#5a5a6e]',
                    )}
                    style={
                      i === selectedIndex
                        ? {
                            background: 'rgba(255, 255, 255, 0.05)',
                            width: 'calc(100% - 12px)',
                          }
                        : { width: 'calc(100% - 12px)' }
                    }
                  >
                    <span
                      className={cn(
                        'shrink-0 transition-colors duration-150',
                        i === selectedIndex ? 'text-[#a78bfa]' : 'text-[#5a5a6e]',
                      )}
                    >
                      {item.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium truncate">{item.label}</div>
                      {item.description && (
                        <div className="text-[11px] text-[#3a3a4a] truncate mt-0.5">
                          {item.description}
                        </div>
                      )}
                    </div>
                    <span
                      className="text-[10px] font-medium px-2 py-0.5 rounded-md shrink-0"
                      style={{
                        background: 'rgba(255, 255, 255, 0.04)',
                        color: '#5a5a6e',
                      }}
                    >
                      {item.category}
                    </span>
                  </button>
                ))}
              </div>

              {/* Footer */}
              <div
                className="flex items-center gap-4 px-4 py-2.5 text-[10px] text-[#3a3a4a]"
                style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}
              >
                <span className="flex items-center gap-1">
                  <kbd className="font-mono px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)' }}>{'\u2191\u2193'}</kbd>
                  navigate
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="font-mono px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)' }}>{'\u21B5'}</kbd>
                  select
                </span>
                <span className="flex items-center gap-1">
                  <kbd className="font-mono px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)' }}>esc</kbd>
                  close
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
