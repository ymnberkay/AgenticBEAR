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
            className="text-[12.5px] font-medium text-[#8b8b9e]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-[38px] w-full rounded-lg px-3 text-[13.5px] text-[#e2e2e8] placeholder:text-[#3a3a4a]',
            'transition-all duration-200',
            'focus:outline-none',
            error && 'focus:ring-error/20',
            'disabled:opacity-35 disabled:pointer-events-none',
            className,
          )}
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: `1px solid ${error ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`,
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = error ? 'rgba(239, 68, 68, 0.7)' : 'rgba(99, 102, 241, 0.5)';
            e.currentTarget.style.boxShadow = error
              ? '0 0 0 3px rgba(239, 68, 68, 0.1)'
              : '0 0 0 3px rgba(99, 102, 241, 0.1)';
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = error ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.boxShadow = 'none';
            props.onBlur?.(e);
          }}
          {...props}
        />
        {error && (
          <p className="text-[11.5px] text-[#ef4444] font-medium">{error}</p>
        )}
        {helperText && !error && (
          <p className="text-[11.5px] text-[#5a5a6e]">{helperText}</p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
