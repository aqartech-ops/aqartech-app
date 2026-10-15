// App sections (أقسام التطبيق). Keys are stable identifiers shared with the app.
// Plans unlock sections (Plan.features) and roles grant a level per section (Role.permissions).
// Later phases make sections configurable by platform admins; these are the built-in ones.

export const SECTIONS = [
  'dashboard',
  'properties',
  'tenants',
  'financials',
  'maintenance',
  'documents',
  'owners',
  'users',
  'settings',
] as const;

export type SectionKey = (typeof SECTIONS)[number];

export type AccessLevel = 'EDIT' | 'VIEW' | 'HIDDEN';

export const LEVEL_RANK: Record<AccessLevel, number> = { HIDDEN: 0, VIEW: 1, EDIT: 2 };

/** Sections every subscriber keeps regardless of plan. */
export const ALWAYS_ON: SectionKey[] = ['dashboard', 'settings'];

export function isSectionKey(value: string): value is SectionKey {
  return (SECTIONS as readonly string[]).includes(value);
}

export function isAccessLevel(value: unknown): value is AccessLevel {
  return value === 'EDIT' || value === 'VIEW' || value === 'HIDDEN';
}

/** Full access map — used for the subscriber's main account. */
export function fullAccess(): Record<SectionKey, AccessLevel> {
  return Object.fromEntries(SECTIONS.map((s) => [s, 'EDIT'])) as Record<SectionKey, AccessLevel>;
}

/** Clean an untrusted permissions object into a valid map (unknown keys dropped, missing = HIDDEN). */
export function normalizePermissions(input: unknown): Record<SectionKey, AccessLevel> {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return Object.fromEntries(
    SECTIONS.map((s) => [s, isAccessLevel(source[s]) ? source[s] : 'HIDDEN']),
  ) as Record<SectionKey, AccessLevel>;
}
