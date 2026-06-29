import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className, id, required, ...props }, ref) => {
    const autoId = useId();
    const inputId = id || autoId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;
    const describedBy =
      [error ? errorId : null, !error && helperText ? helperId : null].filter(Boolean).join(' ') || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[12.5px] font-medium text-text-secondary"
          >
            {label}
            {required && (
              <span aria-hidden="true" style={{ color: '#e06060', marginLeft: 2 }}>
                *
              </span>
            )}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          aria-required={required || undefined}
          className={cn(
            'h-[38px] w-full px-3 text-[13.5px] text-text-primary placeholder:text-text-disabled',
            'transition-all duration-200',
            'focus:outline-none',
            error && 'focus:ring-error/20',
            'disabled:opacity-35 disabled:pointer-events-none disabled:cursor-not-allowed',
            className,
          )}
          style={{
            background: 'var(--glass-bg)',
            border: `1px solid ${error ? 'rgba(224, 96, 96, 0.5)' : 'var(--color-border-default)'}`,
            borderRadius: 'var(--radius-md)',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = error ? 'rgba(224, 96, 96, 0.7)' : 'rgba(124,140,248, 0.5)';
            e.currentTarget.style.boxShadow = error
              ? '0 0 0 3px rgba(224, 96, 96, 0.1)'
              : '0 0 0 3px rgba(124,140,248, 0.1)';
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = error ? 'rgba(224, 96, 96, 0.5)' : 'var(--color-border-default)';
            e.currentTarget.style.boxShadow = 'none';
            props.onBlur?.(e);
          }}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="text-[11.5px] text-[#e06060] font-medium">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="text-[11.5px] text-text-tertiary">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
