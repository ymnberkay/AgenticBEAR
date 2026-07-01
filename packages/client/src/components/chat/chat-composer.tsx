import { useEffect, useId, useRef, useState } from 'react';
import { Send, Mic, Square, Paperclip, Loader2, ImagePlus, X as XIcon } from 'lucide-react';
import type { Agent } from '@subagent/shared';
import { useVoice } from './use-voice';

/** Client image attachment: base64 data-URI + original filename for the preview label. */
export interface ChatImage { dataUrl: string; name?: string; sizeBytes: number }

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onAttach?: () => void;
  streaming: boolean;
  agents: Agent[];
  agentId: string;
  onAgentChange: (id: string) => void;
  /** When defined, image attachments are enabled. Composer manages files via these callbacks. */
  images?: ChatImage[];
  onImagesChange?: (images: ChatImage[]) => void;
}

const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024; // 20 MB per image
const ACCEPT_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

function isAcceptedImage(f: File): boolean {
  return ACCEPT_IMAGE_MIMES.includes(f.type) && f.size <= MAX_IMAGE_BYTES;
}

async function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('read failed'));
    r.onload = () => resolve(String(r.result ?? ''));
    r.readAsDataURL(f);
  });
}

/** Claude-style composer: auto-growing field with voice dictation, attach, agent picker, send. */
export function ChatComposer({ value, onChange, onSend, onAttach, streaming, agents, agentId, onAgentChange, images, onImagesChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaId = useId();
  const agentSelectId = useId();
  const imagesEnabled = !!onImagesChange;
  const currentImages = images ?? [];
  const [dragOver, setDragOver] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  const addFiles = async (files: File[]) => {
    if (!imagesEnabled) return;
    setImageError(null);
    const room = MAX_IMAGES - currentImages.length;
    if (room <= 0) { setImageError(`Max ${MAX_IMAGES} images per turn.`); return; }
    const accepted: File[] = [];
    for (const f of files) {
      if (accepted.length >= room) break;
      if (!isAcceptedImage(f)) continue;
      accepted.push(f);
    }
    if (accepted.length === 0) { setImageError('Only PNG/JPEG/GIF/WebP up to 20 MB.'); return; }
    try {
      const readied = await Promise.all(accepted.map(async (f) => ({
        dataUrl: await fileToDataUrl(f),
        name: f.name,
        sizeBytes: f.size,
      })));
      onImagesChange!([...currentImages, ...readied]);
    } catch {
      setImageError('Could not read one of the files.');
    }
  };

  const removeImage = (i: number) => {
    if (!imagesEnabled) return;
    onImagesChange!(currentImages.filter((_, idx) => idx !== i));
  };

  // Voice dictation appends finalized chunks to the field.
  const voice = useVoice((finalText) => onChange((value ? `${value} ` : '') + finalText));

  const autosize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };
  useEffect(autosize, [value]);

  const canSend = !streaming && !!value.trim();
  const shownValue = voice.interim ? `${value}${value ? ' ' : ''}${voice.interim}` : value;

  // Paste handler: intercept clipboard images (Cmd+V screenshot) → add as attachment.
  //                Also keeps the old "large paste → suggest Knowledge" hint for text.
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (imagesEnabled) {
      const items = Array.from(e.clipboardData.items).filter((it) => it.kind === 'file' && it.type.startsWith('image/'));
      if (items.length > 0) {
        e.preventDefault();
        const files = items.map((it) => it.getAsFile()).filter((f): f is File => !!f);
        void addFiles(files);
        return;
      }
    }
    const text = e.clipboardData.getData('text/plain');
    if (text.length > 5000 && onAttach) {
      ref.current?.setAttribute('aria-describedby', `${textareaId}-large-paste-hint`);
    }
  };

  return (
    <div
      onDragOver={imagesEnabled ? (e) => { e.preventDefault(); if (!dragOver) setDragOver(true); } : undefined}
      onDragLeave={imagesEnabled ? () => setDragOver(false) : undefined}
      onDrop={imagesEnabled ? (e) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) void addFiles(files);
      } : undefined}
      style={{
        border: `1px solid ${dragOver ? 'var(--color-accent)' : voice.listening ? 'var(--color-accent)' : 'var(--color-border-default)'}`,
        borderRadius: 'var(--radius-lg)', background: dragOver ? 'var(--color-accent-subtle)' : 'var(--color-bg-surface)',
        boxShadow: voice.listening ? '0 0 0 3px var(--color-accent-subtle)' : 'var(--shadow-sm)',
        transition: 'border-color .15s, box-shadow .15s, background .15s', overflow: 'hidden',
      }}
    >
      {imagesEnabled && currentImages.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap" style={{ padding: '10px 12px 0', borderBottom: currentImages.length > 0 ? '1px dashed var(--color-border-subtle)' : undefined }}>
          {currentImages.map((im, i) => (
            <div key={i} className="relative" style={{
              width: 72, height: 72, borderRadius: 'var(--radius-sm)', overflow: 'hidden',
              background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)',
              position: 'relative',
            }}>
              <img src={im.dataUrl} alt={im.name ?? `image ${i + 1}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <button
                type="button"
                onClick={() => removeImage(i)}
                aria-label={`Remove image ${i + 1}`}
                style={{
                  position: 'absolute', top: 2, right: 2,
                  width: 20, height: 20, borderRadius: '50%',
                  background: 'rgba(2,21,38,0.85)', border: '1px solid rgba(255,255,255,0.2)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff',
                }}
              >
                <XIcon style={{ width: 11, height: 11 }} aria-hidden="true" />
              </button>
            </div>
          ))}
          <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)', marginLeft: 4 }}>
            {currentImages.length}/{MAX_IMAGES}
          </span>
        </div>
      )}
      {imageError && (
        <div role="alert" style={{ padding: '6px 12px 0', fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--color-error)' }}>
          {imageError}
        </div>
      )}
      <label htmlFor={textareaId} className="sr-only">Message your agent</label>
      <textarea
        ref={ref}
        id={textareaId}
        value={shownValue}
        disabled={streaming}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
            e.preventDefault();
            if (canSend) onSend();
          }
        }}
        placeholder={streaming ? 'Agent is working… please wait' : voice.listening ? 'Listening…' : 'Message your agent · Enter to send · Shift+Enter for newline'}
        rows={1}
        aria-label="Message"
        aria-disabled={streaming || undefined}
        style={{
          width: '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent',
          padding: '13px 14px 4px', fontSize: 14, lineHeight: 1.55, color: 'var(--color-text-primary)',
          fontFamily: 'var(--font-sans)', maxHeight: 220, overflowY: 'auto',
          cursor: streaming ? 'not-allowed' : 'text', opacity: streaming ? 0.6 : 1,
        }}
      />
      <div className="flex items-center justify-between" style={{ padding: '6px 8px 7px 10px' }}>
        <div className="flex items-center gap-1.5">
          {/* Agent picker */}
          <label htmlFor={agentSelectId} className="sr-only">Active agent</label>
          <select
            id={agentSelectId}
            value={agentId}
            disabled={streaming}
            onChange={(e) => onAgentChange(e.target.value)}
            title={agents.find((a) => a.id === agentId)?.name}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              height: 32, maxWidth: 200, background: 'var(--color-bg-base)',
              border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-mono)', fontSize: 11.5, padding: '0 8px', cursor: 'pointer',
              borderRadius: 'var(--radius-sm)', outline: 'none', textOverflow: 'ellipsis',
            }}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.role === 'orchestrator' ? '◆ ' : '• '}{a.name}</option>
            ))}
          </select>
          {onAttach && (
            <button
              type="button"
              onClick={onAttach}
              aria-label="Attach knowledge document"
              title="Attach knowledge document"
              className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{ width: 32, height: 32, background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
            >
              <Paperclip style={{ width: 14, height: 14 }} aria-hidden="true" />
            </button>
          )}
          {imagesEnabled && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_IMAGE_MIMES.join(',')}
                multiple
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (files.length > 0) void addFiles(files);
                }}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach image"
                title="Attach image · paste / drop / pick"
                className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                style={{ width: 32, height: 32, background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
              >
                <ImagePlus style={{ width: 14, height: 14 }} aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Voice */}
          {voice.supported && (
            <button
              type="button"
              onClick={voice.toggle}
              aria-label={voice.listening ? 'Stop voice dictation' : 'Start voice dictation'}
              aria-pressed={voice.listening}
              title={voice.listening ? 'Stop' : 'Voice dictation'}
              className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                width: 32, height: 32, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: voice.listening ? 'var(--color-accent)' : 'none',
                border: `1px solid ${voice.listening ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
                color: voice.listening ? '#021526' : 'var(--color-text-secondary)',
                animation: voice.listening ? 'agbpulse 1.4s ease-in-out infinite' : 'none',
              }}
            >
              {voice.listening ? <Square style={{ width: 13, height: 13 }} aria-hidden="true" /> : <Mic style={{ width: 15, height: 15 }} aria-hidden="true" />}
            </button>
          )}
          {/* Send */}
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send message"
            aria-busy={streaming || undefined}
            title="Send (Enter)"
            className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              width: 36, height: 32, borderRadius: 'var(--radius-sm)', border: 'none',
              background: canSend ? 'var(--color-accent)' : 'var(--color-bg-raised)',
              color: canSend ? '#021526' : 'var(--color-text-disabled)',
              cursor: canSend ? 'pointer' : 'not-allowed', transition: 'background .15s',
            }}
          >
            {streaming ? (
              <Loader2 className="animate-spin" style={{ width: 15, height: 15 }} aria-hidden="true" />
            ) : (
              <Send style={{ width: 15, height: 15 }} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
