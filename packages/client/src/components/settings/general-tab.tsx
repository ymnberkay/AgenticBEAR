import { useState, useEffect } from 'react';
import { Cpu, FolderOpen, Zap } from 'lucide-react';
import type { ClaudeModel } from '@subagent/shared';
import { CLAUDE_MODELS } from '@subagent/shared';
import { useSettings, useUpdateSettings } from '../../api/hooks/use-settings';
import { FolderPickerInput } from '../ui/folder-picker';
import { Section, inputStyle } from './ui';

function Field({ label, helper, children }: { label: string; helper?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
        {label}
      </label>
      {children}
      {helper && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{helper}</span>}
    </div>
  );
}

/** General defaults: default model + max tokens, workspace base path, concurrency. */
export function GeneralTab({ onSaved }: { onSaved: (msg: string) => void }) {
  const { data: settings } = useSettings();
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

  const save = () =>
    updateSettings.mutate(
      { defaultModel, defaultMaxTokens, defaultWorkspacePath, maxConcurrentAgents },
      { onSuccess: () => onSaved('Settings saved') },
    );

  const saveAction = (
    <button type="button" onClick={save} disabled={updateSettings.isPending}
      style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: '#7c8cf8', background: 'none', border: 'none', cursor: 'pointer' }}>
      {updateSettings.isPending ? 'saving…' : 'save'}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <Section icon={<Cpu style={{ width: 13, height: 13 }} />} color="#7c8cf8" title="Model Defaults" action={saveAction}>
        <div className="flex flex-col gap-5">
          <Field label="Default Model">
            <select value={defaultModel} onChange={(e) => setDefaultModel(e.target.value as ClaudeModel)}
              style={{ ...inputStyle, cursor: 'pointer', appearance: 'none', paddingRight: 32 }}>
              {(Object.entries(CLAUDE_MODELS) as [ClaudeModel, (typeof CLAUDE_MODELS)[ClaudeModel]][]).map(([key, info]) => (
                <option key={key} value={key} style={{ background: '#031d38' }}>{info.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Default Max Tokens">
            <input type="number" value={defaultMaxTokens} min={1} max={200000}
              onChange={(e) => setDefaultMaxTokens(parseInt(e.target.value) || 0)} style={inputStyle} />
          </Field>
        </div>
      </Section>

      <Section icon={<FolderOpen style={{ width: 13, height: 13 }} />} color="#6db58a" title="Workspace" action={saveAction}>
        <Field label="Default Workspace Path" helper="Base path for new project workspaces">
          <FolderPickerInput value={defaultWorkspacePath} onChange={setDefaultWorkspacePath} inputStyle={inputStyle} />
        </Field>
      </Section>

      <Section icon={<Zap style={{ width: 13, height: 13 }} />} color="#e2b04a" title="Performance" action={saveAction}>
        <Field label="Max Concurrent Agents" helper="Maximum number of agents that can run simultaneously">
          <input type="number" value={maxConcurrentAgents} min={1} max={10}
            onChange={(e) => setMaxConcurrentAgents(parseInt(e.target.value) || 1)} style={inputStyle} />
        </Field>
      </Section>
    </div>
  );
}
