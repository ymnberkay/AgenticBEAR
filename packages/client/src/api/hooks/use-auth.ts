import { useQuery, useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { User, AuthResult, AuthMethodsInfo, AddEntraUserInput, ChangePasswordInput, EntraDirectoryUser, MfaChallenge, MfaSetupInfo, MfaVerifyInput, CreateUserInput, UpdateUserInput, UserRole, PermissionGroup, GroupUsage, UserUsage, CustomRole, CreateRoleInput, UpdateRoleInput } from '@subagent/shared';
import { apiGet, apiPost, apiPatch, apiDelete, setToken, clearToken, getToken, setSessionBase, clearSessionBase } from '../client';

export function useMe() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiGet<User>('/api/auth/me'),
    enabled: !!getToken(),
    retry: false,
    staleTime: 60_000,
  });
}

/** Enabled login methods (public) — which options the login screen renders. */
export function useAuthMethods() {
  return useQuery({
    queryKey: ['auth', 'methods'],
    queryFn: () => apiGet<AuthMethodsInfo>('/api/auth/methods'),
    staleTime: 5 * 60_000,
    retry: 1,
  });
}

/** Store a completed login (password, MFA or SSO) — token, session base, `me` cache. */
function completeLogin(qc: QueryClient, res: AuthResult): void {
  setToken(res.token);
  // Hub topology: data-plane requests go straight to this user's session pod. The base is
  // known even while the pod is still starting — first requests recover via the wake flow.
  setSessionBase(res.session?.baseUrl ?? '');
  qc.setQueryData(['auth', 'me'], res.user);
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; password: string }) => apiPost<AuthResult | MfaChallenge>('/api/auth/login', body),
    onSuccess: (res) => {
      if ('mfaRequired' in res) return; // second factor still owed — login page shows the code step
      completeLogin(qc, res);
    },
  });
}

/** Second login step when the account has TOTP enabled. */
export function useVerifyMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: MfaVerifyInput) => apiPost<AuthResult>('/api/auth/mfa/verify', body),
    onSuccess: (res) => completeLogin(qc, res),
  });
}

/** Self-service password change — also the forced-rotation step after a provisional password. */
export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ChangePasswordInput) => apiPost<{ token: string; user: User }>('/api/auth/password', body),
    onSuccess: (res) => {
      setToken(res.token); // other sessions are revoked; this one continues on a fresh token
      qc.setQueryData(['auth', 'me'], res.user);
    },
  });
}

// ── TOTP self-service (authed) ──
export function useMfaSetup() {
  return useMutation({ mutationFn: () => apiPost<MfaSetupInfo>('/api/auth/mfa/setup') });
}
export function useMfaEnable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => apiPost<User>('/api/auth/mfa/enable', { code }),
    onSuccess: (user) => qc.setQueryData(['auth', 'me'], user),
  });
}
export function useMfaDisable() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => apiPost<User>('/api/auth/mfa/disable', { code }),
    onSuccess: (user) => qc.setQueryData(['auth', 'me'], user),
  });
}

export function logout(): void {
  clearToken();
  clearSessionBase();
  window.location.reload();
}

// ── User management (admin) ──
export function useUsers() {
  return useQuery({ queryKey: ['auth', 'users'], queryFn: () => apiGet<User[]>('/api/auth/users') });
}
export function useUserUsage() {
  return useQuery({
    queryKey: ['auth', 'users', 'usage'],
    queryFn: () => apiGet<UserUsage[]>('/api/auth/users/usage'),
    staleTime: 30_000,
  });
}
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => apiPost<User>('/api/auth/users', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'users'] }),
  });
}
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...fields }: { id: string } & UpdateUserInput) =>
      apiPatch<User>(`/api/auth/users/${id}`, fields),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'users'] }),
  });
}
export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/auth/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'users'] }),
  });
}

// ── Entra directory picker (admin) ──
export function useSearchEntraUsers(query: string) {
  return useQuery({
    queryKey: ['auth', 'entra-directory', query],
    queryFn: () => apiGet<EntraDirectoryUser[]>(`/api/auth/entra/users?query=${encodeURIComponent(query)}`),
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
    retry: false,
  });
}
export function useAddEntraUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddEntraUserInput) => apiPost<User>('/api/auth/users/from-entra', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'users'] }),
  });
}

// ── Custom roles (admin) ──
export function useRoles() {
  return useQuery({ queryKey: ['auth', 'roles'], queryFn: () => apiGet<CustomRole[]>('/api/auth/roles') });
}
export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleInput) => apiPost<CustomRole>('/api/auth/roles', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'roles'] }),
  });
}
export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...fields }: { id: string } & UpdateRoleInput) => apiPatch<CustomRole>(`/api/auth/roles/${id}`, fields),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'roles'] }),
  });
}
export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/auth/roles/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['auth', 'roles'] }); qc.invalidateQueries({ queryKey: ['auth', 'groups'] }); },
  });
}

// ── Permission groups (admin) ──
export function useGroups() {
  return useQuery({ queryKey: ['auth', 'groups'], queryFn: () => apiGet<PermissionGroup[]>('/api/auth/groups') });
}
export function useGroupUsage() {
  return useQuery({
    queryKey: ['auth', 'groups', 'usage'],
    queryFn: () => apiGet<GroupUsage[]>('/api/auth/groups/usage'),
    staleTime: 30_000,
  });
}
export function useCreateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; role?: string; projectIds?: string[]; tokenQuota?: number | null }) => apiPost<PermissionGroup>('/api/auth/groups', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'groups'] }),
  });
}
export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...fields }: { id: string; name?: string; role?: string; projectIds?: string[]; tokenQuota?: number | null }) =>
      apiPatch<PermissionGroup>(`/api/auth/groups/${id}`, fields),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'groups'] }),
  });
}
export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/api/auth/groups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'groups'] }),
  });
}
