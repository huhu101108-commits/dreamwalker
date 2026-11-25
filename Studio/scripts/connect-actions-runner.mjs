import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { executeAndroidJob, studio } from './android-runner.mjs';

const run = promisify(execFile);
const versionFile = await readFile(new URL('../../ProjectSettings/ProjectVersion.txt', import.meta.url), 'utf8');
const version = /^m_EditorVersion:\s*(\S+)/m.exec(versionFile)[1];
let editor, android = false, bundledAdb;
const home = process.env.HOME || '';
for (const candidate of [
  process.env.UNITY_EDITOR, '/opt/unity/Editor/Unity',
  '/opt/unity/Hub/Editor/' + version + '/Editor/Unity',
  join(home, 'Unity/Hub/Editor', version, 'Editor/Unity'),
  '/Applications/Unity/Hub/Editor/' + version + '/Unity.app/Contents/MacOS/Unity',
  process.env.ProgramFiles && join(process.env.ProgramFiles, 'Unity/Hub/Editor', version, 'Editor/Unity.exe'),
].filter(Boolean)) {
  try {
    await access(candidate);
    const result = await run(candidate, ['-version'], { timeout: 30000 });
    if (!(result.stdout + ' ' + result.stderr).split(/[\s()]+/).includes(version)) continue;
    editor = candidate;
    for (const data of ['Data/PlaybackEngines', '../PlaybackEngines']) {
      const module = join(dirname(editor), data, 'AndroidPlayer');
      if (await stat(module).then(s => s.isDirectory(), () => false)) {
        android = true;
        bundledAdb = join(module, 'SDK/platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
        break;
      }
    }
    if (android) break;
  } catch { /* Another Hub installation may contain the pinned editor. */ }
}

async function galaxyTablets() {
  const adb = process.platform === 'win32' ? 'adb.exe' : 'adb';
  const sdk = process.env.ANDROID_SDK_ROOT || process.env.ANDROID_HOME;
  for (const executable of [bundledAdb, sdk && join(sdk, 'platform-tools', adb), adb].filter(Boolean)) {
    try {
      const command = async args => (await run(executable, args, { timeout: 12000 })).stdout;
      const list = await command(['devices']);
      let count = 0;
      for (const line of list.split(/\r?\n/)) {
        const serial = /^(\S+)\s+device\s*$/.exec(line)?.[1];
        if (!serial) continue;
        const props = await command(['-s', serial, 'shell', 'getprop']);
        const values = Object.fromEntries([...props.matchAll(/^\[([^\]]+)\]: \[([^\]]*)\]\s*$/gm)]
          .map(match => [match[1], match[2]]));
        if (values['ro.boot.qemu'] === '1' || values['ro.kernel.qemu'] === '1') continue;
        if (/^samsung$/i.test(values['ro.product.manufacturer']) &&
            (/tablet/i.test(values['ro.build.characteristics']) || /^(SM-[TX]\d|Galaxy Tab)/i.test(values['ro.product.model'])))
          count++;
      }
      return count;
    } catch { /* Try the next installed SDK. */ }
  }
  return 0;
}

const tablets = await galaxyTablets();
const endpoint = studio + '/api/android/ci-connect';
const request = new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
request.searchParams.set('audience', endpoint);
const identity = await fetch(request, {
  headers: { authorization: 'Bearer ' + process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN },
  redirect: 'error', signal: AbortSignal.timeout(20000),
});
if (!identity.ok) throw Error('GitHub runner identity HTTP ' + identity.status);
const jwt = (await identity.json()).value;
const response = await fetch(endpoint, {
  method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
  headers: { authorization: 'Bearer ' + jwt, 'content-type': 'application/json' },
  body: JSON.stringify({ editor: Boolean(editor), android, tablets }),
});
if (!response.ok) throw Error('Studio runner connection HTTP ' + response.status);
const { ready, job } = await response.json();
console.log('Studio acknowledged this run. Unity ' + version + ': ' + Boolean(editor) +
  ', Android module: ' + android + ', authorized physical Galaxy tablets: ' + tablets);
if (ready && job) await executeAndroidJob(job, editor, job.lease);
