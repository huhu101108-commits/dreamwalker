import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
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
  api: async () => structuredClone(release),
  fetch: async (url) => {
    const jpgFile = url.endsWith('.jpg');
    return new Response(jpgFile ? jpg : png, {
      headers: { 'Content-Type': jpgFile ? 'image/jpeg' : 'image/png' },
    });
  },
});
vm.runInContext(
  (await readFile('src/model.js', 'utf8')) + '\n' + (await readFile('src/export.js', 'utf8')),
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
} finally {
  await rm(dir, { recursive: true, force: true });
}
