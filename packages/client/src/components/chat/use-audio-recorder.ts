import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Mic recording via MediaRecorder → a single base64 data-URI clip handed to `onClip`.
 * Distinct from use-voice (dictation): this captures the actual audio to SEND to the model.
 * Gracefully no-ops where unsupported (no getUserMedia / MediaRecorder).
 */

const MAX_SECONDS = 120; // hard stop so a forgotten mic doesn't produce a huge payload

export interface AudioClip { dataUrl: string; name: string; sizeBytes: number }

export interface UseAudioRecorder {
  supported: boolean;
  recording: boolean;
  /** Elapsed seconds while recording (for the little counter). */
  seconds: number;
  toggle: () => void;
}

export function useAudioRecorder(onClip: (clip: AudioClip) => void, onError?: (msg: string) => void): UseAudioRecorder {
  const [supported] = useState(() =>
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined');
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onClipRef = useRef(onClip);
  onClipRef.current = onClip;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const stop = useCallback(() => {
    recRef.current?.stop(); // onstop handler finalizes the clip + releases the mic
  }, []);

  const start = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onErrorRef.current?.('Microphone permission denied.');
      return;
    }
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
      : '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      setRecording(false);
      setSeconds(0);
      recRef.current = null;
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      if (blob.size === 0) return;
      const r = new FileReader();
      r.onload = () => {
        const ext = (rec.mimeType || 'audio/webm').split('/')[1]?.split(';')[0] ?? 'webm';
        onClipRef.current({ dataUrl: String(r.result ?? ''), name: `recording.${ext}`, sizeBytes: blob.size });
      };
      r.readAsDataURL(blob);
    };
    recRef.current = rec;
    setRecording(true);
    setSeconds(0);
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_SECONDS) stop();
        return s + 1;
      });
    }, 1000);
    rec.start();
  }, [stop]);

  const toggle = useCallback(() => {
    if (recording) stop();
    else void start();
  }, [recording, start, stop]);

  // Release the mic if the composer unmounts mid-recording.
  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    const rec = recRef.current;
    if (rec && rec.state !== 'inactive') {
      rec.stream.getTracks().forEach((t) => t.stop());
      try { rec.stop(); } catch { /* already stopping */ }
    }
  }, []);

  return { supported, recording, seconds, toggle };
}
