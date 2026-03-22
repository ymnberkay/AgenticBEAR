import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  mono?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, mono = false, className, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-[12px] font-medium text-white/40"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'w-full border bg-white/[0.03] px-2.5 py-2 text-[13px] text-text-primary placeholder:text-text-disabled resize-y min-h-[72px]',
            'border-white/[0.06]',
            'transition-colors duration-100',
            'hover:border-white/[0.10]',
            'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/15',
            error && 'border-error focus:border-error focus:ring-error/15',
            'disabled:opacity-35 disabled:pointer-events-none',
            mono && 'font-mono text-[12px] leading-relaxed',
            className,
          )}
          {...props}
        />
        {error && <p className="text-[11px] text-error">{error}</p>}
        {helperText && !error && (
          <p className="text-[11px] text-text-tertiary">{helperText}</p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
