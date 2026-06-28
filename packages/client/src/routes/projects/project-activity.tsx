import { useParams } from '@tanstack/react-router';
import {
  MessageSquare, FileCheck2, FileX2, Bot, Play, CheckCircle2, ScrollText, type LucideIcon,
} from 'lucide-react';
import type { ActivityLogEntry } from '@subagent/shared';
import { useProjectActivity } from '../../api/hooks/use-activity';
import { Skeleton } from '../../components/ui/skeleton';

const ACTION_META: Record<string, { icon: LucideIcon; color: string; verb: string }> = {
  'chat.message':  { icon: MessageSquare, color: 'var(--color-accent)',  verb: 'chatted with' },
  'file.apply':    { icon: FileCheck2,    color: 'var(--color-success)', verb: 'approved change to' },
  'file.reject':   { icon: FileX2,        color: 'var(--color-error)',   verb: 'rejected change to' },
  'agent.create':  { icon: Bot,           color: 'var(--color-success)', verb: 'created agent' },
  'agent.update':  { icon: Bot,           color: 'var(--color-warning)', verb: 'updated agent' },
  'agent.delete':  { icon: Bot,           color: 'var(--color-error)',   verb: 'deleted agent' },
  'run.start':     { icon: Play,          color: 'var(--color-accent)',  verb: 'started run' },
  'run.complete':  { icon: CheckCircle2,  color: 'var(--color-success)', verb: 'completed run' },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  if (Number.isNaN(diff)) return iso;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

function Row({ e }: { e: ActivityLogEntry }) {
  const meta = ACTION_META[e.action] ?? { icon: ScrollText, color: 'var(--color-text-tertiary)', verb: e.action };
  const Icon = meta.icon;
  return (
    <div className="flex items-start gap-3" style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}>
      <span className="flex items-center justify-center shrink-0" style={{ width: 30, height: 30, borderRadius: 'var(--radius-md)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', color: meta.color }}>
        <Icon style={{ width: 15, height: 15 }} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
          <span style={{ fontWeight: 600 }}>{e.username || 'system'}</span>{' '}
          <span style={{ color: 'var(--color-text-tertiary)' }}>{meta.verb}</span>{' '}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{e.target}</span>
        </div>
        {e.detail && (
          <div className="truncate" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 2 }}>{e.detail}</div>
        )}
      </div>
      <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', flexShrink: 0, whiteSpace: 'nowrap' }}>{relativeTime(e.createdAt)}</span>
    </div>
  );
}

export function ProjectActivityPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: entries, isLoading } = useProjectActivity(projectId);

  return (
    <div style={{ maxWidth: 820 }}>
      <div className="flex items-center gap-2.5" style={{ marginBottom: 16 }}>
        <ScrollText style={{ width: 18, height: 18, color: 'var(--color-accent)' }} />
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>Activity Log</h2>
          <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 2 }}>Who did what in this project — chat, file approvals, agents, runs.</p>
        </div>
      </div>

      <div style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        {isLoading ? (
          <div style={{ padding: 14 }}>
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} height={20} className="mb-3" />)}
          </div>
        ) : (entries ?? []).length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            No activity yet.
          </div>
        ) : (
          (entries ?? []).map((e) => <Row key={e.id} e={e} />)
        )}
      </div>
    </div>
  );
}
