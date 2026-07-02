import { useState, useEffect, useId } from 'react';
import { Key, Eye, EyeOff } from 'lucide-react';
import { useSettings, useUpdateSettings } from '../../api/hooks/use-settings';
import { useRefreshModelCatalog } from '../../api/hooks/use-gateway';
import { useToast } from '../ui/toast';
import { CustomProvidersSection } from './custom-providers';
import { inputStyle } from './ui';
import { Panel } from './gateway-ui';

function ApiKeyInput({ id, value, onChange, placeholder, label }: { id: string; value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-label={label}
        style={{ ...inputStyle, paddingRight: 44 }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide API key' : 'Show API key'}
        aria-pressed={visible}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
        style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 8, display: 'flex', borderRadius: 4 }}
      >
        {visible ? <EyeOff style={{ width: 14, height: 14 }} aria-hidden="true" /> : <Eye style={{ width: 14, height: 14 }} aria-hidden="true" />}
      </button>
    </div>
  );
}

function Field({ id, label, helper, children }: { id?: string; label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}
      >
        {label}
      </label>
      {children}
      {helper && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{helper}</span>}
    </div>
  );
}

/** Built-in provider API keys (Anthropic/OpenAI/Gemini) + custom LLM providers. */
export function ProvidersTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const refreshCatalog = useRefreshModelCatalog();
  const { show: showToast } = useToast();
  const antId = useId();
  const oaiId = useId();
  const gemId = useId();

  // Inputs stay empty and are "write-only": the server only ever returns masked keys, so we never
  // pre-fill them (that would let a blind save overwrite a real key with its mask). A blank field
  // means "keep the current key"; typing replaces it.
  const [apiKey, setApiKey] = useState('');
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');

  const isDirty = apiKey !== '' || openAiApiKey !== '' || geminiApiKey !== '';

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const save = () => {
    // Only send fields the user actually filled in — omitted fields keep their stored key.
    const patch: { apiKey?: string; openAiApiKey?: string; geminiApiKey?: string } = {};
    if (apiKey) patch.apiKey = apiKey;
    if (openAiApiKey) patch.openAiApiKey = openAiApiKey;
    if (geminiApiKey) patch.geminiApiKey = geminiApiKey;
    updateSettings.mutate(patch, {
      onSuccess: () => {
        setApiKey(''); setOpenAiApiKey(''); setGeminiApiKey('');
        onSaved('Provider keys saved');
        refreshCatalog.mutate(); // new/changed keys → re-discover reachable models
      },
      onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to save keys', { variant: 'error' }),
    });
  };

  const keyPlaceholder = (isSet: boolean, hint: string) => (isSet ? '•••••••••• saved — type to replace' : hint);

  return (
    <div className="flex flex-col gap-3">
      <Panel
        icon={<Key style={{ width: 12, height: 12 }} aria-hidden="true" />}
        color="#7c8cf8"
        title="Built-in provider keys"
        action={
          <div className="flex items-center gap-2">
            {isDirty && (
              <span aria-live="polite" style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-warning)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                unsaved
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={updateSettings.isPending || !isDirty}
              aria-busy={updateSettings.isPending || undefined}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                height: 32, padding: '0 14px', fontSize: 11.5, fontFamily: 'var(--font-sans)', fontWeight: 600,
                color: !isDirty || updateSettings.isPending ? 'var(--color-text-disabled)' : '#021526',
                background: !isDirty || updateSettings.isPending ? 'var(--color-bg-raised)' : 'var(--color-accent)',
                border: 'none', borderRadius: 'var(--radius-md)', cursor: !isDirty || updateSettings.isPending ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => { if (isDirty && !updateSettings.isPending) e.currentTarget.style.background = 'var(--color-accent-hover)'; }}
              onMouseLeave={(e) => { if (isDirty && !updateSettings.isPending) e.currentTarget.style.background = 'var(--color-accent)'; }}
            >
              {updateSettings.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        }
      >
        <div className="flex flex-col gap-5">
          <Field id={antId} label="Anthropic API Key" helper="Used for Claude models (claude-*). Stored encrypted.">
            <ApiKeyInput id={antId} label="Anthropic API key" value={apiKey} onChange={setApiKey} placeholder={keyPlaceholder(!!settings?.apiKey, 'sk-ant-...')} />
          </Field>
          <Field id={oaiId} label="OpenAI API Key" helper="Used for GPT, o-series and Codex models. Stored encrypted.">
            <ApiKeyInput id={oaiId} label="OpenAI API key" value={openAiApiKey} onChange={setOpenAiApiKey} placeholder={keyPlaceholder(!!settings?.openAiApiKey, 'sk-...')} />
          </Field>
          <Field id={gemId} label="Gemini API Key" helper="Used for Google Gemini models. Stored encrypted.">
            <ApiKeyInput id={gemId} label="Gemini API key" value={geminiApiKey} onChange={setGeminiApiKey} placeholder={keyPlaceholder(!!settings?.geminiApiKey, 'AIza...')} />
          </Field>
        </div>
      </Panel>

      <CustomProvidersSection />
    </div>
  );
}
