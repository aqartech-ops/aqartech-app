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

/** Access per section: the built-in ones plus sections created by the platform team ("cs_<key>"). */
export type AccessMap = Record<SectionKey, AccessLevel> & Record<string, AccessLevel>;

// Sections created by the platform team (الأقسام المضافة). Kept in memory by CustomSectionsService
// (loaded at start-up and refreshed on every change), so access checks stay synchronous.
let customKeys: string[] = [];

export const customSectionKey = (key: string) => `cs_${key}`;

export function setCustomSectionKeys(keys: string[]) {
  customKeys = keys.map(customSectionKey);
}

/** Built-in sections followed by the active custom ones. */
export function allSectionKeys(): string[] {
  return [...SECTIONS, ...customKeys];
}

export const LEVEL_RANK: Record<AccessLevel, number> = { HIDDEN: 0, VIEW: 1, EDIT: 2 };

/** Sections every subscriber keeps regardless of plan. */
export const ALWAYS_ON: SectionKey[] = ['dashboard', 'settings'];

export function isSectionKey(value: string): boolean {
  return allSectionKeys().includes(value);
}

export function isAccessLevel(value: unknown): value is AccessLevel {
  return value === 'EDIT' || value === 'VIEW' || value === 'HIDDEN';
}

/** Full access map — used for the subscriber's main account. */
export function fullAccess(): AccessMap {
  return Object.fromEntries(allSectionKeys().map((s) => [s, 'EDIT'])) as AccessMap;
}

/** Clean an untrusted permissions object into a valid map (unknown keys dropped, missing = HIDDEN). */
export function normalizePermissions(input: unknown): AccessMap {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return Object.fromEntries(
    allSectionKeys().map((s) => [s, isAccessLevel(source[s]) ? source[s] : 'HIDDEN']),
  ) as AccessMap;
}
