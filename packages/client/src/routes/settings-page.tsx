import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useToast, Toast } from '../components/ui/toast';
import { GeneralTab } from '../components/settings/general-tab';
import { ProvidersTab } from '../components/settings/providers-tab';
import { ApiKeysTab } from '../components/settings/api-keys-tab';
import { ModelsTab } from '../components/settings/models-tab';
import { UsageTab } from '../components/settings/usage-tab';

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'providers', label: 'Providers' },
  { id: 'apikeys', label: 'API Keys' },
  { id: 'models', label: 'Models' },
  { id: 'usage', label: 'Usage' },
] as const;
type TabId = (typeof TABS)[number]['id'];

/** Organization-wide settings, organized into tabs (providers/keys, gateway, models, usage). */
export function SettingsPage() {
  const { show: showToast, toast } = useToast();
  // Allow deep-linking a tab via hash, e.g. /settings#models (used by the dashboard nav).
  const initialTab = (typeof window !== 'undefined' && window.location.hash.slice(1)) as TabId;
  const [tab, setTab] = useState<TabId>(TABS.some((t) => t.id === initialTab) ? initialTab : 'general');

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--color-bg-base)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 32px' }}>
        <Link to="/" className="flex items-center gap-2 w-fit"
          style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', textDecoration: 'none', marginBottom: 28 }}>
          <ArrowLeft style={{ width: 12, height: 12 }} /> agenticbear / settings
        </Link>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            Organization Settings
          </h1>
          <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 6 }}>
            providers, keys, gateway, reachable models, and org-wide usage
          </p>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1" style={{ marginBottom: 24, borderBottom: '1px solid var(--color-border-subtle)' }}>
          {TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => { setTab(t.id); history.replaceState(null, '', `#${t.id}`); }}
              style={{
                height: 36, padding: '0 14px', fontSize: 12.5, fontFamily: 'var(--font-mono)', cursor: 'pointer',
                background: 'none', border: 'none', borderBottom: `2px solid ${tab === t.id ? '#6EACDA' : 'transparent'}`,
                color: tab === t.id ? 'var(--color-text-primary)' : 'var(--color-text-disabled)',
                marginBottom: -1,
              }}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'general' && <GeneralTab onSaved={showToast} />}
        {tab === 'providers' && <ProvidersTab onSaved={showToast} />}
        {tab === 'apikeys' && <ApiKeysTab />}
        {tab === 'models' && <ModelsTab />}
        {tab === 'usage' && <UsageTab />}
      </div>
      <Toast toast={toast} />
    </div>
  );
}
