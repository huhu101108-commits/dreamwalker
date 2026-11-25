import fs from 'node:fs';
import { createHash } from 'node:crypto';
const read = (path) => fs.readFileSync(path, 'utf8');
const files = {};
for (const [path, name, type] of [
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/play', 'index.html', 'text/html; charset=utf-8'],
  ['/arena','arena.html','text/html; charset=utf-8'],
  ['/arena.css','arena.css','text/css'],
  ['/arena-client.js','arena-client.js','text/javascript'],
  ['/arena-design.js','arena-design.js','text/javascript'],
  ['/device','device-local.html','text/html; charset=utf-8'],
  ['/device-files', 'device-files.html', 'text/html; charset=utf-8'],
  ['/style.css', 'style.css', 'text/css'],
]) {
  files[path] = [type, read('src/' + name)];
}
for (const name of [
  'app','claude-panel','workspace','story-probe','competitive-lab','planning','rule-machine','arena-simulation','inspection-store','inspection-game','inspection-lab','capabilities',
  'file-wire', 'device-files', 'file-import', 'desk', 'asset-desk', 'scene-tools',
  'production', 'combat-editor',
  'network-test',
  'model',
  'simulation',
  'game',
  'view',
  'maps',
  'characters','character-stage',
  'stories','shot-view','shot-editor',
  'interface','preset-editor','screen-tools','design-plan','personal-gpt','studio-gpt','gpt-dock','studio-layout','device-open','target-files','device-workspace','device-standalone',
  'flows',
  'export',
  'roadmap','locales','error-reports','shop-editor','release-check','script-tools','studio-guide',
  'source','unity-return',
]) {
  files['/' + name + '.js'] = ['text/javascript', read('src/' + name + '.js')];
}
files['/download/dreamwalker-gpt.mjs']=['application/octet-stream',read('scripts/dreamwalker-gpt.mjs')];
for (const name of ['cover', 'player', 'stage']) {
  files['/' + name + '.webp'] = ['image/webp', fs.readFileSync('art/' + name + '.webp').toString('base64')];
}
for (const [path, mime] of [
  ['player.png', 'image/png'],
  ['stage.jpg', 'image/jpeg'],
]) {
  files['/' + path] = [mime, fs.readFileSync('art/' + path).toString('base64')];
}
// Only client game sources are exposed to authenticated editors. Worker/session code stays outside the game.
const native = JSON.parse(read('templates/unity.json'));
const web = {
  'Web/index.html': read('templates/web-index.html'),
  'Web/boot.js': read('templates/web-boot.js'),
  'Web/model.js': read('src/model.js')+'\n'+read('src/rule-machine.js'),
  'Web/simulation.js': read('src/simulation.js'),
  'Web/game.js': read('src/inspection-game.js')+'\n'+read('src/game.js'),
  'Web/game.css': read('src/style.css'),
  'Web/dialogue.js': read('src/shot-view.js')+'\n'+read('src/stories.js').split('function previewStory(')[0],
  'Web/view.js': read('src/view.js').split('function pointerDrag(')[0],
};
const sourceBase = { ...web, ...native };
const workbenchHtml=read('src/gpt-workbench.html').replace('/* STUDIO_HOST_BRIDGE */',()=>read('src/gpt-host-bridge.js')).replace('/* STUDIO_WORKBENCH */',()=>read('src/gpt-workbench.js'));
for (const entry of Object.values(files))
  entry.push('"' + createHash('sha256').update(entry[1]).digest('hex') + '"');
fs.writeFileSync(
  'dist/server/index.js',
  'const WORKBENCH_HTML='+JSON.stringify(workbenchHtml)+';\nconst FILES=' +
    JSON.stringify(files) +
    ';\n' +
    'const SOURCE_BASE=' +
    JSON.stringify(sourceBase) +
    ';\n' +
    ['model','rule-machine','design-plan','gpt-service','personal-gpt-service','unity-transfer-service','gpt-workbench-service','gpt-mcp','claude-service', 'github-runner', 'android-service', 'competitive-lab','link-test-service', 'file-relay-service', 'arena-simulation', 'arena-service', 'report-service', 'shop-service', 'wallet-service', 'server']
      .map((n) => read('src/' + n + '.js'))
      .join('\n'),
);
