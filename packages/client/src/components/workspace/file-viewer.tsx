import { FileCode, Loader2 } from 'lucide-react';
import { CodeBlock } from '../ui/code-block';
import { useFileContent } from '../../api/hooks/use-workspace';

interface FileViewerProps {
  projectId: string;
  filePath: string | null;
}

export function FileViewer({ projectId, filePath }: FileViewerProps) {
  const { data, isLoading, error } = useFileContent(projectId, filePath ?? '');

  if (!filePath) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-center">
        <FileCode className="h-7 w-7 text-text-disabled mb-2.5" />
        <p className="text-[12px] text-text-disabled">Select a file to view its contents</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-12">
        <Loader2 className="h-4 w-4 text-text-disabled animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-12 text-center">
        <p className="text-[12px] text-error">Failed to load file</p>
        <p className="text-[11px] text-text-disabled mt-1">{(error as Error).message}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* File header */}
      <div className="flex items-center gap-2 border-b border-border-default px-2.5 py-1.5 shrink-0 bg-bg-raised">
        <FileCode className="h-3.5 w-3.5 text-text-disabled" />
        <span className="text-[11px] font-mono text-text-secondary truncate">
          {filePath}
        </span>
      </div>

      {/* Code content */}
      <div className="flex-1 overflow-auto">
        <CodeBlock
          code={data?.content ?? ''}
          showLineNumbers
          maxHeight="none"
          className="border-0 rounded-none"
        />
      </div>
    </div>
  );
}
