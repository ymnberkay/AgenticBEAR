/**
 * Capability-based custom roles. Built-in roles (admin/contributor/viewer) map to fixed
 * capability sets; admins can also define custom roles from a subset of these capabilities and
 * attach them to permission groups. A user's effective capabilities are the union of their own
 * role's capabilities and those of every group they belong to (additive — never reduces below
 * the user's own role, so an admin can't be locked out).
 */

/** Every enforceable capability. `admin.full` short-circuits to unrestricted access. */
export type Capability =
  | 'admin.full'
  | 'projects.view'
  | 'projects.create'
  | 'projects.edit'
  | 'projects.delete'
  | 'agents.manage'
  | 'runs.execute'
  | 'files.approve'
  | 'integrations.manage'
  | 'gateway.manage'
  | 'users.manage'
  | 'settings.manage';

export interface CapabilityInfo {
  key: Capability;
  /** Grouping shown in the role editor. */
  area: string;
  label: string;
  /** Write-type capability — grants non-GET access within accessible projects. */
  write?: boolean;
}

/** Catalog rendered in the role editor (order = display order). */
export const CAPABILITY_CATALOG: CapabilityInfo[] = [
  { key: 'admin.full', area: 'Administration', label: 'Full administrator (all access)' },
  { key: 'users.manage', area: 'Administration', label: 'Manage users, groups & roles' },
  { key: 'settings.manage', area: 'Administration', label: 'Manage org & security settings' },
  { key: 'gateway.manage', area: 'Administration', label: 'Manage gateway keys & providers' },
  { key: 'projects.view', area: 'Projects', label: 'View projects' },
  { key: 'projects.create', area: 'Projects', label: 'Create projects', write: true },
  { key: 'projects.edit', area: 'Projects', label: 'Edit project settings', write: true },
  { key: 'projects.delete', area: 'Projects', label: 'Delete projects', write: true },
  { key: 'agents.manage', area: 'Agents & Runs', label: 'Create & edit agents', write: true },
  { key: 'runs.execute', area: 'Agents & Runs', label: 'Run agents & chat', write: true },
  { key: 'files.approve', area: 'Agents & Runs', label: 'Approve / reject file changes', write: true },
  { key: 'integrations.manage', area: 'Integrations', label: 'Manage integrations', write: true },
];

export const ALL_CAPABILITIES: Capability[] = CAPABILITY_CATALOG.map((c) => c.key);
export const WRITE_CAPABILITIES: Capability[] = CAPABILITY_CATALOG.filter((c) => c.write).map((c) => c.key);

/** Built-in role → capability set. These reproduce the pre-custom-roles behavior exactly. */
export const BUILTIN_ROLE_CAPS: Record<'admin' | 'contributor' | 'viewer', Capability[]> = {
  admin: ['admin.full'],
  contributor: ['projects.view', 'projects.create', 'projects.edit', 'agents.manage', 'runs.execute', 'files.approve', 'integrations.manage'],
  viewer: ['projects.view'],
};

export const BUILTIN_ROLE_IDS = ['admin', 'contributor', 'viewer'] as const;
export const isBuiltinRole = (ref: string): ref is 'admin' | 'contributor' | 'viewer' =>
  (BUILTIN_ROLE_IDS as readonly string[]).includes(ref);

/** An admin-defined role: a named capability set attachable to permission groups. */
export interface CustomRole {
  id: string;
  name: string;
  /** Optional free-text explaining what the role is for. */
  description: string;
  capabilities: Capability[];
  createdAt: string;
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  capabilities: Capability[];
}

export interface UpdateRoleInput {
  name?: string;
  description?: string;
  capabilities?: Capability[];
}
