// Pure helper shared by buttons and print templates (no React Native imports).

/** Value of "phone", "tenant.phone", "company.name" or an extra field "parking_no" on a record. */
export function readPath(record, path) {
  if (!record || typeof record !== 'object') return undefined;
  let value = record;
  for (const part of path.split('.')) value = value && typeof value === 'object' ? value[part] : undefined;
  if (value === undefined && record.custom && typeof record.custom === 'object') value = record.custom[path];
  return value;
}
