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
        className="p-1 rounded-xl inline-flex gap-1"
        style={{
          background: 'rgba(255, 255, 255, 0.03)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-[12.5px] font-medium rounded-lg transition-all duration-200',
              currentTab === tab.id
                ? 'text-white'
                : 'text-[#5a5a6e] hover:text-[#e2e2e8]',
            )}
            style={
              currentTab === tab.id
                ? {
                    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(139, 92, 246, 0.15))',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                    boxShadow: '0 2px 6px rgba(99, 102, 241, 0.1)',
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
