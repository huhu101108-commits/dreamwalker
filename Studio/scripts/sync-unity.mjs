import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
const root = process.argv[2];
if (!root) throw Error('Use node scripts/sync-unity.mjs <Unity project directory>');
const files = {};
function collect(folder) {
  for (const f of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(folder, f.name);
    if (f.isDirectory()) collect(path);
    else if (/\.(cs|txt|json|meta|asset|prefab|unity|asmdef|shader|mat|inputactions)$/.test(f.name))
      files[relative(root, path).replaceAll('\\', '/')] = readFileSync(path, 'utf8');
  }
}
for (const folder of ['Assets', 'Packages', 'ProjectSettings']) collect(join(root, folder));
writeFileSync('templates/unity.json', JSON.stringify(files, null, 2) + '\n');
