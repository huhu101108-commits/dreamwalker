// The Unity play tests play the studio's default project, packed as a content pack's release.json, and the same
// project with the UI design tool's home, settings and standby screens (studio-menus-release.json).
//   node scripts/unity-test-fixture.mjs           writes both files in Assets/Dreamwalker/Tests/Play
//   node scripts/unity-test-fixture.mjs --check   fails when a committed file no longer matches the studio
import { readFile, writeFile } from 'node:fs/promises';
import vm from 'node:vm';

const folder = new URL('../../Assets/Dreamwalker/Tests/Play/', import.meta.url);
const ctx = vm.createContext({ crypto, structuredClone, TextEncoder });
vm.runInContext(await readFile(new URL('../src/model.js', import.meta.url), 'utf8'), ctx);
const seed = vm.runInContext('migrateProject(seed())', ctx);
// The templates the UI design buttons make, with a standby screen that opens after one quiet second.
const menus = structuredClone(seed);
menus.layouts.push(ctx.frontScreen('home', 'home', menus.title), ctx.settingsScreen('settings'), ctx.standbyScreen('standby', 'home', 1));
menus.frontScreens.home = 'home';
menus.frontScreens.settings = 'settings';
menus.layouts.find((l) => l.id === menus.scenes[0].menuId).elements.push(ctx.widget('go-home', 'button', 4, 4, 22, 10, { text: '홈으로', action: 'home' }));
if (ctx.problem(menus)) throw Error('the menu project is invalid: ' + ctx.problem(menus));
let stale = false;
for (const [name, project] of [['studio-seed-release.json', seed], ['studio-menus-release.json', menus]]) {
  const target = new URL(name, folder);
  const release = { rev: 0, contentDigest: await ctx.contentDigest(project), project: JSON.parse(JSON.stringify(ctx.packNativeWorld(project))) };
  const text = JSON.stringify(release, null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const committed = await readFile(target, 'utf8').catch(() => '');
    if (committed !== text) { console.error('FAIL Unity play test project ' + name + ' differs from the studio. Run: node scripts/unity-test-fixture.mjs'); stale = true; }
  } else {
    await writeFile(target, text);
    console.log('Wrote ' + target.pathname);
  }
}
if (stale) process.exit(1);
if (process.argv.includes('--check')) console.log('PASS Unity play test projects match the studio seed and its home, settings and standby screens');
