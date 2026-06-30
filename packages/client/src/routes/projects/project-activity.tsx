import { useCallback, useMemo } from 'react';
import { useParams, useSearch, useNavigate, Link } from '@tanstack/react-router';
import {
  MessageSquare, FileCheck2, FileX2, Bot, Play, CheckCircle2,
  ScrollText, Sparkles, ChevronLeft, ChevronRight, type LucideIcon,
} from 'lucide-react';
import type { ActivityLogEntry } from '@subagent/shared';
import { useProjectActivity } from '../../api/hooks/use-activity';
import { ActivityFilters, type ActivityFilterState } from '../../components/activity/activity-filters';
import { Skeleton } from '../../components/ui/skeleton';
import { formatRelativeTime } from '../../lib/format';

// ─── Action metadata ──────────────────────────────────────────────────────────
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

// ─── URL search params (source of truth) ──────────────────────────────────────
interface ActivitySearchParams {
  action?: string;
  userId?: string;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
}

const EMPTY_FILTERS: ActivitySearchParams = {
  action: '',
  userId: '',
  search: '',
  from: '',
  to: '',
  page: 1,
};

// ─── Row component ────────────────────────────────────────────────────────────
function Row({ e }: { e: ActivityLogEntry }) {
  const meta = ACTION_META[e.action] ?? { icon: ScrollText, color: 'var(--color-text-tertiary)', verb: e.action };
  const Icon = meta.icon;
  return (
    <div
      className="flex items-start gap-3"
      style={{ padding: '12px 14px', borderBottom: '1px solid var(--color-border-subtle)' }}
    >
      <span
        className="flex items-center justify-center shrink-0"
        style={{
          width: 30, height: 30, borderRadius: 'var(--radius-md)',
          background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
          color: meta.color,
        }}
        aria-hidden="true"
      >
        <Icon style={{ width: 15, height: 15 }} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
          <span style={{ fontWeight: 600 }}>{e.username || 'system'}</span>{' '}
          <span style={{ color: 'var(--color-text-tertiary)' }}>{meta.verb}</span>{' '}
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{e.target}</span>
        </div>
        {e.detail && (
          <div
            className="truncate"
            style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 2 }}
          >
            {e.detail}
          </div>
        )}
      </div>
      <span
        style={{
          fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)',
          flexShrink: 0, whiteSpace: 'nowrap',
        }}
      >
        {formatRelativeTime(e.createdAt)}
      </span>
    </div>
  );
}

// ─── Pagination component ─────────────────────────────────────────────────────
function Pagination({
  page, pageSize, total, onPageChange,
}: {
  page: number; pageSize: number; total: number; onPageChange: (p: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  // Build visible page numbers
  const pages: (number | 'ellipsis')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 2 && i <= page + 2)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== 'ellipsis') {
      pages.push('ellipsis');
    }
  }

  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: '10px 14px', borderTop: '1px solid var(--color-border-subtle)' }}
    >
      <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
        {start}–{end} of {total}
      </span>
      <div className="flex items-center" style={{ gap: 2 }}>
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-sm)', color: page <= 1 ? 'var(--color-text-disabled)' : 'var(--color-text-secondary)',
            opacity: page <= 1 ? 0.4 : 1, cursor: page <= 1 ? 'default' : 'pointer',
          }}
        >
          <ChevronLeft style={{ width: 14, height: 14 }} />
        </button>
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e-${i}`} style={{ width: 28, textAlign: 'center', fontSize: 11, color: 'var(--color-text-tertiary)' }}>…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
                borderRadius: 'var(--radius-sm)', fontSize: 11, fontFamily: 'var(--font-mono)',
                background: p === page ? 'var(--color-accent)' : 'transparent',
                color: p === page ? '#021526' : 'var(--color-text-secondary)',
                fontWeight: p === page ? 600 : 400,
              }}
            >
              {p}
            </button>
          ),
        )}
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{
            width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: 'var(--radius-sm)', color: page >= totalPages ? 'var(--color-text-disabled)' : 'var(--color-text-secondary)',
            opacity: page >= totalPages ? 0.4 : 1, cursor: page >= totalPages ? 'default' : 'pointer',
          }}
        >
          <ChevronRight style={{ width: 14, height: 14 }} />
        </button>
      </div>
    </div>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────
const PAGE_SIZE = 25;

export function ProjectActivityPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const search = useSearch({ strict: false }) as ActivitySearchParams;
  const navigate = useNavigate();

  // Derive filter state from URL search params
  const filters: ActivityFilterState = useMemo(() => ({
    action: search.action ?? '',
    userId: search.userId ?? '',
    search: search.search ?? '',
    from: search.from ?? '',
    to: search.to ?? '',
    page: search.page ?? 1,
  }), [search]);

  const hasActiveFilters = !!(filters.action || filters.userId || filters.search || filters.from || filters.to);

  const { data, isLoading, isFetching } = useProjectActivity(projectId, {
    action: filters.action || undefined,
    userId: filters.userId || undefined,
    search: filters.search || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    page: filters.page,
    pageSize: PAGE_SIZE,
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const page = data?.page ?? 1;

  // Update URL search params
  const updateSearch = useCallback(
    (patch: Partial<ActivitySearchParams>) => {
      navigate({
        // `useNavigate()` isn't route-bound here, so the search-reducer type widens to `never`;
        // cast preserves the runtime behavior (URL-synced filters).
        search: ((prev: ActivitySearchParams) => ({
          ...prev,
          ...patch,
          // Reset to page 1 when filters change (unless page itself is being set)
          page: 'page' in patch ? patch.page : (patch.page ?? 1),
        })) as never,
        replace: true,
      });
    },
    [navigate],
  );

  const handleFiltersChange = useCallback(
    (patch: Partial<ActivityFilterState>) => {
      // Clean empty strings
      const cleaned: Partial<ActivitySearchParams> = {};
      for (const [k, v] of Object.entries(patch)) {
        if (v === '' || v === undefined) {
          (cleaned as any)[k] = undefined;
        } else {
          (cleaned as any)[k] = v;
        }
      }
      updateSearch(cleaned);
    },
    [updateSearch],
  );

  const handleReset = useCallback(() => {
    navigate({ search: EMPTY_FILTERS as never, replace: true });
  }, [navigate]);

  const handlePageChange = useCallback(
    (p: number) => {
      updateSearch({ page: p });
      // Scroll to top of list
      document.getElementById('activity-list-top')?.scrollIntoView({ behavior: 'smooth' });
    },
    [updateSearch],
  );

  return (
    <div style={{ maxWidth: 860 }}>
      {/* ── Header ── */}
      <div className="flex items-center gap-2.5" style={{ marginBottom: 12 }}>
        <ScrollText style={{ width: 18, height: 18, color: 'var(--color-accent)' }} aria-hidden="true" />
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
            Activity Log
          </h2>
          <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
            Who did what in this project — chat, file approvals, agents, runs.
          </p>
        </div>
        {/* Spinner when refetching in background */}
        {isFetching && !isLoading && (
          <div
            aria-hidden="true"
            style={{
              width: 14, height: 14, marginLeft: 6,
              border: '2px solid var(--color-border-subtle)',
              borderTopColor: 'var(--color-accent)',
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }}
          />
        )}
      </div>

      {/* ── Filters ── */}
      <ActivityFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        onReset={handleReset}
        projectId={projectId}
      />

      {/* ── Results ── */}
      <div
        id="activity-list-top"
        style={{
          background: 'var(--color-bg-base)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}
      >
        {isLoading ? (
          /* ── Loading skeleton ── */
          <div style={{ padding: 14 }} role="status" aria-live="polite" aria-label="Loading activity log">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={20} className="mb-3" />
            ))}
            <span className="sr-only">Loading activity log…</span>
          </div>
        ) : entries.length === 0 ? (
          /* ── Empty state ── */
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <div
              aria-hidden="true"
              className="flex items-center justify-center mx-auto"
              style={{
                width: 48, height: 48, borderRadius: '50%',
                background: 'var(--color-accent-subtle)',
                border: '1px solid rgba(124,140,248,0.25)',
                marginBottom: 14,
              }}
            >
              {hasActiveFilters ? (
                <ScrollText style={{ width: 22, height: 22, color: 'var(--color-text-tertiary)' }} />
              ) : (
                <Sparkles style={{ width: 22, height: 22, color: 'var(--color-accent)' }} />
              )}
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)', fontWeight: 500 }}>
              {hasActiveFilters ? 'No matching activity' : 'No activity yet'}
            </div>
            <p
              style={{
                fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)',
                marginTop: 6, maxWidth: 360, marginLeft: 'auto', marginRight: 'auto',
              }}
            >
              {hasActiveFilters
                ? 'Try adjusting your filters or clearing them to see all activity.'
                : 'Activity appears here when you chat with an agent, approve file changes, or start a run.'}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={handleReset}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 32, padding: '0 14px', marginTop: 14,
                  background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-default)',
                  color: 'var(--color-text-primary)', fontSize: 12, fontWeight: 500,
                  borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-sans)',
                }}
              >
                Clear filters
              </button>
            ) : (
              <Link
                to="/projects/$projectId"
                params={{ projectId }}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 32, padding: '0 14px', marginTop: 14,
                  background: 'var(--color-accent)', color: '#021526',
                  fontSize: 12, fontWeight: 600, textDecoration: 'none',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                Open chat
              </Link>
            )}
          </div>
        ) : (
          /* ── Activity list ── */
          <>
            {/* Result count badge */}
            {hasActiveFilters && total > 0 && (
              <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}>
                <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                  {total} result{total !== 1 ? 's' : ''} found
                </span>
              </div>
            )}
            {entries.map((e) => (
              <Row key={e.id} e={e} />
            ))}
            {/* Server-side pagination */}
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={total}
              onPageChange={handlePageChange}
            />
          </>
        )}
      </div>
    </div>
  );
}
