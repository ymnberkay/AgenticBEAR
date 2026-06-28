import { useState, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRouter,
  createRoute,
  createRootRoute,
  RouterProvider,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { getToken } from './api/client';
import { useMe } from './api/hooks/use-auth';
import { LoginPage } from './routes/login-page';
import { AppShell } from './components/layout/app-shell';
import { DashboardPage } from './routes/dashboard';
import { ProjectDetailPage } from './routes/projects/project-detail';
import { ProjectAgentsPage } from './routes/projects/project-agents';
import { ProjectChatPage } from './routes/projects/project-chat';
import { ProjectMonitorPage } from './routes/projects/project-monitor';
import { ProjectActivityPage } from './routes/projects/project-activity';

import { ProjectSettingsPage } from './routes/projects/project-settings';
import { RunDetailPage } from './routes/projects/run-detail';
import { TemplatesPage } from './routes/templates-page';
import { SettingsPage } from './routes/settings-page';

// Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Root route
const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

// Dashboard
const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: DashboardPage,
});

// Project detail layout
const projectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  component: ProjectDetailPage,
});

// Project index → Chat (chat-centric entry)
const projectIndexRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/',
  component: ProjectChatPage,
});

// Project agents (the "agentic" workspace)
const projectAgentsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/agents',
  component: ProjectAgentsPage,
});

// Project monitor (live mission control)
const projectMonitorRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/monitor',
  component: ProjectMonitorPage,
});


const projectActivityRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/activity',
  component: ProjectActivityPage,
});

// Analytics folded into Monitor — keep the path working for old links.
const projectAnalyticsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/analytics',
  beforeLoad: ({ params }) => { throw redirect({ to: '/projects/$projectId/monitor', params }); },
});

// Project chat
const projectChatRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/chat',
  component: ProjectChatPage,
});

// Project settings
const projectSettingsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/settings',
  component: ProjectSettingsPage,
});

// Run detail
const runDetailRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/runs/$runId',
  component: RunDetailPage,
});

// Templates
const templatesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/templates',
  component: TemplatesPage,
});

// Global settings
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
});

// Legacy /models path → now a tab inside Settings.
const modelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/models',
  beforeLoad: () => { throw redirect({ to: '/settings', hash: 'models' }); },
});

// Build the route tree
const routeTree = rootRoute.addChildren([
  dashboardRoute,
  projectRoute.addChildren([
    projectIndexRoute,
    projectAgentsRoute,
    projectMonitorRoute,
    projectActivityRoute,
    projectAnalyticsRoute,
    projectChatRoute,
    projectSettingsRoute,
    runDetailRoute,
  ]),
  templatesRoute,
  settingsRoute,
  modelsRoute,
]);

// Create router
const router = createRouter({ routeTree });

// Register types
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

/** Gate the whole app behind login; verifies the stored token via /api/auth/me. */
function AuthGate() {
  const [authed, setAuthed] = useState(!!getToken());
  const me = useMe();

  useEffect(() => {
    const onUnauth = () => setAuthed(false);
    window.addEventListener('auth:unauthorized', onUnauth);
    return () => window.removeEventListener('auth:unauthorized', onUnauth);
  }, []);

  if (!authed || !getToken()) return <LoginPage onSuccess={() => setAuthed(true)} />;
  if (me.isError) return <LoginPage onSuccess={() => { setAuthed(true); me.refetch(); }} />;
  if (me.isLoading) {
    return <div className="h-screen flex items-center justify-center" style={{ background: 'var(--color-bg-base)', color: 'var(--color-text-disabled)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>loading…</div>;
  }
  return <RouterProvider router={router} />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGate />
    </QueryClientProvider>
  );
}
