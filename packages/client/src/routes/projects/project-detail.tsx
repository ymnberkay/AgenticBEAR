import { Outlet, useParams, Link } from '@tanstack/react-router';
import { Settings, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useEffect, useMemo } from 'react';
import { useProject } from '../../api/hooks/use-projects';
import { ProjectNav } from '../../components/layout/project-nav';
import { Skeleton } from '../../components/ui/skeleton';
import { useUIStore } from '../../stores/ui.store';

// ── Abstract network background ───────────────────────────────────────────────
interface Node { x: number; y: number; vx: number; vy: number; r: number; pulse: number; speed: number }

function NetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodes = useMemo<Node[]>(() => Array.from({ length: 14 }, () => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    vx: (Math.random() - 0.5) * 0.012,
    vy: (Math.random() - 0.5) * 0.012,
    r: 1.5 + Math.random() * 2,
    pulse: Math.random() * Math.PI * 2,
    speed: 0.008 + Math.random() * 0.012,
  })), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf: number;
    let t = 0;

    const draw = () => {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }

      ctx.clearRect(0, 0, W, H);
      t += 1;

      // move nodes
      nodes.forEach((n) => {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > 100) n.vx *= -1;
        if (n.y < 0 || n.y > 100) n.vy *= -1;
        n.pulse += n.speed;
      });

      // edges between nearby nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = (a.x - b.x) / 100 * W;
          const dy = (a.y - b.y) / 100 * H;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 160) {
            const alpha = (1 - dist / 160) * 0.12;
            ctx.strokeStyle = `rgba(250,189,47,${alpha})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x / 100 * W, a.y / 100 * H);
            ctx.lineTo(b.x / 100 * W, b.y / 100 * H);
            ctx.stroke();
          }
        }
      }

      // nodes
      nodes.forEach((n) => {
        const px = n.x / 100 * W;
        const py = n.y / 100 * H;
        const glow = 0.25 + 0.15 * Math.sin(n.pulse);
        const radius = n.r * (1 + 0.3 * Math.sin(n.pulse));
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(250,189,47,${glow})`;
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(raf);
  }, [nodes]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', opacity: 0.45,
      }}
    />
  );
}

const statusConfig: Record<string, { color: string; label: string }> = {
  active:   { color: '#b8bb26', label: 'active' },
  archived: { color: '#928374', label: 'archived' },
  draft:    { color: '#83a598', label: 'draft' },
};

export function ProjectDetailPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: project, isLoading } = useProject(projectId);
  const paletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const openModal = useUIStore((s) => s.openModal);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="shrink-0 px-6 py-3" style={{ background: 'var(--color-bg-nav)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <Skeleton height={14} width={200} />
        </div>
        <div className="flex-1 p-8" style={{ background: 'var(--color-bg-base)' }}>
          <Skeleton height={300} />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2" style={{ background: 'var(--color-bg-base)' }}>
        <p style={{ fontSize: 13, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)' }}>project not found</p>
      </div>
    );
  }

  const status = statusConfig[project.status] ?? statusConfig.draft;

  return (
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div
        className="shrink-0"
        style={{
          background: 'rgba(29,32,33,0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <div className="relative flex items-center w-full" style={{ padding: '0 24px', height: 44 }}>
          {/* Left: breadcrumb */}
          <div className="flex items-center gap-2" style={{ flex: '1 1 0', minWidth: 0, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            <Link
              to="/"
              style={{ color: 'var(--color-text-disabled)', textDecoration: 'none', flexShrink: 0, transition: 'color 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fabd2f'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; }}
            >
              agenticbear
            </Link>
            <span style={{ color: 'var(--color-border-default)' }}>/</span>
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {project.name}
            </span>
            <span
              style={{
                flexShrink: 0,
                fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                fontFamily: 'var(--font-mono)',
                color: status.color, background: `${status.color}12`, border: `1px solid ${status.color}28`,
                padding: '2px 7px',
              }}
            >
              {status.label}
            </span>
          </div>

          {/* Center: search bar */}
          <AnimatePresence>
            {!paletteOpen && (
              <motion.button
                layoutId="spotlight-bar"
                key="search-trigger"
                onClick={() => openModal('command-palette')}
                className="absolute flex items-center gap-2.5"
                style={{
                  left: 'calc(50% - 160px)',
                  width: 320, height: 30,
                  padding: '0 12px',
                  background: 'var(--color-bg-raised)',
                  border: '1px solid var(--color-border-default)',
                  color: 'var(--color-text-disabled)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: 12,
                  cursor: 'pointer',
                  borderRadius: 0,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(250,189,47,0.35)'; e.currentTarget.style.background = 'var(--color-bg-overlay)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.background = 'var(--color-bg-raised)'; }}
              >
                <Search style={{ width: 12, height: 12, flexShrink: 0 }} />
                <span style={{ flex: 1, textAlign: 'left' }}>Search or jump to...</span>
                <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 9, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', padding: '1px 5px', color: 'var(--color-text-disabled)', flexShrink: 0 }}>
                  ⌘K
                </kbd>
              </motion.button>
            )}
          </AnimatePresence>

          {/* Right: settings */}
          <div className="flex items-center justify-end" style={{ flex: '1 1 0', minWidth: 0 }}>
            <Link
              to="/projects/$projectId/settings"
              params={{ projectId: project.id }}
              className="flex items-center gap-1.5"
              style={{
                height: 28, padding: '0 10px',
                color: 'var(--color-text-disabled)',
                border: '1px solid var(--color-border-subtle)',
                fontFamily: 'var(--font-mono)', fontSize: 11,
                textDecoration: 'none',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#fabd2f'; e.currentTarget.style.borderColor = 'rgba(250,189,47,0.3)'; e.currentTarget.style.background = 'rgba(250,189,47,0.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.background = 'transparent'; }}
            >
              <Settings style={{ width: 12, height: 12 }} />
              <span>settings</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 relative min-h-0" style={{ background: 'var(--color-bg-base)' }}>
        <ProjectNav project={project} />
        <div
          className="absolute inset-0 overflow-y-auto"
          style={{ background: 'var(--color-bg-base)', left: 'var(--nav-width)', padding: '32px 40px' }}
        >
          {/* Abstract background decoration */}
          <NetworkCanvas />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
