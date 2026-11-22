import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
const nativeBase = JSON.parse(await readFile('templates/unity.json', 'utf8'));
import { execFileSync } from 'node:child_process';
const png = new Uint8Array(await readFile('art/player.png')),
  jpg = new Uint8Array(await readFile('art/stage.jpg'));
const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', png)), (b) =>
  b.toString(16).padStart(2, '0'),
).join('');
let archive, downloaded, release;
const ctx = vm.createContext({
  crypto,
  Blob,
  TextEncoder,
  Uint8Array,
  DataView,
  structuredClone,
  note: () => {},
  URL: {
    createObjectURL(blob) {
      archive = blob;
      return 'memory:';
    },
    revokeObjectURL() {},
  },
  setTimeout() {},
  el() {
    return {
      click() {
        downloaded = this.download;
      },
    };
  },
  api: async (path) => (path === 'source-base' ? nativeBase : structuredClone(release)),
  fetch: async (url) => {
    const jpgFile = url.endsWith('.jpg');
    return new Response(jpgFile ? jpg : png, {
      headers: { 'Content-Type': jpgFile ? 'image/jpeg' : 'image/png' },
    });
  },
});
vm.runInContext(
  (await readFile('src/model.js', 'utf8')) +
    '\n' +
    (await readFile('src/export.js', 'utf8')) +
    '\n' +
    (await readFile('src/source.js', 'utf8')),
  ctx,
);
release = { rev: 17, project: vm.runInContext('seed()', ctx) };
release.project.characters[0].portrait = 'asset:' + hash;
await vm.runInContext('exportUnityPack()', ctx);
assert.equal(downloaded, 'Dreamwalker-Unity-v17.zip');
const dir = await mkdtemp(join(tmpdir(), 'dw-zip-'));
try {
  const path = join(dir, 'pack.zip');
  await writeFile(path, new Uint8Array(await archive.arrayBuffer()));
  execFileSync('unzip', ['-tq', path]);
  const root = 'Assets/Resources/DreamwalkerStudio/';
  const data = JSON.parse(execFileSync('unzip', ['-p', path, root + 'release.json']));
  assert.equal(data.project.characters[0].portrait, 'asset:' + hash);
  assert.equal(data.rev, 17);
  assert.deepEqual(execFileSync('unzip', ['-p', path, root + 'Images/' + hash + '.png']), Buffer.from(png));
  assert.deepEqual(execFileSync('unzip', ['-p', path, root + 'Images/builtin-stage.jpg']), Buffer.from(jpg));
  console.log('PASS Unity ZIP CRC, release manifest and texture bytes');
  release.project.sourceFiles = [
    { path: 'Assets/Tests/Example.cs', text: 'class Example {}' },
    { path: 'Web/scratch.js', text: '// web' },
  ];
  await vm.runInContext('exportUnityPack(true)', ctx);
  assert.equal(downloaded, 'Dreamwalker-Unity-Project-v17.zip');
  await writeFile(path, new Uint8Array(await archive.arrayBuffer()));
  execFileSync('unzip', ['-tq', path]);
  const files = execFileSync('unzip', ['-Z1', path], { encoding: 'utf8' });
  for (const item of [
    'Assets/Tests/Example.cs',
    'ProjectSettings/ProjectVersion.txt',
    'Packages/manifest.json',
    'Assets/Dreamwalker/Scripts/Demo/StudioScreenFlow.cs',
  ])
    assert(files.includes(item));
  assert(!files.includes('Web/scratch.js'));
  assert.equal(
    execFileSync('unzip', ['-p', path, 'Assets/Tests/Example.cs'], { encoding: 'utf8' }),
    'class Example {}',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
