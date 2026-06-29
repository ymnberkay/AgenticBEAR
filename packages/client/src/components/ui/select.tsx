import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, helperText, className, children, id, required, ...props }, ref) => {
    const autoId = useId();
    const selectId = id || autoId;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;
    const describedBy =
      [error ? errorId : null, !error && helperText ? helperId : null].filter(Boolean).join(' ') || undefined;

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
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
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            className={cn(
              'h-[38px] w-full appearance-none px-3 pr-9 text-[13.5px] text-text-primary',
              'transition-all duration-200',
              'focus:outline-none',
              'disabled:opacity-35 disabled:pointer-events-none disabled:cursor-not-allowed',
              className,
            )}
            style={{
              background: 'var(--glass-bg)',
              border: `1px solid ${error ? 'rgba(224, 96, 96, 0.5)' : 'var(--color-border-default)'}`,
              borderRadius: 'var(--radius-md)',
              padding: '0 34px 0 12px',
              textOverflow: 'ellipsis',
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(124,140,248, 0.5)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,140,248, 0.1)';
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border-default)';
              e.currentTarget.style.boxShadow = 'none';
              props.onBlur?.(e);
            }}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary pointer-events-none"
          />
        </div>
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

Select.displayName = 'Select';
