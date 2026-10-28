// Checks that every action button of the subscriber screens can be managed from the platform team's "Buttons" page:
//  1. every <Button>/<IconButton> has an `id`, unless it is part of a form (Save, Cancel, Back, choice chips…);
//  2. every id used in the screens is in the catalog (services/buttons.js) and every catalog id is used.
// Run: node scripts/check-buttons.mjs
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// Platform-team screens and the building blocks themselves are not subscriber buttons.
const SKIP_FILES = ['FieldsScreen.js', 'SectionsScreen.js', 'ButtonsScreen.js', 'PlansScreen.js', 'CompaniesScreen.js', 'LoginScreen.js', 'ui.js', 'AppShell.js', 'SearchModal.js', 'CustomActions.js'];

// Buttons that belong to a form or a picker (not actions of their own).
const FORM_PARTS = [
  /title=\{t\('common\.(cancel|save|back|add|close|confirm)'\)\}/,
  /title=\{t\('finance\.loadMore'\)\}/,
  /title=\{t\('(users\.generatePassword|users\.allProperties|leases\.pickProperty|partners\.addPartner|auth\.signOut|payments\.save|closing\.reopenShort)'\)\}/,
  /title=\{t\('cheques\.bulkSave'/,
  /title=\{locked \? t\('common\.save'\) : t\('leases\.saveActivate'\)\}/, // the lease form's own submit
  /title=\{(role|p)\.name\}/,
  /<IconButton icon="close" color=\{COLORS\.danger\}/, // remove a row inside a form
];

const catalog = new Set([...read('services/buttons.js').matchAll(/^\s+\['([a-z][A-Za-z0-9.]+)', '/gm)].map((m) => m[1]));
const used = new Set();
const problems = [];

const files = ['screens', 'components'].flatMap((dir) => fs.readdirSync(path.join(root, dir)).filter((f) => f.endsWith('.js') && !SKIP_FILES.includes(f)).map((f) => `${dir}/${f}`));
for (const file of files) {
  const src = read(file);
  for (const m of src.matchAll(/<(Button|IconButton)\b/g)) {
    const end = src.indexOf('/>', m.index);
    const tag = src.slice(m.index, end).replace(/\s+/g, ' ');
    const line = src.slice(0, m.index).split('\n').length;
    const id = tag.match(/ id="([^"]+)"/)?.[1];
    const dynamic = tag.match(/ id=\{`([a-zA-Z.]+)\$\{\w+\}`\}/)?.[1];
    if (id) {
      used.add(id);
      if (!catalog.has(id)) problems.push(`${file}:${line} id "${id}" is not in the catalog`);
    } else if (dynamic) {
      for (const c of catalog) if (c.startsWith(dynamic)) used.add(c);
    } else if (!FORM_PARTS.some((re) => re.test(tag))) {
      problems.push(`${file}:${line} button without id: ${tag.slice(0, 120)}`);
    }
  }
}
for (const id of catalog) if (!used.has(id)) problems.push(`catalog id "${id}" is not used by any screen`);

if (problems.length) {
  console.log(problems.join('\n'));
  process.exit(1);
}
console.log(`OK — ${catalog.size} buttons in the catalog, all used, and every action button has an id.`);
