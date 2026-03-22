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
            className="text-[12.5px] font-medium text-[#8b8b9e]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'h-[38px] w-full appearance-none rounded-lg px-3 pr-9 text-[13.5px] text-[#e2e2e8]',
              'transition-all duration-200',
              'focus:outline-none',
              'disabled:opacity-35 disabled:pointer-events-none',
              className,
            )}
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: `1px solid ${error ? 'rgba(239, 68, 68, 0.5)' : 'rgba(255, 255, 255, 0.08)'}`,
            }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.5)';
              e.currentTarget.style.boxShadow = '0 0 0 3px rgba(99, 102, 241, 0.1)';
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.boxShadow = 'none';
              props.onBlur?.(e);
            }}
            {...props}
          >
            {children}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5a5a6e] pointer-events-none" />
        </div>
        {error && <p className="text-[11.5px] text-[#ef4444] font-medium">{error}</p>}
      </div>
    );
  },
);

Select.displayName = 'Select';
