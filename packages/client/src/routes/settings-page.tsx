import { useState, useEffect } from 'react';
import { ArrowLeft, Cpu, FolderOpen, Zap } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import type { ClaudeModel } from '@subagent/shared';
import { CLAUDE_MODELS } from '@subagent/shared';
import { useSettings, useUpdateSettings } from '../api/hooks/use-settings';
import { Input } from '../components/ui/input';
import { Select } from '../components/ui/select';
import { Button } from '../components/ui/button';
import { Skeleton } from '../components/ui/skeleton';

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
    updateSettings.mutate({
      defaultModel,
      defaultMaxTokens,
      defaultWorkspacePath,
      maxConcurrentAgents,
    });
  };

  if (isLoading) {
    return (
      <div className="h-full" style={{ background: 'var(--color-bg-base)' }}>
        <div style={{ maxWidth: '672px', margin: '0 auto', padding: '40px 48px' }}>
          <Skeleton height={28} width={200} className="mb-3" />
          <Skeleton height={16} width={300} className="mb-10" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={60} className="mb-6" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--color-bg-base)' }}>
      <div style={{ maxWidth: '672px', margin: '0 auto', padding: '40px 48px' }}>
        {/* Header */}
        <Link
          to="/"
          className="flex items-center gap-2 text-[12px] text-text-tertiary hover:text-text-primary transition-colors duration-200 w-fit mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Projects
        </Link>

        <div className="mb-8">
          <h1 className="text-[22px] font-bold text-text-primary tracking-tight">Global Settings</h1>
          <p className="text-[13px] text-text-tertiary mt-1">
            Configure your AgenticBEAR environment
          </p>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-8">
          {/* Model Section */}
          <div
            className="p-6"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-default)',
            }}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div
                className="h-8 w-8 flex items-center justify-center"
                style={{ background: 'rgba(212, 146, 78, 0.1)', border: '1px solid rgba(212, 146, 78, 0.2)' }}
              >
                <Cpu className="h-4 w-4 text-[#d4924e]" />
              </div>
              <h2 className="text-[14px] font-semibold text-text-primary">Model Defaults</h2>
            </div>

            <div className="flex flex-col gap-4">
              <Select
                label="Default Model"
                value={defaultModel}
                onChange={(e) => setDefaultModel(e.target.value as ClaudeModel)}
              >
                {(Object.entries(CLAUDE_MODELS) as [ClaudeModel, (typeof CLAUDE_MODELS)[ClaudeModel]][]).map(
                  ([key, info]) => (
                    <option key={key} value={key}>
                      {info.label}
                    </option>
                  ),
                )}
              </Select>

              <Input
                label="Default Max Tokens"
                type="number"
                value={defaultMaxTokens}
                onChange={(e) => setDefaultMaxTokens(parseInt(e.target.value) || 0)}
                min={1}
                max={200000}
              />
            </div>
          </div>

          {/* Workspace Section */}
          <div
            className="p-6"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-default)',
            }}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div
                className="h-8 w-8 flex items-center justify-center"
                style={{ background: 'rgba(0, 208, 132, 0.1)', border: '1px solid rgba(0, 208, 132, 0.2)' }}
              >
                <FolderOpen className="h-4 w-4 text-[#00d084]" />
              </div>
              <h2 className="text-[14px] font-semibold text-text-primary">Workspace</h2>
            </div>

            <Input
              label="Default Workspace Path"
              value={defaultWorkspacePath}
              onChange={(e) => setDefaultWorkspacePath(e.target.value)}
              placeholder="/home/user/projects"
              className="font-mono text-[12px]"
              helperText="Base path for new project workspaces"
            />
          </div>

          {/* Performance Section */}
          <div
            className="p-6"
            style={{
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-default)',
            }}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div
                className="h-8 w-8 flex items-center justify-center"
                style={{ background: 'rgba(255, 159, 28, 0.1)', border: '1px solid rgba(255, 159, 28, 0.2)' }}
              >
                <Zap className="h-4 w-4 text-[#ff9f1c]" />
              </div>
              <h2 className="text-[14px] font-semibold text-text-primary">Performance</h2>
            </div>

            <Input
              label="Max Concurrent Agents"
              type="number"
              value={maxConcurrentAgents}
              onChange={(e) => setMaxConcurrentAgents(parseInt(e.target.value) || 1)}
              min={1}
              max={10}
              helperText="Maximum number of agents that can run simultaneously"
            />
          </div>

          {/* Save */}
          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={updateSettings.isPending}
              className="flex items-center gap-2 text-[13.5px] font-semibold whitespace-nowrap transition-all duration-200 hover:bg-white/90 disabled:opacity-60"
              style={{
                background: 'white',
                color: '#0a0a0a',
                height: '40px',
                padding: '0 24px',
              }}
            >
              {updateSettings.isPending ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
