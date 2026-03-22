import { useState, useEffect } from 'react';
import { Eye, EyeOff, ArrowLeft, Shield, Cpu, FolderOpen, Zap } from 'lucide-react';
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

  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [defaultModel, setDefaultModel] = useState<ClaudeModel>('claude-sonnet-4-20250514');
  const [defaultMaxTokens, setDefaultMaxTokens] = useState(8192);
  const [defaultWorkspacePath, setDefaultWorkspacePath] = useState('');
  const [maxConcurrentAgents, setMaxConcurrentAgents] = useState(3);

  useEffect(() => {
    if (settings) {
      setApiKey(settings.apiKey);
      setDefaultModel(settings.defaultModel);
      setDefaultMaxTokens(settings.defaultMaxTokens);
      setDefaultWorkspacePath(settings.defaultWorkspacePath);
      setMaxConcurrentAgents(settings.maxConcurrentAgents);
    }
  }, [settings]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate({
      apiKey,
      defaultModel,
      defaultMaxTokens,
      defaultWorkspacePath,
      maxConcurrentAgents,
    });
  };

  if (isLoading) {
    return (
      <div className="h-full" style={{ background: 'var(--color-bg-base)' }}>
        <div className="max-w-2xl mx-auto px-8 sm:px-10 py-10">
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
      <div className="max-w-2xl mx-auto px-8 sm:px-10 py-10">
        {/* Header */}
        <Link
          to="/"
          className="flex items-center gap-2 text-[12px] text-[#5a5a6e] hover:text-[#e2e2e8] transition-colors duration-200 w-fit mb-6"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Projects
        </Link>

        <div className="mb-8">
          <h1 className="text-[22px] font-bold text-[#e2e2e8] tracking-tight">Global Settings</h1>
          <p className="text-[13px] text-[#5a5a6e] mt-1">
            Configure your AgenticBEAR environment
          </p>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-8">
          {/* API Key Section */}
          <div
            className="rounded-xl p-6"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
            }}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
              >
                <Shield className="h-4 w-4 text-[#ef4444]" />
              </div>
              <div>
                <h2 className="text-[14px] font-semibold text-[#e2e2e8]">API Configuration</h2>
                <p className="text-[11px] text-[#5a5a6e]">Stored locally, never shared</p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[12.5px] font-semibold text-[#8b8b9e]">
                Anthropic API Key
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className="h-[40px] w-full rounded-xl px-3.5 pr-10 text-[13px] text-[#e2e2e8] placeholder:text-[#3a3a4a] font-mono transition-all duration-200 focus:outline-none"
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#5a5a6e] hover:text-[#8b8b9e] transition-colors duration-200"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Model Section */}
          <div
            className="rounded-xl p-6"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
            }}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)' }}
              >
                <Cpu className="h-4 w-4 text-[#6366f1]" />
              </div>
              <h2 className="text-[14px] font-semibold text-[#e2e2e8]">Model Defaults</h2>
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
            className="rounded-xl p-6"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
            }}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)' }}
              >
                <FolderOpen className="h-4 w-4 text-[#10b981]" />
              </div>
              <h2 className="text-[14px] font-semibold text-[#e2e2e8]">Workspace</h2>
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
            className="rounded-xl p-6"
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
            }}
          >
            <div className="flex items-center gap-2.5 mb-4">
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.2)' }}
              >
                <Zap className="h-4 w-4 text-[#f59e0b]" />
              </div>
              <h2 className="text-[14px] font-semibold text-[#e2e2e8]">Performance</h2>
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
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={updateSettings.isPending}
            >
              Save Settings
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
