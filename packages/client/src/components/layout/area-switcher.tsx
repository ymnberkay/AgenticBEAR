import { useLayoutEffect, useRef, useState } from 'react';
import { Boxes, Network } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

export type WorkspaceArea = 'agentic' | 'gateway';

const AREAS: { id: WorkspaceArea; label: string; icon: typeof Boxes; to: string; accent: string }[] = [
  { id: 'agentic', label: 'Agentic', icon: Boxes,   to: '/',        accent: '#7c8cf8' },
  { id: 'gateway', label: 'Gateway', icon: Network, to: '/gateway', accent: '#6db58a' },
];

/**
 * Top-level product-area switcher (Agentic | Gateway). A modern segmented control
 * with a sliding glow indicator that re-anchors when the active area changes.
 */
export function AreaSwitcher({ active }: { active: WorkspaceArea }) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<WorkspaceArea, HTMLButtonElement | null>>({ agentic: null, gateway: null });
  const [pill, setPill] = useState<{ left: number; width: number }>({ left: 4, width: 0 });
  const activeAccent = AREAS.find((a) => a.id === active)?.accent ?? '#7c8cf8';

  useLayoutEffect(() => {
    const c = containerRef.current; const b = btnRefs.current[active];
    if (!c || !b) return;
    const cr = c.getBoundingClientRect(); const br = b.getBoundingClientRect();
    setPill({ left: br.left - cr.left, width: br.width });
  }, [active]);

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Workspace area"
      className="relative flex items-center"
      style={{
        gap: 4,
        padding: 4,
        background: 'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 999,
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        boxShadow: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.4)',
      }}
    >
      {/* Sliding indicator pill */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 4,
          bottom: 4,
          left: pill.left,
          width: pill.width,
          borderRadius: 999,
          background: `linear-gradient(180deg, ${activeAccent}22 0%, ${activeAccent}14 100%)`,
          border: `1px solid ${activeAccent}55`,
          boxShadow: `0 0 0 1px ${activeAccent}10, 0 8px 20px -10px ${activeAccent}88`,
          transition: 'left .28s cubic-bezier(.4,0,.2,1), width .28s cubic-bezier(.4,0,.2,1), background .2s',
        }}
      />
      {AREAS.map((a) => {
        const on = a.id === active;
        const Icon = a.icon;
        return (
          <button
            key={a.id}
            ref={(el) => { btnRefs.current[a.id] = el; }}
            role="tab"
            type="button"
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            onClick={() => { if (!on) navigate({ to: a.to }); }}
            className="relative flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              zIndex: 1,
              height: 36,
              padding: '0 18px',
              fontSize: 13,
              fontFamily: 'var(--font-sans)',
              fontWeight: on ? 600 : 500,
              letterSpacing: on ? '-0.005em' : 0,
              cursor: on ? 'default' : 'pointer',
              borderRadius: 999,
              border: 'none',
              whiteSpace: 'nowrap',
              transition: 'color .2s',
              background: 'transparent',
              color: on ? a.accent : 'var(--color-text-secondary)',
            }}
            onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = 'var(--color-text-primary)'; }}
            onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
          >
            <Icon style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden="true" />
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
