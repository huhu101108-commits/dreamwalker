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
  'export',
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
fs.writeFileSync(
  'dist/server/index.js',
  'const FILES=' +
    JSON.stringify(files) +
    ';\n' +
    ['model', 'server'].map((n) => read('src/' + n + '.js')).join('\n'),
);
