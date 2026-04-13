import { useState, useEffect } from 'react';
import { ArrowLeft, Cpu, FolderOpen, Zap, Key, Eye, EyeOff } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import type { ClaudeModel } from '@subagent/shared';
import { CLAUDE_MODELS } from '@subagent/shared';
import { useSettings, useUpdateSettings } from '../api/hooks/use-settings';
import { Skeleton } from '../components/ui/skeleton';
import { FolderPickerInput } from '../components/ui/folder-picker';
import { useToast, Toast } from '../components/ui/toast';

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

function ApiKeyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, paddingRight: 40 }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(110,172,218,0.5)'; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        style={{
          position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--color-text-disabled)', padding: 0, display: 'flex',
        }}
      >
        {visible ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
      </button>
    </div>
  );
}

export function SettingsPage() {
  const { data: settings, isLoading } = useSettings();
  const updateSettings = useUpdateSettings();
  const { show: showToast, toast } = useToast();

  const [apiKey, setApiKey] = useState('');
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [defaultModel, setDefaultModel] = useState<ClaudeModel>('claude-sonnet-4-20250514');
  const [defaultMaxTokens, setDefaultMaxTokens] = useState(8192);
  const [defaultWorkspacePath, setDefaultWorkspacePath] = useState('');
  const [maxConcurrentAgents, setMaxConcurrentAgents] = useState(3);

  useEffect(() => {
    if (settings) {
      setApiKey(settings.apiKey ?? '');
      setOpenAiApiKey(settings.openAiApiKey ?? '');
      setGeminiApiKey(settings.geminiApiKey ?? '');
      setDefaultModel(settings.defaultModel);
      setDefaultMaxTokens(settings.defaultMaxTokens);
      setDefaultWorkspacePath(settings.defaultWorkspacePath);
      setMaxConcurrentAgents(settings.maxConcurrentAgents);
    }
  }, [settings]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate(
      { apiKey, openAiApiKey, geminiApiKey, defaultModel, defaultMaxTokens, defaultWorkspacePath, maxConcurrentAgents },
      { onSuccess: () => showToast('Settings saved') },
    );
  };

  if (isLoading) {
    return (
      <div className="h-full" style={{ background: 'var(--color-bg-base)' }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '40px 32px' }}>
          <Skeleton height={14} width={140} className="mb-8" />
          {Array.from({ length: 4 }).map((_, i) => (
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
          onMouseEnter={(e) => { e.currentTarget.style.color = '#6EACDA'; }}
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

          {/* API Keys */}
          <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid #c0a0d8' }}>
            <div className="flex items-center gap-2.5" style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <Key style={{ width: 13, height: 13, color: '#c0a0d8', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                API Keys
              </span>
            </div>
            <div className="flex flex-col gap-5" style={{ padding: '16px' }}>
              <SettingsField label="Anthropic API Key" helper="Used for Claude models (claude-*). Stored encrypted.">
                <ApiKeyInput value={apiKey} onChange={setApiKey} placeholder="sk-ant-..." />
              </SettingsField>
              <SettingsField label="OpenAI API Key" helper="Used for GPT, o-series and Codex models. Stored encrypted.">
                <ApiKeyInput value={openAiApiKey} onChange={setOpenAiApiKey} placeholder="sk-..." />
              </SettingsField>
              <SettingsField label="Gemini API Key" helper="Used for Google Gemini models. Stored encrypted.">
                <ApiKeyInput value={geminiApiKey} onChange={setGeminiApiKey} placeholder="AIza..." />
              </SettingsField>
            </div>
          </section>

          {/* Model Defaults */}
          <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid #6EACDA' }}>
            <div className="flex items-center gap-2.5" style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <Cpu style={{ width: 13, height: 13, color: '#6EACDA', flexShrink: 0 }} />
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
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(110,172,218,0.5)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
                >
                  {(Object.entries(CLAUDE_MODELS) as [ClaudeModel, (typeof CLAUDE_MODELS)[ClaudeModel]][]).map(
                    ([key, info]) => (
                      <option key={key} value={key} style={{ background: '#031d38' }}>
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
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(110,172,218,0.5)'; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
                />
              </SettingsField>
            </div>
          </section>

          {/* Workspace */}
          <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid #6db58a' }}>
            <div className="flex items-center gap-2.5" style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <FolderOpen style={{ width: 13, height: 13, color: '#6db58a', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                Workspace
              </span>
            </div>
            <div style={{ padding: '16px' }}>
              <SettingsField label="Default Workspace Path" helper="Base path for new project workspaces">
                <FolderPickerInput value={defaultWorkspacePath} onChange={setDefaultWorkspacePath} inputStyle={inputStyle} />
              </SettingsField>
            </div>
          </section>

          {/* Performance */}
          <section style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid #e2b04a' }}>
            <div className="flex items-center gap-2.5" style={{ padding: '14px 16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <Zap style={{ width: 13, height: 13, color: '#e2b04a', flexShrink: 0 }} />
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
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(110,172,218,0.5)'; }}
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
                background: updateSettings.isPending ? '#03346E' : '#6EACDA',
                color: '#021526',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                border: 'none',
                cursor: updateSettings.isPending ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => { if (!updateSettings.isPending) e.currentTarget.style.background = '#94c5e8'; }}
              onMouseLeave={(e) => { if (!updateSettings.isPending) e.currentTarget.style.background = '#6EACDA'; }}
            >
              {updateSettings.isPending ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
      <Toast toast={toast} />
    </div>
  );
}
