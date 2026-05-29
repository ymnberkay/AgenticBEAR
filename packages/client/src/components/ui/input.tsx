import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[12.5px] font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-[38px] w-full px-3 text-[13.5px] text-text-primary placeholder:text-text-disabled',
            'transition-all duration-200',
            'focus:outline-none',
            error && 'focus:ring-error/20',
            'disabled:opacity-35 disabled:pointer-events-none',
            className,
          )}
          style={{
            background: 'var(--glass-bg)',
            border: `1px solid ${error ? 'rgba(224, 96, 96, 0.5)' : 'var(--color-border-default)'}`,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = error ? 'rgba(224, 96, 96, 0.7)' : 'rgba(110, 172, 218, 0.5)';
            e.currentTarget.style.boxShadow = error
              ? '0 0 0 3px rgba(224, 96, 96, 0.1)'
              : '0 0 0 3px rgba(110, 172, 218, 0.1)';
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
          <p className="text-[11.5px] text-[#e06060] font-medium">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-[11.5px] text-text-tertiary">{helperText}</p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
