import type { ReactNode } from 'react';

import {
  NotificationCenter,
  SocketConnectionStatus,
} from '@/components/notifications';
import Sidebar from '@/components/Sidebar';
import { ThemeToggle } from '@/components/layout/theme-toggle';

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-end gap-3 border-b px-4">
          <SocketConnectionStatus />
          <NotificationCenter />
          <ThemeToggle />
        </header>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
