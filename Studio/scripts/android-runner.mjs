// Run on a dedicated account with this repository and a licensed Unity Editor with Android Build Support.
import { mkdtemp, cp, mkdir, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const root = fileURLToPath(new URL('../../', import.meta.url));
export const studio = 'https://dreamwalker-snowfield-studio.congenialcockatoo.chatgpt.site';
const context = vm.createContext({});
vm.runInContext(await readFile(new URL('../src/model.js', import.meta.url), 'utf8'), context);
const editable = vm.runInContext('editablePath', context);
async function api(token, route, { method = 'GET', job, body, headers = {} } = {}) {
  const r = await fetch(studio + '/api/android/' + route, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      ...(job ? { 'X-Build-Id': job.id, 'X-Build-Lease': job.lease } : {}),
      ...headers,
    },
    body,
    ...(body?.pipe ? { duplex: 'half' } : {}),
  });
  if (!r.ok) throw Error(route + ' failed (' + r.status + ')');
  return r;
}
export async function executeAndroidJob(job, editor, token) {
  const workspace = await mkdtemp(path.join(tmpdir(), 'dreamwalker-android-'));
  try {
    for (const folder of ['Assets', 'Packages', 'ProjectSettings'])
      await cp(path.join(root, folder), path.join(workspace, folder), { recursive: true });
    for (const f of job.release.patches) {
      if (!editable(f.path) || f.path.startsWith('Web/')) throw Error('Invalid project path');
      const target = path.join(workspace, f.path);
      if (f.text === null) await rm(target, { force: true });
      else {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, f.text);
      }
    }
    const resources = path.join(workspace, 'Assets/Resources/DreamwalkerStudio'),
      images = path.join(resources, 'Images');
    await mkdir(images, { recursive: true });
    await writeFile(
      path.join(resources, 'release.json'),
      JSON.stringify({ rev: job.release.rev, project: job.release.project }),
    );
    for (const builtin of ['player.png', 'stage.jpg'])
      await cp(path.join(root, 'Studio/art', builtin), path.join(images, 'builtin-' + builtin));
    for (const hash of job.release.images) {
      if (!/^[0-9a-f]{64}$/.test(hash)) throw Error('Invalid asset id');
      const r = await api(token, 'image/' + hash, { job }),
        bytes = Buffer.from(await r.arrayBuffer());
      if (createHash('sha256').update(bytes).digest('hex') !== hash) throw Error('Image checksum mismatch');
      await writeFile(
        path.join(images, hash + (r.headers.get('content-type') === 'image/jpeg' ? '.jpg' : '.png')),
        bytes,
      );
    }
    const env = { ...process.env };
    for (const name of Object.keys(env)) {
      if (/^(ACTIONS_|GITHUB_|RUNNER_|INPUT_|DREAMWALKER_RUNNER_KEY$)/.test(name)) delete env[name];
    }
    const log = path.join(workspace, 'Build.log');
    await new Promise((resolve, reject) => {
      const child = spawn(
        editor,
        [
          '-batchmode',
          '-nographics',
          '-quit',
          '-buildTarget',
          'Android',
          '-projectPath',
          workspace,
          '-executeMethod',
          'Dreamwalker.EditorTools.CreateCombatDemo.BuildAndroid',
          '-logFile',
          log,
        ],
        { shell: false, cwd: workspace, env, stdio: process.env.GITHUB_ACTIONS ? 'ignore' : 'inherit' },
      );
      const timer = setTimeout(() => child.kill('SIGTERM'), 100 * 60 * 1000);
      child.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        code === 0 ? resolve() : reject(Error('Unity 종료 코드 ' + code));
      });
    });
    const apk = path.join(workspace, 'Build', 'Dreamwalker.apk'),
      size = (await stat(apk)).size;
    if (size > 90000000) throw Error('APK exceeds the studio upload limit (90 MB)');
    await api(token, 'upload', {
      method: 'POST',
      job,
      body: createReadStream(apk),
      headers: { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': String(size) },
    });
    console.log('APK uploaded for release v' + job.release.rev);
  } catch (e) {
    await api(token, 'failed', { method: 'POST', job, body: String(e.message).slice(0, 500) });
    try {
      await cp(path.join(workspace, 'Build.log'), path.join(tmpdir(), 'dreamwalker-last-build.log'));
    } catch {}
    throw e;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const editor = process.env.UNITY_EDITOR, token = process.env.DREAMWALKER_RUNNER_KEY;
  if (!editor || !token) throw Error('Set UNITY_EDITOR and DREAMWALKER_RUNNER_KEY.');
  const once = process.argv.includes('--once');
  do {
    try {
      const response = await api(token, 'claim', { method: 'POST' });
      if (response.status !== 204) await executeAndroidJob(await response.json(), editor, token);
    } catch (e) {
      console.error(e.message);
      if (once) process.exitCode = 1;
    }
    if (!once) await new Promise((resolve) => setTimeout(resolve, 30000));
  } while (!once);
}
