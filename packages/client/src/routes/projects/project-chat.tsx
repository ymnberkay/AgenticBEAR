import { useState, useRef, useEffect } from 'react';
import { useParams } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Send, Plus, Trash2, BookOpen, Upload, Loader2, FolderTree, X } from 'lucide-react';
import { useAgents } from '../../api/hooks/use-agents';
import { useDocuments, useCreateDocument, useDeleteDocument } from '../../api/hooks/use-documents';
import { useFileTree, workspaceKeys } from '../../api/hooks/use-workspace';
import { FileTree } from '../../components/workspace/file-tree';
import { FileViewer } from '../../components/workspace/file-viewer';
import { streamChat, type ChatMessage, type ToolEvent } from '../../api/chat';

/** A rendered chat entry: a message plus any tool activity the agent performed for it. */
interface ChatEntry extends ChatMessage {
  activity?: string[];
}

/** Human-readable one-liner for a tool event (shown dimmed above the answer). */
function activityLine(e: ToolEvent): string | null {
  switch (e.kind) {
    case 'write':
      return `${e.operation === 'modify' ? '✏️ edited' : '📝 wrote'} ${e.path}`;
    case 'delegate':
      return `→ delegated to ${e.agent}${e.task ? `: ${e.task.length > 70 ? `${e.task.slice(0, 67)}…` : e.task}` : ''}`;
    case 'tool':
      if (e.name === 'read_file') return '📄 read a file';
      if (e.name === 'list_files') return '📁 listed files';
      return `🔧 ${e.name}`;
    default:
      return null; // toolResult is noisy — skip
  }
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 36, padding: '0 12px', background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-mono)', fontSize: 13, outline: 'none',
};

export function ProjectChatPage() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { data: agents } = useAgents(projectId);
  const { data: docs } = useDocuments(projectId);
  const createDoc = useCreateDocument(projectId);
  const deleteDoc = useDeleteDocument(projectId);

  const queryClient = useQueryClient();
  const { data: fileTree, isLoading: treeLoading } = useFileTree(projectId);

  const [agentId, setAgentId] = useState('');
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [showKnowledge, setShowKnowledge] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  // Files changed during this chat session (from streamed `write` events): path → operation.
  const [changed, setChanged] = useState<Map<string, 'create' | 'modify'>>(new Map());
  const [viewerPath, setViewerPath] = useState<string | null>(null);
  const [docName, setDocName] = useState('');
  const [docContent, setDocContent] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Grow the input box to fit its content (up to a cap), so multi-line edits stay visible.
  const autosizeInput = () => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  };
  useEffect(() => { autosizeInput(); }, [input]);

  // Default to the orchestrator, else the first agent.
  useEffect(() => {
    if (!agentId && agents && agents.length > 0) {
      setAgentId((agents.find((a) => a.role === 'orchestrator') ?? agents[0]).id);
    }
  }, [agents, agentId]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || !agentId || streaming) return;
    // Wire history carries only role/content; tool activity is local UI state.
    const history: ChatMessage[] = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ];
    setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);
    const appendToLast = (t: string) =>
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, content: last.content + t };
        return copy;
      });
    const addActivity = (line: string) =>
      setMessages((prev) => {
        const copy = [...prev];
        const last = copy[copy.length - 1];
        copy[copy.length - 1] = { ...last, activity: [...(last.activity ?? []), line] };
        return copy;
      });
    const touched: string[] = [];
    await streamChat(projectId, agentId, history, {
      onDelta: appendToLast,
      onTool: (e) => {
        const line = activityLine(e);
        if (line) addActivity(line);
        if (e.kind === 'write' && e.path) {
          touched.push(e.path);
          setChanged((prev) => new Map(prev).set(e.path!, (e.operation as 'create' | 'modify') ?? 'modify'));
        }
      },
      onError: (m) => appendToLast(`\n\n⚠️ ${m}`),
    });
    setStreaming(false);
    // Files changed → refresh the tree (new files appear) + any open/changed file contents.
    if (touched.length > 0) {
      queryClient.invalidateQueries({ queryKey: workspaceKeys.fileTree(projectId) });
      for (const p of touched) queryClient.invalidateQueries({ queryKey: workspaceKeys.fileContent(projectId, p) });
      setShowWorkspace(true);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const content = await file.text();
    setDocName(file.name);
    setDocContent(content);
    e.target.value = '';
  }

  function addDoc() {
    if (!docName.trim() || !docContent.trim()) return;
    createDoc.mutate(
      { name: docName.trim(), content: docContent },
      { onSuccess: () => { setDocName(''); setDocContent(''); } },
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Header: agent picker + knowledge toggle */}
      <div className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 12 }}>
        <select value={agentId} onChange={(e) => setAgentId(e.target.value)}
          style={{ ...inputStyle, width: 'auto', minWidth: 220, cursor: 'pointer' }}>
          {(agents ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.role === 'orchestrator' ? '🧭 ' : '• '}{a.name} ({a.role})
            </option>
          ))}
        </select>
        <button type="button" onClick={() => setShowKnowledge((s) => !s)} className="flex items-center gap-1.5"
          style={{ height: 36, padding: '0 12px', fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', color: showKnowledge ? '#6EACDA' : 'var(--color-text-disabled)', cursor: 'pointer' }}>
          <BookOpen style={{ width: 13, height: 13 }} /> Knowledge ({docs?.length ?? 0})
        </button>
        <button type="button" onClick={() => setShowWorkspace((s) => !s)} className="flex items-center gap-1.5"
          style={{ height: 36, padding: '0 12px', fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', color: showWorkspace ? '#6EACDA' : 'var(--color-text-disabled)', cursor: 'pointer' }}>
          <FolderTree style={{ width: 13, height: 13 }} /> Files{changed.size > 0 ? ` (${changed.size})` : ''}
        </button>
        {messages.length > 0 && (
          <button type="button" onClick={() => setMessages([])}
            style={{ height: 36, padding: '0 12px', fontSize: 12, fontFamily: 'var(--font-mono)', background: 'none', border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-disabled)', cursor: 'pointer' }}>
            clear
          </button>
        )}
      </div>

      {/* Knowledge panel */}
      {showKnowledge && (
        <div style={{ marginBottom: 12, padding: 14, background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderLeft: '3px solid #6db58a' }}>
          <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginTop: 0, marginBottom: 10 }}>
            Documents added here are injected into every agent's context in this project.
          </p>
          <div className="flex flex-col gap-1.5" style={{ marginBottom: 12 }}>
            {(docs ?? []).map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3" style={{ padding: '6px 10px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)' }}>
                <span className="truncate" style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>{d.name}</span>
                <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                  <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>{(d.content.length / 1000).toFixed(1)}k chars</span>
                  <button type="button" onClick={() => deleteDoc.mutate(d.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#d88a8a' }}>
                    <Trash2 style={{ width: 13, height: 13 }} />
                  </button>
                </div>
              </div>
            ))}
            {(docs ?? []).length === 0 && <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No documents yet.</span>}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input placeholder="document name" value={docName} onChange={(e) => setDocName(e.target.value)} style={inputStyle} />
              <label className="flex items-center gap-1.5" style={{ height: 36, padding: '0 12px', fontSize: 12, fontFamily: 'var(--font-mono)', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)', color: 'var(--color-text-disabled)', cursor: 'pointer', flexShrink: 0 }}>
                <Upload style={{ width: 13, height: 13 }} /> file
                <input type="file" accept=".txt,.md,.json,.csv,text/*" onChange={onFile} style={{ display: 'none' }} />
              </label>
            </div>
            <textarea placeholder="paste document content…" value={docContent} onChange={(e) => setDocContent(e.target.value)}
              style={{ ...inputStyle, height: 80, padding: '8px 12px', resize: 'vertical' }} />
            <button type="button" onClick={addDoc} disabled={createDoc.isPending} className="flex items-center gap-1.5 w-fit"
              style={{ height: 32, padding: '0 14px', fontSize: 12.5, fontWeight: 600, background: '#6EACDA', color: '#021526', border: 'none', cursor: 'pointer' }}>
              <Plus style={{ width: 13, height: 13 }} /> add document
            </button>
          </div>
        </div>
      )}

      {/* Body: chat column + optional workspace panel */}
      <div className="flex-1 flex gap-3" style={{ minHeight: 0 }}>
      <div className="flex-1 flex flex-col" style={{ minHeight: 0 }}>
      {/* Messages */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-3" style={{ padding: '4px 2px' }}>
        {messages.length === 0 && (
          <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            Chat with the selected agent. Project knowledge is included automatically.
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className="flex flex-col" style={{ alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.activity && m.activity.length > 0 && (
              <div className="flex flex-col gap-0.5" style={{ maxWidth: '80%', marginBottom: 4 }}>
                {m.activity.map((line, j) => (
                  <span key={j} style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', paddingLeft: 2 }}>
                    {line}
                  </span>
                ))}
              </div>
            )}
            <div style={{
              maxWidth: '80%', padding: '10px 14px', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
              fontFamily: m.role === 'assistant' ? 'var(--font-mono)' : 'var(--font-sans)',
              background: m.role === 'user' ? 'rgba(110,172,218,0.12)' : 'var(--color-bg-surface)',
              border: `1px solid ${m.role === 'user' ? 'rgba(110,172,218,0.3)' : 'var(--color-border-subtle)'}`,
              color: 'var(--color-text-primary)',
            }}>
              {m.content || (streaming && i === messages.length - 1 ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '')}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="flex items-end gap-2" style={{ marginTop: 12 }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
          rows={1}
          style={{ ...inputStyle, height: 40, minHeight: 40, maxHeight: 320, padding: '10px 12px', resize: 'none', overflowY: 'auto', fontFamily: 'var(--font-sans)' }}
        />
        <button type="button" onClick={send} disabled={streaming || !input.trim()}
          className="flex items-center justify-center" style={{ height: 40, width: 44, flexShrink: 0, background: streaming || !input.trim() ? 'var(--color-bg-surface)' : '#6EACDA', color: streaming || !input.trim() ? 'var(--color-text-disabled)' : '#021526', border: 'none', cursor: streaming || !input.trim() ? 'default' : 'pointer' }}>
          {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send style={{ width: 16, height: 16 }} />}
        </button>
      </div>
      </div>

      {/* Workspace panel: files changed in this chat + the directory tree */}
      {showWorkspace && (
        <div className="flex flex-col" style={{ width: 300, flexShrink: 0, border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)', minHeight: 0 }}>
          <div className="flex items-center justify-between" style={{ padding: '8px 10px', borderBottom: '1px solid var(--color-border-subtle)' }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>Workspace</span>
            <button type="button" onClick={() => setShowWorkspace(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-disabled)' }}><X style={{ width: 13, height: 13 }} /></button>
          </div>

          {/* Changed in this chat */}
          <div style={{ borderBottom: '1px solid var(--color-border-subtle)', maxHeight: 160, overflowY: 'auto' }}>
            <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', padding: '8px 10px 4px' }}>
              Changed in this chat ({changed.size})
            </div>
            {changed.size === 0 ? (
              <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', padding: '0 10px 8px' }}>No edits yet.</div>
            ) : (
              <div className="flex flex-col" style={{ paddingBottom: 6 }}>
                {[...changed.entries()].map(([path, op]) => (
                  <button key={path} type="button" onClick={() => setViewerPath(path)}
                    className="flex items-center gap-1.5 hover:bg-bg-raised" style={{ padding: '3px 10px', background: viewerPath === path ? 'rgba(110,172,218,0.1)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 10, color: op === 'create' ? '#6db58a' : '#e2b04a', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{op === 'create' ? '+' : '~'}</span>
                    <span className="truncate" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{path}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Directory tree */}
          <div className="flex-1 overflow-y-auto">
            <div style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', padding: '8px 10px 2px' }}>Files</div>
            <FileTree nodes={fileTree?.children} isLoading={treeLoading} selectedPath={viewerPath} onSelectFile={setViewerPath} changedFiles={new Set(changed.keys())} />
          </div>
        </div>
      )}
      </div>

      {/* File viewer overlay */}
      {viewerPath && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }} onClick={() => setViewerPath(null)}>
          <div className="flex flex-col" style={{ width: '80%', maxWidth: 900, height: '80%', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-default)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between" style={{ padding: '8px 12px', borderBottom: '1px solid var(--color-border-subtle)' }}>
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
