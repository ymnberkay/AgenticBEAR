import { useEffect, useRef, useState, useId, type KeyboardEvent } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useToast } from '../components/ui/toast';
import { GeneralTab } from '../components/settings/general-tab';
import { ProvidersTab } from '../components/settings/providers-tab';
import { ApiKeysTab } from '../components/settings/api-keys-tab';
import { ModelsTab } from '../components/settings/models-tab';
import { UsageTab } from '../components/settings/usage-tab';
import { SecurityTab } from '../components/settings/security-tab';
import { UsersTab } from '../components/settings/users-tab';
import { GroupsTab } from '../components/settings/groups-tab';

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'providers', label: 'Providers' },
  { id: 'apikeys', label: 'API Keys' },
  { id: 'models', label: 'Models' },
  { id: 'security', label: 'Security' },
  { id: 'users', label: 'Users' },
  { id: 'groups', label: 'Groups' },
  { id: 'usage', label: 'Usage' },
] as const;
type TabId = (typeof TABS)[number]['id'];

function readHashTab(): TabId | null {
  if (typeof window === 'undefined') return null;
  const id = window.location.hash.slice(1) as TabId;
  return TABS.some((t) => t.id === id) ? id : null;
}

/** Organization-wide settings, organized into tabs (providers/keys, gateway, models, usage). */
export function SettingsPage() {
  const { show: showToast } = useToast();
  const [tab, setTab] = useState<TabId>(() => readHashTab() ?? 'general');
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const tablistId = useId();
  const scrollRef = useRef<HTMLDivElement>(null);

  // React to hash changes (deep-link, back/forward) and scroll to top on tab switch.
  useEffect(() => {
    const onHash = () => {
      const next = readHashTab();
      if (next) setTab(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [tab]);

  const setTabAndHash = (next: TabId) => {
    setTab(next);
    if (window.location.hash !== `#${next}`) {
      history.replaceState(null, '', `#${next}`);
    }
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const focusAt = (idx: number) => {
      const safe = (idx + TABS.length) % TABS.length;
      buttonsRef.current[safe]?.focus();
      setTabAndHash(TABS[safe]!.id);
    };
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); focusAt(i + 1); break;
      case 'ArrowLeft':  e.preventDefault(); focusAt(i - 1); break;
      case 'Home':       e.preventDefault(); focusAt(0); break;
      case 'End':        e.preventDefault(); focusAt(TABS.length - 1); break;
    }
  };

  // Usage is a wide dashboard; the rest are forms that read best in a narrow column.
  const wide = tab === 'usage';

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto" style={{ background: 'var(--color-bg-base)' }}>
      {/* Header + tabs — kept in a narrow column */}
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 32px 0' }}>
        <Link to="/" className="flex items-center gap-2 w-fit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textDecoration: 'none', marginBottom: 28, borderRadius: 'var(--radius-sm)', padding: '4px 4px' }}>
          <ArrowLeft style={{ width: 12, height: 12 }} aria-hidden="true" /> agenticbear / settings
        </Link>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            Organization Settings
          </h1>
          <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginTop: 6 }}>
            providers, keys, gateway, reachable models, and org-wide usage
          </p>
        </div>

        {/* Tab bar — segmented pills with proper tablist semantics */}
        <div
          role="tablist"
          aria-label="Settings sections"
          aria-orientation="horizontal"
          className="flex items-center"
          style={{ marginBottom: 24, gap: 4, padding: 4, width: '100%', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)' }}
        >
          {TABS.map((t, i) => {
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => { buttonsRef.current[i] = el; }}
                role="tab"
                type="button"
                id={`${tablistId}-tab-${t.id}`}
                aria-selected={on}
                aria-controls={`${tablistId}-panel-${t.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => setTabAndHash(t.id)}
                onKeyDown={(e) => onTabKey(e, i)}
                className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{
                  flex: 1, minWidth: 0, height: 36, padding: '0 8px', fontSize: 12.5,
                  fontFamily: 'var(--font-sans)', fontWeight: on ? 600 : 500, cursor: 'pointer',
                  whiteSpace: 'nowrap', borderRadius: 'var(--radius-md)', border: 'none',
                  transition: 'all .15s',
                  background: on ? 'var(--color-accent-subtle)' : 'transparent',
                  color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                }}
                onMouseEnter={(e) => { if (!on) { e.currentTarget.style.background = 'var(--color-bg-raised)'; e.currentTarget.style.color = 'var(--color-text-primary)'; } }}
                onMouseLeave={(e) => { if (!on) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-secondary)'; } }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content — Usage breaks out to a wider column to use the screen */}
      <div
        role="tabpanel"
        id={`${tablistId}-panel-${tab}`}
        aria-labelledby={`${tablistId}-tab-${tab}`}
        tabIndex={0}
        className="focus-visible:outline-none"
        style={{ maxWidth: wide ? 1320 : 760, margin: '0 auto', padding: '22px 32px 48px', transition: 'max-width 0.2s ease' }}
      >
        {tab === 'general' && <GeneralTab onSaved={showToast} />}
        {tab === 'providers' && <ProvidersTab onSaved={showToast} />}
        {tab === 'apikeys' && <ApiKeysTab />}
        {tab === 'models' && <ModelsTab />}
        {tab === 'security' && <SecurityTab onSaved={showToast} />}
        {tab === 'users' && <UsersTab onSaved={showToast} />}
        {tab === 'groups' && <GroupsTab onSaved={showToast} />}
        {tab === 'usage' && <UsageTab />}
      </div>
    </div>
  );
}
