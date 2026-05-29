import { Plus, Settings, Search } from 'lucide-react';
import { useNavigate } from '@tanstack/react-router';
import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useEffect, useMemo } from 'react';
import { useProjects } from '../api/hooks/use-projects';
import { useUIStore } from '../stores/ui.store';
import { ProjectList } from '../components/dashboard/project-list';
import { QuickCreateDialog } from '../components/dashboard/quick-create-dialog';

// ── Agent neural network background ───────────────────────────────────────
interface ANode { x: number; y: number; vx: number; vy: number; r: number; phase: number; phaseSpeed: number; pulse: number; ripple: number }
interface Packet { from: number; to: number; t: number; speed: number }

function NeuralCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef({ x: 0, y: 0, active: false });

  const nodes = useMemo<ANode[]>(() =>
    Array.from({ length: 26 }, (_, i) => ({
      x: 5 + Math.random() * 90,
      y: 5 + Math.random() * 90,
      vx: (Math.random() - 0.5) * 0.01,
      vy: (Math.random() - 0.5) * 0.01,
      r: i < 4 ? 4 + Math.random() * 2 : 1.6 + Math.random() * 2.4,
      phase: Math.random() * Math.PI * 2,
      phaseSpeed: 0.007 + Math.random() * 0.01,
      pulse: 0,
      ripple: 0,
    })), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf: number;
    const packets: Packet[] = [];
    let nextSpawn = 30;

    const spawnFrom = (src: number) => {
      const W = canvas.width, H = canvas.height;
      nodes[src].pulse = 1;
      nodes[src].ripple = 1;
      const THRESH = Math.min(W, H) * 0.3;
      const neighbors: number[] = [];
      for (let j = 0; j < nodes.length; j++) {
        if (j === src) continue;
        const dx = (nodes[src].x - nodes[j].x) / 100 * W;
        const dy = (nodes[src].y - nodes[j].y) / 100 * H;
        if (Math.sqrt(dx * dx + dy * dy) < THRESH) neighbors.push(j);
      }
      const count = Math.min(neighbors.length, 1 + Math.floor(Math.random() * 3));
      neighbors.sort(() => Math.random() - 0.5).slice(0, count).forEach(nb => {
        if (!packets.some(p => p.from === src && p.to === nb)) {
          packets.push({ from: src, to: nb, t: 0, speed: 0.004 + Math.random() * 0.007 });
        }
      });
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.current.x = ((e.clientX - rect.left) / rect.width) * 100;
      mouse.current.y = ((e.clientY - rect.top) / rect.height) * 100;
      mouse.current.active = true;
    };

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ((e.clientX - rect.left) / rect.width) * 100;
      const my = ((e.clientY - rect.top) / rect.height) * 100;
      const W = canvas.width, H = canvas.height;
      nodes.forEach((n, i) => {
        const dx = (n.x - mx) / 100 * W;
        const dy = (n.y - my) / 100 * H;
        if (Math.sqrt(dx * dx + dy * dy) < 220) spawnFrom(i);
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('click', onClick);

    const ATTRACT_PX = 180; // pixel radius for attraction
    const ACTIVATE_PX = 48; // pixel radius to trigger node
    const MAX_SPD = 0.055;

    const draw = () => {
      const W = canvas.offsetWidth;
      const H = canvas.offsetHeight;
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      ctx.clearRect(0, 0, W, H);

      const mpx = mouse.current.active ? mouse.current.x / 100 * W : -9999;
      const mpy = mouse.current.active ? mouse.current.y / 100 * H : -9999;

      // Move nodes + mouse influence
      nodes.forEach((n, i) => {
        const npx = n.x / 100 * W;
        const npy = n.y / 100 * H;
        const mdx = mpx - npx;
        const mdy = mpy - npy;
        const mdist = Math.sqrt(mdx * mdx + mdy * mdy);

        if (mouse.current.active && mdist < ATTRACT_PX && mdist > 0) {
          const force = (1 - mdist / ATTRACT_PX) * 0.0025;
          n.vx += (mdx / mdist) * force * 100 / W;
          n.vy += (mdy / mdist) * force * 100 / H;
          if (mdist < ACTIVATE_PX && n.pulse < 0.15) spawnFrom(i);
        }

        n.x += n.vx; n.y += n.vy;
        const spd = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        if (spd > MAX_SPD) { n.vx = n.vx / spd * MAX_SPD; n.vy = n.vy / spd * MAX_SPD; }
        if (n.x < 3) { n.x = 3; n.vx = Math.abs(n.vx); }
        if (n.x > 97) { n.x = 97; n.vx = -Math.abs(n.vx); }
        if (n.y < 3) { n.y = 3; n.vy = Math.abs(n.vy); }
        if (n.y > 97) { n.y = 97; n.vy = -Math.abs(n.vy); }
        n.phase += n.phaseSpeed;
        if (n.pulse > 0) n.pulse = Math.max(0, n.pulse - 0.018);
        if (n.ripple > 0) n.ripple = Math.max(0, n.ripple - 0.009);
      });

      // Spawn signals
      nextSpawn--;
      if (nextSpawn <= 0) {
        spawnFrom(Math.floor(Math.random() * nodes.length));
        nextSpawn = 55 + Math.floor(Math.random() * 90);
      }

      const THRESH = Math.min(W, H) * 0.3;

      // Draw edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = (a.x - b.x) / 100 * W;
          const dy = (a.y - b.y) / 100 * H;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < THRESH) {
            ctx.strokeStyle = `rgba(110,172,218,${(1 - dist / THRESH) * 0.07})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath();
            ctx.moveTo(a.x / 100 * W, a.y / 100 * H);
            ctx.lineTo(b.x / 100 * W, b.y / 100 * H);
            ctx.stroke();
          }
        }
      }

      // Mouse cursor field
      if (mouse.current.active) {
        const cg = ctx.createRadialGradient(mpx, mpy, 0, mpx, mpy, ATTRACT_PX);
        cg.addColorStop(0, 'rgba(110,172,218,0.05)');
        cg.addColorStop(0.5, 'rgba(110,172,218,0.02)');
        cg.addColorStop(1, 'rgba(110,172,218,0)');
        ctx.fillStyle = cg;
        ctx.beginPath();
        ctx.arc(mpx, mpy, ATTRACT_PX, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mpx, mpy, ATTRACT_PX, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(110,172,218,0.07)';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 7]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(mpx, mpy, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(110,172,218,0.45)';
        ctx.fill();
      }

      // Update and draw packets
      for (let i = packets.length - 1; i >= 0; i--) {
        const p = packets[i];
        p.t += p.speed;
        if (p.t >= 1) {
          nodes[p.to].pulse = 1;
          nodes[p.to].ripple = 1;
          packets.splice(i, 1);
          continue;
        }
        const fn = nodes[p.from], tn = nodes[p.to];
        const px = fn.x / 100 * W + (tn.x / 100 * W - fn.x / 100 * W) * p.t;
        const py = fn.y / 100 * H + (tn.y / 100 * H - fn.y / 100 * H) * p.t;

        // Trail
        const t0 = Math.max(0, p.t - 0.1);
        const tx0 = fn.x / 100 * W + (tn.x / 100 * W - fn.x / 100 * W) * t0;
        const ty0 = fn.y / 100 * H + (tn.y / 100 * H - fn.y / 100 * H) * t0;
        const trailGrad = ctx.createLinearGradient(tx0, ty0, px, py);
        trailGrad.addColorStop(0, 'rgba(110,172,218,0)');
        trailGrad.addColorStop(1, 'rgba(110,172,218,0.35)');
        ctx.strokeStyle = trailGrad;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(tx0, ty0);
        ctx.lineTo(px, py);
        ctx.stroke();

        // Glow dot
        const g = ctx.createRadialGradient(px, py, 0, px, py, 8);
        g.addColorStop(0, 'rgba(110,172,218,0.95)');
        g.addColorStop(0.4, 'rgba(110,172,218,0.35)');
        g.addColorStop(1, 'rgba(110,172,218,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      // Draw nodes
      nodes.forEach(n => {
        const px = n.x / 100 * W;
        const py = n.y / 100 * H;
        const ambient = 0.18 + 0.08 * Math.sin(n.phase);
        const glow = ambient + n.pulse * 0.6;
        const r = n.r * (1 + n.pulse * 1.2);

        // Ripple ring
        if (n.ripple > 0) {
          ctx.beginPath();
          ctx.arc(px, py, n.r + (1 - n.ripple) * 24, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(110,172,218,${n.ripple * 0.32})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Halo
        const halo = ctx.createRadialGradient(px, py, 0, px, py, r * 5);
        halo.addColorStop(0, `rgba(110,172,218,${glow * 0.3})`);
        halo.addColorStop(1, 'rgba(110,172,218,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(px, py, r * 5, 0, Math.PI * 2);
        ctx.fill();

        // Core dot
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(110,172,218,${Math.min(1, glow + 0.18)})`;
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('click', onClick);
    };
  }, [nodes]);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
    />
  );
}

export function DashboardPage() {
  const { data: projects, isLoading } = useProjects();
  const activeModal = useUIStore((s) => s.activeModal);
  const openModal = useUIStore((s) => s.openModal);
  const closeModal = useUIStore((s) => s.closeModal);
  const paletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const navigate = useNavigate();

  const projectCount = projects?.length ?? 0;

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg-base)', position: 'relative' }}>
      <NeuralCanvas />
      {/* Top bar */}
      <div
        className="relative flex items-center animate-fade-in-up w-full"
        style={{
          borderBottom: '1px solid var(--color-border-subtle)',
          animationDelay: '30ms',
          padding: '0 32px',
          height: 56,
          background: 'rgba(2,21,38,0.75)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          position: 'sticky',
          top: 0,
          zIndex: 2,
        }}
      >
        {/* Left: title */}
        <div className="flex items-center gap-2.5" style={{ flex: '1 1 0', minWidth: 0 }}>
          <h1 style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', lineHeight: 1 }}>
            Projects
          </h1>
          {!isLoading && (
            <span style={{
              fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)',
              background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-subtle)',
              padding: '2px 6px',
            }}>
              {projectCount}
            </span>
          )}
        </div>

        {/* Center: search bar — only shown when palette is closed */}
        <AnimatePresence>
          {!paletteOpen && (
            <motion.button
              layoutId="spotlight-bar"
              key="search-trigger"
              onClick={() => openModal('command-palette')}
              className="absolute flex items-center gap-2.5"
              style={{
                left: 'calc(50% - 160px)',
                width: 320,
                height: 34,
                padding: '0 14px',
                background: 'var(--color-bg-raised)',
                border: '1px solid var(--color-border-default)',
                color: 'var(--color-text-disabled)',
                fontFamily: 'var(--font-sans)',
                fontSize: 13,
                cursor: 'pointer',
                borderRadius: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(110,172,218,0.35)';
                e.currentTarget.style.background = 'var(--color-bg-overlay)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border-default)';
                e.currentTarget.style.background = 'var(--color-bg-raised)';
              }}
            >
              <Search style={{ width: 13, height: 13, flexShrink: 0 }} />
              <span style={{ flex: 1, textAlign: 'left' }}>Search or jump to...</span>
              <kbd style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
                padding: '1px 5px', color: 'var(--color-text-disabled)', flexShrink: 0,
              }}>
                ⌘K
              </kbd>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Right: new project */}
        <div className="flex items-center gap-2 justify-end" style={{ flex: '1 1 0', minWidth: 0 }}>
          <button
            onClick={() => openModal('create-project')}
            className="flex items-center gap-2 transition-all duration-150"
            style={{
              height: 34, padding: '0 16px',
              background: '#6EACDA', color: '#021526',
              fontSize: 13, fontWeight: 600,
              fontFamily: 'var(--font-sans)', border: 'none', whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#ffd561'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#6EACDA'; }}
          >
            <Plus style={{ width: 14, height: 14 }} />
            New Project
          </button>
        </div>
      </div>

      {/* Project grid */}
      <div
        className="flex-1 overflow-y-auto animate-fade-in-up"
        style={{ padding: '28px 32px', animationDelay: '90ms', position: 'relative', zIndex: 1 }}
      >
        <ProjectList
          projects={projects}
          isLoading={isLoading}
          onCreateProject={() => openModal('create-project')}
        />
      </div>

      {/* Bottom-left settings */}
      <div className="fixed z-10 animate-fade-in-up" style={{ bottom: '24px', left: '32px', animationDelay: '160ms' }}>
        <button
          onClick={() => navigate({ to: '/settings' })}
          className="flex items-center gap-2 transition-all duration-150"
          style={{
            height: 32, padding: '0 14px',
            background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
            color: 'var(--color-text-disabled)', fontSize: 12, fontFamily: 'var(--font-sans)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.color = 'var(--color-text-disabled)'; }}
        >
          <Settings style={{ width: 13, height: 13 }} />
          <span>Settings</span>
        </button>
      </div>

      <QuickCreateDialog open={activeModal === 'create-project'} onClose={closeModal} />
    </div>
  );
}
