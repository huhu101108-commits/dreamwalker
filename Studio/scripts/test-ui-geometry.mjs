// Unity's uGUI screens size widget text like the studio's browser preview. This writes the shared table that the .NET
// contract check (scripts/native-check/UiGeometry.cs) runs through StudioUiGeometry.TextPixels.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const view = await readFile('src/view.js', 'utf8');
assert(view.includes("fontSize: 'clamp(8px,' + w.fontSize / 8 + 'cqw,' + w.fontSize * 1.4 + 'px)'"),
  'the web widget text formula changed: update StudioUiGeometry.TextPixels and this table together');
// CSS clamp(8px, n/8 cqw, 1.4n px) in a container `width` CSS pixels wide, in the order the C# code computes it.
const css = (n, width) => Math.max(8, n * Math.min(width / 800, 1.4));
const texts = [];
for (const authored of [4, 9, 11, 12, 16, 22, 32, 48, 64])
  for (const cssWidth of [480, 800, 1024, 1280, 1920])
    for (const density of [1, 1.5, 2, 2.625]) {
      assert(Math.abs(css(authored, cssWidth) - Math.max(8, Math.min(authored / 8 * cssWidth / 100, authored * 1.4))) < 1e-9);
      texts.push({ authored, screenWidth: cssWidth * density, density, pixels: Math.round(Math.min(90, css(authored, cssWidth)) * density) });
    }
const table = JSON.stringify({ texts }, null, 1) + '\n';
const path = 'scripts/native-check/ui-geometry.json';
if ((await readFile(path, 'utf8').catch(() => '')) !== table) {
  await writeFile(path, table);
  assert.fail(path + ' was out of date and has been rewritten; commit it with the change');
}
console.log('PASS Unity text sizes follow the studio preview formula clamp(8px, n/8 cqw, 1.4n px): ' + texts.length + ' cases written for the .NET check');
