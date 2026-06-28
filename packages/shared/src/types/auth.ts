/** Auth + RBAC types. Roles: admin (full), contributor (edit), viewer (read-only). */
export type UserRole = 'admin' | 'contributor' | 'viewer';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  /** Permission groups this user belongs to (grant project access + role). */
  groupIds: string[];
  createdAt: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  role?: UserRole;
  groupIds?: string[];
}

export interface PermissionGroup {
  id: string;
  name: string;
  role: UserRole;
  /** Projects this group can access. Empty = none (admins always see all). */
  projectIds: string[];
  /**
   * Monthly token budget shared by all group members (input+output). null/0 = unlimited.
   * Consumption resets each calendar month; admins are exempt.
   */
  tokenQuota: number | null;
  createdAt: string;
}

/** Current-month token consumption for a group, against its quota. */
export interface GroupUsage {
  groupId: string;
  period: string; // 'YYYY-MM'
  totalTokens: number;
  costUsd: number;
  requestCount: number;
  quota: number | null;
}

export interface LoginInput {
  username: string;
  password: string;
}

/** Returned once on successful login. */
export interface AuthResult {
  token: string;
  user: User;
}
