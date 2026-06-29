import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
import type { PromptTemplate } from '@subagent/shared';
import { useTemplates } from '../api/hooks/use-templates';
import { useUIStore } from '../stores/ui.store';
import { TemplateList } from '../components/templates/template-list';
import { TemplateEditor } from '../components/templates/template-editor';
import { Dialog } from '../components/ui/dialog';
import { UserMenu } from '../components/layout/user-menu';

export function TemplatesPage() {
  const { data: templates, isLoading } = useTemplates();
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | undefined>();
  const openModal = useUIStore((s) => s.openModal);
  const paletteOpen = useUIStore((s) => s.commandPaletteOpen);

  const handleSelect = (template: PromptTemplate) => { setEditingTemplate(template); setShowEditor(true); };
  const handleCreate = () => { setEditingTemplate(undefined); setShowEditor(true); };

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg-base)', position: 'relative' }}>
      <div className="ambient" />
      {/* Top bar — consistent with the dashboard/project header */}
      <div
        className="relative flex items-center w-full"
        style={{
          height: 56, padding: '0 32px', position: 'sticky', top: 0, zIndex: 2,
          borderBottom: '1px solid var(--color-border-subtle)',
          background: 'rgba(2,21,38,0.75)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        {/* Left: breadcrumb + count */}
        <div className="flex items-center gap-2.5" style={{ flex: '1 1 0', minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          <Link to="/" style={{ color: 'var(--color-text-disabled)', textDecoration: 'none', flexShrink: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; }}>
            agenticbear
          </Link>
          <span style={{ color: 'var(--color-border-default)' }}>/</span>
          <span style={{ color: 'var(--color-text-primary)', fontWeight: 500, fontFamily: 'var(--font-sans)', fontSize: 15 }}>Templates</span>
          {!isLoading && (
            <span style={{ fontSize: 10, color: 'var(--color-text-disabled)', background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: '2px 6px' }}>
              {templates?.length ?? 0}
            </span>
          )}
        </div>

        {/* Center: search trigger */}
        <AnimatePresence>
          {!paletteOpen && (
            <motion.button
              layoutId="spotlight-bar" key="search-trigger"
              type="button"
              onClick={() => openModal('command-palette')}
              aria-label="Open command palette (Cmd+K)"
              aria-keyshortcuts="Meta+K"
              className="absolute flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                left: 'calc(50% - 160px)', width: 320, height: 36, padding: '0 14px',
                background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-default)',
                color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', fontSize: 13,
                cursor: 'pointer', borderRadius: 'var(--radius-md)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(124,140,248,0.35)'; e.currentTarget.style.background = 'var(--color-bg-overlay)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.background = 'var(--color-bg-raised)'; }}
            >
              <Search style={{ width: 13, height: 13, flexShrink: 0 }} aria-hidden="true" />
              <span style={{ flex: 1, textAlign: 'left' }}>Search or jump to...</span>
              <kbd aria-hidden="true" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', padding: '2px 6px', color: 'var(--color-text-secondary)', flexShrink: 0 }}>⌘K</kbd>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Right: new template + account */}
        <div className="flex items-center gap-3 justify-end" style={{ flex: '1 1 0', minWidth: 0 }}>
          <button
            type="button"
            onClick={handleCreate}
            className="flex items-center gap-2 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 16px', borderRadius: 'var(--radius-md)', background: 'var(--color-accent)', color: '#021526', fontSize: 13, fontWeight: 600, border: 'none', whiteSpace: 'nowrap', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--color-accent)'; }}>
            <Plus style={{ width: 14, height: 14 }} aria-hidden="true" /> New Template
          </button>
          <div style={{ width: 1, height: 22, background: 'var(--color-border-subtle)' }} />
          <UserMenu />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto animate-fade-in-up" style={{ padding: '28px 32px', position: 'relative', zIndex: 1 }}>
        <p style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginBottom: 22 }}>
          Reusable prompt templates for your agents
        </p>
        <TemplateList templates={templates} isLoading={isLoading} onSelect={handleSelect} />
      </div>

      <Dialog open={showEditor} onClose={() => setShowEditor(false)} maxWidth="680px">
        <TemplateEditor template={editingTemplate} onClose={() => setShowEditor(false)} />
      </Dialog>
    </div>
  );
}
