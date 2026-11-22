import fs from 'node:fs';
const read = (path) => fs.readFileSync(path, 'utf8');
const files = {};
for (const [path, name, type] of [
  ['/', 'index.html', 'text/html; charset=utf-8'],
  ['/play', 'index.html', 'text/html; charset=utf-8'],
  ['/style.css', 'style.css', 'text/css'],
]) {
  files[path] = [type, read('src/' + name)];
}
for (const name of [
  'app',
  'model',
  'simulation',
  'game',
  'view',
  'maps',
  'characters',
  'stories',
  'interface',
  'flows',
  'export',
  'roadmap',
  'source',
]) {
  files['/' + name + '.js'] = ['text/javascript', read('src/' + name + '.js')];
}
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
  'Web/model.js': read('src/model.js'),
  'Web/simulation.js': read('src/simulation.js'),
  'Web/game.js': read('src/game.js'),
  'Web/game.css': read('src/style.css'),
  'Web/dialogue.js': read('src/stories.js').split('function previewStory(')[0],
  'Web/view.js': read('src/view.js').split('function pointerDrag(')[0],
};
const sourceBase = { ...web, ...native };
fs.writeFileSync(
  'dist/server/index.js',
  'const FILES=' +
    JSON.stringify(files) +
    ';\n' +
    'const SOURCE_BASE=' +
    JSON.stringify(sourceBase) +
    ';\n' +
    ['model', 'server'].map((n) => read('src/' + n + '.js')).join('\n'),
);
