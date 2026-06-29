import { useState, useMemo } from 'react';
import {
  Brain, Server, Monitor, Database, Container, TestTube2,
  FileText, Palette, Bot, X, Pencil, Clock, CheckCircle, AlertCircle, Loader2,
  MessageSquare, Trash2, ChevronRight, BookOpen, Search, Filter,
} from 'lucide-react';
import type { Agent, Task, AgentActivity, AgentMemory } from '@subagent/shared';
import { CLAUDE_MODELS } from '@subagent/shared';
import { Badge } from '../ui/badge';
import { Dialog } from '../ui/dialog';
import { useToast } from '../ui/toast';
import {
  useAgentTasks, useAgentActivities, useDeleteActivity, useClearActivities,
  useAgentMemories, useDeleteMemory, useClearMemories,
} from '../../api/hooks/use-agents';
import type { AgentStatus } from './agent-card';

const PAGE_SIZE = 25;

const iconMap: Record<string, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  Brain, Server, Monitor, Database, Container, TestTube2,
  FileText, Palette, Bot,
};

const taskStatusConfig: Record<string, { icon: React.FC<{ className?: string }>; color: string; label: string }> = {
  completed: { icon: CheckCircle, color: '#6db58a', label: 'Completed' },
  in_progress: { icon: Loader2, color: '#7c8cf8', label: 'In Progress' },
  failed: { icon: AlertCircle, color: '#e06060', label: 'Failed' },
  queued: { icon: Clock, color: '#6a5a48', label: 'Queued' },
  delegated: { icon: Clock, color: '#a8947c', label: 'Delegated' },
  awaiting_handoff: { icon: Clock, color: '#a8947c', label: 'Awaiting' },
  skipped: { icon: Clock, color: '#42332a', label: 'Skipped' },
};

interface AgentDetailPanelProps {
  agent: Agent;
  status?: AgentStatus;
  onClose: () => void;
  onEdit: () => void;
  selectedActivityId?: string;
  onSelectActivity: (activity: AgentActivity) => void;
}

export function AgentDetailPanel({ agent, status = 'idle', onClose, onEdit, selectedActivityId, onSelectActivity }: AgentDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<'activity' | 'memory'>('activity');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'completed' | 'failed'>('all');
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [confirmClear, setConfirmClear] = useState<null | 'activity' | 'memory'>(null);

  const { data: tasks, isLoading: tasksLoading } = useAgentTasks(agent.id);
  const { data: activities, isLoading: activitiesLoading } = useAgentActivities(agent.id);
  const { data: memories, isLoading: memoriesLoading } = useAgentMemories(agent.id);
  const deleteActivity = useDeleteActivity();
  const clearActivities = useClearActivities();
  const deleteMemory = useDeleteMemory();
  const clearMemories = useClearMemories();
  const { show: showToast } = useToast();

  const Icon = iconMap[agent.icon] || Bot;
  const modelLabel = CLAUDE_MODELS[agent.modelConfig.model]?.label ?? agent.modelConfig.model;

  const filteredActivities = useMemo(() => {
    let list = activities ?? [];
    if (statusFilter !== 'all') list = list.filter((a) => a.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((a) => a.query?.toLowerCase().includes(q));
    }
    return list;
  }, [activities, statusFilter, search]);

  const filteredMemories = useMemo(() => {
    let list = memories ?? [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => m.query?.toLowerCase().includes(q) || m.response?.toLowerCase().includes(q));
    }
    return list;
  }, [memories, search]);

  // Reset pagination when switching tab or filters.
  const visibleList = activeTab === 'activity' ? filteredActivities.slice(0, visible) : filteredMemories.slice(0, visible);
  const sourceList = activeTab === 'activity' ? filteredActivities : filteredMemories;
  const hasMore = sourceList.length > visible;

  const handleConfirmClear = () => {
    if (!confirmClear) return;
    const target = confirmClear;
    setConfirmClear(null);
    if (target === 'activity') {
      clearActivities.mutate(agent.id, {
        onSuccess: () => showToast('Activity history cleared', { variant: 'success' }),
        onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to clear', { variant: 'error' }),
      });
    } else {
      clearMemories.mutate(agent.id, {
        onSuccess: () => showToast('Memories cleared', { variant: 'success' }),
        onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to clear', { variant: 'error' }),
      });
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start gap-4 pb-5" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center"
          style={{ backgroundColor: `${agent.color}15`, color: agent.color }}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-text-primary truncate">{agent.name}</h2>
            <Badge color={agent.color}>{agent.role}</Badge>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-text-tertiary font-mono">{modelLabel}</span>
            {status === 'running' && (
              <span className="flex items-center gap-1 text-[10px] text-[#7c8cf8]">
                <span className="h-1.5 w-1.5 rounded-full animate-pulse bg-[#7c8cf8]" />
                Running
              </span>
            )}
          </div>
          {agent.description && (
            <p className="text-[12px] text-text-secondary mt-2 leading-relaxed">{agent.description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${agent.name}`}
            className="flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary transition-colors duration-200 px-2 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8] rounded"
            style={{ minHeight: 28 }}
          >
            <Pencil className="h-3 w-3" aria-hidden="true" />
            Edit
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close agent detail"
            className="flex items-center justify-center h-8 w-8 text-text-secondary hover:text-text-primary transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8] rounded"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center shrink-0" style={{ borderBottom: '1px solid var(--color-border-subtle)' }} role="tablist" aria-label="Agent details">
        <div className="flex gap-1 px-1">
          {(['activity', 'memory'] as const).map((tab) => {
            const count = tab === 'activity'
              ? (activities?.length ?? 0)
              : (memories?.length ?? 0);
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                onClick={() => { setActiveTab(tab); setVisible(PAGE_SIZE); }}
                className="flex items-center gap-2 px-3 py-2.5 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8] rounded"
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                  borderBottom: isActive ? `2px solid ${agent.color}` : '2px solid transparent',
                  marginBottom: '-1px',
                  minHeight: 36,
                }}
              >
                {tab === 'activity' ? 'Activity' : 'Memory'}
                {count > 0 && (
                  <span
                    aria-label={`${count} items`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '16px',
                      height: '16px',
                      padding: '0 4px',
                      fontSize: '9px',
                      fontWeight: 700,
                      lineHeight: 1,
                      background: isActive ? `${agent.color}22` : 'var(--color-bg-raised)',
                      color: isActive ? agent.color : 'var(--color-text-secondary)',
                      borderRadius: '4px',
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        {activeTab === 'activity' && activities && activities.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmClear('activity')}
            disabled={clearActivities.isPending}
            aria-label="Clear all activity history"
            className="flex items-center gap-1 transition-colors duration-200 disabled:opacity-50 mr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8] rounded"
            style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#e06060'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            Clear
          </button>
        )}
        {activeTab === 'memory' && memories && memories.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmClear('memory')}
            disabled={clearMemories.isPending}
            aria-label="Clear all memories"
            className="flex items-center gap-1 transition-colors duration-200 disabled:opacity-50 mr-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8] rounded"
            style={{ fontSize: '10.5px', color: 'var(--color-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 8px' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#e06060'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
            Clear
          </button>
        )}
      </div>

      {/* Search & filter */}
      {((activeTab === 'activity' && (activities?.length ?? 0) > 0) || (activeTab === 'memory' && (memories?.length ?? 0) > 0)) && (
        <div className="flex items-center gap-2 px-1 pt-3 pb-2 shrink-0">
          <div style={{ position: 'relative', flex: 1 }}>
            <Search aria-hidden="true" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', width: 12, height: 12, color: 'var(--color-text-secondary)' }} />
            <label className="sr-only" htmlFor={`detail-search-${agent.id}`}>Search</label>
            <input
              id={`detail-search-${agent.id}`}
              type="search"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setVisible(PAGE_SIZE); }}
              placeholder={activeTab === 'activity' ? 'Search activity…' : 'Search memories…'}
              style={{
                width: '100%', height: 30, padding: '0 8px 0 26px',
                background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)',
                color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontSize: 11.5,
                borderRadius: 'var(--radius-sm)', outline: 'none',
              }}
            />
          </div>
          {activeTab === 'activity' && (
            <label className="inline-flex items-center gap-1.5">
              <Filter aria-hidden="true" style={{ width: 11, height: 11, color: 'var(--color-text-secondary)' }} />
              <span className="sr-only">Filter by status</span>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setVisible(PAGE_SIZE); }}
                aria-label="Filter activity by status"
                style={{
                  height: 30, padding: '0 6px', background: 'var(--color-bg-base)',
                  border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)',
                  fontFamily: 'var(--font-mono)', fontSize: 11, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                }}
              >
                <option value="all">all</option>
                <option value="running">running</option>
                <option value="completed">completed</option>
                <option value="failed">failed</option>
              </select>
            </label>
          )}
        </div>
      )}

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto pt-4">

        {/* ── Activity Tab ── */}
        {activeTab === 'activity' && (
          <>

            {(tasksLoading || activitiesLoading) && (
              <div className="flex items-center gap-2 py-8 justify-center text-text-disabled">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[12px]">Loading...</span>
              </div>
            )}

            {!tasksLoading && !activitiesLoading && (!activities || activities.length === 0) && (!tasks || tasks.length === 0) && (
              <div className="flex flex-col items-center py-12 text-center">
                <Clock className="h-8 w-8 text-text-disabled mb-2" />
                <p className="text-[13px] text-text-secondary">No activity yet</p>
                <p className="text-[11px] text-text-disabled mt-1">
                  Activities will appear here when this agent is used
                </p>
              </div>
            )}

            {filteredActivities.length > 0 && (
              <div className="flex flex-col gap-2 mb-4">
                {visibleList.length === 0 && activeTab === 'activity' && (
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                    No matches for "{search}".
                  </span>
                )}
                {activeTab === 'activity' && (visibleList as AgentActivity[]).map((activity) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    agentColor={agent.color}
                    isSelected={activity.id === selectedActivityId}
                    onSelect={() => onSelectActivity(activity)}
                    onDelete={() => deleteActivity.mutate(
                      { id: activity.id, agentId: agent.id },
                      { onError: (err) => showToast(err instanceof Error ? err.message : 'Delete failed', { variant: 'error' }) },
                    )}
                    isDeleting={deleteActivity.isPending}
                  />
                ))}
                {activeTab === 'activity' && hasMore && (
                  <button
                    type="button"
                    onClick={() => setVisible((v) => v + PAGE_SIZE)}
                    className="self-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                    style={{
                      height: 30, padding: '0 14px', marginTop: 6,
                      background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-default)',
                      color: 'var(--color-text-primary)', fontSize: 11.5, borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    Load {Math.min(PAGE_SIZE, filteredActivities.length - visible)} more
                  </button>
                )}
              </div>
            )}

            {tasks && tasks.length > 0 && (
              <>
                <div className="mb-3 mt-2" style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-disabled)' }}>
                  Run Tasks
                </div>
                <div className="flex flex-col gap-2">
                  {tasks.map((task) => (
                    <TaskRow key={task.id} task={task} agentColor={agent.color} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Memory Tab ── */}
        {activeTab === 'memory' && (
          <>

            {memoriesLoading && (
              <div className="flex items-center gap-2 py-8 justify-center text-text-disabled">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-[12px]">Loading...</span>
              </div>
            )}

            {!memoriesLoading && (!memories || memories.length === 0) && (
              <div className="flex flex-col items-center py-12 text-center">
                <BookOpen className="h-8 w-8 text-text-disabled mb-2" />
                <p className="text-[13px] text-text-secondary">No memories yet</p>
                <p className="text-[11px] text-text-disabled mt-1">
                  Memories are saved automatically after each run
                </p>
              </div>
            )}

            {filteredMemories.length > 0 && (
              <div className="flex flex-col gap-2">
                {visibleList.length === 0 && activeTab === 'memory' && (
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                    No matches for "{search}".
                  </span>
                )}
                {activeTab === 'memory' && (visibleList as AgentMemory[]).map((memory) => (
                  <MemoryRow
                    key={memory.id}
                    memory={memory}
                    agentColor={agent.color}
                    onDelete={() => deleteMemory.mutate(
                      { id: memory.id, agentId: agent.id },
                      { onError: (err) => showToast(err instanceof Error ? err.message : 'Delete failed', { variant: 'error' }) },
                    )}
                    isDeleting={deleteMemory.isPending}
                  />
                ))}
                {activeTab === 'memory' && hasMore && (
                  <button
                    type="button"
                    onClick={() => setVisible((v) => v + PAGE_SIZE)}
                    className="self-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                    style={{
                      height: 30, padding: '0 14px', marginTop: 6,
                      background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-default)',
                      color: 'var(--color-text-primary)', fontSize: 11.5, borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                    }}
                  >
                    Load {Math.min(PAGE_SIZE, filteredMemories.length - visible)} more
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirm clear */}
      <Dialog
        open={!!confirmClear}
        onClose={() => setConfirmClear(null)}
        title={confirmClear === 'activity' ? 'Clear activity history?' : 'Clear all memories?'}
        description={
          confirmClear === 'activity'
            ? 'This permanently deletes all logged activity for this agent. The agent will lose its context cues.'
            : "This permanently deletes everything this agent has learned. The agent will start fresh on its next run."
        }
        maxWidth="440px"
      >
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmClear(null)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmClear}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, padding: '0 14px', background: '#e06060', color: '#021526', border: 'none', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Clear
          </button>
        </div>
      </Dialog>
    </div>
  );
}

// ── Activity Detail View ───────────────────────────────────────────────────────

export function ActivityDetailPanel({
  activity,
  agent,
  onClose,
}: {
  activity: AgentActivity;
  agent: Agent;
  onClose: () => void;
}) {
  const isRunning = activity.status === 'running';
  const isFailed = activity.status === 'failed';
  const statusColor = isRunning ? '#7c8cf8' : isFailed ? '#e06060' : '#6db58a';
  const statusLabel = isRunning ? 'Running' : isFailed ? 'Failed' : 'Completed';

  const duration =
    activity.completedAt && activity.startedAt
      ? Math.round(
          (new Date(activity.completedAt).getTime() - new Date(activity.startedAt).getTime()) / 1000,
        )
      : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-disabled)' }}>
          Activity Detail
        </span>
        <button
          onClick={onClose}
          className="flex items-center justify-center h-7 w-7 text-text-disabled hover:text-text-secondary transition-colors duration-200"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pt-5 flex flex-col gap-5">
        {/* Status + meta */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5"
              style={{
                color: statusColor,
                background: `${statusColor}15`,
                border: `1px solid ${statusColor}30`,
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {statusLabel}
            </span>
            <span
              className="text-[10px] uppercase tracking-wider px-2 py-0.5"
              style={{
                color: 'var(--color-text-disabled)',
                background: 'var(--color-bg-card)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-border-subtle)',
              }}
            >
              {activity.type === 'mcp_call' ? 'MCP Call' : 'Direct'}
            </span>
          </div>

          <div className="flex flex-col gap-1" style={{ fontSize: '11px', color: 'var(--color-text-disabled)' }}>
            <span>Started: {new Date(activity.startedAt).toLocaleString()}</span>
            {activity.completedAt && (
              <span>Completed: {new Date(activity.completedAt).toLocaleString()}</span>
            )}
            {duration !== null && <span>Duration: {duration}s</span>}
          </div>
        </div>

        {/* Query */}
        <div>
          <div
            className="mb-2"
            style={{ fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-disabled)' }}
          >
            Query sent to agent
          </div>
          <div
            className="leading-relaxed whitespace-pre-wrap"
            style={{
              fontSize: '12.5px',
              color: 'var(--color-text-primary)',
              background: 'var(--color-bg-card)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border-subtle)',
              padding: '14px 16px',
            }}
          >
            {activity.query}
          </div>
        </div>

        {/* Agent context note */}
        <div
          style={{
            fontSize: '11px',
            color: 'var(--color-text-disabled)',
            background: 'var(--color-bg-card)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border-subtle)',
            padding: '10px 14px',
            lineHeight: '1.6',
          }}
        >
          Routed to <strong style={{ color: 'var(--color-text-tertiary)' }}>{agent.name}</strong> via MCP.
          Claude Code CLI handled the response using your session.
        </div>
      </div>
    </div>
  );
}

// ── Activity Row ───────────────────────────────────────────────────────────────

function ActivityRow({
  activity,
  agentColor,
  isSelected,
  onSelect,
  onDelete,
  isDeleting,
}: {
  activity: AgentActivity;
  agentColor: string;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const isRunning = activity.status === 'running';
  const isFailed = activity.status === 'failed';
  const statusColor = isRunning ? '#7c8cf8' : isFailed ? '#e06060' : '#6db58a';
  const StatusIcon = isRunning ? Loader2 : isFailed ? AlertCircle : CheckCircle;
  const statusLabel = isRunning ? 'Running' : isFailed ? 'Failed' : 'Completed';

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Activity: ${activity.query?.slice(0, 80)}${activity.query && activity.query.length > 80 ? '…' : ''}, ${statusLabel}`}
      aria-pressed={isSelected}
      className="group flex items-start gap-3 px-3 py-3 transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
      style={{
        background: isSelected ? `${agentColor}08` : 'var(--color-bg-card)',
        border: `1px solid ${isSelected ? agentColor + '40' : 'var(--color-border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
      }}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; }}
    >
      <span className="shrink-0 mt-0.5" style={{ color: agentColor }} aria-hidden="true">
        <MessageSquare className="h-3.5 w-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-text-primary line-clamp-2">{activity.query}</div>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium" style={{ color: statusColor }}>
            <StatusIcon className={`h-2.5 w-2.5 ${isRunning ? 'animate-spin' : ''}`} aria-hidden="true" />
            {statusLabel}
          </span>
          {activity.completedAt && (
            <span className="text-[9px] text-text-secondary">
              {new Date(activity.completedAt).toLocaleString()}
            </span>
          )}
          {!activity.completedAt && activity.startedAt && (
            <span className="text-[9px] text-text-secondary">
              {new Date(activity.startedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          disabled={isDeleting}
          aria-label="Delete activity"
          className="flex items-center justify-center h-7 w-7 transition-colors duration-200 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8] rounded"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#e06060'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
        </button>
        <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--color-text-secondary)' }} aria-hidden="true" />
      </div>
    </div>
  );
}

// ── Memory Row ─────────────────────────────────────────────────────────────────

function MemoryRow({
  memory,
  agentColor,
  onDelete,
  isDeleting,
}: {
  memory: AgentMemory;
  agentColor: string;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const isSummary = memory.type === 'summary';
  const typeColor = isSummary ? '#c0a0d8' : agentColor;
  const typeLabel = isSummary ? 'Summary' : 'Task';

  return (
    <div
      className="group flex items-start gap-3 px-3 py-3 transition-colors duration-200"
      style={{
        background: 'var(--color-bg-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border-subtle)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; }}
    >
      <span className="shrink-0 mt-0.5" style={{ color: typeColor }}>
        <BookOpen className="h-3.5 w-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5"
            style={{
              color: typeColor,
              background: `${typeColor}15`,
              border: `1px solid ${typeColor}30`,
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {typeLabel}
          </span>
        </div>
        <div className="text-[12px] font-medium text-text-primary line-clamp-1">{memory.query}</div>
        <p className="text-[11px] text-text-tertiary mt-0.5 line-clamp-2 leading-relaxed">
          {memory.response.slice(0, 120)}{memory.response.length > 120 ? '...' : ''}
        </p>
        <span className="text-[9px] text-text-disabled mt-1 block">
          {new Date(memory.createdAt).toLocaleString()}
        </span>
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150">
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label="Delete memory"
          className="flex items-center justify-center h-7 w-7 transition-colors duration-200 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8] rounded"
          style={{ color: 'var(--color-text-secondary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#e06060'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
        >
          <Trash2 className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// ── Task Row ───────────────────────────────────────────────────────────────────

function TaskRow({ task, agentColor }: { task: Task; agentColor: string }) {
  const config = taskStatusConfig[task.status] ?? taskStatusConfig.queued;
  const StatusIcon = config.icon;

  return (
    <div
      className="flex items-start gap-3 px-3 py-3 transition-colors duration-200"
      style={{
        background: 'var(--color-bg-card)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--color-border-subtle)',
      }}
    >
      <span className="shrink-0 mt-0.5" style={{ color: config.color }}>
        <StatusIcon
          className={`h-3.5 w-3.5 ${task.status === 'in_progress' ? 'animate-spin' : ''}`}
        />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-text-primary truncate">{task.title}</div>
        {task.output && (
          <p className="text-[11px] text-text-tertiary mt-1 line-clamp-2 leading-relaxed">
            {task.output}
          </p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[9px] uppercase tracking-wider font-medium" style={{ color: config.color }}>
            {config.label}
          </span>
          {task.completedAt && (
            <span className="text-[9px] text-text-disabled">
              {new Date(task.completedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
