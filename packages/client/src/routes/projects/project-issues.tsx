import { useState, useMemo } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { CircleDot, Plus, Trash2, ExternalLink, Bot, ShieldAlert, Bug, Lightbulb, ListTodo, Link2, RefreshCw, Tag, X, Wand2, UploadCloud, AlertTriangle, ChevronDown, ChevronUp, Check, Minus } from 'lucide-react';
import type { Issue, IssueKind, IssuePriority, IssueStatus } from '@subagent/shared';
import { useProjectIssues, useCreateIssue, useUpdateIssue, useDeleteIssue, useSyncIssues, usePushIssues, type PushFailure } from '../../api/hooks/use-issues';
import { useProjectIntegrations, useConnections, useLinkIntegration } from '../../api/hooks/use-integrations';
import { useToast } from '../../components/ui/toast';
import { Skeleton } from '../../components/ui/skeleton';

/**
 * Key the chat page reads to pick up a pre-filled prompt (e.g. "resolve these issues…").
 * Stored in sessionStorage so it survives navigation but doesn't leak between tabs/sessions.
 */
export const CHAT_PREFILL_KEY = (projectId: string) => `agb_chat_prefill_${projectId}`;

/**
 * System-styled checkbox used in the Issues list. Renders a real (hidden) <input> for
 * accessibility (Space-to-toggle, screen readers, form integration) and a visible square
 * tile that matches the rest of the app (rounded, accent gradient when checked, soft
 * glow on focus). `indeterminate` is honored via a — icon (used for the select-all bar).
 */
function IssueCheckbox({
  checked,
  indeterminate = false,
  onChange,
  ariaLabel,
  size = 16,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (next: boolean) => void;
  ariaLabel: string;
  size?: number;
}) {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = checked || indeterminate;
  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        flexShrink: 0,
        cursor: 'pointer',
        // Outer dot used as the focus ring — softer than a default outline.
        borderRadius: 6,
        boxShadow: focused ? '0 0 0 2px rgba(124,140,248,0.45)' : 'none',
        transition: 'box-shadow .15s',
      }}
    >
      <input
        type="checkbox"
        aria-label={ariaLabel}
        aria-checked={indeterminate ? 'mixed' : checked}
        checked={checked}
        ref={(el) => { if (el) el.indeterminate = indeterminate; }}
        onChange={(e) => onChange(e.target.checked)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // The visible tile is the <span>; the input is hidden but interactive.
        style={{
          position: 'absolute', inset: 0, width: '100%', height: '100%',
          margin: 0, padding: 0, opacity: 0, cursor: 'pointer',
        }}
      />
      <span
        aria-hidden="true"
        style={{
          width: size, height: size, borderRadius: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: active
            ? 'linear-gradient(180deg, rgba(124,140,248,0.95) 0%, rgba(124,140,248,0.78) 100%)'
            : hover
              ? 'rgba(124,140,248,0.10)'
              : 'var(--color-bg-base)',
          border: active
            ? '1px solid rgba(124,140,248,0.75)'
            : hover
              ? '1px solid rgba(124,140,248,0.45)'
              : '1px solid var(--color-border-default)',
          boxShadow: active
            ? 'inset 0 1px 0 rgba(255,255,255,0.15), 0 6px 14px -8px rgba(124,140,248,0.7)'
            : 'inset 0 1px 0 rgba(255,255,255,0.02)',
          transition: 'background .15s, border-color .15s, box-shadow .15s',
        }}
      >
        {indeterminate ? (
          <Minus style={{ width: size - 4, height: size - 4, color: '#021526', strokeWidth: 3 }} aria-hidden="true" />
        ) : checked ? (
          <Check style={{ width: size - 4, height: size - 4, color: '#021526', strokeWidth: 3 }} aria-hidden="true" />
        ) : null}
      </span>
    </label>
  );
}

/** Build the orchestrator handoff prompt for a batch of issues. */
function buildResolvePrompt(issues: Issue[]): string {
  const lines: string[] = [
    `Please orchestrate work to resolve the following ${issues.length} issue${issues.length === 1 ? '' : 's'}. ` +
      `Plan an approach, delegate to specialists where it helps, and produce concrete changes. ` +
      `When each issue is done, file a brief follow-up comment on its tracker entry (if linked) and mark its local status.`,
    '',
    '## Issues',
  ];
  for (const it of issues) {
    lines.push('');
    lines.push(`### ${it.title}`);
    lines.push(`- kind: ${it.kind} · priority: ${it.priority} · status: ${it.status.replace('_', ' ')}`);
    if (it.labels.length) lines.push(`- labels: ${it.labels.join(', ')}`);
    if (it.externalUrl) lines.push(`- tracker: ${it.externalUrl}${it.externalId ? ` (#${it.externalId})` : ''}`);
    lines.push(`- local id: ${it.id}`);
    if (it.description?.trim()) {
      lines.push('');
      lines.push(it.description.trim());
    }
  }
  return lines.join('\n');
}

const KIND_ICON: Record<string, typeof Bug> = {
  vulnerability: ShieldAlert, bug: Bug, task: ListTodo, improvement: Lightbulb, issue: CircleDot,
};
const PRIORITY_COLOR: Record<IssuePriority, string> = {
  low: 'var(--color-text-tertiary)', medium: 'var(--color-info)', high: 'var(--color-warning)', critical: 'var(--color-error)',
};
const STATUS_NEXT: Record<IssueStatus, IssueStatus> = { open: 'in_progress', in_progress: 'closed', closed: 'open' };
const STATUS_COLOR: Record<IssueStatus, string> = { open: 'var(--color-success)', in_progress: 'var(--color-warning)', closed: 'var(--color-text-disabled)' };

const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 11px', background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none', borderRadius: 'var(--radius-md)',
};

export function ProjectIssuesPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const navigate = useNavigate();
  const { data: issues, isLoading } = useProjectIssues(projectId);
  const createIssue = useCreateIssue(projectId);
  const updateIssue = useUpdateIssue(projectId);
  const deleteIssue = useDeleteIssue(projectId);
  const syncIssues = useSyncIssues(projectId);
  const pushIssues = usePushIssues(projectId);
  const { data: links } = useProjectIntegrations(projectId);
  const { data: connections } = useConnections();
  const linkIntegration = useLinkIntegration(projectId);
  const { show: showToast } = useToast();

  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<IssueKind>('issue');
  const [priority, setPriority] = useState<IssuePriority>('medium');
  const [labels, setLabels] = useState<string[]>([]);
  const [labelDraft, setLabelDraft] = useState('');
  const [open, setOpen] = useState(false);
  /** Issue ids the user has checked for batch actions (Resolve in chat, etc.). */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** Active filters. Multi-select within each axis (e.g. low+medium); empty set = all. */
  const [priorityFilter, setPriorityFilter] = useState<Set<IssuePriority>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<IssueStatus>>(new Set());

  const togglePriority = (p: IssuePriority) => {
    setPriorityFilter((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  };
  const toggleStatus = (s: IssueStatus) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };
  const clearFilters = () => { setPriorityFilter(new Set()); setStatusFilter(new Set()); };
  /** Failures from the last push attempt — drives the "Couldn't reach tracker" panel + retry. */
  const [lastFailures, setLastFailures] = useState<PushFailure[]>([]);
  const [failuresExpanded, setFailuresExpanded] = useState(false);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const linkedConn = links?.[0];
  const unlinkedConns = (connections ?? []).filter((c) => c.enabled && !(links ?? []).some((l) => l.connectionId === c.id));
  const linkedConnFull = useMemo(() => connections?.find((c) => c.id === linkedConn?.connectionId), [connections, linkedConn]);
  /** Suggestions = the linked connection's curated vocabulary, minus what's already chosen. */
  const labelSuggestions = (linkedConnFull?.labelsVocabulary ?? []).filter((l) => !labels.some((x) => x.toLowerCase() === l.toLowerCase()));

  const addLabel = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (labels.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    setLabels((prev) => [...prev, v]);
    setLabelDraft('');
  };
  const removeLabel = (l: string) => setLabels((prev) => prev.filter((x) => x !== l));

  const submit = () => {
    if (!title.trim()) return;
    createIssue.mutate({ title: title.trim(), kind, priority, labels, source: 'user' }, {
      onSuccess: () => { setTitle(''); setLabels([]); setLabelDraft(''); setOpen(false); },
      onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to create issue', { variant: 'error' }),
    });
  };

  const runSync = () => {
    syncIssues.mutate(undefined, {
      onSuccess: (r) => {
        const issues = r.imported + r.updated;
        const msg = issues > 0 ? `Pulled ${r.imported} new, ${r.updated} updated.` : 'Up to date — no new work items.';
        showToast(msg + (r.errors.length ? ` (${r.errors.length} warnings)` : ''), { variant: r.errors.length ? 'error' : 'success' });
      },
      onError: (err) => showToast(err instanceof Error ? err.message : 'Sync failed', { variant: 'error' }),
    });
  };

  const handlePushResult = (r: { pushed: number; alreadySynced: number; failed: number; failures: PushFailure[]; errors: string[] }) => {
    setLastFailures(r.failures ?? []);
    setFailuresExpanded(r.failures && r.failures.length > 0 ? true : false);
    if (r.errors.length && r.pushed === 0 && r.failed === 0) {
      // Hard precondition error (e.g. no linked tracker).
      showToast(r.errors[0] ?? 'Push failed', { variant: 'error' });
      return;
    }
    const tail = r.failed > 0 ? `, ${r.failed} failed` : '';
    const skip = r.alreadySynced > 0 ? ` (${r.alreadySynced} already on tracker)` : '';
    showToast(`Pushed ${r.pushed} issue${r.pushed === 1 ? '' : 's'}${tail}${skip}.`, { variant: r.failed > 0 ? 'error' : 'success' });
  };

  const runPush = () => {
    pushIssues.mutate(undefined, {
      onSuccess: handlePushResult,
      onError: (err) => showToast(err instanceof Error ? err.message : 'Push failed', { variant: 'error' }),
    });
  };

  const retryFailedPush = () => {
    if (lastFailures.length === 0) return;
    pushIssues.mutate(lastFailures.map((f) => f.id), {
      onSuccess: handlePushResult,
      onError: (err) => showToast(err instanceof Error ? err.message : 'Push failed', { variant: 'error' }),
    });
  };

  const allIssues = issues ?? [];
  const unsyncedCount = allIssues.filter((it) => !it.externalId && it.source !== 'external').length;
  const hasFilter = priorityFilter.size > 0 || statusFilter.size > 0;
  /** Visible list after applying filters. Drives the rendered rows + the select-all checkbox. */
  const list = useMemo(() => {
    if (!hasFilter) return allIssues;
    return allIssues.filter((it) => {
      if (priorityFilter.size > 0 && !priorityFilter.has(it.priority)) return false;
      if (statusFilter.size > 0 && !statusFilter.has(it.status)) return false;
      return true;
    });
  }, [allIssues, priorityFilter, statusFilter, hasFilter]);
  /** Per-priority / per-status counts shown on the filter chips (always against the full list). */
  const priorityCounts = useMemo(() => {
    const c: Record<IssuePriority, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const it of allIssues) c[it.priority] += 1;
    return c;
  }, [allIssues]);
  const statusCounts = useMemo(() => {
    const c: Record<IssueStatus, number> = { open: 0, in_progress: 0, closed: 0 };
    for (const it of allIssues) c[it.status] += 1;
    return c;
  }, [allIssues]);
  /** Selected issues, in the order they appear in the visible list (for a stable prompt). */
  const selectedIssues = list.filter((it) => selected.has(it.id));

  const resolveInChat = () => {
    if (selectedIssues.length === 0) return;
    const prompt = buildResolvePrompt(selectedIssues);
    try {
      sessionStorage.setItem(CHAT_PREFILL_KEY(projectId), JSON.stringify({
        text: prompt,
        agentRole: 'orchestrator',
        startedFromIssues: selectedIssues.map((it) => it.id),
        createdAt: new Date().toISOString(),
      }));
    } catch {
      showToast('Could not stage the chat prompt (storage quota).', { variant: 'error' });
      return;
    }
    setSelected(new Set());
    navigate({ to: '/projects/$projectId', params: { projectId } });
  };

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Title row */}
      <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-2.5">
          <CircleDot style={{ width: 18, height: 18, color: 'var(--color-accent)' }} aria-hidden="true" />
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>Issues</h2>
            <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Tracked work + findings. Security/QA agents file issues here.
            </p>
          </div>
        </div>
        {/* Primary actions only — selection-driven Resolve + always-available New. */}
        <div className="flex items-center gap-2">
          {selectedIssues.length > 0 && (
            <button type="button"
              onClick={resolveInChat}
              title={`Start an orchestrator chat to resolve ${selectedIssues.length} issue${selectedIssues.length === 1 ? '' : 's'}`}
              className="flex items-center gap-1.5"
              style={{ height: 34, padding: '0 14px', fontSize: 12.5, fontWeight: 600,
                color: '#021526', background: 'var(--color-success)', border: 'none',
                borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
              <Wand2 style={{ width: 14, height: 14 }} />
              Resolve {selectedIssues.length} in chat
            </button>
          )}
          <button type="button" onClick={() => setOpen((v) => !v)} className="flex items-center gap-1.5"
            style={{ height: 34, padding: '0 14px', fontSize: 12.5, fontWeight: 600, color: '#021526', background: 'var(--color-accent)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
            <Plus style={{ width: 14, height: 14 }} /> New issue
          </button>
        </div>
      </div>

      {/* Tracker toolbar — sync controls live together in their own band, so they stop competing
          with the primary New/Resolve actions for visual weight. */}
      {linkedConn && (
        <div
          className="flex items-center justify-between gap-2 flex-wrap"
          style={{
            marginBottom: 12,
            padding: '8px 10px',
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)',
          }}
        >
          <div className="flex items-center gap-2" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
            <Link2 style={{ width: 12, height: 12 }} aria-hidden="true" />
            <span>tracker</span>
            <span style={{ color: 'var(--color-border-default)' }}>·</span>
            <span style={{ color: 'var(--color-accent)' }}>{linkedConn.kind}</span>
            {linkedConnFull && <span style={{ color: 'var(--color-text-disabled)' }}>{linkedConnFull.label}</span>}
            {unsyncedCount > 0 && (
              <>
                <span style={{ color: 'var(--color-border-default)' }}>·</span>
                <span style={{ color: 'var(--color-warning)' }}>{unsyncedCount} local-only</span>
              </>
            )}
          </div>
          <div className="flex items-center" style={{ gap: 1, padding: 2, background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
            <button type="button" onClick={runSync} disabled={syncIssues.isPending}
              aria-busy={syncIssues.isPending || undefined}
              title="Pull new and changed work items from the tracker"
              className="flex items-center gap-1.5"
              style={{ height: 28, padding: '0 10px', fontSize: 11.5, fontFamily: 'var(--font-mono)',
                color: 'var(--color-text-secondary)', background: 'transparent', border: 'none',
                borderRadius: 'var(--radius-sm)', cursor: syncIssues.isPending ? 'wait' : 'pointer' }}>
              <RefreshCw className={syncIssues.isPending ? 'animate-spin' : ''} style={{ width: 12, height: 12 }} aria-hidden="true" />
              {syncIssues.isPending ? 'pulling…' : 'Pull'}
            </button>
            <span style={{ width: 1, alignSelf: 'stretch', background: 'var(--color-border-subtle)' }} aria-hidden="true" />
            <button type="button" onClick={runPush} disabled={pushIssues.isPending || unsyncedCount === 0}
              aria-busy={pushIssues.isPending || undefined}
              title={unsyncedCount === 0 ? 'Everything is already on the tracker' : `Push ${unsyncedCount} local-only issue${unsyncedCount === 1 ? '' : 's'} to the tracker`}
              className="flex items-center gap-1.5"
              style={{ height: 28, padding: '0 10px', fontSize: 11.5, fontFamily: 'var(--font-mono)',
                color: unsyncedCount === 0 ? 'var(--color-text-disabled)' : 'var(--color-accent)',
                background: 'transparent', border: 'none',
                borderRadius: 'var(--radius-sm)', cursor: pushIssues.isPending ? 'wait' : (unsyncedCount === 0 ? 'not-allowed' : 'pointer') }}>
              <UploadCloud className={pushIssues.isPending ? 'animate-pulse' : ''} style={{ width: 12, height: 12 }} aria-hidden="true" />
              {pushIssues.isPending ? 'pushing…' : `Push${unsyncedCount > 0 ? ` ${unsyncedCount}` : ''}`}
            </button>
          </div>
        </div>
      )}

      {/* Failed-push panel — shows exactly which issues didn't reach the tracker and why,
          with a one-click retry. Persists until the user retries successfully or dismisses. */}
      {lastFailures.length > 0 && (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            background: 'var(--color-bg-surface)',
            border: '1px solid rgba(224,96,96,0.35)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          <div className="flex items-center justify-between gap-2" style={{ padding: '9px 11px', background: 'var(--color-error-subtle)' }}>
            <div className="flex items-center gap-2" style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-error)' }}>
              <AlertTriangle style={{ width: 13, height: 13 }} aria-hidden="true" />
              <span style={{ fontWeight: 600 }}>
                {lastFailures.length} issue{lastFailures.length === 1 ? '' : 's'} didn't reach the tracker
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setFailuresExpanded((v) => !v)}
                aria-label={failuresExpanded ? 'Collapse failure list' : 'Expand failure list'}
                title={failuresExpanded ? 'Collapse' : 'Show details'}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 4, borderRadius: 4 }}>
                {failuresExpanded ? <ChevronUp style={{ width: 13, height: 13 }} aria-hidden="true" /> : <ChevronDown style={{ width: 13, height: 13 }} aria-hidden="true" />}
              </button>
              <button type="button" onClick={retryFailedPush} disabled={pushIssues.isPending}
                aria-busy={pushIssues.isPending || undefined}
                className="flex items-center gap-1.5"
                style={{ height: 26, padding: '0 10px', fontSize: 11, fontWeight: 600,
                  background: 'var(--color-accent)', color: '#021526', border: 'none',
                  borderRadius: 'var(--radius-sm)', cursor: pushIssues.isPending ? 'wait' : 'pointer' }}>
                <RefreshCw className={pushIssues.isPending ? 'animate-spin' : ''} style={{ width: 11, height: 11 }} aria-hidden="true" />
                {pushIssues.isPending ? 'retrying…' : `Retry ${lastFailures.length}`}
              </button>
              <button type="button" onClick={() => { setLastFailures([]); setFailuresExpanded(false); }}
                aria-label="Dismiss failure list" title="Dismiss"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 4, borderRadius: 4 }}>
                <X style={{ width: 13, height: 13 }} aria-hidden="true" />
              </button>
            </div>
          </div>
          {failuresExpanded && (
            <div className="flex flex-col" style={{ maxHeight: 220, overflowY: 'auto' }}>
              {lastFailures.map((f) => (
                <div key={f.id} className="flex flex-col gap-0.5" style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border-subtle)' }}>
                  <span className="truncate" style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>{f.title}</span>
                  <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-error)' }}>{f.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tracker link prompt — only when no tracker is linked yet (linked state lives in the toolbar above). */}
      {!linkedConn && (
        <div className="flex items-center gap-2" style={{ marginBottom: 12, fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
          <Link2 style={{ width: 13, height: 13 }} aria-hidden="true" />
          {unlinkedConns.length > 0 ? (
            <span className="flex items-center gap-2">
              Not linked to a tracker.
              <select defaultValue="" onChange={(e) => { if (e.target.value) linkIntegration.mutate({ connectionId: e.target.value, syncEnabled: true }); }}
                style={{ ...inputStyle, height: 26, width: 'auto', fontSize: 11.5, cursor: 'pointer' }}>
                <option value="">Link a tracker…</option>
                {unlinkedConns.map((c) => <option key={c.id} value={c.id}>{c.label} ({c.kind})</option>)}
              </select>
            </span>
          ) : (
            <span>No tracker connections — add one in Settings → Integrations to sync issues to Jira/GitHub/Azure.</span>
          )}
        </div>
      )}

      {/* Create form */}
      {open && (
        <div className="flex flex-col gap-2" style={{ padding: 14, marginBottom: 12, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)' }}>
          <input autoFocus placeholder="Issue title" value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} style={inputStyle} />
          <div className="flex items-center gap-2 flex-wrap">
            <select value={kind} onChange={(e) => setKind(e.target.value as IssueKind)} style={{ ...inputStyle, height: 32, width: 'auto', cursor: 'pointer' }}>
              {['issue', 'bug', 'task', 'vulnerability', 'improvement'].map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <select value={priority} onChange={(e) => setPriority(e.target.value as IssuePriority)} style={{ ...inputStyle, height: 32, width: 'auto', cursor: 'pointer' }}>
              {['low', 'medium', 'high', 'critical'].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <div className="flex items-center gap-1.5 flex-wrap" style={{ flex: '1 1 200px', minWidth: 0 }}>
              <Tag style={{ width: 12, height: 12, color: 'var(--color-text-secondary)', flexShrink: 0 }} aria-hidden="true" />
              {labels.map((l) => (
                <span key={l} className="flex items-center gap-1" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)', borderRadius: 999, padding: '2px 4px 2px 8px' }}>
                  {l}
                  <button type="button" onClick={() => removeLabel(l)} aria-label={`Remove label ${l}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 2, display: 'flex' }}>
                    <X style={{ width: 10, height: 10 }} />
                  </button>
                </span>
              ))}
              <input
                placeholder={labels.length === 0 ? 'Add labels…' : '+ add'}
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLabel(labelDraft); }
                  else if (e.key === 'Backspace' && labelDraft === '' && labels.length > 0) { removeLabel(labels[labels.length - 1]!); }
                }}
                onBlur={() => { if (labelDraft.trim()) addLabel(labelDraft); }}
                list={`label-vocab-${projectId}`}
                style={{ ...inputStyle, height: 28, flex: '1 1 120px', minWidth: 100, fontSize: 12 }}
              />
              <datalist id={`label-vocab-${projectId}`}>
                {labelSuggestions.map((l) => <option key={l} value={l} />)}
              </datalist>
            </div>
            <button type="button" onClick={submit} disabled={!title.trim() || createIssue.isPending}
              style={{ height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600, background: 'var(--color-accent)', color: '#021526', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', marginLeft: 'auto' }}>
              {createIssue.isPending ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Filter bar — multi-select within each axis. Empty axis = all. Drives `list` so
          select-all + Resolve naturally operate on whatever the user is currently viewing. */}
      {allIssues.length > 0 && (
        <div
          className="flex items-center gap-2 flex-wrap"
          style={{
            marginBottom: 10,
            padding: '8px 10px',
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)',
            borderRadius: 'var(--radius-md)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
          }}
        >
          <span style={{ color: 'var(--color-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>priority</span>
          {(['critical', 'high', 'medium', 'low'] as IssuePriority[]).map((p) => {
            const on = priorityFilter.has(p);
            const color = PRIORITY_COLOR[p];
            return (
              <button
                key={p}
                type="button"
                onClick={() => togglePriority(p)}
                aria-pressed={on}
                title={on ? `Hide ${p}` : `Only show ${p}`}
                className="flex items-center gap-1.5"
                style={{
                  height: 24, padding: '0 9px', fontSize: 11, fontFamily: 'var(--font-mono)',
                  background: on ? `${color}22` : 'var(--color-bg-base)',
                  border: `1px solid ${on ? color : 'var(--color-border-subtle)'}`,
                  color: on ? color : 'var(--color-text-secondary)',
                  borderRadius: 999, cursor: 'pointer',
                  transition: 'background .15s, border-color .15s, color .15s',
                }}
              >
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: on ? `0 0 0 2px ${color}33` : 'none' }} />
                {p}
                <span style={{ color: on ? color : 'var(--color-text-disabled)', opacity: 0.8 }}>· {priorityCounts[p]}</span>
              </button>
            );
          })}
          <span style={{ width: 1, height: 16, background: 'var(--color-border-subtle)' }} aria-hidden="true" />
          <span style={{ color: 'var(--color-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>status</span>
          {(['open', 'in_progress', 'closed'] as IssueStatus[]).map((s) => {
            const on = statusFilter.has(s);
            const color = STATUS_COLOR[s];
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleStatus(s)}
                aria-pressed={on}
                title={on ? `Hide ${s.replace('_', ' ')}` : `Only show ${s.replace('_', ' ')}`}
                className="flex items-center gap-1.5"
                style={{
                  height: 24, padding: '0 9px', fontSize: 11, fontFamily: 'var(--font-mono)',
                  background: on ? `${color}22` : 'var(--color-bg-base)',
                  border: `1px solid ${on ? color : 'var(--color-border-subtle)'}`,
                  color: on ? color : 'var(--color-text-secondary)',
                  borderRadius: 999, cursor: 'pointer',
                  transition: 'background .15s, border-color .15s, color .15s',
                }}
              >
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: on ? `0 0 0 2px ${color}33` : 'none' }} />
                {s.replace('_', ' ')}
                <span style={{ color: on ? color : 'var(--color-text-disabled)', opacity: 0.8 }}>· {statusCounts[s]}</span>
              </button>
            );
          })}
          <span style={{ flex: 1, minWidth: 0 }} aria-hidden="true" />
          {hasFilter && (
            <span className="flex items-center gap-2">
              <span style={{ color: 'var(--color-text-disabled)' }}>{list.length}/{allIssues.length}</span>
              <button type="button" onClick={clearFilters}
                style={{ height: 22, padding: '0 8px', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                clear
              </button>
            </span>
          )}
        </div>
      )}

      {/* List */}
      <div style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 14 }}>{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} height={20} className="mb-3" />)}</div>
        ) : list.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            {hasFilter ? (
              <span>No issues match the current filters. <button type="button" onClick={clearFilters} style={{ color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Clear filters</button>.</span>
            ) : 'No issues yet.'}
          </div>
        ) : (
          <>
            {/* Select-all bar */}
            <div className="flex items-center gap-3" style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}>
              <IssueCheckbox
                ariaLabel={selected.size === list.length ? 'Deselect all issues' : 'Select all issues'}
                checked={list.length > 0 && selected.size === list.length}
                indeterminate={selected.size > 0 && selected.size < list.length}
                onChange={(next) => setSelected(next ? new Set(list.map((it) => it.id)) : new Set())}
              />
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                {selected.size > 0
                  ? `${selected.size} selected`
                  : `${list.length} issue${list.length === 1 ? '' : 's'}${hasFilter ? ` of ${allIssues.length}` : ''}`}
              </span>
              {selected.size > 0 && (
                <button type="button" onClick={() => setSelected(new Set())}
                  style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
                  clear
                </button>
              )}
            </div>
            {list.map((it: Issue) => {
              const Icon = KIND_ICON[it.kind] ?? CircleDot;
              const isSelected = selected.has(it.id);
              return (
                <div key={it.id} className="flex items-center gap-3 group" style={{ padding: '11px 14px', borderBottom: '1px solid var(--color-border-subtle)', background: isSelected ? 'rgba(124,140,248,0.06)' : 'transparent' }}>
                  <IssueCheckbox
                    ariaLabel={`Select issue "${it.title}"`}
                    checked={isSelected}
                    onChange={() => toggleSelect(it.id)}
                  />
                  <Icon style={{ width: 15, height: 15, color: PRIORITY_COLOR[it.priority], flexShrink: 0 }} aria-hidden="true" />
                <button type="button" onClick={() => updateIssue.mutate({ id: it.id, status: STATUS_NEXT[it.status] })} title="Cycle status"
                  style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)', color: STATUS_COLOR[it.status], background: 'none', border: `1px solid ${STATUS_COLOR[it.status]}55`, borderRadius: 999, padding: '2px 8px', cursor: 'pointer', flexShrink: 0 }}>
                  {it.status.replace('_', ' ')}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="truncate" style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>{it.title}</div>
                  <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 1 }}>
                    <span style={{ color: PRIORITY_COLOR[it.priority] }}>{it.priority}</span>
                    <span>· {it.kind}</span>
                    {it.source === 'agent' && <span className="flex items-center gap-1"><Bot style={{ width: 10, height: 10 }} /> agent</span>}
                    {it.source === 'external' && <span className="flex items-center gap-1" style={{ color: 'var(--color-accent)' }}><RefreshCw style={{ width: 10, height: 10 }} /> from tracker</span>}
                    {it.labels.length > 0 && (
                      <span className="flex items-center gap-1 flex-wrap">
                        {it.labels.map((l) => (
                          <span key={l} style={{ fontSize: 9.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 999, padding: '1px 6px' }}>
                            {l}
                          </span>
                        ))}
                      </span>
                    )}
                  </div>
                </div>
                {it.externalUrl && (
                  <a href={it.externalUrl} target="_blank" rel="noreferrer" title="Open in tracker" className="flex items-center gap-1" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', textDecoration: 'none', flexShrink: 0 }}>
                    <ExternalLink style={{ width: 12, height: 12 }} /> {it.externalId}
                  </a>
                )}
                  <button type="button" onClick={() => deleteIssue.mutate(it.id)} title="Delete" className="opacity-0 group-hover:opacity-100"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-disabled)', flexShrink: 0, padding: 4 }}>
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
