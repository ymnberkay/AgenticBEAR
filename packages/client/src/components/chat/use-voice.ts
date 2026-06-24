import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Voice dictation via the Web Speech API (SpeechRecognition).
 * Streams interim + final transcripts; `onFinal` receives each finalized chunk
 * so the caller can append it to the composer. Gracefully no-ops where unsupported.
 */

// Minimal typings (not in the standard lib DOM types).
interface SRAlternative { transcript: string }
interface SRResult { 0: SRAlternative; isFinal: boolean }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SpeechRecognitionLike {
  lang: string; continuous: boolean; interimResults: boolean;
  start(): void; stop(): void; abort(): void;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type SRCtor = new () => SpeechRecognitionLike;

function getCtor(): SRCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface UseVoice {
  supported: boolean;
  listening: boolean;
  interim: string;
  toggle: () => void;
  stop: () => void;
}

export function useVoice(onFinal: (text: string) => void, lang = 'en-US'): UseVoice {
  const [supported] = useState(() => !!getCtor());
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript;
        if (r.isFinal) onFinalRef.current(t.trim() + ' ');
        else interimText += t;
      }
      setInterim(interimText);
    };
    rec.onerror = () => { setListening(false); setInterim(''); };
    rec.onend = () => { setListening(false); setInterim(''); recRef.current = null; };
    recRef.current = rec;
    setListening(true);
    try { rec.start(); } catch { setListening(false); }
  }, [lang]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => () => { recRef.current?.abort(); }, []);

  return { supported, listening, interim, toggle, stop };
}
