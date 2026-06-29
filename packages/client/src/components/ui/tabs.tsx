import { useState, useRef, useId, type ReactNode, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';

interface Tab {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface TabsProps {
  tabs: Tab[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  children?: (activeTabId: string) => ReactNode;
  className?: string;
  /** Optional accessible label for the tablist (for screen readers). */
  ariaLabel?: string;
}

export function Tabs({ tabs, activeTab, onTabChange, children, className, ariaLabel }: TabsProps) {
  const [internalActiveTab, setInternalActiveTab] = useState(tabs[0]?.id ?? '');
  const currentTab = activeTab ?? internalActiveTab;
  const buttonsRef = useRef<(HTMLButtonElement | null)[]>([]);
  const groupId = useId();

  const handleTabChange = (tabId: string) => {
    setInternalActiveTab(tabId);
    onTabChange?.(tabId);
  };

  const focusTab = (index: number) => {
    const safe = (index + tabs.length) % tabs.length;
    const btn = buttonsRef.current[safe];
    btn?.focus();
    const tab = tabs[safe];
    if (tab) handleTabChange(tab.id);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        focusTab(index + 1);
        break;
      case 'ArrowLeft':
        e.preventDefault();
        focusTab(index - 1);
        break;
      case 'Home':
        e.preventDefault();
        focusTab(0);
        break;
      case 'End':
        e.preventDefault();
        focusTab(tabs.length - 1);
        break;
    }
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        aria-orientation="horizontal"
        className="p-1 inline-flex gap-1"
        style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border-subtle)',
        }}
      >
        {tabs.map((tab, i) => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              ref={(el) => { buttonsRef.current[i] = el; }}
              role="tab"
              type="button"
              aria-selected={isActive}
              aria-controls={`${groupId}-panel-${tab.id}`}
              id={`${groupId}-tab-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => handleTabChange(tab.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c8cf8]',
                isActive ? 'text-white' : 'text-text-secondary hover:text-text-primary',
              )}
              style={
                isActive
                  ? {
                      background: 'linear-gradient(135deg, rgba(124,140,248, 0.2), rgba(109, 181, 138, 0.15))',
                      border: '1px solid rgba(124,140,248, 0.25)',
                      boxShadow: '0 2px 6px rgba(124,140,248, 0.1)',
                      minHeight: 32,
                    }
                  : { border: '1px solid transparent', minHeight: 32 }
              }
            >
              {tab.icon && <span className="shrink-0" aria-hidden="true">{tab.icon}</span>}
              {tab.label}
            </button>
          );
        })}
      </div>
      {children && (
        <div
          role="tabpanel"
          id={`${groupId}-panel-${currentTab}`}
          aria-labelledby={`${groupId}-tab-${currentTab}`}
          tabIndex={0}
          className="pt-4 focus-visible:outline-none"
        >
          {children(currentTab)}
        </div>
      )}
    </div>
  );
}
