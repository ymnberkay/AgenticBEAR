interface PromptEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export function PromptEditor({ value, onChange }: PromptEditorProps) {
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0;
  const charCount = value.length;

  return (
    <div>
      <label className="text-[10px] font-medium uppercase text-[#5a5a5a] tracking-[0.08em] block mb-1.5">
        System Prompt
      </label>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="You are a specialist agent responsible for..."
          rows={12}
          className="w-full rounded-md border border-[#333333] bg-[#252526] px-3 py-2 font-mono text-[12px] leading-relaxed text-[#858585] placeholder:text-[#5a5a5a] resize-y min-h-[160px] transition-colors duration-150 hover:border-[#333333] focus:outline-none focus:border-[#0078d4] focus:ring-1 focus:ring-[#0078d4]/20"
        />
        <div className="absolute bottom-2 right-2.5 flex items-center gap-2.5 text-[10px] text-[#5a5a5a] pointer-events-none">
          <span>{wordCount} words</span>
          <span>{charCount} chars</span>
        </div>
      </div>
    </div>
  );
}
