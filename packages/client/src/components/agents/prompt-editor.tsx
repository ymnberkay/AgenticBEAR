interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function PromptEditor({ value, onChange }: PromptEditorProps) {
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const charCount = value.length;

  return (
    <div>
      <label className="text-[10px] font-medium uppercase text-text-tertiary tracking-[0.08em] block mb-1.5">
        System Prompt
      </label>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="You are a specialist agent responsible for..."
          rows={12}
          className="w-full border border-border-default bg-bg-raised px-3 py-2 font-mono text-[12px] leading-relaxed text-text-secondary placeholder:text-text-disabled resize-y min-h-[160px] transition-colors duration-150 hover:border-border-default focus:outline-none focus:border-[#00d4ff] focus:ring-1 focus:ring-[#00d4ff]/20"
        />
        <div className="absolute bottom-2 right-2.5 flex items-center gap-2.5 text-[10px] text-text-tertiary pointer-events-none">
          <span>{wordCount} words</span>
          <span>{charCount} chars</span>
        </div>
      </div>
    </div>
  );
}
