/** Auth + RBAC types. Roles: admin (full), contributor (edit), viewer (read-only). */
export type UserRole = 'admin' | 'contributor' | 'viewer';

/** Account lifecycle: 'active' can sign in; 'pending' awaits email verification. */
export type UserStatus = 'active' | 'pending';

export interface User {
  id: string;
  username: string;
  role: UserRole;
  /** Permission groups this user belongs to (grant project access + role). */
  groupIds: string[];
  /**
   * Personal monthly token budget (input+output). null/0 = unlimited. Enforced in addition to
   * any group quota — whichever limit is hit first blocks the request. Admins are exempt.
   */
  tokenQuota: number | null;
  /** Email from SSO claims (JIT-provisioned users) or empty for local accounts. */
  email?: string;
  /** True once the user confirmed a TOTP authenticator (Settings → 2FA). */
  totpEnabled?: boolean;
  /** Provisional password (seeded default / admin reset) — client forces a change at login. */
  mustChangePassword?: boolean;
  /** 'pending' until the user confirms their email; can't sign in until 'active'. */
  status?: UserStatus;
  /** External identities linked to this account ('entra' | 'oidc' | 'github'). */
  identityProviders?: SsoProviderId[];
  createdAt: string;
}

export interface CreateUserInput {
  username: string;
  password: string;
  role?: UserRole;
  groupIds?: string[];
  /** Personal monthly token budget. null/omitted = unlimited. */
  tokenQuota?: number | null;
  /** Optional email — when set and email verification is enabled, sends a confirmation link. */
  email?: string;
}

export interface UpdateUserInput {
  role?: UserRole;
  groupIds?: string[];
  password?: string;
  /** Personal monthly token budget. null = unlimited. */
  tokenQuota?: number | null;
  /** Admin: clear the user's TOTP enrollment (lost device). */
  resetMfa?: boolean;
  /** Admin: invalidate every outstanding session token ("log out everywhere"). */
  revokeSessions?: boolean;
}

/** POST /api/auth/password — self-service change; also the forced-rotation step at login. */
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/** One Entra directory hit (GET /api/auth/entra/users?query=…, admin). */
export interface EntraDirectoryUser {
  /** Directory object id — matches the `oid` claim at login, so the identity pre-links. */
  id: string;
  displayName: string;
  email: string;
}

/** POST /api/auth/users/from-entra — create a local user bound to a directory identity. */
export interface AddEntraUserInput {
  id: string;
  email: string;
  displayName?: string;
  role?: UserRole;
  groupIds?: string[];
}

/** Current-month token consumption for a single user, against their personal quota. */
export interface UserUsage {
  userId: string;
  period: string; // 'YYYY-MM'
  totalTokens: number;
  costUsd: number;
  requestCount: number;
  quota: number | null;
}

export interface PermissionGroup {
  id: string;
  name: string;
  /** Role reference: a built-in ('admin' | 'contributor' | 'viewer') or a custom role id. */
  role: string;
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

/**
 * Per-user session runtime state (hub topology). 'none' = not provisioned, 'starting' = pod
 * booting, 'ready' = data plane reachable at baseUrl. Standalone always reports ready + ''.
 */
export type SessionPodStatus = 'none' | 'starting' | 'ready';

export interface SessionInfo {
  status: SessionPodStatus;
  /** Base the client prepends to data-plane requests ('' = same origin, standalone). */
  baseUrl: string;
}

/** Returned once on successful login. */
export interface AuthResult {
  token: string;
  user: User;
  /** Present in hub mode; absent/ready-'' in standalone. */
  session?: SessionInfo;
  /** mfaMode=required but this account has no authenticator yet — client forces enrollment. */
  mfaSetupRequired?: boolean;
}

// ── Pluggable auth methods (local / Entra ID / generic OIDC / GitHub) + TOTP 2FA ──

/** External identity providers a deployment may enable (Helm values → env). */
export type SsoProviderId = 'entra' | 'oidc' | 'github';

/** TOTP enforcement for password logins (SSO delegates MFA to the IdP). */
export type MfaMode = 'off' | 'optional' | 'required';

/** One enabled SSO provider as shown on the login screen. */
export interface SsoProviderInfo {
  id: SsoProviderId;
  /** Button label, e.g. "Microsoft Entra ID", "Okta", "GitHub". */
  name: string;
  /** Browser navigates here to start the flow: /api/auth/sso/<id>/start */
  startUrl: string;
}

/** GET /api/auth/methods (public) — drives which login options the client renders. */
export interface AuthMethodsInfo {
  /** Username/password form enabled. */
  local: boolean;
  mfaMode: MfaMode;
  providers: SsoProviderInfo[];
}

/**
 * POST /api/auth/login when the account requires a TOTP code: no session token yet,
 * only a short-lived MFA-pending token to present to POST /api/auth/mfa/verify.
 */
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}

export interface MfaVerifyInput {
  mfaToken: string;
  code: string;
}

/** POST /api/auth/mfa/setup → secret to load into an authenticator app. */
export interface MfaSetupInfo {
  /** Base32 secret for manual entry. */
  secret: string;
  /** otpauth:// URI (QR-code payload / deep link). */
  otpauthUrl: string;
}
