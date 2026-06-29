import { useId, useMemo } from 'react';
import { AlertCircle, Hash } from 'lucide-react';

interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
  originalValue?: string;
  error?: string;
}

const PROMPT_HIGH_WATER_MARK = 4000;

/** Find unmatched curly placeholders like `{var}` (loose validation). */
function findUnmatchedBraces(text: string): { open: number; close: number } {
  let open = 0;
  let close = 0;
  for (const ch of text) {
    if (ch === '{') open++;
    else if (ch === '}') close++;
  }
  return { open, close };
}

export function PromptEditor({ value, onChange, originalValue, error }: PromptEditorProps) {
  const id = useId();
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const charCount = value.length;
  // Rough token estimate (~ 4 chars/token); good enough for a UX hint.
  const tokenEstimate = Math.ceil(charCount / 4);
  const isDirty = originalValue !== undefined && originalValue !== value;
  const overLimit = charCount > PROMPT_HIGH_WATER_MARK;

  const braceWarning = useMemo(() => {
    const { open, close } = findUnmatchedBraces(value);
    if (open !== close) return `Unmatched curly braces (${open} "{", ${close} "}")`;
    return '';
  }, [value]);

  const errorMessage = error || braceWarning;
  const errorId = `${id}-err`;

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="text-[10px] font-medium uppercase text-text-secondary tracking-[0.08em]">
          System Prompt
        </label>
        {isDirty && (
          <span
            aria-live="polite"
            style={{
              fontSize: 10, fontFamily: 'var(--font-mono)',
              color: 'var(--color-warning)', textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            unsaved
          </span>
        )}
      </div>
      <div className="relative">
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="You are a specialist agent responsible for..."
          rows={12}
          aria-invalid={!!errorMessage}
          aria-describedby={errorMessage ? errorId : undefined}
          spellCheck={false}
          className="w-full border px-3 py-2 font-mono text-[12px] leading-relaxed text-text-secondary placeholder:text-text-disabled resize-y min-h-[160px] transition-colors duration-150 focus:outline-none focus:border-[#7c8cf8] focus:ring-1 focus:ring-[#7c8cf8]/20"
          style={{
            background: 'var(--color-bg-raised)',
            borderColor: errorMessage ? 'rgba(224,96,96,0.5)' : 'var(--color-border-default)',
            borderRadius: 'var(--radius-md)',
          }}
        />
        <div
          aria-hidden="true"
          className="absolute bottom-2 right-2.5 flex items-center gap-2 text-[10px] text-text-secondary pointer-events-none"
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          <span>{wordCount}w</span>
          <span>{charCount}c</span>
          <span className="inline-flex items-center gap-1">
            <Hash style={{ width: 9, height: 9 }} /> ~{tokenEstimate} tok
          </span>
        </div>
      </div>
      {errorMessage && (
        <p
          id={errorId}
          role={error ? 'alert' : undefined}
          className="flex items-center gap-1 mt-1.5"
          style={{ fontSize: 11, color: 'var(--color-error)', fontFamily: 'var(--font-mono)' }}
        >
          <AlertCircle style={{ width: 11, height: 11 }} aria-hidden="true" />
          {errorMessage}
        </p>
      )}
      {!errorMessage && overLimit && (
        <p
          className="flex items-center gap-1 mt-1.5"
          style={{ fontSize: 11, color: 'var(--color-warning)', fontFamily: 'var(--font-mono)' }}
        >
          <AlertCircle style={{ width: 11, height: 11 }} aria-hidden="true" />
          Long prompt ({charCount.toLocaleString()} chars). Consider trimming for cost.
        </p>
      )}
    </div>
  );
}
