import { useEffect, useMemo, useRef, useState, useId } from 'react';
import {
  Search, Server, KeyRound, Cpu, Boxes, Zap, Copy, Check,
  LayoutDashboard, BarChart3, Users2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useUIStore } from '../stores/ui.store';
import { useToast } from '../components/ui/toast';
import { UserMenu } from '../components/layout/user-menu';
import { AreaSwitcher } from '../components/layout/area-switcher';
import { ProvidersTab } from '../components/settings/providers-tab';
import { ApiKeysTab } from '../components/settings/api-keys-tab';
import { ModelsTab } from '../components/settings/models-tab';
import { GatewayUsage } from '../components/settings/gateway-usage';
import { Panel } from '../components/settings/gateway-ui';
import { Kpi, fmt } from '../components/charts/usage-bits';
import { useGatewayKeys, useModelCatalog, useGatewayUsage } from '../api/hooks/use-gateway';
import { useUsers, useMe } from '../api/hooks/use-auth';
import { AdminRequired } from '../components/layout/admin-required';
import type { AnalyticsRange } from '../api/hooks/use-analytics';

const SECTIONS = [
  { id: 'overview',  label: 'Overview',  desc: 'everything at a glance', icon: LayoutDashboard },
  { id: 'providers', label: 'Providers', desc: 'provider credentials',   icon: Server },
  { id: 'apikeys',   label: 'API Keys',  desc: 'gateway access keys',     icon: KeyRound },
  { id: 'models',    label: 'Models',    desc: 'curate reachable models', icon: Cpu },
  { id: 'usage',     label: 'Usage',     desc: 'request volume & cost',   icon: BarChart3 },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

function readHashSection(): SectionId | null {
  if (typeof window === 'undefined') return null;
  const id = window.location.hash.slice(1) as SectionId;
  return SECTIONS.some((s) => s.id === id) ? id : null;
}

/** Gateway overview — the hub landing screen: at-a-glance KPIs + per-provider model breakdown. */
function GatewayOverview() {
  const { data: keys } = useGatewayKeys();
  const { data: catalog } = useModelCatalog();
  const { data: users } = useUsers();
  const { data: usage } = useGatewayUsage({ range: '30d' });
  const [copied, setCopied] = useState(false);
  const baseUrl = `${window.location.origin}/v1`;

  const enabledModels = (catalog ?? []).filter((m) => m.enabled !== false).length;
  const totalModels = catalog?.length ?? 0;

  const byProvider = useMemo(() => {
    const m = new Map<string, { total: number; enabled: number }>();
    for (const model of catalog ?? []) {
      const e = m.get(model.owned_by) ?? { total: 0, enabled: 0 };
      e.total++;
      if (model.enabled !== false) e.enabled++;
      m.set(model.owned_by, e);
    }
    return [...m.entries()].sort((a, b) => b[1].total - a[1].total);
  }, [catalog]);

  const copyUrl = () => {
    navigator.clipboard?.writeText(baseUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Hero endpoint card — a stronger first read than a plain Panel header. */}
      <div
        className="relative overflow-hidden"
        style={{
          padding: '20px 22px',
          background: 'linear-gradient(135deg, rgba(124,140,248,0.10) 0%, rgba(124,140,248,0.02) 60%, transparent 100%)',
          border: '1px solid rgba(124,140,248,0.28)',
          borderRadius: 14,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 36px -22px rgba(124,140,248,0.7)',
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute"
          style={{
            inset: 0,
            background: 'radial-gradient(420px 180px at 0% 0%, rgba(124,140,248,0.10), transparent 70%)',
          }}
        />
        <div className="relative flex items-start gap-3 flex-wrap">
          <div
            aria-hidden="true"
            style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: 'linear-gradient(135deg, rgba(124,140,248,0.28), rgba(124,140,248,0.08))',
              border: '1px solid rgba(124,140,248,0.45)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 8px 22px -12px rgba(124,140,248,0.7)',
            }}
          >
            <Server style={{ width: 16, height: 16, color: '#7c8cf8' }} aria-hidden="true" />
          </div>
          <div className="flex flex-col" style={{ flex: '1 1 280px', minWidth: 0 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#7c8cf8', fontFamily: 'var(--font-mono)' }}>
              OpenAI-compatible endpoint
            </span>
            <div className="flex items-center justify-between gap-2" style={{ marginTop: 10, padding: '10px 12px', background: 'rgba(2,21,38,0.55)', border: '1px solid rgba(124,140,248,0.22)', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 12.5, color: 'var(--color-text-primary)' }}>
              <span className="truncate">{baseUrl}</span>
              <button
                type="button"
                onClick={copyUrl}
                aria-label={copied ? 'Base URL copied' : 'Copy base URL'}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? '#6db58a' : 'var(--color-text-secondary)', padding: 6, borderRadius: 4, flexShrink: 0 }}
              >
                {copied ? <Check style={{ width: 13, height: 13 }} aria-hidden="true" /> : <Copy style={{ width: 13, height: 13 }} aria-hidden="true" />}
              </button>
            </div>
            <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginTop: 10, marginBottom: 0 }}>
              Point any OpenAI-compatible SDK here. Manage keys under <strong style={{ color: 'var(--color-text-primary)' }}>API Keys</strong>, curate reachable models under <strong style={{ color: 'var(--color-text-primary)' }}>Models</strong>.
            </p>
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(168px, 1fr))', gap: 12 }}>
        <Kpi icon={<Boxes style={{ width: 13, height: 13 }} />} label="Reachable models" value={`${enabledModels}/${totalModels}`} sub="enabled / total" accent="var(--color-info)" />
        <Kpi icon={<Cpu style={{ width: 13, height: 13 }} />} label="Providers" value={String(byProvider.length)} sub="connected" accent="var(--color-success)" />
        <Kpi icon={<KeyRound style={{ width: 13, height: 13 }} />} label="API Keys" value={String(keys?.length ?? 0)} sub="gateway credentials" accent="#d88aa0" />
        <Kpi icon={<Users2 style={{ width: 13, height: 13 }} />} label="Users" value={String(users?.length ?? 0)} sub="org members" accent="#7c8cf8" />
        <Kpi icon={<Zap style={{ width: 13, height: 13 }} />} label="Requests" value={fmt(usage?.totalRequests ?? 0)} sub="last 30 days" accent="var(--color-warning)" />
      </div>

      <Panel icon={<Cpu style={{ width: 12, height: 12 }} aria-hidden="true" />} color="#7c8cf8" title="Models by provider">
        {byProvider.length === 0 ? (
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No models discovered yet — add a provider key.</span>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {byProvider.map(([provider, { total, enabled }]) => {
              const ratio = total > 0 ? enabled / total : 0;
              return (
                <div
                  key={provider}
                  className="flex flex-col gap-2"
                  style={{ padding: '12px 14px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 10 }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{provider}</span>
                    <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: enabled === 0 ? 'var(--color-text-disabled)' : '#6db58a', whiteSpace: 'nowrap' }}>
                      {enabled}/{total}
                    </span>
                  </div>
                  <div aria-hidden="true" style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                    <div style={{ width: `${ratio * 100}%`, height: '100%', background: enabled === 0 ? 'var(--color-text-disabled)' : 'linear-gradient(90deg, #6db58a, #22c55e)', transition: 'width .3s' }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

/** Gateway usage with a segmented range picker wrapping the shared GatewayUsage view. */
function GatewayUsagePanel() {
  const [range, setRange] = useState<AnalyticsRange>('30d');
  const RANGES: { value: AnalyticsRange; label: string }[] = [
    { value: '24h', label: '24h' },
    { value: '7d',  label: '7d'  },
    { value: '30d', label: '30d' },
    { value: '90d', label: '90d' },
    { value: 'all', label: 'all' },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-end">
        <div role="group" aria-label="Time range" className="flex items-center" style={{ gap: 2, padding: 3, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 999 }}>
          {RANGES.map((r) => {
            const on = range === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setRange(r.value)}
                aria-pressed={on}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{
                  height: 26, padding: '0 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
                  background: on ? 'linear-gradient(180deg, rgba(124,140,248,0.22), rgba(124,140,248,0.10))' : 'transparent',
                  border: on ? '1px solid rgba(124,140,248,0.4)' : '1px solid transparent',
                  color: on ? '#7c8cf8' : 'var(--color-text-secondary)',
                  borderRadius: 999, cursor: on ? 'default' : 'pointer',
                  fontWeight: on ? 600 : 500, transition: 'background .15s, color .15s, border-color .15s',
                }}
                onMouseEnter={(e) => { if (!on) e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                onMouseLeave={(e) => { if (!on) e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
      <GatewayUsage range={range} />
    </div>
  );
}

/** The Gateway control center — a left-nav hub, one of the two top-level workspace areas. */
export function GatewayPage() {
  const me = useMe();
  const { show: showToast } = useToast();
  const openModal = useUIStore((s) => s.openModal);
  const navCollapsed = useUIStore((s) => s.gatewayNavCollapsed);
  const toggleNav = useUIStore((s) => s.toggleGatewayNav);
  const [section, setSection] = useState<SectionId>(() => readHashSection() ?? 'overview');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onHash = () => {
      const next = readHashSection();
      if (next) setSection(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [section]);

  const go = (next: SectionId) => {
    setSection(next);
    if (window.location.hash !== `#${next}`) {
      history.replaceState(null, '', `#${next}`);
    }
  };

  const current = SECTIONS.find((s) => s.id === section)!;
  // Overview & Usage are dashboards (wide); the rest are management forms (narrower column).
  const wide = section === 'overview' || section === 'usage';

  if (me.data && me.data.role !== 'admin') return <AdminRequired area="The Gateway area" />;

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--color-bg-base)', position: 'relative' }}>
      {/* Calm static ambient — dot-grid + glow, shared across the whole page so the
          backdrop reads continuous from header to sidebar to content. */}
      <div className="ambient" />
      {/* Top bar — search center, account menu right */}
      <div
        className="relative flex items-center shrink-0 w-full"
        style={{
          borderBottom: '1px solid var(--color-border-subtle)',
          padding: '0 32px',
          height: 56,
          background: 'rgba(2,21,38,0.78)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          zIndex: 3,
        }}
      >
        {/* Left — product-area switcher (Agentic | Gateway) */}
        <div className="flex items-center" style={{ flex: '1 1 0', minWidth: 0 }}>
          <AreaSwitcher active="gateway" />
        </div>
        <button
          type="button"
          onClick={() => openModal('command-palette')}
          aria-label="Open command palette (Cmd+K)"
          aria-keyshortcuts="Meta+K"
          className="absolute flex items-center gap-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            left: 'calc(50% - 190px)', width: 380, height: 36, padding: '0 14px',
            background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-default)',
            color: 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', fontSize: 13,
            cursor: 'pointer', borderRadius: 'var(--radius-md)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(124,140,248,0.35)'; e.currentTarget.style.background = 'var(--color-bg-overlay)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; e.currentTarget.style.background = 'var(--color-bg-raised)'; }}
        >
          <Search style={{ width: 13, height: 13, flexShrink: 0 }} aria-hidden="true" />
          <span style={{ flex: 1, textAlign: 'left' }}>Search or jump to...</span>
          <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', padding: '2px 6px', color: 'var(--color-text-secondary)', flexShrink: 0, borderRadius: 'var(--radius-sm)' }} aria-hidden="true">
            ⌘K
          </kbd>
        </button>
        <div className="flex items-center justify-end" style={{ flex: '1 1 0', minWidth: 0 }}>
          <UserMenu />
        </div>
      </div>


      {/* Body: left section nav + content */}
      <div className="flex-1 flex min-h-0 relative" style={{ zIndex: 1 }}>
        {/* Left nav — modern, card-style entries */}
        <motion.nav
          aria-label="Gateway sections"
          animate={{ width: navCollapsed ? 64 : 236 }}
          transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 flex flex-col"
          style={{
            // Lightly tinted, but transparent enough for the page ambient dot-grid to read through.
            background: 'linear-gradient(180deg, rgba(2,21,38,0.18) 0%, rgba(2,21,38,0.05) 100%)',
            borderRight: '1px solid var(--color-border-subtle)',
            padding: navCollapsed ? '20px 8px' : '20px 14px',
            gap: 4,
            overflow: 'hidden',
          }}
        >
          {/* Identity header */}
          <div style={{ padding: navCollapsed ? '0 0 14px' : '0 6px 14px', display: 'flex', alignItems: 'center', gap: 10, justifyContent: navCollapsed ? 'center' : 'flex-start' }}>
            <div
              aria-hidden="true"
              style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: 'linear-gradient(135deg, rgba(109,181,138,0.25), rgba(109,181,138,0.08))',
                border: '1px solid rgba(109,181,138,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 20px -12px rgba(109,181,138,0.6)',
              }}
            >
              <Server style={{ width: 15, height: 15, color: '#6db58a' }} aria-hidden="true" />
            </div>
            {!navCollapsed && (
              <div className="flex flex-col" style={{ minWidth: 0 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.005em' }}>
                  Gateway
                </span>
                <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  Control center
                </span>
              </div>
            )}
          </div>

          <div style={{ height: 1, background: 'var(--color-border-subtle)', margin: navCollapsed ? '0 -8px 12px' : '0 -14px 12px' }} aria-hidden="true" />

          {!navCollapsed && (
            <span style={{ padding: '0 8px 8px', fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>
              Manage
            </span>
          )}

          <div className="flex flex-col" style={{ gap: 4, flex: 1 }}>
            {SECTIONS.map((s) => {
              const on = s.id === section;
              const Icon = s.icon;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(s.id)}
                  aria-current={on ? 'page' : undefined}
                  title={navCollapsed ? `${s.label} — ${s.desc}` : undefined}
                  className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                  style={{
                    fontSize: 13, fontWeight: on ? 600 : 500,
                    color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                    padding: navCollapsed ? '10px 8px' : '10px 12px',
                    justifyContent: navCollapsed ? 'center' : 'flex-start',
                    background: on
                      ? 'linear-gradient(135deg, rgba(124,140,248,0.16) 0%, rgba(124,140,248,0.04) 100%)'
                      : 'transparent',
                    border: on ? '1px solid rgba(124,140,248,0.35)' : '1px solid transparent',
                    borderRadius: 10,
                    transition: 'background .2s, color .2s, border-color .2s',
                    fontFamily: 'var(--font-sans)', textAlign: 'left', cursor: 'pointer',
                    minHeight: 48,
                    boxShadow: on ? '0 8px 18px -14px rgba(124,140,248,0.7), inset 0 1px 0 rgba(255,255,255,0.03)' : 'none',
                  }}
                  onMouseEnter={(e) => { if (!on) { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; e.currentTarget.style.color = 'var(--color-text-primary)'; } }}
                  onMouseLeave={(e) => { if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)'; } }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: on
                        ? 'linear-gradient(135deg, rgba(124,140,248,0.28), rgba(124,140,248,0.10))'
                        : 'rgba(255,255,255,0.03)',
                      border: on ? '1px solid rgba(124,140,248,0.45)' : '1px solid var(--color-border-subtle)',
                      color: on ? '#7c8cf8' : 'var(--color-text-secondary)',
                      transition: 'background .2s, color .2s, border-color .2s',
                    }}
                  >
                    <Icon style={{ width: 14, height: 14 }} aria-hidden="true" />
                  </span>
                  {!navCollapsed && (
                    <div className="flex flex-col" style={{ minWidth: 0 }}>
                      <span style={{ lineHeight: 1.2, whiteSpace: 'nowrap' }}>{s.label}</span>
                      <span style={{ fontSize: 10.5, color: on ? 'rgba(124,140,248,0.7)' : 'var(--color-text-disabled)', lineHeight: 1.2, marginTop: 3, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                        {s.desc}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Collapse toggle */}
          <button
            type="button"
            onClick={toggleNav}
            aria-label={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!navCollapsed}
            title={navCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              marginTop: 8,
              padding: navCollapsed ? '10px 8px' : '10px 12px',
              justifyContent: navCollapsed ? 'center' : 'flex-start',
              borderRadius: 10,
              border: '1px solid var(--color-border-subtle)',
              background: 'rgba(255,255,255,0.02)',
              color: 'var(--color-text-secondary)',
              fontSize: 11, fontFamily: 'var(--font-mono)',
              cursor: 'pointer',
              transition: 'background .2s, color .2s, border-color .2s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(124,140,248,0.08)'; e.currentTarget.style.color = '#7c8cf8'; e.currentTarget.style.borderColor = 'rgba(124,140,248,0.35)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; }}
          >
            {navCollapsed
              ? <ChevronRight style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden="true" />
              : <ChevronLeft style={{ width: 14, height: 14, flexShrink: 0 }} aria-hidden="true" />}
            {!navCollapsed && <span style={{ whiteSpace: 'nowrap' }}>collapse</span>}
          </button>
        </motion.nav>

        {/* Content — transparent so the outer ambient dot-grid carries straight through */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto relative" style={{ background: 'transparent' }}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0"
            style={{
              height: 280,
              background: 'radial-gradient(720px 240px at 30% -20%, rgba(124,140,248,0.10), transparent 70%), radial-gradient(620px 220px at 80% -10%, rgba(109,181,138,0.08), transparent 70%)',
            }}
          />
          <div style={{ position: 'relative', zIndex: 1, maxWidth: wide ? 1100 : 820, margin: '0 auto', padding: '36px 40px 56px', transition: 'max-width 0.2s ease' }}>
            <div
              className="flex items-start gap-4"
              style={{
                marginBottom: 28,
                padding: '20px 22px',
                background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.015) 100%)',
                border: '1px solid var(--color-border-subtle)',
                borderRadius: 14,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  width: 42, height: 42, flexShrink: 0, borderRadius: 12,
                  background: 'linear-gradient(135deg, rgba(124,140,248,0.25), rgba(124,140,248,0.06))',
                  border: '1px solid rgba(124,140,248,0.4)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 8px 22px -12px rgba(124,140,248,0.7)',
                }}
              >
                {(() => { const I = current.icon; return <I style={{ width: 18, height: 18, color: '#7c8cf8' }} aria-hidden="true" />; })()}
              </div>
              <div className="flex flex-col" style={{ minWidth: 0, flex: 1 }}>
                <h1 style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                  {current.label}
                </h1>
                <p style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginTop: 6, letterSpacing: '0.01em' }}>
                  {current.desc}
                </p>
              </div>
            </div>

            {section === 'overview' && <GatewayOverview />}
            {section === 'providers' && <ProvidersTab onSaved={showToast} />}
            {section === 'apikeys' && <ApiKeysTab />}
            {section === 'models' && <ModelsTab />}
            {section === 'usage' && <GatewayUsagePanel />}
          </div>
        </div>
      </div>
    </div>
  );
}
