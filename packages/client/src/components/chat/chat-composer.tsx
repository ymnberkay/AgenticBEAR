import { useEffect, useId, useRef, useState } from 'react';
import { Send, Mic, Square, Paperclip, Loader2, ImagePlus, AudioLines, Film, X as XIcon } from 'lucide-react';
import type { Agent } from '@subagent/shared';
import { useVoice } from './use-voice';
import { useAudioRecorder } from './use-audio-recorder';
import { usePublicConfig } from '../../api/hooks/use-config';

/** Client image attachment: base64 data-URI + original filename for the preview label. */
export interface ChatImage { dataUrl: string; name?: string; sizeBytes: number }
/** Client audio attachment: mic recording or an audio file, as a base64 data-URI. */
export interface ChatAudio { dataUrl: string; name?: string; sizeBytes: number }
/** Client video attachment: a video file, as a base64 data-URI. */
export interface ChatVideo { dataUrl: string; name?: string; sizeBytes: number }

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
  /** When defined, audio attachments are enabled (mic record button + audio files). */
  audio?: ChatAudio[];
  onAudioChange?: (audio: ChatAudio[]) => void;
  /** When defined, video attachments are enabled (video files). */
  video?: ChatVideo[];
  onVideoChange?: (video: ChatVideo[]) => void;
}

// Accepted MIME lists are static; the size/count caps come from the server (usePublicConfig).
const ACCEPT_IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
const ACCEPT_AUDIO_MIMES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a'];
const ACCEPT_VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-matroska'];
const MB = 1024 * 1024;

async function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error('read failed'));
    r.onload = () => resolve(String(r.result ?? ''));
    r.readAsDataURL(f);
  });
}

/** Claude-style composer: auto-growing field with voice dictation, attach, agent picker, send. */
export function ChatComposer({ value, onChange, onSend, onAttach, streaming, agents, agentId, onAgentChange, images, onImagesChange, audio, onAudioChange, video, onVideoChange }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaId = useId();
  const agentSelectId = useId();
  const imagesEnabled = !!onImagesChange;
  const audioEnabled = !!onAudioChange;
  const videoEnabled = !!onVideoChange;
  const currentImages = images ?? [];
  const currentAudio = audio ?? [];
  const currentVideo = video ?? [];
  const [dragOver, setDragOver] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Operator-set upload caps (server env / Helm values) — falls back to defaults while loading.
  const { uploads } = usePublicConfig();

  const isAcceptedImage = (f: File) => ACCEPT_IMAGE_MIMES.includes(f.type) && f.size <= uploads.maxImageMb * MB;
  const isAcceptedAudio = (f: File) => ACCEPT_AUDIO_MIMES.includes(f.type) && f.size <= uploads.maxAudioMb * MB;
  const isAcceptedVideo = (f: File) => ACCEPT_VIDEO_MIMES.includes(f.type) && f.size <= uploads.maxVideoMb * MB;

  const addFiles = async (files: File[]) => {
    if (!imagesEnabled && !audioEnabled && !videoEnabled) return;
    setImageError(null);
    const wantImages = files.filter((f) => f.type.startsWith('image/'));
    const wantAudio = files.filter((f) => f.type.startsWith('audio/'));
    const wantVideo = files.filter((f) => f.type.startsWith('video/'));

    if (imagesEnabled && wantImages.length > 0) {
      const room = uploads.maxImages - currentImages.length;
      if (room <= 0) { setImageError(`Max ${uploads.maxImages} images per turn.`); return; }
      const accepted = wantImages.filter(isAcceptedImage).slice(0, room);
      if (accepted.length === 0) { setImageError(`Only PNG/JPEG/GIF/WebP up to ${uploads.maxImageMb} MB.`); return; }
      try {
        const readied = await Promise.all(accepted.map(async (f) => ({ dataUrl: await fileToDataUrl(f), name: f.name, sizeBytes: f.size })));
        onImagesChange!([...currentImages, ...readied]);
      } catch {
        setImageError('Could not read one of the files.');
      }
    }
    if (audioEnabled && wantAudio.length > 0) {
      const room = uploads.maxAudioClips - currentAudio.length;
      if (room <= 0) { setImageError(`Max ${uploads.maxAudioClips} audio clips per turn.`); return; }
      const accepted = wantAudio.filter(isAcceptedAudio).slice(0, room);
      if (accepted.length === 0) { setImageError(`Only MP3/WAV/WebM/OGG/M4A up to ${uploads.maxAudioMb} MB.`); return; }
      try {
        const readied = await Promise.all(accepted.map(async (f) => ({ dataUrl: await fileToDataUrl(f), name: f.name, sizeBytes: f.size })));
        onAudioChange!([...currentAudio, ...readied]);
      } catch {
        setImageError('Could not read one of the files.');
      }
    }
    if (videoEnabled && wantVideo.length > 0) {
      const room = uploads.maxVideos - currentVideo.length;
      if (room <= 0) { setImageError(`Max ${uploads.maxVideos} video${uploads.maxVideos === 1 ? '' : 's'} per turn.`); return; }
      const tooBig = wantVideo.some((f) => ACCEPT_VIDEO_MIMES.includes(f.type) && f.size > uploads.maxVideoMb * MB);
      const accepted = wantVideo.filter(isAcceptedVideo).slice(0, room);
      if (accepted.length === 0) {
        setImageError(tooBig ? `Video too large — max ${uploads.maxVideoMb} MB.` : 'Only MP4/WebM/OGG/MOV/MKV video.');
        return;
      }
      try {
        const readied = await Promise.all(accepted.map(async (f) => ({ dataUrl: await fileToDataUrl(f), name: f.name, sizeBytes: f.size })));
        onVideoChange!([...currentVideo, ...readied]);
      } catch {
        setImageError('Could not read one of the files.');
      }
    }
  };

  const removeImage = (i: number) => {
    if (!imagesEnabled) return;
    onImagesChange!(currentImages.filter((_, idx) => idx !== i));
  };
  const removeAudio = (i: number) => {
    if (!audioEnabled) return;
    onAudioChange!(currentAudio.filter((_, idx) => idx !== i));
  };
  const removeVideo = (i: number) => {
    if (!videoEnabled) return;
    onVideoChange!(currentVideo.filter((_, idx) => idx !== i));
  };

  // Voice dictation appends finalized chunks to the field (browser UI language → works in Turkish too).
  const voice = useVoice((finalText) => onChange((value ? `${value} ` : '') + finalText), navigator.language || 'en-US');

  // Mic recording → attach the clip so it's SENT to the model (unlike dictation, which fills the text).
  const recorder = useAudioRecorder(
    (clip) => {
      if (currentAudio.length >= uploads.maxAudioClips) { setImageError(`Max ${uploads.maxAudioClips} audio clips per turn.`); return; }
      onAudioChange?.([...currentAudio, clip]);
    },
    (msg) => setImageError(msg),
  );

  const autosize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  };
  useEffect(autosize, [value]);

  // Attachments alone are sendable (e.g. a voice message with no typed text).
  const canSend = !streaming && (!!value.trim() || currentImages.length > 0 || currentAudio.length > 0 || currentVideo.length > 0);
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

  const dropEnabled = imagesEnabled || audioEnabled || videoEnabled;
  return (
    <div
      onDragOver={dropEnabled ? (e) => { e.preventDefault(); if (!dragOver) setDragOver(true); } : undefined}
      onDragLeave={dropEnabled ? () => setDragOver(false) : undefined}
      onDrop={dropEnabled ? (e) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) void addFiles(files);
      } : undefined}
      style={{
        border: `1px solid ${dragOver ? 'var(--color-accent)' : voice.listening || recorder.recording ? 'var(--color-accent)' : 'var(--color-border-default)'}`,
        borderRadius: 'var(--radius-lg)', background: dragOver ? 'var(--color-accent-subtle)' : 'var(--color-bg-surface)',
        boxShadow: voice.listening || recorder.recording ? '0 0 0 3px var(--color-accent-subtle)' : 'var(--shadow-sm)',
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
            {currentImages.length}/{uploads.maxImages}
          </span>
        </div>
      )}
      {audioEnabled && currentAudio.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap" style={{ padding: '10px 12px 0' }}>
          {currentAudio.map((a, i) => (
            <div key={i} className="flex items-center gap-2" style={{
              padding: '6px 8px', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)',
            }}>
              <AudioLines style={{ width: 13, height: 13, color: 'var(--color-accent)', flexShrink: 0 }} aria-hidden="true" />
              <audio src={a.dataUrl} controls preload="metadata" style={{ height: 28, maxWidth: 220 }} />
              <span className="truncate" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', maxWidth: 120 }}>
                {a.name ?? `clip ${i + 1}`} · {(a.sizeBytes / 1024).toFixed(0)}k
              </span>
              <button
                type="button"
                onClick={() => removeAudio(i)}
                aria-label={`Remove audio clip ${i + 1}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 2, display: 'flex' }}
              >
                <XIcon style={{ width: 12, height: 12 }} aria-hidden="true" />
              </button>
            </div>
          ))}
          <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            {currentAudio.length}/{uploads.maxAudioClips}
          </span>
        </div>
      )}
      {videoEnabled && currentVideo.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap" style={{ padding: '10px 12px 0' }}>
          {currentVideo.map((v, i) => (
            <div key={i} className="flex items-center gap-2" style={{
              padding: '6px 8px', borderRadius: 'var(--radius-sm)',
              background: 'var(--color-bg-base)', border: '1px solid var(--color-border-subtle)',
            }}>
              <Film style={{ width: 13, height: 13, color: 'var(--color-accent)', flexShrink: 0 }} aria-hidden="true" />
              <video src={v.dataUrl} controls preload="metadata" style={{ height: 72, maxWidth: 160, borderRadius: 4, background: '#000' }} />
              <span className="truncate" style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-secondary)', maxWidth: 120 }}>
                {v.name ?? `video ${i + 1}`} · {(v.sizeBytes / (1024 * 1024)).toFixed(1)}MB
              </span>
              <button
                type="button"
                onClick={() => removeVideo(i)}
                aria-label={`Remove video ${i + 1}`}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)', padding: 2, display: 'flex' }}
              >
                <XIcon style={{ width: 12, height: 12 }} aria-hidden="true" />
              </button>
            </div>
          ))}
          <span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)', color: 'var(--color-text-disabled)' }}>
            {currentVideo.length}/{uploads.maxVideos}
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
        placeholder={streaming ? 'Agent is working… please wait' : recorder.recording ? 'Recording audio…' : voice.listening ? 'Listening…' : 'Message your agent · Enter to send · Shift+Enter for newline'}
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
          {(imagesEnabled || audioEnabled || videoEnabled) && (() => {
            const kinds = [imagesEnabled && 'image', audioEnabled && 'audio', videoEnabled && 'video'].filter(Boolean) as string[];
            const label = `Attach ${kinds.join(' / ')}`;
            return (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={[
                    ...(imagesEnabled ? ACCEPT_IMAGE_MIMES : []),
                    ...(audioEnabled ? ACCEPT_AUDIO_MIMES : []),
                    ...(videoEnabled ? ACCEPT_VIDEO_MIMES : []),
                  ].join(',')}
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
                  aria-label={label}
                  title={`${label} · paste / drop / pick`}
                  className="flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
                  style={{ width: 32, height: 32, background: 'none', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--color-text-secondary)' }}
                >
                  {imagesEnabled ? <ImagePlus style={{ width: 14, height: 14 }} aria-hidden="true" />
                    : videoEnabled ? <Film style={{ width: 14, height: 14 }} aria-hidden="true" />
                    : <AudioLines style={{ width: 14, height: 14 }} aria-hidden="true" />}
                </button>
              </>
            );
          })()}
          {audioEnabled && recorder.supported && (
            <button
              type="button"
              onClick={recorder.toggle}
              aria-label={recorder.recording ? 'Stop recording' : 'Record audio to send'}
              aria-pressed={recorder.recording}
              title={recorder.recording ? 'Stop recording' : 'Record audio · sent to the model as a clip'}
              className="flex items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
              style={{
                height: 32, padding: '0 8px', minWidth: 32, borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: recorder.recording ? 'var(--color-error-subtle)' : 'none',
                border: `1px solid ${recorder.recording ? 'rgba(224,96,96,0.5)' : 'var(--color-border-subtle)'}`,
                color: recorder.recording ? '#e06060' : 'var(--color-text-secondary)',
                animation: recorder.recording ? 'agbpulse 1.4s ease-in-out infinite' : 'none',
              }}
            >
              {recorder.recording
                ? <><Square style={{ width: 12, height: 12 }} aria-hidden="true" /><span style={{ fontSize: 10.5, fontFamily: 'var(--font-mono)' }}>{Math.floor(recorder.seconds / 60)}:{String(recorder.seconds % 60).padStart(2, '0')}</span></>
                : <AudioLines style={{ width: 14, height: 14 }} aria-hidden="true" />}
            </button>
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
