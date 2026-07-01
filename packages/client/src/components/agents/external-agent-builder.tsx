/**
 * Create / edit form for an external agent (team-built HTTP endpoint).
 *
 * External agents have a completely different shape from specialists: they don't need a
 * model config, permissions, or a system prompt, but they need an endpoint URL + auth
 * config + capability flags. Kept separate from the main AgentBuilder so neither form has
 * to carry the other's baggage.
 */
import { useEffect, useState } from 'react';
import { Plug, Zap, Image as ImageIcon, Eye, EyeOff, Trash2, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import type { Agent, ExternalAgentAuthType } from '@subagent/shared';
import { useCreateAgent, useUpdateAgent, useDeleteAgent } from '../../api/hooks/use-agents';
import { apiPost } from '../../api/client';
import { useToast } from '../ui/toast';

const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 12px',
  background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border-default)',
  color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-sans)', fontSize: 13,
  outline: 'none', borderRadius: 'var(--radius-md)',
};

function FieldLabel({ children, hint, required }: { children: React.ReactNode; hint?: string; required?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
        {children}{required && <span aria-hidden="true" style={{ color: 'var(--color-error)', marginLeft: 3 }}>*</span>}
      </span>
      {hint && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{hint}</span>}
    </div>
  );
}

function PillToggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex items-center" style={{ gap: 2, padding: 3, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 999 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={on}
            style={{
              height: 28, padding: '0 12px', fontSize: 11.5, fontFamily: 'var(--font-mono)',
              background: on ? 'linear-gradient(180deg, rgba(124,140,248,0.22), rgba(124,140,248,0.10))' : 'transparent',
              border: on ? '1px solid rgba(124,140,248,0.4)' : '1px solid transparent',
              color: on ? '#7c8cf8' : 'var(--color-text-secondary)',
              borderRadius: 999, cursor: on ? 'default' : 'pointer', fontWeight: on ? 600 : 500,
              transition: 'background .15s, color .15s, border-color .15s', whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

interface TestState { status: 'idle' | 'running' | 'ok' | 'error'; message?: string; latencyMs?: number; sample?: string }

export function ExternalAgentBuilder({ projectId, agent, onClose }: { projectId: string; agent?: Agent; onClose: () => void }) {
  const isEdit = !!agent;
  const createAgent = useCreateAgent();
  const updateAgent = useUpdateAgent();
  const deleteAgent = useDeleteAgent();
  const { show: showToast } = useToast();

  const [name, setName] = useState(agent?.name ?? '');
  const [description, setDescription] = useState(agent?.description ?? '');
  const [endpointUrl, setEndpointUrl] = useState(agent?.external?.endpointUrl ?? '');
  const [authType, setAuthType] = useState<ExternalAgentAuthType>(agent?.external?.authType ?? 'none');
  const [headerName, setHeaderName] = useState(agent?.external?.headerName ?? 'X-API-Key');
  const [secret, setSecret] = useState('');
  const [secretVisible, setSecretVisible] = useState(false);
  const [defaultModel, setDefaultModel] = useState(agent?.external?.defaultModel ?? '');
  const [supportsImages, setSupportsImages] = useState(agent?.external?.supportsImages ?? false);
  const [supportsStreaming, setSupportsStreaming] = useState(agent?.external?.supportsStreaming ?? true);
  const [systemPrompt, setSystemPrompt] = useState(agent?.systemPrompt ?? '');
  const [color, setColor] = useState(agent?.color ?? '#c0a0d8');
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Auto-clear test result when config changes (results are only meaningful for the last-saved shape).
  useEffect(() => { setTest({ status: 'idle' }); }, [endpointUrl, authType, headerName, secret, defaultModel]);

  const save = () => {
    const trimmed = name.trim();
    if (!trimmed) { showToast('Give the agent a name.', { variant: 'error' }); return; }
    if (!endpointUrl.trim()) { showToast('Endpoint URL is required.', { variant: 'error' }); return; }
    const external = {
      endpointUrl: endpointUrl.trim(),
      authType,
      headerName: authType === 'header' ? (headerName.trim() || 'X-API-Key') : '',
      // Send secret only when the user typed one; omit → keep existing on edit.
      ...(secret ? { secret } : {}),
      defaultModel: defaultModel.trim(),
      supportsImages,
      supportsStreaming,
      payloadShape: 'openai' as const,
    };
    if (isEdit && agent) {
      updateAgent.mutate({
        id: agent.id, name: trimmed, description, systemPrompt,
        color, external,
      }, {
        onSuccess: () => { showToast('External agent saved.', { variant: 'success' }); onClose(); },
        onError: (err) => showToast(err instanceof Error ? err.message : 'Save failed', { variant: 'error' }),
      });
    } else {
      createAgent.mutate({
        projectId, role: 'external', name: trimmed, description, systemPrompt,
        modelConfig: { model: 'external', maxTokens: 4096, temperature: 0.7 },
        color,
        external,
      }, {
        onSuccess: () => { showToast('External agent created.', { variant: 'success' }); onClose(); },
        onError: (err) => showToast(err instanceof Error ? err.message : 'Create failed', { variant: 'error' }),
      });
    }
  };

  const runTest = async () => {
    if (!isEdit || !agent) {
      showToast('Save the agent first, then test the connection.', { variant: 'error' });
      return;
    }
    setTest({ status: 'running' });
    try {
      const r = await apiPost<{ ok: boolean; latencyMs: number; error?: string; sample?: string }>(`/api/agents/${agent.id}/test`, {});
      if (r.ok) setTest({ status: 'ok', latencyMs: r.latencyMs, sample: r.sample });
      else setTest({ status: 'error', message: r.error || 'Endpoint returned an error.' });
    } catch (err) {
      setTest({ status: 'error', message: err instanceof Error ? err.message : 'Test failed' });
    }
  };

  return (
    <div className="flex flex-col gap-4" style={{ padding: '4px 2px' }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          style={{
            width: 40, height: 40, borderRadius: 10,
            background: `linear-gradient(135deg, ${color}30, ${color}0d)`,
            border: `1px solid ${color}55`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color,
          }}
        >
          <Plug style={{ width: 18, height: 18 }} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--color-text-primary)' }}>
            {isEdit ? 'Edit external agent' : 'New external agent'}
          </div>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            OpenAI-compatible endpoint — team-built.
          </div>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="flex flex-col gap-1.5">
          <FieldLabel required>Name</FieldLabel>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Vision Reviewer" style={inputStyle} />
        </div>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Accent color</FieldLabel>
          <div className="flex items-center gap-2">
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
              style={{ width: 44, height: 36, border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-base)', cursor: 'pointer', padding: 3 }} />
            <input type="text" value={color} onChange={(e) => setColor(e.target.value)} style={{ ...inputStyle, flex: 1, fontFamily: 'var(--font-mono)' }} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel hint="Shown as the card subtitle. Optional.">Description</FieldLabel>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Analyzes screenshots and returns structured findings." style={inputStyle} />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel hint="Merged into the OpenAI `messages` payload as a system message. Leave blank to skip.">System prompt (optional)</FieldLabel>
        <textarea value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} rows={2}
          placeholder="You are the team's internal document assistant. Answer briefly."
          style={{ ...inputStyle, height: 'auto', padding: '8px 12px', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12 }} />
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel required hint='Full URL of the endpoint that implements POST /v1/chat/completions (or an equivalent path).'>Endpoint URL</FieldLabel>
        <input value={endpointUrl} onChange={(e) => setEndpointUrl(e.target.value)} placeholder="https://vision.internal.company.com/v1/chat/completions"
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="flex flex-col gap-1.5">
          <FieldLabel>Auth</FieldLabel>
          <PillToggle
            value={authType}
            onChange={setAuthType}
            options={[
              { value: 'none', label: 'None' },
              { value: 'bearer', label: 'Bearer' },
              { value: 'header', label: 'Header' },
            ]}
          />
        </div>
        {authType === 'header' && (
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Header name</FieldLabel>
            <input value={headerName} onChange={(e) => setHeaderName(e.target.value)} placeholder="X-API-Key"
              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }} />
          </div>
        )}
      </div>

      {authType !== 'none' && (
        <div className="flex flex-col gap-1.5">
          <FieldLabel hint={isEdit && !secret ? 'Leave blank to keep the existing secret.' : undefined}>Secret</FieldLabel>
          <div style={{ position: 'relative' }}>
            <input
              type={secretVisible ? 'text' : 'password'}
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              placeholder={isEdit ? 'Leave blank to keep existing' : 'Bearer token or API key'}
              autoComplete="off"
              style={{ ...inputStyle, paddingRight: 40, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />
            <button type="button" onClick={() => setSecretVisible((v) => !v)}
              aria-label={secretVisible ? 'Hide secret' : 'Show secret'}
              style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 6, borderRadius: 4, display: 'flex' }}>
              {secretVisible ? <EyeOff style={{ width: 14, height: 14 }} /> : <Eye style={{ width: 14, height: 14 }} />}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <FieldLabel hint='String sent as the `model` field. Blank → agent name.'>Model name (optional)</FieldLabel>
        <input value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} placeholder="vision-v1"
          style={{ ...inputStyle, fontFamily: 'var(--font-mono)', fontSize: 12 }} />
      </div>

      {/* Capabilities toggles */}
      <div style={{ padding: 12, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 10 }}>
        <div style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--color-text-disabled)', fontWeight: 700, marginBottom: 8 }}>
          Capabilities
        </div>
        <label className="flex items-center gap-2 cursor-pointer" style={{ marginBottom: 8 }}>
          <input type="checkbox" checked={supportsImages} onChange={(e) => setSupportsImages(e.target.checked)} />
          <ImageIcon style={{ width: 13, height: 13, color: '#7c8cf8' }} />
          <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>Supports images</span>
          <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Composer shows an image button + accepts paste/drop.</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={supportsStreaming} onChange={(e) => setSupportsStreaming(e.target.checked)} />
          <Zap style={{ width: 13, height: 13, color: '#6db58a' }} />
          <span style={{ fontSize: 12.5, color: 'var(--color-text-primary)' }}>Supports streaming (SSE)</span>
          <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>Off → wait for a single JSON body reply.</span>
        </label>
      </div>

      {/* Test connection */}
      <div className="flex items-center gap-2 flex-wrap" style={{
        padding: 10, borderRadius: 10,
        background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)',
      }}>
        <button
          type="button"
          onClick={runTest}
          disabled={!isEdit || test.status === 'running'}
          title={!isEdit ? 'Save first, then Test' : 'Send a "ping" message and check the response'}
          className="flex items-center gap-1.5"
          style={{
            height: 30, padding: '0 12px', fontSize: 11.5, fontWeight: 600,
            color: !isEdit ? 'var(--color-text-disabled)' : '#021526',
            background: !isEdit ? 'var(--color-bg-raised)' : 'var(--color-accent)',
            border: 'none', borderRadius: 'var(--radius-md)',
            cursor: !isEdit || test.status === 'running' ? 'wait' : (isEdit ? 'pointer' : 'not-allowed'),
          }}
        >
          {test.status === 'running' ? <Loader2 className="animate-spin" style={{ width: 12, height: 12 }} /> : <Zap style={{ width: 12, height: 12 }} />}
          {test.status === 'running' ? 'Testing…' : 'Test connection'}
        </button>
        {test.status === 'ok' && (
          <span className="flex items-center gap-1.5" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-success)' }}>
            <CheckCircle2 style={{ width: 12, height: 12 }} /> OK · {test.latencyMs}ms
            {test.sample && <span style={{ color: 'var(--color-text-disabled)' }}>· "{test.sample.slice(0, 60)}{test.sample.length > 60 ? '…' : ''}"</span>}
          </span>
        )}
        {test.status === 'error' && (
          <span className="flex items-center gap-1.5" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-error)', minWidth: 0 }}>
            <XCircle style={{ width: 12, height: 12, flexShrink: 0 }} /> <span className="truncate">{test.message}</span>
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between" style={{ marginTop: 6, paddingTop: 12, borderTop: '1px solid var(--color-border-subtle)' }}>
        {isEdit ? (
          confirmDelete ? (
            <div className="flex items-center gap-2">
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>Delete this agent?</span>
              <button type="button" onClick={() => setConfirmDelete(false)}
                style={{ height: 26, padding: '0 10px', background: 'none', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)', fontSize: 11, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => agent && deleteAgent.mutate({ id: agent.id, projectId }, {
                  onSuccess: () => { showToast(`Deleted "${agent.name}"`, { variant: 'success' }); onClose(); },
                  onError: (err) => showToast(err instanceof Error ? err.message : 'Delete failed', { variant: 'error' }),
                })}
                style={{ height: 26, padding: '0 10px', background: 'var(--color-error)', color: '#021526', border: 'none', fontSize: 11, fontWeight: 600, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5"
              style={{ height: 30, padding: '0 12px', background: 'none', border: '1px solid var(--color-border-subtle)', color: 'var(--color-error)', fontSize: 11.5, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
            >
              <Trash2 style={{ width: 12, height: 12 }} /> Delete
            </button>
          )
        ) : <span />}
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose}
            style={{ height: 34, padding: '0 14px', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 12.5, border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={createAgent.isPending || updateAgent.isPending}
            className="flex items-center gap-1.5"
            style={{
              height: 34, padding: '0 16px', fontSize: 12.5, fontWeight: 600,
              color: '#021526', background: 'var(--color-accent)', border: 'none',
              borderRadius: 'var(--radius-md)', cursor: 'pointer',
            }}
          >
            {isEdit ? (updateAgent.isPending ? 'Saving…' : 'Save changes') : (createAgent.isPending ? 'Creating…' : 'Create agent')}
          </button>
        </div>
      </div>
    </div>
  );
}
