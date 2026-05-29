import { useEffect, useRef } from 'react';
import { useRunStore } from '../../stores/run.store';
import { cn } from '../../lib/cn';

interface StreamingOutputProps {
  className?: string;
}

export function StreamingOutput({ className }: StreamingOutputProps) {
  const output = useRunStore((s) => s.streamingOutput);
  const isStreaming = useRunStore((s) => s.isStreaming);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [output]);

  if (!output && !isStreaming) return null;

  return (
    <div
      ref={containerRef}
      className={cn(
        'overflow-hidden',
        className,
      )}
      style={{
        maxHeight: '400px',
        background: 'var(--color-bg-card)',
        border: '1px solid var(--color-border-default)',
        overflowY: 'auto',
      }}
    >
      <div
        className="sticky top-0 flex items-center justify-between px-5 py-3 z-10"
        style={{
          background: 'rgba(7, 13, 20, 0.95)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <span className="text-[10px] font-semibold text-text-tertiary uppercase tracking-wider">
          Live Output
        </span>
        {isStreaming && (
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#6EACDA] animate-pulse" />
            <span className="text-[10px] text-[#6EACDA] font-medium">Streaming</span>
          </span>
        )}
      </div>
      <pre className="p-4 font-mono text-[12px] leading-relaxed text-text-secondary whitespace-pre-wrap break-words overflow-x-hidden">
        {output}
        {isStreaming && (
          <span className="inline-block w-[6px] h-[14px] bg-[#6EACDA]/70 animate-cursor-blink ml-px align-middle" />
        )}
      </pre>
    </div>
  );
}
