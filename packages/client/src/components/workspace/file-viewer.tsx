import { useMemo, useState } from 'react';
import { FileCode, Loader2, ImageIcon, AlertTriangle, Download } from 'lucide-react';
import { CodeBlock } from '../ui/code-block';
import { useFileContent } from '../../api/hooks/use-workspace';

interface FileViewerProps {
  projectId: string;
  filePath: string | null;
}

const TEXT_EXTS = new Set([
  'txt', 'md', 'json', 'yaml', 'yml', 'toml', 'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs',
  'html', 'htm', 'css', 'scss', 'sass', 'less', 'py', 'rb', 'go', 'rs', 'java', 'kt',
  'c', 'cpp', 'h', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'sql', 'xml', 'svg',
  'gitignore', 'env', 'lock', 'log', 'csv', 'tsv',
]);
const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'ico']);
const LARGE_FILE_BYTES = 1_500_000; // 1.5 MB
const LARGE_LINE_THRESHOLD = 20_000;

function extOf(path: string): string {
  const idx = path.lastIndexOf('.');
  if (idx < 0) return '';
  return path.slice(idx + 1).toLowerCase();
}

function looksBinary(content: string): boolean {
  // Quick heuristic: a non-trivial proportion of control bytes / NULs indicates binary.
  const sample = content.slice(0, 4000);
  if (!sample) return false;
  let suspicious = 0;
  for (let i = 0; i < sample.length; i++) {
    const code = sample.charCodeAt(i);
    if (code === 0) return true;
    if (code < 9 || (code > 13 && code < 32)) suspicious++;
  }
  return suspicious / sample.length > 0.05;
}

export function FileViewer({ projectId, filePath }: FileViewerProps) {
  const { data, isLoading, error } = useFileContent(projectId, filePath ?? '');
  const [forceShow, setForceShow] = useState(false);

  const ext = filePath ? extOf(filePath) : '';
  const isImage = IMAGE_EXTS.has(ext);
  const content = data?.content ?? '';
  const byteSize = content.length;
  const tooLarge = byteSize > LARGE_FILE_BYTES;
  const lineCount = useMemo(() => content.split('\n').length, [content]);
  const tooManyLines = lineCount > LARGE_LINE_THRESHOLD;
  const binary = useMemo(() => !isImage && content && looksBinary(content), [content, isImage]);
  const isText = TEXT_EXTS.has(ext) || (!binary && !isImage);

  // Reset force-show when the file changes.
  useMemo(() => { setForceShow(false); }, [filePath]);

  if (!filePath) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-center">
        <FileCode className="h-7 w-7 text-text-secondary mb-2.5" aria-hidden="true" />
        <p className="text-[12px] text-text-secondary">Select a file to view its contents</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-12" role="status" aria-live="polite">
        <Loader2 className="h-4 w-4 text-text-secondary animate-spin" aria-hidden="true" />
        <span className="sr-only">Loading file…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-center" role="alert">
        <p className="text-[12px] text-error">Failed to load file</p>
        <p className="text-[11px] text-text-secondary mt-1">{(error as Error).message}</p>
      </div>
    );
  }

  const renderHeader = () => (
    <div
      className="flex items-center gap-2 border-b border-border-default px-3 py-2 shrink-0"
      style={{ background: 'var(--color-bg-raised)' }}
    >
      <FileCode className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
      <span className="text-[11px] font-mono text-text-primary truncate" title={filePath}>
        {filePath}
      </span>
      <span className="ml-auto text-[10.5px] text-text-secondary font-mono" aria-label="File size">
        {formatBytes(byteSize)}{tooManyLines ? ` · ${lineCount.toLocaleString()} lines` : ''}
      </span>
    </div>
  );

  if (binary && !isImage && !forceShow) {
    return (
      <div className="flex flex-col h-full">
        {renderHeader()}
        <div className="flex flex-col items-center justify-center flex-1 text-center px-6 py-12">
          <AlertTriangle className="h-7 w-7 mb-3" style={{ color: 'var(--color-warning)' }} aria-hidden="true" />
          <p className="text-[13px] text-text-primary font-medium">Binary file</p>
          <p className="text-[12px] text-text-secondary mt-1 max-w-[360px]">
            This file doesn't look like text. Rendering it could freeze the viewer or show garbled characters.
          </p>
          <button
            type="button"
            onClick={() => setForceShow(true)}
            className="inline-flex items-center gap-1.5 mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              height: 32, padding: '0 14px',
              background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-default)',
              color: 'var(--color-text-primary)', fontSize: 12, borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
            }}
          >
            <Download style={{ width: 12, height: 12 }} aria-hidden="true" /> Show anyway
          </button>
        </div>
      </div>
    );
  }

  if (isImage) {
    return (
      <div className="flex flex-col h-full">
        {renderHeader()}
        <div className="flex-1 flex items-center justify-center overflow-auto p-4" style={{ background: 'var(--color-bg-base)' }}>
          {/* Content is a server-loaded data URL or base64 string; rendered as data URI via blob URL fallback */}
          <ImagePreview content={content} alt={filePath} />
        </div>
      </div>
    );
  }

  if (tooLarge && !forceShow) {
    return (
      <div className="flex flex-col h-full">
        {renderHeader()}
        <div className="flex flex-col items-center justify-center flex-1 text-center px-6 py-12">
          <AlertTriangle className="h-7 w-7 mb-3" style={{ color: 'var(--color-warning)' }} aria-hidden="true" />
          <p className="text-[13px] text-text-primary font-medium">Large file ({formatBytes(byteSize)})</p>
          <p className="text-[12px] text-text-secondary mt-1 max-w-[360px]">
            Rendering very large files inline can slow the browser. Continue anyway?
          </p>
          <button
            type="button"
            onClick={() => setForceShow(true)}
            className="inline-flex items-center gap-1.5 mt-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]"
            style={{
              height: 32, padding: '0 14px',
              background: 'var(--color-bg-raised)', border: '1px solid var(--color-border-default)',
              color: 'var(--color-text-primary)', fontSize: 12, borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
            }}
          >
            Show file anyway
          </button>
        </div>
      </div>
    );
  }

  // Truncate over-long content to keep the viewer responsive.
  const displayContent = tooManyLines && !forceShow
    ? content.split('\n').slice(0, LARGE_LINE_THRESHOLD).join('\n') + `\n\n… ${(lineCount - LARGE_LINE_THRESHOLD).toLocaleString()} more lines hidden`
    : content;

  return (
    <div className="flex flex-col h-full">
      {renderHeader()}
      <div className="flex-1 overflow-auto">
        <CodeBlock
          code={displayContent}
          showLineNumbers
          maxHeight="none"
          className="!rounded-none !border-0"
          language={isText ? ext || 'text' : undefined}
        />
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function ImagePreview({ content, alt }: { content: string; alt: string }) {
  // Detect whether content is already a data URL or raw base64; build a safe src.
  let src = content;
  if (!/^data:image\//i.test(content)) {
    // Best-effort: assume base64 + try png. The API should ideally send a data URL already.
    src = `data:image/${alt.split('.').pop() || 'png'};base64,${content}`;
  }
  return (
    <div className="flex flex-col items-center gap-3 max-w-full">
      <ImageIcon className="h-5 w-5 text-text-secondary" aria-hidden="true" />
      <img
        src={src}
        alt={alt}
        style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 240px)', objectFit: 'contain', borderRadius: 4, background: 'var(--color-bg-base)' }}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    </div>
  );
}
