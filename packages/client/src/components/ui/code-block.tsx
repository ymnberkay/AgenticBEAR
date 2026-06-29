import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '../../lib/cn';
import { ScrollArea } from './scroll-area';

interface CodeBlockProps {
  code: string;
  showLineNumbers?: boolean;
  maxHeight?: string;
  className?: string;
  language?: string;
  showCopy?: boolean;
}

export function CodeBlock({
  code,
  showLineNumbers = false,
  maxHeight = '400px',
  className,
  language,
  showCopy = true,
}: CodeBlockProps) {
  const lines = code.split('\n');
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // best-effort: fall through silently if clipboard API unavailable
    }
  };

  return (
    <div
      className={cn('relative group/codeblock border border-border-default bg-bg-inset', className)}
      style={{ borderRadius: 'var(--radius-md)' }}
    >
      {(language || showCopy) && (
        <div
          className="flex items-center justify-between px-2.5 py-1.5"
          style={{ borderBottom: '1px solid var(--color-border-subtle)' }}
        >
          {language ? (
            <span className="text-[10.5px] font-mono uppercase tracking-wider text-text-tertiary">
              {language}
            </span>
          ) : (
            <span />
          )}
          {showCopy && (
            <button
              type="button"
              onClick={copy}
              aria-label={copied ? 'Copied' : 'Copy code'}
              className="inline-flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-primary transition-colors px-1.5 py-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3" aria-hidden="true" />
                  <span aria-live="polite">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" aria-hidden="true" />
                  <span>Copy</span>
                </>
              )}
            </button>
          )}
        </div>
      )}
      <ScrollArea maxHeight={maxHeight}>
        <div className="p-2.5">
          <pre className="font-mono text-[12px] leading-relaxed text-text-primary">
            {showLineNumbers ? (
              <table className="border-collapse">
                <tbody>
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td className="pr-3 text-right text-text-disabled select-none align-top w-[1%] whitespace-nowrap">
                        {i + 1}
                      </td>
                      <td className="whitespace-pre break-normal">
                        {line || '\n'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <code className="whitespace-pre break-normal">{code}</code>
            )}
          </pre>
        </div>
      </ScrollArea>
    </div>
  );
}
