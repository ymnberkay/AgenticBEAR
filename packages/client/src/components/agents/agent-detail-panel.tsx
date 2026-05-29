import { useState } from 'react';
import {
  Brain, Server, Monitor, Database, Container, TestTube2,
  FileText, Palette, Bot, X, Pencil, Clock, CheckCircle, AlertCircle, Loader2,
  MessageSquare, Trash2, ChevronRight, BookOpen,
} from 'lucide-react';
import type { Agent, Task, AgentActivity, AgentMemory } from '@subagent/shared';
import { CLAUDE_MODELS } from '@subagent/shared';
import { Badge } from '../ui/badge';
import {
  useAgentTasks, useAgentActivities, useDeleteActivity, useClearActivities,
  useAgentMemories, useDeleteMemory, useClearMemories,
} from '../../api/hooks/use-agents';
import type { AgentStatus } from './agent-card';

const iconMap: Record<string, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  Brain, Server, Monitor, Database, Container, TestTube2,
  FileText, Palette, Bot,
};

const taskStatusConfig: Record<string, { icon: React.FC<{ className?: string }>; color: string; label: string }> = {
  completed: { icon: CheckCircle, color: '#6db58a', label: 'Completed' },
  in_progress: { icon: Loader2, color: '#6EACDA', label: 'In Progress' },
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

  const { data: tasks, isLoading: tasksLoading } = useAgentTasks(agent.id);
  const { data: activities, isLoading: activitiesLoading } = useAgentActivities(agent.id);
  const { data: memories, isLoading: memoriesLoading } = useAgentMemories(agent.id);
  const deleteActivity = useDeleteActivity();
  const clearActivities = useClearActivities();
  const deleteMemory = useDeleteMemory();
  const clearMemories = useClearMemories();

  const Icon = iconMap[agent.icon] || Bot;
  const modelLabel = CLAUDE_MODELS[agent.modelConfig.model]?.label ?? agent.modelConfig.model;

  const handleClearActivities = () => {
    if (window.confirm('Tüm activity geçmişi silinsin mi?')) {
      clearActivities.mutate(agent.id);
    }
  };

  const handleClearMemories = () => {
    if (window.confirm('Bu agentin tüm hafızası silinsin mi? Bu işlem geri alınamaz.')) {
      clearMemories.mutate(agent.id);
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
              <span className="flex items-center gap-1 text-[10px] text-[#6EACDA]">
                <span className="h-1.5 w-1.5 rounded-full animate-pulse bg-[#6EACDA]" />
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
            onClick={onEdit}
            className="flex items-center gap-1 text-[11px] text-text-disabled hover:text-text-secondary transition-colors duration-200 px-2 py-1"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
          <button
            onClick={onClose}
            className="flex items-center justify-center h-7 w-7 text-text-disabled hover:text-text-secondary transition-colors duration-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center shrink-0" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
        <div className="flex gap-1 px-1">
          {(['activity', 'memory'] as const).map((tab) => {
            const count = tab === 'activity'
              ? (activities?.length ?? 0)
              : (memories?.length ?? 0);
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex items-center gap-2 px-3 py-2.5 transition-colors duration-150"
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-disabled)',
                  borderBottom: isActive ? `2px solid ${agent.color}` : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                {tab === 'activity' ? 'Activity' : 'Memory'}
                {count > 0 && (
                  <span
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
                      color: isActive ? agent.color : 'var(--color-text-disabled)',
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
            onClick={handleClearActivities}
            disabled={clearActivities.isPending}
            className="flex items-center gap-1 transition-colors duration-200 disabled:opacity-50 mr-1"
            style={{ fontSize: '10px', color: 'var(--color-text-disabled)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#e06060'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; }}
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        )}
        {activeTab === 'memory' && memories && memories.length > 0 && (
          <button
            onClick={handleClearMemories}
            disabled={clearMemories.isPending}
            className="flex items-center gap-1 transition-colors duration-200 disabled:opacity-50 mr-1"
            style={{ fontSize: '10px', color: 'var(--color-text-disabled)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#e06060'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; }}
          >
            <Trash2 className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>

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

            {activities && activities.length > 0 && (
              <div className="flex flex-col gap-2 mb-4">
                {activities.map((activity) => (
                  <ActivityRow
                    key={activity.id}
                    activity={activity}
                    agentColor={agent.color}
                    isSelected={activity.id === selectedActivityId}
                    onSelect={() => onSelectActivity(activity)}
                    onDelete={() => deleteActivity.mutate({ id: activity.id, agentId: agent.id })}
                    isDeleting={deleteActivity.isPending}
                  />
                ))}
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

            {memories && memories.length > 0 && (
              <div className="flex flex-col gap-2">
                {memories.map((memory) => (
                  <MemoryRow
                    key={memory.id}
                    memory={memory}
                    agentColor={agent.color}
                    onDelete={() => deleteMemory.mutate({ id: memory.id, agentId: agent.id })}
                    isDeleting={deleteMemory.isPending}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
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
  const statusColor = isRunning ? '#6EACDA' : isFailed ? '#e06060' : '#6db58a';
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
              }}
            >
              {statusLabel}
            </span>
            <span
              className="text-[10px] uppercase tracking-wider px-2 py-0.5"
              style={{
                color: 'var(--color-text-disabled)',
                background: 'var(--color-bg-card)',
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
  const statusColor = isRunning ? '#6EACDA' : isFailed ? '#e06060' : '#6db58a';
  const StatusIcon = isRunning ? Loader2 : isFailed ? AlertCircle : CheckCircle;
  const statusLabel = isRunning ? 'Running' : isFailed ? 'Failed' : 'Completed';

  return (
    <div
      className="group flex items-start gap-3 px-3 py-3 transition-colors duration-200 cursor-pointer"
      style={{
        background: isSelected ? `${agentColor}08` : 'var(--color-bg-card)',
        border: `1px solid ${isSelected ? agentColor + '40' : 'var(--color-border-subtle)'}`,
      }}
      onClick={onSelect}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-border-default)'; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; }}
    >
      <span className="shrink-0 mt-0.5" style={{ color: agentColor }}>
        <MessageSquare className="h-3.5 w-3.5" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] font-medium text-text-primary line-clamp-2">{activity.query}</div>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="flex items-center gap-1 text-[9px] uppercase tracking-wider font-medium" style={{ color: statusColor }}>
            <StatusIcon className={`h-2.5 w-2.5 ${isRunning ? 'animate-spin' : ''}`} />
            {statusLabel}
          </span>
          {activity.completedAt && (
            <span className="text-[9px] text-text-disabled">
              {new Date(activity.completedAt).toLocaleString()}
            </span>
          )}
          {!activity.completedAt && activity.startedAt && (
            <span className="text-[9px] text-text-disabled">
              {new Date(activity.startedAt).toLocaleString()}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          disabled={isDeleting}
          className="flex items-center justify-center h-6 w-6 transition-colors duration-200 disabled:opacity-50"
          style={{ color: 'var(--color-text-disabled)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#e06060'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; }}
          title="Sil"
        >
          <Trash2 className="h-3 w-3" />
        </button>
        <ChevronRight className="h-3.5 w-3.5" style={{ color: 'var(--color-text-disabled)' }} />
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
      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <button
          onClick={onDelete}
          disabled={isDeleting}
          className="flex items-center justify-center h-6 w-6 transition-colors duration-200 disabled:opacity-50"
          style={{ color: 'var(--color-text-disabled)' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#e06060'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; }}
          title="Sil"
        >
          <Trash2 className="h-3 w-3" />
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
