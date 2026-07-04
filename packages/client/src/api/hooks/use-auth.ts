import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { User, AuthResult, CreateUserInput, UserRole, PermissionGroup, GroupUsage, UserUsage } from '@subagent/shared';
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

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; password: string }) => apiPost<AuthResult>('/api/auth/login', body),
    onSuccess: (res) => {
      setToken(res.token);
      // Hub topology: data-plane requests go straight to this user's session pod. The base is
      // known even while the pod is still starting — first requests recover via the wake flow.
      setSessionBase(res.session?.baseUrl ?? '');
      qc.setQueryData(['auth', 'me'], res.user);
    },
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
    mutationFn: ({ id, ...fields }: { id: string; role?: UserRole; groupIds?: string[]; password?: string; tokenQuota?: number | null }) =>
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
    mutationFn: (input: { name: string; role?: UserRole; projectIds?: string[]; tokenQuota?: number | null }) => apiPost<PermissionGroup>('/api/auth/groups', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth', 'groups'] }),
  });
}
export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...fields }: { id: string; name?: string; role?: UserRole; projectIds?: string[]; tokenQuota?: number | null }) =>
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
