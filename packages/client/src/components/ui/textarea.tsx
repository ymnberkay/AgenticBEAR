import { forwardRef, useId, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  mono?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, mono = false, className, id, required, ...props }, ref) => {
    const autoId = useId();
    const textareaId = id || autoId;
    const errorId = `${textareaId}-error`;
    const helperId = `${textareaId}-helper`;
    const describedBy =
      [error ? errorId : null, !error && helperText ? helperId : null].filter(Boolean).join(' ') || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-[12px] font-medium text-text-secondary"
          >
            {label}
            {required && (
              <span aria-hidden="true" style={{ color: '#e06060', marginLeft: 2 }}>
                *
              </span>
            )}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          className={cn(
            'w-full border bg-white/[0.03] px-2.5 py-2 text-[13px] text-text-primary placeholder:text-text-disabled resize-y min-h-[72px]',
            'rounded-[var(--radius-md)]',
            'border-white/[0.06]',
            'transition-colors duration-100',
            'hover:border-white/[0.10]',
            'focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/15',
            error && 'border-error focus:border-error focus:ring-error/15',
            'disabled:opacity-35 disabled:pointer-events-none disabled:cursor-not-allowed',
            mono && 'font-mono text-[12px] leading-relaxed',
            className,
          )}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="text-[11px] text-error">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="text-[11px] text-text-tertiary">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';
