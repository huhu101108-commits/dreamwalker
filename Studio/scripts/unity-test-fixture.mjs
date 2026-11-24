// The Unity play test plays the studio's default project, packed as a content pack's release.json.
//   node scripts/unity-test-fixture.mjs           writes Assets/Dreamwalker/Tests/Play/studio-seed-release.json
//   node scripts/unity-test-fixture.mjs --check   fails when the committed file no longer matches the studio seed
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const target = new URL('../../Assets/Dreamwalker/Tests/Play/studio-seed-release.json', import.meta.url);
const ctx = vm.createContext({ crypto, structuredClone, TextEncoder });
vm.runInContext(await readFile(new URL('../src/model.js', import.meta.url), 'utf8'), ctx);
const project = vm.runInContext('migrateProject(seed())', ctx);
const release = { rev: 0, contentDigest: await ctx.contentDigest(project), project: JSON.parse(JSON.stringify(ctx.packNativeWorld(project))) };
const text = JSON.stringify(release, null, 1) + '\n';
if (process.argv.includes('--check')) {
  const committed = await readFile(target, 'utf8').catch(() => '');
  if (committed !== text) {
    console.error('FAIL Unity play test project differs from the studio seed. Run: node scripts/unity-test-fixture.mjs');
    process.exit(1);
  }
  console.log('PASS Unity play test project matches the studio seed');
} else {
  await writeFile(target, text);
  console.log('Wrote ' + target.pathname);
}
