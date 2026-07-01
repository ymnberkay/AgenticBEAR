/**
 * Per-project Goals page.
 *
 * What lives here:
 *   - Inline madde-madde add (one goal per line in a textarea → bulk-create on Save).
 *   - Excel/CSV import with column-mapping preview.
 *   - Filter chips (priority + status), system-styled checkboxes, drag-to-reorder.
 *   - "Send N to orchestrator" handoff via the same sessionStorage prefill mechanism
 *     used by Issues → Resolve in chat.
 */
import { useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import {
  Target, Plus, Trash2, Upload, FileSpreadsheet, Wand2, GripVertical, ChevronDown, ChevronUp,
  Check, Minus, Filter,
} from 'lucide-react';
import type { ProjectGoal, GoalPriority, GoalStatus, CreateGoalInput } from '@subagent/shared';
import {
  useProjectGoals, useCreateGoal, useBulkCreateGoals, useUpdateGoal, useDeleteGoal, useReorderGoals,
} from '../../api/hooks/use-goals';
import { useToast } from '../../components/ui/toast';
import { Skeleton } from '../../components/ui/skeleton';
import { Dialog } from '../../components/ui/dialog';
import { CHAT_PREFILL_KEY } from './project-issues';

const PRIORITY_COLOR: Record<GoalPriority, string> = {
  low: 'var(--color-text-tertiary)',
  medium: 'var(--color-info)',
  high: 'var(--color-warning)',
  critical: 'var(--color-error)',
};
const STATUS_NEXT: Record<GoalStatus, GoalStatus> = { pending: 'in_progress', in_progress: 'done', done: 'pending' };
const STATUS_COLOR: Record<GoalStatus, string> = {
  pending: 'var(--color-text-secondary)',
  in_progress: 'var(--color-warning)',
  done: 'var(--color-success)',
};
const STATUS_LABEL: Record<GoalStatus, string> = { pending: 'pending', in_progress: 'in progress', done: 'done' };

const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 11px', background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-sans)', fontSize: 13, outline: 'none', borderRadius: 'var(--radius-md)',
};

/**
 * System-styled checkbox — the same gradient tile / Check icon / Minus indeterminate as
 * the Issues page. Kept local to avoid a premature shared component; lift later if a third
 * caller appears.
 */
function GoalCheckbox({
  checked, indeterminate = false, onChange, ariaLabel, size = 16,
}: { checked: boolean; indeterminate?: boolean; onChange: (next: boolean) => void; ariaLabel: string; size?: number }) {
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const active = checked || indeterminate;
  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, flexShrink: 0, cursor: 'pointer',
        borderRadius: 6, boxShadow: focused ? '0 0 0 2px rgba(124,140,248,0.45)' : 'none',
        transition: 'box-shadow .15s',
      }}
    >
      <input
        type="checkbox" aria-label={ariaLabel}
        aria-checked={indeterminate ? 'mixed' : checked}
        checked={checked}
        ref={(el) => { if (el) el.indeterminate = indeterminate; }}
        onChange={(e) => onChange(e.target.checked)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', margin: 0, padding: 0, opacity: 0, cursor: 'pointer' }}
      />
      <span
        aria-hidden="true"
        style={{
          width: size, height: size, borderRadius: 5,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: active
            ? 'linear-gradient(180deg, rgba(124,140,248,0.95) 0%, rgba(124,140,248,0.78) 100%)'
            : hover ? 'rgba(124,140,248,0.10)' : 'var(--color-bg-base)',
          border: active
            ? '1px solid rgba(124,140,248,0.75)'
            : hover ? '1px solid rgba(124,140,248,0.45)' : '1px solid var(--color-border-default)',
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

/** Build the orchestrator handoff prompt for a batch of goals. Mirrors the issues version. */
function buildGoalsPrompt(goals: ProjectGoal[]): string {
  const lines: string[] = [
    `Please orchestrate work to accomplish the following ${goals.length} project goal${goals.length === 1 ? '' : 's'}. ` +
      `Plan an approach, delegate to specialists where useful, and produce concrete changes. ` +
      `Track progress: when a goal is complete, mark its status as done. If a goal is too large for one pass, ` +
      `break it into sub-tasks and proceed.`,
    '',
    '## Goals',
  ];
  for (const g of goals) {
    lines.push('');
    lines.push(`### ${g.title}`);
    lines.push(`- priority: ${g.priority} · status: ${STATUS_LABEL[g.status]}`);
    if (g.dueDate) lines.push(`- due: ${g.dueDate}`);
    lines.push(`- goal id: ${g.id}`);
    if (g.description?.trim()) {
      lines.push('');
      lines.push(g.description.trim());
    }
  }
  return lines.join('\n');
}

/** Normalize an arbitrary header into a key we can match (`Görev başlığı` → `gorev basligi`). */
function normalizeHeader(h: string): string {
  return h
    .toLowerCase()
    .replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ç/g, 'c').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ğ/g, 'g')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
/** Pick the first column whose normalized header includes any of the candidate strings. */
function autoPickColumn(headers: string[], candidates: string[]): string {
  const norm = headers.map(normalizeHeader);
  for (const c of candidates) {
    const cn = normalizeHeader(c);
    const idx = norm.findIndex((h) => h.includes(cn));
    if (idx >= 0) return headers[idx]!;
  }
  return '';
}

interface ImportPreview {
  fileName: string;
  headers: string[];
  rows: Array<Record<string, string>>;
  mapping: { title: string; description: string; priority: string; status: string; dueDate: string };
}

export function ProjectGoalsPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const navigate = useNavigate();
  const { data: goals, isLoading } = useProjectGoals(projectId);
  const createGoal = useCreateGoal(projectId);
  const bulkCreate = useBulkCreateGoals(projectId);
  const updateGoal = useUpdateGoal(projectId);
  const deleteGoal = useDeleteGoal(projectId);
  const reorderGoals = useReorderGoals(projectId);
  const { show: showToast } = useToast();

  // ── Selection + filters ──
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [priorityFilter, setPriorityFilter] = useState<Set<GoalPriority>>(new Set());
  const [statusFilter, setStatusFilter] = useState<Set<GoalStatus>>(new Set());

  const togglePriority = (p: GoalPriority) => setPriorityFilter((prev) => {
    const next = new Set(prev); if (next.has(p)) next.delete(p); else next.add(p); return next;
  });
  const toggleStatus = (s: GoalStatus) => setStatusFilter((prev) => {
    const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next;
  });
  const clearFilters = () => { setPriorityFilter(new Set()); setStatusFilter(new Set()); };

  const toggleSelect = (id: string) => setSelected((prev) => {
    const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });

  // ── Add form (madde-madde) ──
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState('');
  const [addPriority, setAddPriority] = useState<GoalPriority>('medium');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ── Excel/CSV import ──
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Drag-to-reorder ──
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const all = goals ?? [];
  const hasFilter = priorityFilter.size > 0 || statusFilter.size > 0;
  const list = useMemo(() => {
    if (!hasFilter) return all;
    return all.filter((g) => {
      if (priorityFilter.size > 0 && !priorityFilter.has(g.priority)) return false;
      if (statusFilter.size > 0 && !statusFilter.has(g.status)) return false;
      return true;
    });
  }, [all, hasFilter, priorityFilter, statusFilter]);
  const priorityCounts = useMemo(() => {
    const c: Record<GoalPriority, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const g of all) c[g.priority] += 1;
    return c;
  }, [all]);
  const statusCounts = useMemo(() => {
    const c: Record<GoalStatus, number> = { pending: 0, in_progress: 0, done: 0 };
    for (const g of all) c[g.status] += 1;
    return c;
  }, [all]);
  const selectedGoals = list.filter((g) => selected.has(g.id));

  // ── Handlers ──
  const submitAdd = () => {
    const lines = addText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    if (lines.length === 0) return;
    const payload: CreateGoalInput[] = lines.map((title) => ({ title, priority: addPriority, source: 'user' }));
    if (payload.length === 1) {
      createGoal.mutate(payload[0]!, {
        onSuccess: () => { setAddText(''); setAddOpen(false); },
        onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to add goal', { variant: 'error' }),
      });
    } else {
      bulkCreate.mutate({ goals: payload, source: 'user' }, {
        onSuccess: (r) => { setAddText(''); setAddOpen(false); showToast(`Added ${r.created} goals.`, { variant: 'success' }); },
        onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to add goals', { variant: 'error' }),
      });
    }
  };

  const sendToOrchestrator = () => {
    if (selectedGoals.length === 0) return;
    const prompt = buildGoalsPrompt(selectedGoals);
    try {
      sessionStorage.setItem(CHAT_PREFILL_KEY(projectId), JSON.stringify({
        text: prompt,
        agentRole: 'orchestrator',
        startedFromGoals: selectedGoals.map((g) => g.id),
        createdAt: new Date().toISOString(),
      }));
    } catch {
      showToast('Could not stage the chat prompt (storage quota).', { variant: 'error' });
      return;
    }
    setSelected(new Set());
    navigate({ to: '/projects/$projectId', params: { projectId } });
  };

  const onPickFile = async (file: File) => {
    try {
      const xlsx = await import('xlsx');
      const buf = await file.arrayBuffer();
      const wb = xlsx.read(buf, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      if (!sheetName) { showToast('No sheets found in file.', { variant: 'error' }); return; }
      const sheet = wb.Sheets[sheetName]!;
      const rowsArr: any[][] = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
      if (rowsArr.length === 0) { showToast('Sheet is empty.', { variant: 'error' }); return; }
      // First non-blank row → headers. If it looks numeric (no real headers), generate Col1..ColN.
      const firstRow = rowsArr[0]!.map((c) => String(c).trim());
      const looksLikeHeaders = firstRow.some((c) => c.length > 0 && !/^[\d.,\s-]+$/.test(c));
      let headers: string[]; let dataRows: any[][];
      if (looksLikeHeaders) {
        headers = firstRow.map((h, i) => h || `Column ${i + 1}`);
        dataRows = rowsArr.slice(1);
      } else {
        headers = firstRow.map((_, i) => `Column ${i + 1}`);
        dataRows = rowsArr;
      }
      const rows: Array<Record<string, string>> = dataRows.map((row) => {
        const obj: Record<string, string> = {};
        for (let i = 0; i < headers.length; i++) obj[headers[i]!] = String(row[i] ?? '').trim();
        return obj;
      }).filter((r) => Object.values(r).some((v) => v.length > 0));
      if (rows.length === 0) { showToast('No data rows found.', { variant: 'error' }); return; }

      const mapping = {
        title: autoPickColumn(headers, ['title', 'task', 'görev', 'gorev', 'name', 'goal', 'iş', 'is', 'description', 'açıklama']),
        description: autoPickColumn(headers, ['description', 'açıklama', 'aciklama', 'details', 'detay', 'notes', 'not']),
        priority: autoPickColumn(headers, ['priority', 'öncelik', 'oncelik', 'priorite']),
        status: autoPickColumn(headers, ['status', 'durum', 'state']),
        dueDate: autoPickColumn(headers, ['due', 'date', 'deadline', 'son tarih', 'tarih', 'bitiş', 'bitis']),
      };
      setImportPreview({ fileName: file.name, headers, rows, mapping });
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to read file.', { variant: 'error' });
    }
  };

  const commitImport = () => {
    if (!importPreview) return;
    const { rows, mapping } = importPreview;
    const normalizePriority = (v: string): GoalPriority => {
      const s = v.toLowerCase().trim();
      if (s.startsWith('crit') || s.startsWith('kri')) return 'critical';
      if (s.startsWith('high') || s.startsWith('yük') || s.startsWith('yuk')) return 'high';
      if (s.startsWith('low') || s.startsWith('düş') || s.startsWith('dus')) return 'low';
      return 'medium';
    };
    const normalizeStatus = (v: string): GoalStatus => {
      const s = v.toLowerCase().trim();
      if (s.startsWith('done') || s.startsWith('compl') || s.startsWith('bit') || s === 'tamam') return 'done';
      if (s.startsWith('prog') || s.startsWith('doing') || s === 'devam') return 'in_progress';
      return 'pending';
    };
    const payload: CreateGoalInput[] = rows
      .map((r) => ({
        title: (mapping.title ? r[mapping.title] : '').trim(),
        description: mapping.description ? (r[mapping.description] ?? '').trim() : '',
        priority: mapping.priority && r[mapping.priority] ? normalizePriority(r[mapping.priority]!) : 'medium',
        status: mapping.status && r[mapping.status] ? normalizeStatus(r[mapping.status]!) : 'pending',
        dueDate: mapping.dueDate && r[mapping.dueDate] ? r[mapping.dueDate] : null,
        source: 'excel' as const,
      }))
      .filter((g) => g.title.length > 0);
    if (payload.length === 0) {
      showToast('No rows have a title — check the column mapping.', { variant: 'error' });
      return;
    }
    bulkCreate.mutate({ goals: payload, source: 'excel' }, {
      onSuccess: (r) => {
        setImportPreview(null);
        showToast(`Imported ${r.created} goal${r.created === 1 ? '' : 's'}.`, { variant: 'success' });
      },
      onError: (err) => showToast(err instanceof Error ? err.message : 'Import failed', { variant: 'error' }),
    });
  };

  // ── Drag-and-drop reorder (HTML5 native) ──
  const onDragStart = (id: string) => (e: React.DragEvent) => {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', id); } catch { /* ignore */ }
  };
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const onDrop = (targetId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const sourceId = draggingId;
    setDraggingId(null);
    if (!sourceId || sourceId === targetId) return;
    if (hasFilter) {
      showToast('Reorder is disabled while filters are active. Clear filters first.', { variant: 'error' });
      return;
    }
    const ordered = [...all];
    const fromIdx = ordered.findIndex((g) => g.id === sourceId);
    const toIdx = ordered.findIndex((g) => g.id === targetId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = ordered.splice(fromIdx, 1);
    ordered.splice(toIdx, 0, moved!);
    const order = ordered.map((g, i) => ({ id: g.id, orderIndex: i }));
    reorderGoals.mutate(order, {
      onError: (err) => showToast(err instanceof Error ? err.message : 'Reorder failed', { variant: 'error' }),
    });
  };

  return (
    <div style={{ maxWidth: 920 }}>
      {/* Title row */}
      <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-2.5">
          <Target style={{ width: 18, height: 18, color: 'var(--color-accent)' }} aria-hidden="true" />
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>Goals</h2>
            <p style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Project objectives. Add line-by-line, import from Excel/CSV, hand picks to the orchestrator.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {selectedGoals.length > 0 && (
            <button type="button"
              onClick={sendToOrchestrator}
              title={`Start an orchestrator chat to work on ${selectedGoals.length} goal${selectedGoals.length === 1 ? '' : 's'}`}
              className="flex items-center gap-1.5"
              style={{ height: 34, padding: '0 14px', fontSize: 12.5, fontWeight: 600, color: '#021526',
                background: 'var(--color-success)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
              <Wand2 style={{ width: 14, height: 14 }} />
              Send {selectedGoals.length} to orchestrator
            </button>
          )}
          <button type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Import goals from an Excel (.xlsx/.xls) or CSV file"
            className="flex items-center gap-1.5"
            style={{ height: 34, padding: '0 12px', fontSize: 12.5, fontWeight: 500, color: 'var(--color-text-primary)',
              background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
            <FileSpreadsheet style={{ width: 14, height: 14 }} /> Import
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void onPickFile(f); }}
            style={{ display: 'none' }}
          />
          <button type="button" onClick={() => setAddOpen((v) => !v)} className="flex items-center gap-1.5"
            style={{ height: 34, padding: '0 14px', fontSize: 12.5, fontWeight: 600, color: '#021526', background: 'var(--color-accent)', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
            <Plus style={{ width: 14, height: 14 }} /> New goal
          </button>
        </div>
      </div>

      {/* Inline add (madde-madde). One per line; bulk-creates on Save. */}
      {addOpen && (
        <div className="flex flex-col gap-2" style={{ padding: 14, marginBottom: 12, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            One goal per line — paste a list, or type madde-madde.
          </span>
          <textarea
            autoFocus
            value={addText}
            onChange={(e) => setAddText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submitAdd(); }}
            placeholder={'Add multi-factor auth\nWrite onboarding flow\nMigrate analytics to Postgres'}
            rows={5}
            style={{ ...inputStyle, height: 'auto', padding: '10px 11px', resize: 'vertical', fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>priority</span>
            <select value={addPriority} onChange={(e) => setAddPriority(e.target.value as GoalPriority)}
              style={{ ...inputStyle, height: 30, width: 'auto', cursor: 'pointer', fontSize: 12 }}>
              {(['low', 'medium', 'high', 'critical'] as GoalPriority[]).map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <span style={{ flex: 1 }} />
            <button type="button" onClick={() => { setAddOpen(false); setAddText(''); }}
              style={{ height: 30, padding: '0 12px', fontSize: 12, background: 'none', border: '1px solid var(--color-border-default)', color: 'var(--color-text-secondary)', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
              Cancel
            </button>
            <button type="button" onClick={submitAdd} disabled={!addText.trim() || createGoal.isPending || bulkCreate.isPending}
              className="flex items-center gap-1.5"
              style={{ height: 30, padding: '0 14px', fontSize: 12, fontWeight: 600, background: 'var(--color-accent)', color: '#021526', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
              <Plus style={{ width: 12, height: 12 }} /> Add {addText.split(/\r?\n/).filter((l) => l.trim()).length || ''}
            </button>
          </div>
        </div>
      )}

      {/* Filter bar — drives the rendered `list`. */}
      {all.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap" style={{
          marginBottom: 10, padding: '8px 10px',
          background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-mono)', fontSize: 11,
        }}>
          <span className="flex items-center gap-1.5" style={{ color: 'var(--color-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            <Filter style={{ width: 11, height: 11 }} aria-hidden="true" /> priority
          </span>
          {(['critical', 'high', 'medium', 'low'] as GoalPriority[]).map((p) => {
            const on = priorityFilter.has(p);
            const color = PRIORITY_COLOR[p];
            return (
              <button key={p} type="button" onClick={() => togglePriority(p)} aria-pressed={on}
                className="flex items-center gap-1.5"
                style={{
                  height: 24, padding: '0 9px', fontSize: 11, fontFamily: 'var(--font-mono)',
                  background: on ? `${color}22` : 'var(--color-bg-base)',
                  border: `1px solid ${on ? color : 'var(--color-border-subtle)'}`,
                  color: on ? color : 'var(--color-text-secondary)',
                  borderRadius: 999, cursor: 'pointer',
                  transition: 'background .15s, border-color .15s, color .15s',
                }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: on ? `0 0 0 2px ${color}33` : 'none' }} />
                {p}
                <span style={{ color: on ? color : 'var(--color-text-disabled)', opacity: 0.8 }}>· {priorityCounts[p]}</span>
              </button>
            );
          })}
          <span style={{ width: 1, height: 16, background: 'var(--color-border-subtle)' }} aria-hidden="true" />
          <span style={{ color: 'var(--color-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>status</span>
          {(['pending', 'in_progress', 'done'] as GoalStatus[]).map((s) => {
            const on = statusFilter.has(s);
            const color = STATUS_COLOR[s];
            return (
              <button key={s} type="button" onClick={() => toggleStatus(s)} aria-pressed={on}
                className="flex items-center gap-1.5"
                style={{
                  height: 24, padding: '0 9px', fontSize: 11, fontFamily: 'var(--font-mono)',
                  background: on ? `${color}22` : 'var(--color-bg-base)',
                  border: `1px solid ${on ? color : 'var(--color-border-subtle)'}`,
                  color: on ? color : 'var(--color-text-secondary)',
                  borderRadius: 999, cursor: 'pointer',
                  transition: 'background .15s, border-color .15s, color .15s',
                }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: on ? `0 0 0 2px ${color}33` : 'none' }} />
                {STATUS_LABEL[s]}
                <span style={{ color: on ? color : 'var(--color-text-disabled)', opacity: 0.8 }}>· {statusCounts[s]}</span>
              </button>
            );
          })}
          <span style={{ flex: 1 }} aria-hidden="true" />
          {hasFilter && (
            <span className="flex items-center gap-2">
              <span style={{ color: 'var(--color-text-disabled)' }}>{list.length}/{all.length}</span>
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
              <span>No goals match the filters. <button type="button" onClick={clearFilters} style={{ color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Clear</button>.</span>
            ) : (
              <>
                No goals yet. <span style={{ color: 'var(--color-text-secondary)' }}>Add some line-by-line or import from Excel.</span>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3" style={{ padding: '8px 14px', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}>
              <GoalCheckbox
                ariaLabel={selected.size === list.length ? 'Deselect all goals' : 'Select all goals'}
                checked={list.length > 0 && selected.size === list.length}
                indeterminate={selected.size > 0 && selected.size < list.length}
                onChange={(next) => setSelected(next ? new Set(list.map((g) => g.id)) : new Set())}
              />
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                {selected.size > 0
                  ? `${selected.size} selected`
                  : `${list.length} goal${list.length === 1 ? '' : 's'}${hasFilter ? ` of ${all.length}` : ''}`}
              </span>
              {selected.size > 0 && (
                <button type="button" onClick={() => setSelected(new Set())}
                  style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
                  clear
                </button>
              )}
            </div>
            {list.map((g) => {
              const isSelected = selected.has(g.id);
              const isExpanded = expandedId === g.id;
              const isDragging = draggingId === g.id;
              return (
                <div
                  key={g.id}
                  draggable={!hasFilter}
                  onDragStart={onDragStart(g.id)}
                  onDragOver={onDragOver}
                  onDrop={onDrop(g.id)}
                  onDragEnd={() => setDraggingId(null)}
                  className="flex flex-col group"
                  style={{
                    padding: '11px 14px',
                    borderBottom: '1px solid var(--color-border-subtle)',
                    background: isDragging ? 'rgba(124,140,248,0.08)' : isSelected ? 'rgba(124,140,248,0.06)' : 'transparent',
                    opacity: isDragging ? 0.6 : 1,
                    transition: 'background .15s, opacity .15s',
                  }}
                >
                  <div className="flex items-center gap-3">
                    {!hasFilter && (
                      <span aria-hidden="true" title="Drag to reorder"
                        style={{ display: 'flex', color: 'var(--color-text-disabled)', cursor: 'grab', flexShrink: 0 }}>
                        <GripVertical style={{ width: 13, height: 13 }} />
                      </span>
                    )}
                    <GoalCheckbox
                      ariaLabel={`Select goal "${g.title}"`}
                      checked={isSelected}
                      onChange={() => toggleSelect(g.id)}
                    />
                    <button type="button" onClick={() => updateGoal.mutate({ id: g.id, status: STATUS_NEXT[g.status] })}
                      title="Cycle status: pending → in progress → done"
                      style={{
                        fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                        fontFamily: 'var(--font-mono)', color: STATUS_COLOR[g.status],
                        background: 'none', border: `1px solid ${STATUS_COLOR[g.status]}55`,
                        borderRadius: 999, padding: '2px 8px', cursor: 'pointer', flexShrink: 0,
                      }}>
                      {STATUS_LABEL[g.status]}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="truncate" style={{ fontSize: 13, color: 'var(--color-text-primary)', textDecoration: g.status === 'done' ? 'line-through' : 'none' }}>
                        {g.title}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 1 }}>
                        <span style={{ color: PRIORITY_COLOR[g.priority] }}>{g.priority}</span>
                        {g.source !== 'user' && <span>· {g.source}</span>}
                        {g.dueDate && <span>· due {g.dueDate}</span>}
                        {g.description && (
                          <button type="button" onClick={() => setExpandedId(isExpanded ? null : g.id)}
                            className="flex items-center gap-0.5"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 0 }}>
                            {isExpanded ? <ChevronUp style={{ width: 11, height: 11 }} /> : <ChevronDown style={{ width: 11, height: 11 }} />}
                            details
                          </button>
                        )}
                      </div>
                    </div>
                    <button type="button" onClick={() => deleteGoal.mutate(g.id)} title="Delete"
                      className="opacity-0 group-hover:opacity-100"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-disabled)', flexShrink: 0, padding: 4 }}>
                      <Trash2 style={{ width: 13, height: 13 }} />
                    </button>
                  </div>
                  {isExpanded && g.description && (
                    <div style={{
                      marginTop: 8, marginLeft: hasFilter ? 32 : 48,
                      padding: '8px 12px',
                      background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 12, color: 'var(--color-text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.5,
                    }}>
                      {g.description}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Excel/CSV import preview + column mapping */}
      <Dialog
        open={!!importPreview}
        onClose={() => setImportPreview(null)}
        title={importPreview ? `Import from ${importPreview.fileName}` : undefined}
        description="Map the sheet columns to goal fields. The first 5 rows are previewed below — at least Title must be mapped."
        maxWidth="780px"
        disableBackdropClose
      >
        {importPreview && (
          <div className="flex flex-col gap-3">
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              {(['title', 'description', 'priority', 'status', 'dueDate'] as const).map((field) => (
                <label key={field} className="flex flex-col gap-1">
                  <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {field === 'dueDate' ? 'due date' : field}{field === 'title' && <span style={{ color: 'var(--color-error)' }}> *</span>}
                  </span>
                  <select
                    value={importPreview.mapping[field]}
                    onChange={(e) => setImportPreview({ ...importPreview, mapping: { ...importPreview.mapping, [field]: e.target.value } })}
                    style={{ ...inputStyle, height: 30, cursor: 'pointer', fontSize: 12 }}>
                    <option value="">(ignore)</option>
                    {importPreview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 260, border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>
                <thead style={{ background: 'var(--color-bg-surface)', position: 'sticky', top: 0 }}>
                  <tr>
                    {importPreview.headers.map((h) => (
                      <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--color-text-secondary)', borderBottom: '1px solid var(--color-border-subtle)', fontWeight: 600 }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {importPreview.rows.slice(0, 5).map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                      {importPreview.headers.map((h) => (
                        <td key={h} style={{ padding: '5px 10px', color: 'var(--color-text-primary)' }}>{row[h]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
              <span>{importPreview.rows.length} row{importPreview.rows.length === 1 ? '' : 's'} ready to import</span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setImportPreview(null)}
                  style={{ height: 32, padding: '0 12px', background: 'none', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button type="button" onClick={commitImport} disabled={!importPreview.mapping.title || bulkCreate.isPending}
                  className="flex items-center gap-1.5"
                  style={{ height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600,
                    background: !importPreview.mapping.title ? 'var(--color-bg-surface)' : 'var(--color-accent)',
                    color: !importPreview.mapping.title ? 'var(--color-text-disabled)' : '#021526',
                    border: 'none', borderRadius: 'var(--radius-md)',
                    cursor: !importPreview.mapping.title ? 'not-allowed' : 'pointer' }}>
                  <Upload style={{ width: 13, height: 13 }} />
                  {bulkCreate.isPending ? 'Importing…' : `Import ${importPreview.rows.length}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
