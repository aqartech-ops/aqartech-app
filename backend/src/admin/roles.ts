// Roles of the platform team (فريق المنصة) — pure rules, unit-tested.
//   OWNER   everything, including the team (add / remove admins, reset their 2FA)
//   MANAGER everything except the team
//   SUPPORT subscribers (companies and their subscriptions); everything else read-only

export const ADMIN_ROLES = ['OWNER', 'MANAGER', 'SUPPORT'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

const READ = ['GET', 'HEAD', 'OPTIONS'];

/** Paths every admin may change for themselves (password, two-step sign-in). */
const SELF = ['/admin/auth/'];
const TEAM = '/admin/team';
const SUPPORT_CAN_CHANGE = ['/admin/companies'];

export function asRole(value: unknown): AdminRole {
  return (ADMIN_ROLES as readonly string[]).includes(String(value)) ? (value as AdminRole) : 'SUPPORT';
}

/** May an admin with this role call `method path`? (path without the query string) */
export function adminCan(role: AdminRole, method: string, path: string): boolean {
  const p = path.replace(/\/+$/, '') || '/';
  if (SELF.some((s) => p.startsWith(s))) return true;
  if (p === TEAM || p.startsWith(`${TEAM}/`)) return role === 'OWNER';
  if (role === 'OWNER' || role === 'MANAGER') return true;
  if (READ.includes(method.toUpperCase())) return true;
  return SUPPORT_CAN_CHANGE.some((s) => p === s || p.startsWith(`${s}/`));
}

/** The team must always keep at least one active owner. */
export function keepsAnOwner(admins: { id: string; role: string; isActive: boolean }[], change: { id: string; role?: string; isActive?: boolean }): boolean {
  const after = admins.map((a) => (a.id === change.id ? { ...a, ...change } : a));
  return after.some((a) => a.role === 'OWNER' && a.isActive);
}
