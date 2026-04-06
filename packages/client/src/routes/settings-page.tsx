import { useState, useEffect } from 'react';
import { ArrowLeft, Cpu, FolderOpen, Zap } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import type { ClaudeModel } from '@subagent/shared';
import { CLAUDE_MODELS } from '@subagent/shared';
import { useSettings, useUpdateSettings } from '../api/hooks/use-settings';
import { Skeleton } from '../components/ui/skeleton';

function SettingsField({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
        {label}
      </label>
      {children}
      {helper && (
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
          {helper}
        </span>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: 36,
  padding: '0 12px',
  background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border-default)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-mono)',
  fontSize: 13,
  outline: 'none',
  transition: 'border-color 0.15s',
};

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();

  const [defaultModel, setDefaultModel] = useState<ClaudeModel>('claude-sonnet-4-20250514');
  const [defaultMaxTokens, setDefaultMaxTokens] = useState(8192);
  const [defaultWorkspacePath, setDefaultWorkspacePath] = useState('');
  const [maxConcurrentAgents, setMaxConcurrentAgents] = useState(3);

  useEffect(() => {
    if (settings) {
      setDefaultModel(settings.defaultModel);
      setDefaultMaxTokens(settings.defaultMaxTokens);
      setDefaultWorkspacePath(settings.defaultWorkspacePath);
      setMaxConcurrentAgents(settings.maxConcurrentAgents);
    }
  }, [settings]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate({ defaultModel, defaultMaxTokens, defaultWorkspacePath, maxConcurrentAgents });
  };

  if (isLoading) {
    return (
      <div className="h-full" style={{ background: 'var(--color-bg-base)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 32px' }}>
          <Skeleton height={14} width={140} className="mb-8" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={120} className="mb-4" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--color-bg-base)' }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 32px' }}>

        {/* Breadcrumb */}
        <Link
          to="/"
          className="flex items-center gap-2 w-fit"
          style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', textDecoration: 'none', marginBottom: 28, transition: 'color 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fabd2f'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; }}
        >
          <ArrowLeft style={{ width: 12, height: 12 }} />
          agenticbear / settings
        </Link>

        {/* Title */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            Global Settings
          </h1>
          <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 6 }}>
            configure your agenticbear environment
          </p>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-3">

          {/* Model Defaults */}
          <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid #fabd2f' }}>
            <div className="flex items-center gap-2.5" style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <Cpu style={{ width: 13, height: 13, color: '#fabd2f', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                Model Defaults
              </span>
            </div>
            <div className="flex flex-col gap-5" style={{ padding: '16px' }}>
              <SettingsField label="Default Model">
                <select
                  value={defaultModel}
                  onChange={(e) => setDefaultModel(e.target.value as ClaudeModel)}
                  style={{ ...inputStyle, cursor: 'pointer', appearance: 'none', paddingRight: 32 }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(250,189,47,0.5)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
                >
                  {(Object.entries(CLAUDE_MODELS) as [ClaudeModel, (typeof CLAUDE_MODELS)[ClaudeModel]][]).map(
                    ([key, info]) => (
                      <option key={key} value={key} style={{ background: '#282828' }}>
                        {info.label}
                      </option>
                    ),
                  )}
                </select>
              </SettingsField>

              <SettingsField label="Default Max Tokens">
                <input
                  type="number"
                  value={defaultMaxTokens}
                  onChange={(e) => setDefaultMaxTokens(parseInt(e.target.value) || 0)}
                  min={1}
                  max={200000}
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(250,189,47,0.5)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
                />
              </SettingsField>
            </div>
          </section>

          {/* Workspace */}
          <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid #8ec07c' }}>
            <div className="flex items-center gap-2.5" style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <FolderOpen style={{ width: 13, height: 13, color: '#8ec07c', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                Workspace
              </span>
            </div>
            <div style={{ padding: '16px' }}>
              <SettingsField label="Default Workspace Path" helper="Base path for new project workspaces">
                <input
                  type="text"
                  value={defaultWorkspacePath}
                  onChange={(e) => setDefaultWorkspacePath(e.target.value)}
                  placeholder="/home/user/projects"
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(250,189,47,0.5)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
                />
              </SettingsField>
            </div>
          </section>

          {/* Performance */}
          <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid #fe8019' }}>
            <div className="flex items-center gap-2.5" style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <Zap style={{ width: 13, height: 13, color: '#fe8019', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                Performance
              </span>
            </div>
            <div style={{ padding: '16px' }}>
              <SettingsField label="Max Concurrent Agents" helper="Maximum number of agents that can run simultaneously">
                <input
                  type="number"
                  value={maxConcurrentAgents}
                  onChange={(e) => setMaxConcurrentAgents(parseInt(e.target.value) || 1)}
                  min={1}
                  max={10}
                  style={inputStyle}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(250,189,47,0.5)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
                />
              </SettingsField>
            </div>
          </section>

          {/* Save */}
          <div className="flex items-center justify-end" style={{ paddingTop: 8 }}>
            <button
              type="submit"
              disabled={updateSettings.isPending}
              style={{
                height: 34,
                padding: '0 20px',
                background: updateSettings.isPending ? '#3c3836' : '#fabd2f',
                color: '#1d2021',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                border: 'none',
                cursor: updateSettings.isPending ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { if (!updateSettings.isPending) e.currentTarget.style.background = '#ffd561'; }}
              onMouseLeave={(e) => { if (!updateSettings.isPending) e.currentTarget.style.background = '#fabd2f'; }}
            >
              {updateSettings.isPending ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
