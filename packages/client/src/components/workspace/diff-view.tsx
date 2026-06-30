/**
 * Minimal line-level before/after diff for a staged file change (no external deps).
 * Uses an LCS so unchanged lines are shown as context and only real adds/removes are highlighted.
 */
interface DiffRow {
  type: 'ctx' | 'add' | 'del';
  text: string;
}

/** Longest-common-subsequence line diff → ordered rows (del before add at each divergence). */
function diffLines(before: string, after: string): DiffRow[] {
  const a = before.length ? before.split('\n') : [];
  const b = after.length ? after.split('\n') : [];
  const n = a.length;
  const m = b.length;

  // DP table of LCS lengths.
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { rows.push({ type: 'ctx', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { rows.push({ type: 'del', text: a[i] }); i++; }
    else { rows.push({ type: 'add', text: b[j] }); j++; }
  }
  while (i < n) { rows.push({ type: 'del', text: a[i] }); i++; }
  while (j < m) { rows.push({ type: 'add', text: b[j] }); j++; }
  return rows;
}

const ROW_STYLE: Record<DiffRow['type'], React.CSSProperties> = {
  ctx: { color: 'var(--color-text-secondary)' },
  add: { color: 'var(--color-success)', background: 'rgba(109,181,138,0.10)' },
  del: { color: 'var(--color-error)', background: 'rgba(224,96,96,0.10)' },
};
const SIGN: Record<DiffRow['type'], string> = { ctx: ' ', add: '+', del: '-' };

export function DiffView({ previousContent, newContent }: { previousContent: string | null; newContent: string }) {
  const rows = diffLines(previousContent ?? '', newContent ?? '');
  const added = rows.filter((r) => r.type === 'add').length;
  const removed = rows.filter((r) => r.type === 'del').length;

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 0 }}>
      <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--color-border-subtle)', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
        <span style={{ color: 'var(--color-success)' }}>+{added}</span>{' '}
        <span style={{ color: 'var(--color-error)' }}>-{removed}</span>
      </div>
      <div className="flex-1 overflow-auto" style={{ padding: '8px 0' }}>
        <pre style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.55 }}>
          {rows.map((r, idx) => (
            <div key={idx} style={{ ...ROW_STYLE[r.type], padding: '0 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              <span aria-hidden="true" style={{ display: 'inline-block', width: 12, opacity: 0.7, userSelect: 'none' }}>{SIGN[r.type]}</span>
              {r.text || ' '}
            </div>
          ))}
          {rows.length === 0 && (
            <div style={{ padding: '0 12px', color: 'var(--color-text-disabled)' }}>(no changes)</div>
          )}
        </pre>
      </div>
    </div>
  );
}
