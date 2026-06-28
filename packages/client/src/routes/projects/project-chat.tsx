import { useState, useRef, useEffect, useMemo } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, BookOpen, Upload, FolderTree, X, MessageSquarePlus, PanelLeftClose, PanelLeft, Sparkles, Check, FileWarning } from 'lucide-react';
import { useAgents } from '../../api/hooks/use-agents';
import { useDocuments, useCreateDocument, useDeleteDocument } from '../../api/hooks/use-documents';
import { useFileTree, workspaceKeys } from '../../api/hooks/use-workspace';
import { useApplyFileChange, useRejectFileChange } from '../../api/hooks/use-file-changes';
import { FileTree } from '../../components/workspace/file-tree';
import { FileViewer } from '../../components/workspace/file-viewer';
import { streamChat, type ChatMessage, type ToolEvent, type PendingChange } from '../../api/chat';
import { ChatMessage as ChatBubble } from '../../components/chat/chat-message';
import { ChatComposer } from '../../components/chat/chat-composer';
import { useConversations, type ChatEntry } from '../../components/chat/use-conversations';

/** Human-readable one-liner for a tool event (shown as an activity chip). */
function activityLine(e: ToolEvent): string | null {
  switch (e.kind) {
    case 'write': return `${e.operation === 'modify' ? 'edited' : e.operation === 'delete' ? 'deleted' : 'wrote'} ${e.path}`;
    case 'pendingWrite': return `proposed ${e.operation === 'delete' ? 'deletion of' : e.operation === 'modify' ? 'edit to' : 'new file'} ${e.path} — awaiting approval`;
    case 'delegate': return `→ delegated to ${e.agent}${e.task ? `: ${e.task.length > 70 ? `${e.task.slice(0, 67)}…` : e.task}` : ''}`;
    case 'tool':
      if (e.name === 'read_file') return 'read a file';
      if (e.name === 'list_files') return 'listed files';
      return `${e.name}`;
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

  const conv = useConversations(projectId);
  const [messages, setMessages] = useState<ChatEntry[]>(conv.active?.messages ?? []);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [railOpen, setRailOpen] = useState(true);
  const [panel, setPanel] = useState<null | 'knowledge' | 'workspace'>(null);
  const [changed, setChanged] = useState<Map<string, 'create' | 'modify'>>(new Map());
  const [pending, setPending] = useState<PendingChange[]>([]);
  const [viewerPath, setViewerPath] = useState<string | null>(null);
  const [docName, setDocName] = useState('');
  const [docContent, setDocContent] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

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
  useEffect(() => { setMessages(conv.active?.messages ?? []); setChanged(new Map()); setPending([]); /* eslint-disable-next-line */ }, [conv.activeId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || !agentId || streaming) return;

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
    await streamChat(projectId, agentId, history, {
      onDelta: (t) => setLast((last) => ({ ...last, content: last.content + t })),
      onTool: (e) => {
        const line = activityLine(e);
        if (line) setLast((last) => ({ ...last, activity: [...(last.activity ?? []), line] }));
        if (e.kind === 'write' && e.path) {
          touched.push(e.path);
          setChanged((prev) => new Map(prev).set(e.path!, (e.operation as 'create' | 'modify') ?? 'modify'));
        }
      },
      onPending: (p) => setPending((prev) => [...prev, p]),
      onError: (m) => setLast((last) => ({ ...last, content: `${last.content}\n\n⚠️ ${m}` })),
    });
    setStreaming(false);

    // Persist the finished turn into the conversation store.
    conv.update(id, work, agentId);

    if (touched.length > 0) {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.fileTree(projectId) });
      for (const p of touched) queryClient.invalidateQueries({ queryKey: workspaceKeys.fileContent(projectId, p) });
      setPanel('workspace');
    }
  }

  function approve(p: PendingChange) {
    applyChange.mutate(p.id, {
      onSuccess: () => {
        setPending((prev) => prev.filter((x) => x.id !== p.id));
        if (p.operation !== 'delete') setChanged((prev) => new Map(prev).set(p.path, p.operation === 'modify' ? 'modify' : 'create'));
        setPanel('workspace');
      },
    });
  }
  function reject(p: PendingChange) {
    rejectChange.mutate(p.id, { onSuccess: () => setPending((prev) => prev.filter((x) => x.id !== p.id)) });
  }
  const approveAll = () => pending.forEach(approve);

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
    <div className="flex" style={{ height: 'calc(100vh - 116px)', gap: 0 }}>
      {/* ── Conversation rail ── */}
      {railOpen ? (
        <div className="flex flex-col" style={{ width: 230, flexShrink: 0, borderRight: '1px solid var(--color-border-subtle)', paddingRight: 12, marginRight: 14 }}>
          <button type="button" onClick={() => { setMessages([]); conv.startNew(agentId); }} className="flex items-center justify-center gap-2"
            style={{ height: 36, background: 'var(--color-accent)', color: '#0d1117', border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, marginBottom: 12 }}>
            <MessageSquarePlus style={{ width: 15, height: 15 }} /> New chat
          </button>
          <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)' }}>Chats</span>
            <button type="button" onClick={() => setRailOpen(false)} title="Hide" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-disabled)' }}>
              <PanelLeftClose style={{ width: 14, height: 14 }} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto flex flex-col" style={{ gap: 2 }}>
            {conv.conversations.length === 0 && (
              <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', padding: '4px 2px' }}>No chats yet.</span>
            )}
            {conv.conversations.map((c) => {
              const on = c.id === conv.activeId;
              return (
                <div key={c.id} className="group flex items-center" style={{ borderRadius: 'var(--radius-sm)', background: on ? 'var(--color-accent-subtle)' : 'transparent' }}>
                  <button type="button" onClick={() => conv.setActiveId(c.id)} className="truncate"
                    style={{ flex: 1, textAlign: 'left', padding: '7px 9px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: on ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontFamily: 'var(--font-sans)' }}>
                    {c.title}
                  </button>
                  <button type="button" onClick={() => conv.remove(c.id)} title="Delete"
                    style={{ opacity: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-disabled)', padding: '0 7px' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-error)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-disabled)'; }}
                    className="group-hover:opacity-100">
                    <Trash2 style={{ width: 12.5, height: 12.5 }} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setRailOpen(true)} title="Chats"
          style={{ width: 30, height: 30, marginRight: 12, flexShrink: 0, background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-disabled)' }}>
          <PanelLeft style={{ width: 14, height: 14 }} />
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

        <div className="flex-1 flex" style={{ minHeight: 0, gap: 14 }}>
          {/* Thread + composer */}
          <div className="flex-1 flex flex-col" style={{ minWidth: 0 }}>
            <div className="flex-1 overflow-y-auto flex flex-col" style={{ gap: 22, padding: '6px 4px 12px' }}>
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
                  <ChatBubble key={i} entry={m} agentName={activeAgent?.name ?? 'agent'} agentColor={activeAgent?.color ?? 'var(--color-accent)'}
                    streaming={streaming && i === messages.length - 1} />
                ))
              )}
              <div ref={endRef} />
            </div>

            {/* Pending file ops — require user approval before touching disk */}
            {pending.length > 0 && (
              <div style={{ maxWidth: 760, width: '100%', margin: '0 auto 10px', background: 'var(--color-bg-surface)', border: '1px solid rgba(124,140,248,0.4)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                <div className="flex items-center justify-between" style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                  <span className="flex items-center gap-2" style={{ fontSize: 11.5, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>
                    <FileWarning style={{ width: 13, height: 13, color: 'var(--color-accent)' }} /> {pending.length} file change{pending.length === 1 ? '' : 's'} need approval
                  </span>
                  <button type="button" onClick={approveAll} disabled={applyChange.isPending}
                    style={{ height: 24, padding: '0 10px', fontSize: 11, fontWeight: 600, background: 'var(--color-accent)', color: '#021526', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                    Approve all
                  </button>
                </div>
                <div className="flex flex-col">
                  {pending.map((p) => {
                    const op = p.operation === 'delete' ? 'delete' : p.operation === 'modify' ? 'edit' : 'create';
                    const opColor = p.operation === 'delete' ? 'var(--color-error)' : p.operation === 'modify' ? 'var(--color-warning)' : 'var(--color-success)';
                    return (
                      <div key={p.id} className="flex items-center gap-2" style={{ padding: '7px 12px', borderTop: '1px solid var(--color-border-subtle)' }}>
                        <span style={{ fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', fontFamily: 'var(--font-mono)', color: opColor, width: 46, flexShrink: 0 }}>{op}</span>
                        <button type="button" onClick={() => setViewerPath(p.path)} className="truncate" title="Preview"
                          style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)', minWidth: 0 }}>
                          {p.path}
                        </button>
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
                          <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{(d.content.length / 1000).toFixed(1)}k</span>
                          <button type="button" onClick={() => deleteDoc.mutate(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)' }}><Trash2 style={{ width: 12, height: 12 }} /></button>
                        </div>
                      </div>
                    ))}
                    {(docs ?? []).length === 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No documents.</span>}
                  </div>
                  <input placeholder="document name" value={docName} onChange={(e) => setDocName(e.target.value)} style={{ ...inputStyle, marginBottom: 8 }} />
                  <textarea placeholder="paste content…" value={docContent} onChange={(e) => setDocContent(e.target.value)}
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

      {/* File viewer overlay */}
      {viewerPath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.55)' }} onClick={() => setViewerPath(null)}>
          <div className="flex flex-col" style={{ width: '80%', maxWidth: 900, height: '80%', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between" style={{ padding: '9px 12px', borderBottom: '1px solid var(--color-border-subtle)' }}>
              <span className="truncate" style={{ fontSize: 12.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{viewerPath}</span>
              <button type="button" onClick={() => setViewerPath(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-disabled)' }}><X style={{ width: 15, height: 15 }} /></button>
            </div>
            <div className="flex-1 overflow-hidden">
              <FileViewer projectId={projectId} filePath={viewerPath} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
