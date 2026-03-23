import {
  Brain, Server, Monitor, Database, Container, TestTube2,
  FileText, Palette, Bot, X, Pencil, Clock, CheckCircle, AlertCircle, Loader2,
  MessageSquare,
} from 'lucide-react';
import type { Agent, Task, AgentActivity } from '@subagent/shared';
import { CLAUDE_MODELS } from '@subagent/shared';
import { Badge } from '../ui/badge';
import { useAgentTasks, useAgentActivities } from '../../api/hooks/use-agents';
import type { AgentStatus } from './agent-card';

const iconMap: Record<string, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  Brain, Server, Monitor, Database, Container, TestTube2,
  FileText, Palette, Bot,
};

const taskStatusConfig: Record<string, { icon: React.FC<{ className?: string }>; color: string; label: string }> = {
  completed: { icon: CheckCircle, color: '#6bbfa0', label: 'Completed' },
  in_progress: { icon: Loader2, color: '#d4924e', label: 'In Progress' },
  failed: { icon: AlertCircle, color: '#ef4444', label: 'Failed' },
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
}

export function AgentDetailPanel({ agent, status = 'idle', onClose, onEdit }: AgentDetailPanelProps) {
  const { data: tasks, isLoading: tasksLoading } = useAgentTasks(agent.id);
  const { data: activities, isLoading: activitiesLoading } = useAgentActivities(agent.id);
  const isLoading = tasksLoading || activitiesLoading;
  const Icon = iconMap[agent.icon] || Bot;
  const modelLabel = CLAUDE_MODELS[agent.modelConfig.model]?.label ?? agent.modelConfig.model;

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
              <span className="flex items-center gap-1 text-[10px] text-[#d4924e]">
                <span className="h-1.5 w-1.5 rounded-full animate-pulse bg-[#d4924e]" />
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

      {/* Activity & Task history */}
      <div className="flex-1 overflow-y-auto pt-5">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-text-disabled mb-3">
          Activity History
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 py-8 justify-center text-text-disabled">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-[12px]">Loading...</span>
          </div>
        )}

        {!isLoading && (!activities || activities.length === 0) && (!tasks || tasks.length === 0) && (
          <div className="flex flex-col items-center py-12 text-center">
            <Clock className="h-8 w-8 text-text-disabled mb-2" />
            <p className="text-[13px] text-text-secondary">No activity yet</p>
            <p className="text-[11px] text-text-disabled mt-1">
              Activities will appear here when this agent is used
            </p>
          </div>
        )}

        {/* MCP Activities */}
        {activities && activities.length > 0 && (
          <div className="flex flex-col gap-2 mb-4">
            {activities.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} agentColor={agent.color} />
            ))}
          </div>
        )}

        {/* Run Tasks */}
        {tasks && tasks.length > 0 && (
          <>
            <div className="text-[10px] font-semibold uppercase tracking-widest text-text-disabled mb-3 mt-2">
              Run Tasks
            </div>
            <div className="flex flex-col gap-2">
              {tasks.map((task) => (
                <TaskRow key={task.id} task={task} agentColor={agent.color} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ activity, agentColor }: { activity: AgentActivity; agentColor: string }) {
  const isRunning = activity.status === 'running';
  const isFailed = activity.status === 'failed';
  const statusColor = isRunning ? '#d4924e' : isFailed ? '#ef4444' : '#6bbfa0';
  const StatusIcon = isRunning ? Loader2 : isFailed ? AlertCircle : CheckCircle;
  const statusLabel = isRunning ? 'Running' : isFailed ? 'Failed' : 'Completed';

  return (
    <div
      className="flex items-start gap-3 px-3 py-3 transition-colors duration-200"
      style={{
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border-subtle)',
      }}
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
    </div>
  );
}

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
