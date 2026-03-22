import type { ReactNode } from 'react';
import { CommandPalette } from './command-palette';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="h-screen overflow-hidden bg-bg-base">
      {children}
      <CommandPalette />
    </div>
  );
}
