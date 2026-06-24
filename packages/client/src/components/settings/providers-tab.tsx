import { useState, useEffect } from 'react';
import { Key, Eye, EyeOff } from 'lucide-react';
import { useSettings, useUpdateSettings } from '../../api/hooks/use-settings';
import { useRefreshModelCatalog } from '../../api/hooks/use-gateway';
import { CustomProvidersSection } from './custom-providers';
import { Section, inputStyle } from './ui';

function ApiKeyInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input type={visible ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ ...inputStyle, paddingRight: 40 }} />
      <button type="button" onClick={() => setVisible((v) => !v)}
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-disabled)', padding: 0, display: 'flex' }}>
        {visible ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
      </button>
    </div>
  );
}

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{label}</label>
      {children}
      {helper && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{helper}</span>}
    </div>
  );
}

/** Built-in provider API keys (Anthropic/OpenAI/Gemini) + custom LLM providers. */
export function ProvidersTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const refreshCatalog = useRefreshModelCatalog();

  const [apiKey, setApiKey] = useState('');
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [geminiApiKey, setGeminiApiKey] = useState('');

  useEffect(() => {
    if (settings) {
      setApiKey(settings.apiKey ?? '');
      setOpenAiApiKey(settings.openAiApiKey ?? '');
      setGeminiApiKey(settings.geminiApiKey ?? '');
    }
  }, [settings]);

  const save = () =>
    updateSettings.mutate(
      { apiKey, openAiApiKey, geminiApiKey },
      {
        onSuccess: () => {
          onSaved('Keys saved');
          refreshCatalog.mutate(); // new/changed keys → re-discover reachable models
        },
      },
    );

  return (
    <div className="flex flex-col gap-3">
      <Section icon={<Key style={{ width: 13, height: 13 }} />} color="#c0a0d8" title="Built-in Provider Keys"
        action={<button type="button" onClick={save} disabled={updateSettings.isPending} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#7c8cf8', background: 'none', border: 'none', cursor: 'pointer' }}>{updateSettings.isPending ? 'saving…' : 'save'}</button>}>
        <div className="flex flex-col gap-5">
          <Field label="Anthropic API Key" helper="Used for Claude models (claude-*). Stored encrypted.">
            <ApiKeyInput value={apiKey} onChange={setApiKey} placeholder="sk-ant-..." />
          </Field>
          <Field label="OpenAI API Key" helper="Used for GPT, o-series and Codex models. Stored encrypted.">
            <ApiKeyInput value={openAiApiKey} onChange={setOpenAiApiKey} placeholder="sk-..." />
          </Field>
          <Field label="Gemini API Key" helper="Used for Google Gemini models. Stored encrypted.">
            <ApiKeyInput value={geminiApiKey} onChange={setGeminiApiKey} placeholder="AIza..." />
          </Field>
        </div>
      </Section>

      <CustomProvidersSection />
    </div>
  );
}
