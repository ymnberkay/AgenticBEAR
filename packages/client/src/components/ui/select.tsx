import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { ChevronDown } from 'lucide-react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, className, children, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-[12.5px] font-medium text-text-secondary"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'h-[38px] w-full appearance-none px-3 pr-9 text-[13.5px] text-text-primary',
              'transition-all duration-200',
              'focus:outline-none',
              'disabled:opacity-35 disabled:pointer-events-none',
              className,
            )}
            style={{
              background: 'var(--glass-bg)',
              border: `1px solid ${error ? 'rgba(224, 96, 96, 0.5)' : 'var(--color-border-default)'}`,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(110, 172, 218, 0.5)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(110, 172, 218, 0.1)';
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
          <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary pointer-events-none" />
        </div>
        {error && <p className="text-[11.5px] text-[#e06060] font-medium">{error}</p>}
      </div>
    );
  },
);

Select.displayName = 'Select';
