import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createRouter,
  createRoute,
  createRootRoute,
  RouterProvider,
  Outlet,
  redirect,
} from '@tanstack/react-router';
import { AppShell } from './components/layout/app-shell';
import { DashboardPage } from './routes/dashboard';
import { ProjectDetailPage } from './routes/projects/project-detail';
import { ProjectAgentsPage } from './routes/projects/project-agents';
import { ProjectAnalyticsPage } from './routes/projects/project-analytics';
import { ProjectChatPage } from './routes/projects/project-chat';

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

// Project index (redirects to agents by default)
const projectIndexRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/',
  component: ProjectAgentsPage,
});

// Project agents
const projectAgentsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/agents',
  component: ProjectAgentsPage,
});


// Project analytics
const projectAnalyticsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/analytics',
  component: ProjectAnalyticsPage,
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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
