import { useState } from 'react';
import { BookOpen, Plus, Trash2, Upload } from 'lucide-react';
import { useDocuments, useCreateDocument, useDeleteDocument } from '../../api/hooks/use-documents';
import { useToast } from '../ui/toast';

const inputStyle: React.CSSProperties = {
  width: '100%', height: 34, padding: '0 10px', background: 'var(--color-bg-base)',
  border: '1px solid var(--color-border-default)', color: 'var(--color-text-primary)',
  fontFamily: 'var(--font-mono)', fontSize: 12.5, outline: 'none', borderRadius: 'var(--radius-sm)',
};

/**
 * Knowledge documents bound to one agent — managed from the agent editor. Changes apply
 * immediately (documents save independently of the wizard's Save button). Legacy documents
 * without an agent binding are listed separately: they still reach every internal agent.
 */
export function AgentKnowledge({ projectId, agentId }: { projectId: string; agentId: string }) {
  const { data: docs } = useDocuments(projectId);
  const createDoc = useCreateDocument(projectId);
  const deleteDoc = useDeleteDocument(projectId);
  const { show: showToast } = useToast();

  const [name, setName] = useState('');
  const [content, setContent] = useState('');

  const own = (docs ?? []).filter((d) => d.agentId === agentId);
  const shared = (docs ?? []).filter((d) => !d.agentId);
  const canAdd = !!name.trim() && !!content.trim() && !createDoc.isPending;

  const add = () => {
    if (!canAdd) return;
    createDoc.mutate(
      { name: name.trim(), content, agentId },
      {
        onSuccess: () => { setName(''); setContent(''); showToast('Document attached', { variant: 'success' }); },
        onError: (err) => showToast(err instanceof Error ? err.message : 'Failed to attach', { variant: 'error' }),
      },
    );
  };

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setName(file.name);
    setContent(await file.text());
    e.target.value = '';
  }

  const removeDoc = (id: string) => {
    deleteDoc.mutate(id, {
      onError: (err) => showToast(err instanceof Error ? err.message : 'Delete failed', { variant: 'error' }),
    });
  };

  const docRow = (d: { id: string; name: string; content: string }) => (
    <div key={d.id} className="flex items-center justify-between gap-2" style={{ padding: '7px 10px', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>
      <span className="flex items-center gap-2 min-w-0">
        <BookOpen aria-hidden="true" style={{ width: 12, height: 12, color: 'var(--color-accent)', flexShrink: 0 }} />
        <span className="truncate" style={{ fontSize: 12, color: 'var(--color-text-primary)' }}>{d.name}</span>
      </span>
      <span className="flex items-center gap-2" style={{ flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)' }}>{(d.content.length / 1000).toFixed(1)}k</span>
        <button
          type="button"
          onClick={() => removeDoc(d.id)}
          aria-label={`Delete document ${d.name}`}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-error)', padding: 5, borderRadius: 4, display: 'flex' }}
        >
          <Trash2 style={{ width: 12, height: 12 }} aria-hidden="true" />
        </button>
      </span>
    </div>
  );

  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      <p style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', margin: 0 }}>
        Documents below are injected into this agent's system prompt. Changes apply immediately — no save needed.
      </p>

      <div className="flex flex-col gap-1.5">
        {own.length === 0 && (
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>No documents attached to this agent yet.</span>
        )}
        {own.map(docRow)}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="agent-doc-name" className="sr-only">Document name</label>
        <input id="agent-doc-name" placeholder="document name" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
        <label htmlFor="agent-doc-content" className="sr-only">Document content</label>
        <textarea
          id="agent-doc-content"
          placeholder="paste content…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{ ...inputStyle, height: 88, padding: '7px 10px', resize: 'vertical' }}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={add}
            disabled={!canAdd}
            className="flex items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              height: 32, padding: '0 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 999,
              background: canAdd ? 'var(--color-accent)' : 'var(--color-bg-raised)',
              color: canAdd ? '#021526' : 'var(--color-text-disabled)',
              cursor: canAdd ? 'pointer' : 'not-allowed',
            }}
          >
            <Plus style={{ width: 13, height: 13 }} aria-hidden="true" /> {createDoc.isPending ? 'Attaching…' : 'Attach'}
          </button>
          <label className="flex items-center gap-1.5" style={{ height: 32, padding: '0 12px', fontSize: 11.5, fontFamily: 'var(--font-mono)', background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)', borderRadius: 999, color: 'var(--color-text-tertiary)', cursor: 'pointer' }}>
            <Upload style={{ width: 13, height: 13 }} aria-hidden="true" /> from file
            <input type="file" accept=".txt,.md,.json,.csv,text/*" onChange={onFile} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      {shared.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: 'var(--color-text-tertiary)' }}>
            Shared (legacy) — visible to every internal agent
          </span>
          {shared.map(docRow)}
        </div>
      )}
    </div>
  );
}
