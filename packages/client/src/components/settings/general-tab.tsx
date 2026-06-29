import { useState, useEffect, useId, useMemo } from 'react';
import { Cpu, FolderOpen, Zap } from 'lucide-react';
import type { ClaudeModel } from '@subagent/shared';
import { CLAUDE_MODELS } from '@subagent/shared';
import { useSettings, useUpdateSettings } from '../../api/hooks/use-settings';
import { useToast } from '../ui/toast';
import { FolderPickerInput } from '../ui/folder-picker';
import { Section, inputStyle } from './ui';

function Field({ id, label, helper, error, children }: { id?: string; label: string; helper?: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}
      >
        {label}
      </label>
      {children}
      {error ? (
        <span role="alert" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-error)' }}>{error}</span>
      ) : helper ? (
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{helper}</span>
      ) : null}
    </div>
  );
}

const MAX_TOKEN_MIN = 1;
const MAX_TOKEN_MAX = 200_000;
const CONCURRENCY_MIN = 1;
const CONCURRENCY_MAX = 10;

/** General defaults: default model + max tokens, workspace base path, concurrency. */
export function GeneralTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { show: showToast } = useToast();
  const modelId = useId();
  const tokensId = useId();
  const wsId = useId();
  const concId = useId();

  const [defaultModel, setDefaultModel] = useState<ClaudeModel>('claude-sonnet-4-20250514');
  const [defaultMaxTokens, setDefaultMaxTokens] = useState(8192);
  const [defaultWorkspacePath, setDefaultWorkspacePath] = useState('');
  const [maxConcurrentAgents, setMaxConcurrentAgents] = useState(3);
  const [maxTokensInput, setMaxTokensInput] = useState('8192');
  const [concurrencyInput, setConcurrencyInput] = useState('3');

  useEffect(() => {
    if (settings) {
      setDefaultModel(settings.defaultModel);
      setDefaultMaxTokens(settings.defaultMaxTokens);
      setDefaultWorkspacePath(settings.defaultWorkspacePath);
      setMaxConcurrentAgents(settings.maxConcurrentAgents);
      setMaxTokensInput(String(settings.defaultMaxTokens));
      setConcurrencyInput(String(settings.maxConcurrentAgents));
    }
  }, [settings]);

  const tokensError = useMemo(() => {
    const n = Number(maxTokensInput);
    if (!Number.isFinite(n) || Math.floor(n) !== n) return 'Must be a whole number';
    if (n < MAX_TOKEN_MIN || n > MAX_TOKEN_MAX) return `Must be between ${MAX_TOKEN_MIN} and ${MAX_TOKEN_MAX.toLocaleString()}`;
    return '';
  }, [maxTokensInput]);

  const concurrencyError = useMemo(() => {
    const n = Number(concurrencyInput);
    if (!Number.isFinite(n) || Math.floor(n) !== n) return 'Must be a whole number';
    if (n < CONCURRENCY_MIN || n > CONCURRENCY_MAX) return `Must be between ${CONCURRENCY_MIN} and ${CONCURRENCY_MAX}`;
    return '';
  }, [concurrencyInput]);

  const isDirty = useMemo(() => {
    if (!settings) return false;
    return (
      defaultModel !== settings.defaultModel ||
      Number(maxTokensInput) !== settings.defaultMaxTokens ||
      defaultWorkspacePath !== settings.defaultWorkspacePath ||
      Number(concurrencyInput) !== settings.maxConcurrentAgents
    );
  }, [settings, defaultModel, maxTokensInput, defaultWorkspacePath, concurrencyInput]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const canSave = isDirty && !tokensError && !concurrencyError && !updateSettings.isPending;

  const save = () => {
    if (!canSave) return;
    const tokens = Number(maxTokensInput);
    const concurrency = Number(concurrencyInput);
    setDefaultMaxTokens(tokens);
    setMaxConcurrentAgents(concurrency);
    updateSettings.mutate(
      { defaultModel, defaultMaxTokens: tokens, defaultWorkspacePath, maxConcurrentAgents: concurrency },
      {
        onSuccess: () => onSaved('Settings saved'),
        onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to save', { variant: 'error' }),
      },
    );
  };

  const saveAction = (
    <button
      type="button"
      onClick={save}
      disabled={!canSave}
      aria-busy={updateSettings.isPending || undefined}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
      style={{
        height: 28, padding: '0 10px', fontSize: 11, fontFamily: 'var(--font-mono)',
        color: canSave ? '#7c8cf8' : 'var(--color-text-disabled)',
        background: 'none', border: 'none',
        cursor: canSave ? 'pointer' : 'not-allowed',
        borderRadius: 4,
      }}
    >
      {updateSettings.isPending ? 'saving…' : isDirty ? 'save' : 'saved'}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <Section icon={<Cpu style={{ width: 13, height: 13 }} aria-hidden="true" />} color="#7c8cf8" title="Model Defaults" action={saveAction}>
        <div className="flex flex-col gap-5">
          <Field id={modelId} label="Default Model">
            <select
              id={modelId}
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value as ClaudeModel)}
              style={{ ...inputStyle, cursor: 'pointer', appearance: 'none', paddingRight: 32 }}
            >
              {(Object.entries(CLAUDE_MODELS) as [ClaudeModel, (typeof CLAUDE_MODELS)[ClaudeModel]][]).map(([key, info]) => (
                <option key={key} value={key} style={{ background: '#031d38' }}>{info.label}</option>
              ))}
            </select>
          </Field>
          <Field id={tokensId} label="Default Max Tokens" error={tokensError} helper={!tokensError ? `Between ${MAX_TOKEN_MIN} and ${MAX_TOKEN_MAX.toLocaleString()}.` : undefined}>
            <input
              id={tokensId}
              type="number"
              value={maxTokensInput}
              min={MAX_TOKEN_MIN}
              max={MAX_TOKEN_MAX}
              step={1}
              aria-invalid={!!tokensError}
              aria-describedby={tokensError ? `${tokensId}-err` : undefined}
              onChange={(e) => setMaxTokensInput(e.target.value)}
              style={{ ...inputStyle, borderColor: tokensError ? 'rgba(224,96,96,0.5)' : 'var(--color-border-default)' }}
            />
          </Field>
        </div>
      </Section>

      <Section icon={<FolderOpen style={{ width: 13, height: 13 }} aria-hidden="true" />} color="#6db58a" title="Workspace" action={saveAction}>
        <Field id={wsId} label="Default Workspace Path" helper="Base path for new project workspaces">
          <FolderPickerInput value={defaultWorkspacePath} onChange={setDefaultWorkspacePath} inputStyle={inputStyle} />
        </Field>
      </Section>

      <Section icon={<Zap style={{ width: 13, height: 13 }} aria-hidden="true" />} color="#e2b04a" title="Performance" action={saveAction}>
        <Field id={concId} label="Max Concurrent Agents" error={concurrencyError} helper={!concurrencyError ? `Between ${CONCURRENCY_MIN} and ${CONCURRENCY_MAX}.` : undefined}>
          <input
            id={concId}
            type="number"
            value={concurrencyInput}
            min={CONCURRENCY_MIN}
            max={CONCURRENCY_MAX}
            step={1}
            aria-invalid={!!concurrencyError}
            onChange={(e) => setConcurrencyInput(e.target.value)}
            style={{ ...inputStyle, borderColor: concurrencyError ? 'rgba(224,96,96,0.5)' : 'var(--color-border-default)' }}
          />
        </Field>
      </Section>
    </div>
  );
}
