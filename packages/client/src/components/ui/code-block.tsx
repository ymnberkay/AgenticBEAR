import { cn } from '../../lib/cn';
import { ScrollArea } from './scroll-area';

interface CodeBlockProps {
  code: string;
  showLineNumbers?: boolean;
  maxHeight?: string;
  className?: string;
}

export function CodeBlock({
  code,
  showLineNumbers = false,
  maxHeight = '400px',
  className,
}: CodeBlockProps) {
  const lines = code.split('\n');

  return (
    <ScrollArea
      maxHeight={maxHeight}
      className={cn(
        'rounded border border-[#333333] bg-[#1e1e1e]',
        className,
      )}
    >
      <div className="p-2.5">
        <pre className="font-mono text-[12px] leading-relaxed text-[#cccccc]">
          {showLineNumbers ? (
            <table className="border-collapse">
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td className="pr-3 text-right text-[#5a5a5a] select-none align-top w-[1%] whitespace-nowrap">
                      {i + 1}
                    </td>
                    <td className="whitespace-pre-wrap break-all">
                      {line || '\n'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <code className="whitespace-pre-wrap break-all">{code}</code>
          )}
        </pre>
      </div>
    </ScrollArea>
  );
}
