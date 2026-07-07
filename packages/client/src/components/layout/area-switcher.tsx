import { useLayoutEffect, useRef, useState } from 'react';
import { Boxes, Network } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';

export type WorkspaceArea = 'agentic' | 'gateway';

const AREAS: { id: WorkspaceArea; label: string; icon: typeof Boxes; to: string; accent: string }[] = [
  { id: 'agentic', label: 'Agentic', icon: Boxes,   to: '/',        accent: '#7c8cf8' },
  { id: 'gateway', label: 'Gateway', icon: Network, to: '/gateway', accent: '#6db58a' },
];

/**
 * Top-level product-area toggle (Agentic ⇄ Gateway). Behaves like a switch: clicking anywhere
 * on the control flips to the other area, and the indicator pill slides across from the inactive
 * segment to the active one on every render (so a navigation animates the flip).
 */
export function AreaSwitcher({ active }: { active: WorkspaceArea }) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLButtonElement>(null);
  const segRefs = useRef<Record<WorkspaceArea, HTMLSpanElement | null>>({ agentic: null, gateway: null });
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  const other = AREAS.find((a) => a.id !== active)!;
  const activeAccent = AREAS.find((a) => a.id === active)?.accent ?? '#7c8cf8';

  useLayoutEffect(() => {
    const c = containerRef.current;
    const activeEl = segRefs.current[active];
    const inactiveEl = segRefs.current[other.id];
    if (!c || !activeEl || !inactiveEl) return;
    const cr = c.getBoundingClientRect();
    const ar = activeEl.getBoundingClientRect();
    const ir = inactiveEl.getBoundingClientRect();
    // Snap to the inactive segment (no transition), then slide to the active one next frame.
    setAnimate(false);
    setPill({ left: ir.left - cr.left, width: ir.width });
    const raf = requestAnimationFrame(() => {
      setAnimate(true);
      setPill({ left: ar.left - cr.left, width: ar.width });
    });
    return () => cancelAnimationFrame(raf);
  }, [active, other.id]);

  const toggle = () => navigate({ to: other.to });

  return (
    <button
      ref={containerRef}
      type="button"
      role="switch"
      aria-checked={active === 'gateway'}
      aria-label={`Workspace area: ${AREAS.find((a) => a.id === active)?.label}. Switch to ${other.label}.`}
      onClick={toggle}
      className="relative flex items-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
      style={{
        gap: 2,
        padding: 3,
        cursor: 'pointer',
        background: 'var(--color-bg-raised)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 999,
      }}
    >
      {/* Sliding indicator pill */}
      {pill && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 3,
            bottom: 3,
            left: pill.left,
            width: pill.width,
            borderRadius: 999,
            background: `${activeAccent}1f`,
            border: `1px solid ${activeAccent}59`,
            transition: animate
              ? 'left .28s cubic-bezier(.4,0,.2,1), width .28s cubic-bezier(.4,0,.2,1), background .2s'
              : 'none',
          }}
        />
      )}
      {AREAS.map((a) => {
        const on = a.id === active;
        const Icon = a.icon;
        return (
          <span
            key={a.id}
            ref={(el) => { segRefs.current[a.id] = el; }}
            className="relative flex items-center gap-1.5"
            style={{
              zIndex: 1,
              height: 28,
              padding: '0 14px',
              fontSize: 12.5,
              fontFamily: 'var(--font-sans)',
              fontWeight: on ? 600 : 500,
              whiteSpace: 'nowrap',
              transition: 'color .2s',
              color: on ? a.accent : 'var(--color-text-secondary)',
            }}
          >
            <Icon style={{ width: 13, height: 13, flexShrink: 0 }} aria-hidden="true" />
            {a.label}
          </span>
        );
      })}
    </button>
  );
}
