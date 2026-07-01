/**
 * BranchPill — current git branch chip with a dropdown to switch or create a branch.
 *
 * Only rendered for projects whose workspaceSource is 'git' and whose clone is ready.
 * Sits in the project detail header (next to the status pill). Also shows an uncommitted
 * changes badge when the working tree isn't clean.
 */
import { useEffect, useRef, useState } from 'react';
import { GitBranch, ChevronDown, Check, Plus, RefreshCw, AlertTriangle } from 'lucide-react';
import type { Project } from '@subagent/shared';
import { useGitBranches, useGitStatus, useGitCheckout } from '../../api/hooks/use-git';
import { useToast } from '../ui/toast';

export function BranchPill({ project }: { project: Project }) {
  const enabled = project.workspaceSource === 'git' && project.gitCloneStatus === 'ready';
  const statusQuery = useGitStatus(project.id, enabled);
  const branchesQuery = useGitBranches(project.id, enabled);
  const checkout = useGitCheckout(project.id);
  const { show: showToast } = useToast();

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newBranch, setNewBranch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) { setOpen(false); setCreating(false); } };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); setCreating(false); } };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => { if (creating) inputRef.current?.focus(); }, [creating]);

  if (!enabled) return null;

  const status = statusQuery.data && statusQuery.data.ok ? statusQuery.data.status : null;
  const branches = branchesQuery.data && branchesQuery.data.ok ? branchesQuery.data.branches : null;
  const current = status?.branch || branches?.current || project.gitDefaultBranch || 'main';
  const uncommitted = status?.entries.length ?? 0;
  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const local = branches?.local ?? [];
  const remote = (branches?.remote ?? []).filter((r) => !local.includes(r));

  const switchTo = (branch: string, create: boolean) => {
    checkout.mutate({ branch, create }, {
      onSuccess: () => {
        showToast(create ? `Created and switched to ${branch}` : `Switched to ${branch}`, { variant: 'success' });
        setOpen(false); setCreating(false); setNewBranch('');
      },
      onError: (err) => showToast(err instanceof Error ? err.message : 'Checkout failed', { variant: 'error' }),
    });
  };

  return (
    <div ref={rootRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
        style={{
          height: 24, padding: '0 8px',
          fontSize: 11, fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-primary)',
          background: 'var(--color-bg-surface)',
          border: `1px solid ${uncommitted > 0 ? 'rgba(226,176,74,0.35)' : 'var(--color-border-subtle)'}`,
          borderRadius: 999, cursor: 'pointer',
          transition: 'border-color .15s',
        }}
      >
        <GitBranch style={{ width: 11, height: 11, color: uncommitted > 0 ? 'var(--color-warning)' : 'var(--color-text-secondary)' }} aria-hidden="true" />
        <span className="truncate" style={{ maxWidth: 160 }} title={current}>{current}</span>
        {uncommitted > 0 && (
          <span
            aria-label={`${uncommitted} uncommitted change${uncommitted === 1 ? '' : 's'}`}
            title={`${uncommitted} uncommitted change${uncommitted === 1 ? '' : 's'}`}
            style={{
              fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
              color: 'var(--color-warning)', background: 'rgba(226,176,74,0.14)',
              border: '1px solid rgba(226,176,74,0.35)',
              borderRadius: 999, padding: '0 6px', marginLeft: 2,
            }}
          >
            {uncommitted}
          </span>
        )}
        {(ahead > 0 || behind > 0) && (
          <span
            aria-label={`${ahead} ahead, ${behind} behind`}
            title={`${ahead} ahead, ${behind} behind`}
            style={{
              fontSize: 9, letterSpacing: '0.04em',
              color: 'var(--color-text-disabled)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            {ahead > 0 ? `↑${ahead}` : ''}{behind > 0 ? `↓${behind}` : ''}
          </span>
        )}
        <ChevronDown
          style={{
            width: 11, height: 11, color: 'var(--color-text-disabled)',
            transition: 'transform .2s', transform: open ? 'rotate(180deg)' : 'none',
          }}
        />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 40,
            width: 260,
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-default)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 16px 30px -14px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02) inset',
            overflow: 'hidden',
          }}
        >
          {/* Uncommitted summary */}
          {uncommitted > 0 && (
            <div className="flex items-center gap-1.5" style={{
              padding: '8px 10px', background: 'rgba(226,176,74,0.06)',
              borderBottom: '1px solid var(--color-border-subtle)',
              fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-warning)',
            }}>
              <AlertTriangle style={{ width: 11, height: 11 }} />
              {uncommitted} uncommitted change{uncommitted === 1 ? '' : 's'} on this branch
            </div>
          )}

          {/* Create-branch inline form */}
          {creating ? (
            <div className="flex items-center gap-1" style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <Plus style={{ width: 12, height: 12, color: 'var(--color-accent)' }} aria-hidden="true" />
              <input
                ref={inputRef}
                type="text"
                placeholder="feature/my-branch"
                value={newBranch}
                onChange={(e) => setNewBranch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newBranch.trim()) switchTo(newBranch.trim(), true);
                  if (e.key === 'Escape') { setCreating(false); setNewBranch(''); }
                }}
                style={{
                  flex: 1, height: 26, padding: '0 8px',
                  background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)',
                  color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', fontSize: 11,
                  outline: 'none', borderRadius: 'var(--radius-sm)',
                }}
              />
              <button
                type="button"
                onClick={() => newBranch.trim() && switchTo(newBranch.trim(), true)}
                disabled={!newBranch.trim() || checkout.isPending}
                style={{
                  height: 26, padding: '0 8px', fontSize: 10.5, fontWeight: 600, fontFamily: 'var(--font-mono)',
                  color: '#021526', background: !newBranch.trim() ? 'var(--color-bg-raised)' : 'var(--color-accent)',
                  border: 'none', borderRadius: 'var(--radius-sm)',
                  cursor: !newBranch.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {checkout.isPending ? '…' : 'create'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 w-full"
              style={{
                padding: '8px 10px', background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--color-accent)', fontSize: 11, fontFamily: 'var(--font-mono)', textAlign: 'left',
                borderBottom: '1px solid var(--color-border-subtle)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(124,140,248,0.06)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              <Plus style={{ width: 12, height: 12 }} aria-hidden="true" /> new branch…
            </button>
          )}

          {/* Local + remote branches */}
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {local.length === 0 && remote.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
                {branchesQuery.isLoading ? 'Loading branches…' : 'No branches.'}
              </div>
            )}
            {local.length > 0 && (
              <>
                <div style={{ padding: '6px 10px 4px', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>local</div>
                {local.map((b) => {
                  const isCurrent = b === current;
                  return (
                    <button
                      key={`local-${b}`}
                      type="button"
                      onClick={() => { if (!isCurrent) switchTo(b, false); }}
                      className="flex items-center gap-1.5 w-full"
                      style={{
                        padding: '6px 10px', background: 'transparent', border: 'none',
                        cursor: isCurrent ? 'default' : 'pointer',
                        color: isCurrent ? 'var(--color-accent)' : 'var(--color-text-primary)',
                        fontSize: 11, fontFamily: 'var(--font-mono)', textAlign: 'left',
                      }}
                      onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = 'rgba(124,140,248,0.06)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                    >
                      {isCurrent
                        ? <Check style={{ width: 11, height: 11, color: 'var(--color-accent)' }} aria-hidden="true" />
                        : <span aria-hidden="true" style={{ width: 11, height: 11 }} />}
                      <span className="truncate" style={{ flex: 1 }} title={b}>{b}</span>
                    </button>
                  );
                })}
              </>
            )}
            {remote.length > 0 && (
              <>
                <div style={{ padding: '6px 10px 4px', fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>remote-only</div>
                {remote.map((b) => (
                  <button
                    key={`remote-${b}`}
                    type="button"
                    onClick={() => switchTo(b, false)}
                    className="flex items-center gap-1.5 w-full"
                    style={{
                      padding: '6px 10px', background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--color-text-secondary)',
                      fontSize: 11, fontFamily: 'var(--font-mono)', textAlign: 'left',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(124,140,248,0.06)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span aria-hidden="true" style={{ width: 11, height: 11 }} />
                    <span className="truncate" style={{ flex: 1 }} title={`origin/${b}`}>origin/{b}</span>
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Footer: refresh */}
          <div className="flex items-center justify-between" style={{
            padding: '6px 10px', borderTop: '1px solid var(--color-border-subtle)',
            fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)',
          }}>
            <span>{local.length} local · {remote.length} remote-only</span>
            <button
              type="button"
              onClick={() => { statusQuery.refetch(); branchesQuery.refetch(); }}
              title="Refresh"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 2, display: 'flex', borderRadius: 4 }}
            >
              <RefreshCw className={statusQuery.isFetching || branchesQuery.isFetching ? 'animate-spin' : ''} style={{ width: 11, height: 11 }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
