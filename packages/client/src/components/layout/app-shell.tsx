import type { ReactNode } from 'react';
import { CommandPalette } from './command-palette';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="relative h-screen overflow-hidden bg-bg-base">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(1200px 540px at 8% -18%, rgba(212,146,78,0.13), transparent 60%), radial-gradient(920px 520px at 110% 0%, rgba(107,191,160,0.09), transparent 62%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            'linear-gradient(rgba(196,142,88,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(196,142,88,0.06) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(circle at center, black 30%, transparent 85%)',
        }}
      />
      <div className="relative z-10 h-full animate-fade-in">
        {children}
      </div>
      <CommandPalette />
    </div>
  );
}
