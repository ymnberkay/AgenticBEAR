import { useState, type ReactNode } from 'react';
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
}

export function Tabs({ tabs, activeTab, onTabChange, children, className }: TabsProps) {
  const [internalActiveTab, setInternalActiveTab] = useState(tabs[0]?.id ?? '');
  const currentTab = activeTab ?? internalActiveTab;

  const handleTabChange = (tabId: string) => {
    setInternalActiveTab(tabId);
    onTabChange?.(tabId);
  };

  return (
    <div className={cn('flex flex-col', className)}>
      <div
        className="p-1 inline-flex gap-1"
        style={{
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border-subtle)',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium transition-all duration-200',
              currentTab === tab.id
                ? 'text-white'
                : 'text-text-tertiary hover:text-text-primary',
            )}
            style={
              currentTab === tab.id
                ? {
                    background: 'linear-gradient(135deg, rgba(110, 172, 218, 0.2), rgba(109, 181, 138, 0.15))',
                    border: '1px solid rgba(110, 172, 218, 0.25)',
                    boxShadow: '0 2px 6px rgba(110, 172, 218, 0.1)',
                  }
                : { border: '1px solid transparent' }
            }
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            {tab.label}
          </button>
        ))}
      </div>
      {children && <div className="pt-4">{children(currentTab)}</div>}
    </div>
  );
}
