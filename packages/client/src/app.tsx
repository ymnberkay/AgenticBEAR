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
import { authHeaders, getToken, setToken, setSessionBase } from './api/client';
import { useMe } from './api/hooks/use-auth';
import { LoginPage } from './routes/login-page';
import { AppShell } from './components/layout/app-shell';
import { DashboardPage } from './routes/dashboard';
import { ProjectDetailPage } from './routes/projects/project-detail';
import { ProjectAgentsPage } from './routes/projects/project-agents';
import { ProjectChatPage } from './routes/projects/project-chat';
import { ProjectMonitorPage } from './routes/projects/project-monitor';
import { ProjectActivityPage } from './routes/projects/project-activity';
import { ProjectIssuesPage } from './routes/projects/project-issues';
import { ProjectGoalsPage } from './routes/projects/project-goals';

import { ProjectSettingsPage } from './routes/projects/project-settings';
import { RunDetailPage } from './routes/projects/run-detail';
import { TemplatesPage } from './routes/templates-page';
import { SettingsPage } from './routes/settings-page';
import { GatewayPage } from './routes/gateway';

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
  validateSearch: (search: Record<string, unknown>) => ({
    action: (search.action as string) || undefined,
    userId: (search.userId as string) || undefined,
    search: (search.search as string) || undefined,
    from: (search.from as string) || undefined,
    to: (search.to as string) || undefined,
    page: search.page ? Number(search.page) : undefined,
  }),
  component: ProjectActivityPage,
});

const projectIssuesRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/issues',
  component: ProjectIssuesPage,
});

const projectGoalsRoute = createRoute({
  getParentRoute: () => projectRoute,
  path: '/goals',
  component: ProjectGoalsPage,
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

// Gateway control center (the second top-level area alongside the dashboard).
const gatewayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/gateway',
  component: GatewayPage,
});

// Legacy /models path → now the Models section of the Gateway area.
const modelsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/models',
  beforeLoad: () => { throw redirect({ to: '/gateway', hash: 'models' }); },
});

// Build the route tree
const routeTree = rootRoute.addChildren([
  dashboardRoute,
  projectRoute.addChildren([
    projectIndexRoute,
    projectAgentsRoute,
    projectMonitorRoute,
    projectActivityRoute,
    projectIssuesRoute,
    projectGoalsRoute,
    projectAnalyticsRoute,
    projectChatRoute,
    projectSettingsRoute,
    runDetailRoute,
  ]),
  templatesRoute,
  settingsRoute,
  gatewayRoute,
  modelsRoute,
]);

const router = createRouter({
  routeTree,
  defaultPreload: false,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// ── Auth gate ──────────────────────────────────────────────────────────────────

/**
 * SSO callback lands on /#sso_token=… (or /#sso_error=…) — the token rides the URL fragment so
 * it never reaches server/proxy logs. Consumed once at module load, before React queries run.
 */
function consumeSsoFragment(): { token?: string; error?: string; notice?: string } {
  const h = window.location.hash;
  const strip = () => window.history.replaceState(null, '', window.location.pathname + window.location.search);
  if (h.startsWith('#sso_token=')) {
    strip();
    return { token: decodeURIComponent(h.slice('#sso_token='.length)) };
  }
  if (h.startsWith('#sso_error=')) {
    strip();
    return { error: decodeURIComponent(h.slice('#sso_error='.length)) };
  }
  // Email-verification landing (from the confirmation email).
  if (h === '#verified=1') {
    strip();
    return { notice: 'Email confirmed — your account is active. Please sign in.' };
  }
  if (h.startsWith('#verify_error=')) {
    strip();
    return { error: decodeURIComponent(h.slice('#verify_error='.length)) };
  }
  return {};
}

const ssoResult = consumeSsoFragment();
if (ssoResult.token) setToken(ssoResult.token);

function AuthGate() {
  const [authed, setAuthed] = useState(!!getToken());
  const me = useMe();

  useEffect(() => {
    const onUnauth = () => setAuthed(false);
    window.addEventListener('auth:unauthorized', onUnauth);
    return () => window.removeEventListener('auth:unauthorized', onUnauth);
  }, []);

  // After an SSO sign-in the hub hasn't told us where the session pod lives (password logins get
  // it in the login response). Hub answers /api/auth/session; standalone 404s → same-origin.
  useEffect(() => {
    if (!ssoResult.token) return;
    ssoResult.token = undefined; // one-shot
    fetch('/api/auth/session', { headers: authHeaders() })
      .then((r) => (r.ok ? (r.json() as Promise<{ baseUrl?: string }>) : null))
      .then((info) => { if (info?.baseUrl) setSessionBase(info.baseUrl); })
      .catch(() => {});
  }, []);

  if (!authed || !getToken()) return <LoginPage onSuccess={() => setAuthed(true)} notice={ssoResult.error ?? ssoResult.notice} />;
  if (me.isError) return <LoginPage onSuccess={() => { setAuthed(true); me.refetch(); }} notice="Your session has expired. Please sign in again." />;
  if (me.isLoading) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="h-screen flex flex-col items-center justify-center gap-3"
        style={{ background: 'var(--color-bg-base)' }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            border: '2px solid var(--color-border-subtle)',
            borderTopColor: 'var(--color-accent)',
            borderRadius: '50%',
            animation: 'spin 0.9s linear infinite',
          }}
        />
        <span style={{ color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          AgenticBEAR · loading workspace…
        </span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
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
