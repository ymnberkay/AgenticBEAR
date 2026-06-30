import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, BookOpen, Upload, FolderTree, X, MessageSquarePlus, PanelLeftClose, PanelLeft, Sparkles, Check, FileWarning, ArrowDown } from 'lucide-react';
import { useAgents } from '../../api/hooks/use-agents';
import { useDocuments, useCreateDocument, useDeleteDocument } from '../../api/hooks/use-documents';
import { useFileTree, workspaceKeys } from '../../api/hooks/use-workspace';
import { useApplyFileChange, useRejectFileChange, usePendingFileChanges } from '../../api/hooks/use-file-changes';
import { FileTree } from '../../components/workspace/file-tree';
import { FileViewer } from '../../components/workspace/file-viewer';
import { DiffView } from '../../components/workspace/diff-view';
import { streamChat, type ChatMessage, type ToolEvent } from '../../api/chat';
import type { FileChange } from '@subagent/shared';
import { ChatMessage as ChatBubble } from '../../components/chat/chat-message';
import { ChatComposer } from '../../components/chat/chat-composer';
import { useConversations, type ChatEntry } from '../../components/chat/use-conversations';
import { useToast } from '../../components/ui/toast';
import { Dialog } from '../../components/ui/dialog';

/**
 * A short present-tense status for a tool event (shown as a live activity chip). Labels are
 * intentionally generic so consecutive same-kind steps (e.g. reading several files) collapse
 * into a single line instead of repeating "read a file" over and over.
 */
function activityLine(e: ToolEvent): string | null {
  switch (e.kind) {
    case 'write': return e.operation === 'delete' ? 'Deleting files' : e.operation === 'modify' ? 'Editing files' : 'Writing files';
    case 'pendingWrite': return e.operation === 'command'
      ? `Proposing command: ${(e.path ?? '').length > 56 ? `${(e.path ?? '').slice(0, 53)}…` : e.path}`
      : 'Proposing file changes';
    case 'delegate': return `Delegating to ${e.agent}`;
    case 'tool':
      if (e.name === 'read_file') return 'Reading files';
      if (e.name === 'list_files') return 'Listing files';
      if (e.name === 'delete_file') return 'Deleting files';
      if (e.name === 'write_file') return 'Writing files';
      if (e.name === 'run_command') return e.command ? `Running: ${e.command.length > 60 ? `${e.command.slice(0, 57)}…` : e.command}` : 'Running a command';
      if (e.name === 'documenting') return 'Documenting changes';
      return `Running ${e.name}`;
    default: return null;
  }
}

const SUGGESTIONS = [
  { icon: '⚡', text: 'Summarize what this project does' },
  { icon: '🛠️', text: 'Write a small helper function under src' },
  { icon: '🔎', text: 'List the files and explain the structure' },
  { icon: '📝', text: 'Draft a README for this project' },
];

const inputStyle: React.CSSProperties = {
  width: '100%', height: 34, padding: '0 10px', background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-mono)', fontSize: 12.5, outline: 'none', borderRadius: 'var(--radius-sm)',
};

export function ProjectChatPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: agents } = useAgents(projectId);
  const { data: docs } = useDocuments(projectId);
  const createDoc = useCreateDocument(projectId);
  const deleteDoc = useDeleteDocument(projectId);
  const queryClient = useQueryClient();
  const { data: fileTree, isLoading: treeLoading } = useFileTree(projectId);
  const applyChange = useApplyFileChange(projectId);
  const rejectChange = useRejectFileChange(projectId);
  const { data: pending = [] } = usePendingFileChanges(projectId); // server-backed → survives navigation

  const draftKey = `agb_chat_draft_${projectId}`;
  const conv = useConversations(projectId);
  const [messages, setMessages] = useState<ChatEntry[]>(conv.active?.messages ?? []);
  // Draft persists across navigating away/back (restored on remount).
  const [input, setInput] = useState(() => { try { return localStorage.getItem(draftKey) ?? ''; } catch { return ''; } });
  const [streaming, setStreaming] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [railOpen, setRailOpen] = useState(true);
  const [panel, setPanel] = useState<null | 'knowledge' | 'workspace'>(null);
  const [changed, setChanged] = useState<Map<string, 'create' | 'modify'>>(new Map());
  const [viewerPath, setViewerPath] = useState<string | null>(null);
  const [diffChange, setDiffChange] = useState<FileChange | null>(null); // staged-change diff preview
  const [docName, setDocName] = useState('');
  const [docContent, setDocContent] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<
    | { kind: 'doc'; id: string; name: string }
    | { kind: 'conv'; id: string; title: string }
    | null
  >(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [streamError, setStreamError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const lastInputRef = useRef<{ history: ChatMessage[]; text: string } | null>(null);
  const { show: showToast } = useToast();

  const agentList = useMemo(() => agents ?? [], [agents]);
  const activeAgent = agentList.find((a) => a.id === agentId);

  // Default agent = the active conversation's, else orchestrator, else first.
  useEffect(() => {
    if (agentList.length === 0) return;
    const fallback = (agentList.find((a) => a.role === 'orchestrator') ?? agentList[0]).id;
    setAgentId(conv.active?.agentId || fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentList, conv.activeId]);

  // Load messages when switching conversations.
  useEffect(() => { setMessages(conv.active?.messages ?? []); setChanged(new Map()); /* eslint-disable-next-line */ }, [conv.activeId]);

  // Persist the composer draft so it survives navigating away and back.
  useEffect(() => { try { localStorage.setItem(draftKey, input); } catch { /* quota */ } }, [draftKey, input]);

  // Smart auto-scroll: only follow the latest message when the user is already near the bottom.
  useEffect(() => {
    if (!autoScroll) return;
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, autoScroll]);

  const onThreadScroll = useCallback(() => {
    const el = threadRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distanceFromBottom < 120);
  }, []);

  const scrollToLatest = useCallback(() => {
    setAutoScroll(true);
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  async function send() {
    const text = input.trim();
    if (!text || !agentId || streaming) return;
    setStreamError(null);

    // Ensure a conversation exists.
    let id = conv.activeId;
    if (!id) id = conv.startNew(agentId);

    const history: ChatMessage[] = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ];
    // `work` is the live source of truth; we clone it into state on each chunk for rendering.
    const work: ChatEntry[] = [...messages, { role: 'user', content: text }, { role: 'assistant', content: '' }];
    setMessages([...work]);
    setInput('');
    setStreaming(true);

    const setLast = (fn: (last: ChatEntry) => ChatEntry) => { work[work.length - 1] = fn(work[work.length - 1]); setMessages([...work]); };

    const touched: string[] = [];
    lastInputRef.current = { history, text };
    await streamChat(projectId, agentId, history, {
      onDelta: (t) => setLast((last) => ({ ...last, content: last.content + t })),
      onTool: (e) => {
        const line = activityLine(e);
        if (line) setLast((last) => {
          const act = last.activity ?? [];
          if (act[act.length - 1] === line) return last; // collapse consecutive same-kind steps
          return { ...last, activity: [...act, line] };
        });
        if (e.kind === 'write' && e.path) {
          touched.push(e.path);
          setChanged((prev) => new Map(prev).set(e.path!, (e.operation as 'create' | 'modify') ?? 'modify'));
        }
      },
      onError: (m) => {
        setStreamError(m);
        showToast(m, { variant: 'error' });
      },
    });
    setStreaming(false);

    // Persist the finished turn into the conversation store.
    conv.update(id, work, agentId);

    // The turn may have staged file changes for approval — refresh the server-backed pending bar.
    queryClient.invalidateQueries({ queryKey: ['file-changes', 'pending', projectId] });

    if (touched.length > 0) {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.fileTree(projectId) });
      for (const p of touched) queryClient.invalidateQueries({ queryKey: workspaceKeys.fileContent(projectId, p) });
      setPanel('workspace');
    }
  }

  function approve(p: FileChange) {
    applyChange.mutate(p.id, {
      onSuccess: (res) => {
        if (p.operation === 'command') {
          // Surface the command output inline in the conversation.
          const id = conv.activeId ?? conv.startNew(agentId);
          const out = res.commandOutput ?? '(no output)';
          const next: ChatEntry[] = [...messages, { role: 'assistant', content: `\`\`\`\n$ ${p.filePath}\n${out}\n\`\`\`` }];
          setMessages(next);
          conv.update(id, next, agentId);
        } else {
          setChanged((prev) => new Map(prev).set(p.filePath, p.operation === 'modify' ? 'modify' : 'create'));
          setPanel('workspace');
        }
      },
      onError: (err) => showToast(err instanceof Error ? err.message : `Failed to apply ${p.filePath}`, { variant: 'error' }),
    });
  }
  function reject(p: FileChange) {
    rejectChange.mutate(p.id, {
      onError: (err) => showToast(err instanceof Error ? err.message : `Failed to reject ${p.filePath}`, { variant: 'error' }),
    });
  }
  const approveAll = async () => {
    const items = [...pending];
    if (items.length === 0) return;
    let failed = 0;
    for (const p of items) {
      try {
        await applyChange.mutateAsync(p.id);
        if (p.operation !== 'delete') setChanged((prev) => new Map(prev).set(p.filePath, p.operation === 'modify' ? 'modify' : 'create'));
      } catch {
        failed++;
      }
    }
    setPanel('workspace');
    if (failed === 0) showToast(`Applied ${items.length} change${items.length === 1 ? '' : 's'}`, { variant: 'success' });
    else showToast(`${items.length - failed} applied, ${failed} failed`, { variant: 'error' });
  };

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setDocName(file.name);
    setDocContent(await file.text());
    e.target.value = '';
  }
  function addDoc() {
    if (!docName.trim() || !docContent.trim()) return;
    createDoc.mutate({ name: docName.trim(), content: docContent }, { onSuccess: () => { setDocName(''); setDocContent(''); } });
  }

  return (
    <div className="flex flex-col md:flex-row" style={{ height: 'calc(100vh - 116px)', gap: 0 }}>
      {/* ── Conversation rail ── */}
      {railOpen ? (
        <div className="flex flex-col" style={{ width: 230, flexShrink: 0, borderRight: '1px solid var(--color-border-subtle)', paddingRight: 12, marginRight: 14 }}>
          <button
            type="button"
            onClick={() => { setMessages([]); conv.startNew(agentId); }}
            aria-label="Start a new chat"
            className="flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 36, background: 'var(--color-accent)', color: '#021526', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}
          >
            <MessageSquarePlus style={{ width: 15, height: 15 }} aria-hidden="true" /> New chat
          </button>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>Chats</span>
            <button
              type="button"
              onClick={() => setRailOpen(false)}
              aria-label="Hide conversations sidebar"
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 6, borderRadius: 4 }}
            >
              <PanelLeftClose style={{ width: 14, height: 14 }} aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col" style={{ gap: 2 }}>
            {conv.conversations.length === 0 && (
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', padding: '4px 2px' }}>No chats yet.</span>
            )}
            {conv.conversations.map((c) => {
              const on = c.id === conv.activeId;
              return (
                <div key={c.id} className="group flex items-center focus-within:ring-2 focus-within:ring-[#7c8cf8]" style={{ borderRadius: 'var(--radius-sm)', background: on ? 'var(--color-accent-subtle)' : 'transparent' }}>
                  <button
                    type="button"
                    onClick={() => conv.setActiveId(c.id)}
                    className="truncate focus-visible:outline-none"
                    style={{ flex: 1, textAlign: 'left', padding: '8px 9px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)', minHeight: 36 }}
                  >
                    {c.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete({ kind: 'conv', id: c.id, title: c.title })}
                    aria-label={`Delete chat ${c.title}`}
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: '6px 7px', borderRadius: 4 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-error)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
                  >
                    <Trash2 style={{ width: 12.5, height: 12.5 }} aria-hidden="true" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRailOpen(true)}
          aria-label="Show conversations sidebar"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{ width: 36, height: 36, marginRight: 12, flexShrink: 0, background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <PanelLeft style={{ width: 14, height: 14 }} aria-hidden="true" />
        </button>
      )}

      {/* ── Chat column ── */}
      <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
        {/* Header: knowledge + files toggle pills */}
        <div className="flex items-center justify-end gap-2" style={{ marginBottom: 8 }}>
          {([
            { key: 'knowledge' as const, icon: <BookOpen style={{ width: 13, height: 13 }} />, label: `Knowledge (${docs?.length ?? 0})` },
            { key: 'workspace' as const, icon: <FolderTree style={{ width: 13, height: 13 }} />, label: `Files${changed.size > 0 ? ` (${changed.size})` : ''}` },
          ]).map(({ key, icon, label }) => {
            const on = panel === key;
            return (
              <button key={key} type="button" onClick={() => setPanel((p) => (p === key ? null : key))}
                className="flex items-center gap-2"
                style={{
                  height: 30, padding: '0 12px', fontSize: 12, fontFamily: 'var(--font-sans)', fontWeight: 500, cursor: 'pointer',
                  borderRadius: 'var(--radius-md)', transition: 'all .15s',
                  background: on ? 'var(--color-accent-subtle)' : 'var(--color-bg-surface)',
                  border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                  color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)',
                }}>
                {icon} {label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 flex flex-col lg:flex-row" style={{ minHeight: 0, gap: 14 }}>
          {/* Thread + composer */}
          <div className="flex-1 flex flex-col relative" style={{ minWidth: 0 }}>
            <div
              ref={threadRef}
              onScroll={onThreadScroll}
              className="flex-1 overflow-y-auto flex flex-col"
              style={{ gap: 22, padding: '6px 4px 12px' }}
            >
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center" style={{ margin: 'auto', maxWidth: 560, textAlign: 'center', gap: 18 }}>
                  <div className="flex items-center justify-center" style={{ width: 46, height: 46, borderRadius: 'var(--radius-lg)', background: 'var(--color-accent-subtle)', border: '1px solid var(--glass-border-hover)' }}>
                    <Sparkles style={{ width: 22, height: 22, color: 'var(--color-accent)' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--color-text-primary)' }}>What should we work on?</div>
                    <div style={{ fontSize: 12.5, color: 'var(--color-text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: 5 }}>
                      {activeAgent ? `chatting with ${activeAgent.name}` : 'pick an agent'} · project knowledge is included automatically
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-center" style={{ gap: 8 }}>
                    {SUGGESTIONS.map((s) => (
                      <button key={s.text} type="button" onClick={() => setInput(s.text)}
                        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 12px', fontSize: 12.5, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--color-text-secondary)', cursor: 'pointer', fontFamily: 'var(--font-sans)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--glass-border-hover)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-subtle)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}>
                        <span>{s.icon}</span>{s.text}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                messages.map((m, i) => (
                  <ChatBubble
                    key={`${m.role}-${i}-${m.content.length}`}
                    entry={m}
                    agentName={activeAgent?.name ?? 'agent'}
                    agentColor={activeAgent?.color ?? 'var(--color-accent)'}
                    streaming={streaming && i === messages.length - 1}
                  />
                ))
              )}
              <div ref={endRef} />
            </div>

            {/* Streaming error banner with retry */}
            {streamError && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3"
                style={{
                  margin: '0 auto 8px',
                  maxWidth: 760,
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--color-error-subtle)',
                  border: '1px solid rgba(224,96,96,0.3)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 12,
                  color: '#e06060',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <span className="truncate" style={{ flex: 1 }}>Stream failed: {streamError}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      const last = lastInputRef.current;
                      if (!last) return;
                      setInput(last.text);
                      setStreamError(null);
                    }}
                    className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                    style={{ height: 26, padding: '0 10px', background: 'transparent', border: '1px solid rgba(224,96,96,0.4)', color: '#e06060', fontSize: 11, borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => setStreamError(null)}
                    aria-label="Dismiss error"
                    style={{ background: 'none', border: 'none', color: '#e06060', padding: 4, cursor: 'pointer' }}
                  >
                    <X style={{ width: 12, height: 12 }} aria-hidden="true" />
                  </button>
                </div>
              </div>
            )}

            {/* "Jump to latest" pill — appears when the user has scrolled up from the bottom */}
            {!autoScroll && messages.length > 0 && (
              <button
                type="button"
                onClick={scrollToLatest}
                aria-label="Jump to latest message"
                className="absolute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{
                  bottom: 100, left: '50%', transform: 'translateX(-50%)',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  height: 30, padding: '0 12px',
                  background: 'var(--color-bg-surface)',
                  border: '1px solid rgba(124,140,248,0.4)',
                  color: 'var(--color-accent)',
                  borderRadius: 999, fontSize: 11.5, fontFamily: 'var(--font-mono)',
                  cursor: 'pointer', boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
                }}
              >
                <ArrowDown style={{ width: 12, height: 12 }} aria-hidden="true" /> Latest
              </button>
            )}

            {/* Pending file ops — require user approval before touching disk */}
            {pending.length > 0 && (
              <div style={{ maxWidth: 760, width: '100%', margin: '0 auto 10px', background: 'var(--color-bg-surface)', border: '1px solid rgba(124,140,248,0.4)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div className="flex items-center justify-between" style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <span className="flex items-center gap-2" style={{ fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                    <FileWarning style={{ width: 13, height: 13, color: 'var(--color-accent)' }} /> {pending.length} change{pending.length === 1 ? '' : 's'} need approval
                  </span>
                  <button type="button" onClick={approveAll} disabled={applyChange.isPending}
                    style={{ height: 24, padding: '0 10px', fontSize: 11, fontWeight: 600, background: 'var(--color-accent)', color: '#021526', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                    Approve all
                  </button>
                </div>
                <div className="flex flex-col">
                  {pending.map((p) => {
                    const isCmd = p.operation === 'command';
                    const op = isCmd ? 'run' : p.operation === 'delete' ? 'delete' : p.operation === 'modify' ? 'edit' : 'create';
                    const opColor = isCmd ? 'var(--color-accent)' : p.operation === 'delete' ? 'var(--color-error)' : p.operation === 'modify' ? 'var(--color-warning)' : 'var(--color-success)';
                    return (
                      <div key={p.id} className="flex items-center gap-2" style={{ padding: '7px 12px', borderTop: '1px solid var(--color-border-subtle)' }}>
                        <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)', color: opColor, width: 46, flexShrink: 0 }}>{op}</span>
                        {isCmd ? (
                          <span className="truncate" title={p.filePath} style={{ flex: 1, fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', minWidth: 0 }}>
                            $ {p.filePath}
                          </span>
                        ) : (
                          <button type="button" onClick={() => setDiffChange(p)} className="truncate" title="View diff"
                            style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', minWidth: 0 }}>
                            {p.filePath}
                          </button>
                        )}
                        <button type="button" onClick={() => approve(p)} disabled={applyChange.isPending} title="Approve" className="flex items-center gap-1"
                          style={{ height: 24, padding: '0 9px', fontSize: 10.5, fontWeight: 600, background: 'var(--color-success-subtle)', color: 'var(--color-success)', border: '1px solid rgba(109,181,138,0.4)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', flexShrink: 0 }}>
                          <Check style={{ width: 11, height: 11 }} /> Approve
                        </button>
                        <button type="button" onClick={() => reject(p)} disabled={rejectChange.isPending} title="Reject" className="flex items-center gap-1"
                          style={{ height: 24, padding: '0 9px', fontSize: 10.5, fontWeight: 600, background: 'none', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', flexShrink: 0 }}>
                          <X style={{ width: 11, height: 11 }} /> Reject
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ maxWidth: 760, width: '100%', margin: '0 auto' }}>
              <ChatComposer
                value={input} onChange={setInput} onSend={send} streaming={streaming}
                agents={agentList} agentId={agentId} onAgentChange={setAgentId}
                onAttach={() => setPanel('knowledge')}
              />
              <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', textAlign: 'center', marginTop: 6 }}>
                {activeAgent?.role === 'orchestrator' ? '◆ Orchestrator — can delegate work to specialist agents' : 'agentic: the agent can read & write files'}
              </div>
            </div>
          </div>

          {/* ── Right slide-over: knowledge or workspace ── */}
          {panel && (
            <div className="flex flex-col" style={{ width: 300, flexShrink: 0, border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', background: 'var(--color-bg-surface)', minHeight: 0 }}>
              <div className="flex items-center justify-between" style={{ padding: '9px 11px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                  {panel === 'knowledge' ? 'Knowledge' : 'Workspace'}
                </span>
                <button type="button" onClick={() => setPanel(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-disabled)' }}><X style={{ width: 14, height: 14 }} /></button>
              </div>

              {panel === 'knowledge' ? (
                <div className="flex-1 overflow-y-auto" style={{ padding: 11 }}>
                  <p style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', margin: '0 0 10px' }}>
                    Documents added here are injected into every agent's context in this project.
                  </p>
                  <div className="flex flex-col gap-1.5" style={{ marginBottom: 12 }}>
                    {(docs ?? []).map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-2" style={{ padding: '6px 9px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>
                        <span className="truncate" style={{ fontSize: 11.5, color: 'var(--color-text-primary)' }}>{d.name}</span>
                        <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{(d.content.length / 1000).toFixed(1)}k</span>
                          <button
                            type="button"
                            onClick={() => setConfirmDelete({ kind: 'doc', id: d.id, name: d.name })}
                            aria-label={`Delete document ${d.name}`}
                            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', padding: 6, borderRadius: 4 }}
                          >
                            <Trash2 style={{ width: 12, height: 12 }} aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                    ))}
                    {(docs ?? []).length === 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No documents.</span>}
                  </div>
                  <label htmlFor="doc-name-input" className="sr-only">Document name</label>
                  <input id="doc-name-input" placeholder="document name" value={docName} onChange={(e) => setDocName(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
                  <label htmlFor="doc-content-input" className="sr-only">Document content</label>
                  <textarea id="doc-content-input" placeholder="paste content…" value={docContent} onChange={(e) => setDocContent(e.target.value)}
                    style={{ ...inputStyle, height: 80, padding: '7px 10px', resize: 'vertical', marginBottom: 8 }} />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={addDoc} disabled={createDoc.isPending} className="flex items-center gap-1.5"
                      style={{ height: 30, padding: '0 12px', fontSize: 12, fontWeight: 600, background: 'var(--color-accent)', color: '#0d1117', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                      <Plus style={{ width: 13, height: 13 }} /> add
                    </button>
                    <label className="flex items-center gap-1.5" style={{ height: 30, padding: '0 10px', fontSize: 11.5, fontFamily: 'var(--font-mono)', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
                      <Upload style={{ width: 13, height: 13 }} /> file
                      <input type="file" accept=".txt,.md,.json,.csv,text/*" onChange={onFile} style={{ display: 'none' }} />
                    </label>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
                  <div style={{ borderBottom: '1px solid var(--color-border-subtle)', maxHeight: 150, overflowY: 'auto' }}>
                    <div style={{ fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', padding: '8px 10px 4px' }}>Changed in this chat ({changed.size})</div>
                    {changed.size === 0 ? (
                      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', padding: '0 10px 8px' }}>No changes yet.</div>
                    ) : (
                      <div className="flex flex-col" style={{ paddingBottom: 6 }}>
                        {[...changed.entries()].map(([path, op]) => (
                          <button key={path} type="button" onClick={() => setViewerPath(path)} className="flex items-center gap-1.5"
                            style={{ padding: '3px 10px', background: viewerPath === path ? 'var(--color-accent-subtle)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                            <span style={{ fontSize: 10, color: op === 'create' ? 'var(--color-success)' : 'var(--color-warning)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{op === 'create' ? '+' : '~'}</span>
                            <span className="truncate" style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{path}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <div style={{ fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', padding: '8px 10px 2px' }}>Files</div>
                    <FileTree nodes={fileTree?.children} isLoading={treeLoading} selectedPath={viewerPath} onSelectFile={setViewerPath} changedFiles={new Set(changed.keys())} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* File viewer overlay — reuses Dialog for ESC/focus/scroll-lock/aria */}
      <Dialog
        open={!!viewerPath}
        onClose={() => setViewerPath(null)}
        title={viewerPath ?? undefined}
        maxWidth="900px"
        className="!max-h-[85vh]"
      >
        <div style={{ height: '70vh', minHeight: 320 }}>
          {viewerPath && <FileViewer projectId={projectId} filePath={viewerPath} />}
        </div>
      </Dialog>

      {/* Staged-change diff overlay (before/after for a pending approval) */}
      <Dialog
        open={!!diffChange}
        onClose={() => setDiffChange(null)}
        title={diffChange ? `${diffChange.operation} · ${diffChange.filePath}` : undefined}
        maxWidth="900px"
        className="!max-h-[85vh]"
      >
        <div style={{ height: '70vh', minHeight: 320 }}>
          {diffChange && <DiffView previousContent={diffChange.previousContent} newContent={diffChange.newContent} />}
        </div>
      </Dialog>

      {/* Delete confirm dialog (doc or conversation) */}
      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={confirmDelete?.kind === 'doc' ? 'Delete document' : 'Delete conversation'}
        description={
          confirmDelete?.kind === 'doc'
            ? `Remove "${confirmDelete.name}" from project knowledge. Agents will no longer see it.`
            : confirmDelete?.kind === 'conv'
              ? `Permanently delete "${confirmDelete.title}". This cannot be undone.`
              : undefined
        }
        maxWidth="420px"
      >
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(null)}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 34, padding: '0 14px', background: 'transparent', border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)', fontSize: 12, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (!confirmDelete) return;
              if (confirmDelete.kind === 'doc') {
                deleteDoc.mutate(confirmDelete.id, {
                  onError: (err) => showToast(err instanceof Error ? err.message : 'Delete failed', { variant: 'error' }),
                });
              } else {
                conv.remove(confirmDelete.id);
              }
              setConfirmDelete(null);
            }}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{ height: 34, padding: '0 14px', background: '#e06060', color: '#021526', border: 'none', fontSize: 12, fontWeight: 600, borderRadius: 'var(--radius-md)', cursor: 'pointer' }}
          >
            Delete
          </button>
        </div>
      </Dialog>
    </div>
  );
}
