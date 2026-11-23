// Compiles the project's Unity scripts with the .NET SDK C# compiler against the managed assemblies of the Unity
// version in ProjectSettings/ProjectVersion.txt. It needs no Unity license and does not enter play mode.
//   node scripts/unity-compile-check.mjs <Unity Editor/Data directory>
//   node scripts/unity-compile-check.mjs --fetch <cache directory>   downloads only Managed and NetStandard once
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const version = /m_EditorVersion:\s*(\S+)/.exec(readFileSync(join(root, 'ProjectSettings/ProjectVersion.txt'), 'utf8'))[1];
const [mode, location] = process.argv.slice(2);
if (!mode) throw Error('Use: node scripts/unity-compile-check.mjs <Editor/Data> | --fetch <cache directory>');
const data = mode === '--fetch' ? await fetchManaged(resolve(location || join(tmpdir(), 'dreamwalker-unity'))) : resolve(mode);
const managed = join(data, 'Managed/UnityEngine'), netstandard = join(data, 'NetStandard/ref/2.1.0/netstandard.dll');
for (const need of [join(managed, 'UnityEngine.CoreModule.dll'), join(managed, 'UnityEditor.CoreModule.dll'), netstandard])
  if (!existsSync(need)) throw Error('Missing ' + need + '. Pass the Editor/Data directory of Unity ' + version + '.');

// Unity reads every .cs file under Assets; files below a folder named Editor form the editor assembly.
function scripts(folder, out = []) {
  for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) scripts(path, out);
    else if (entry.name.endsWith('.asmdef') || entry.name.endsWith('.asmref'))
      throw Error('Assembly definitions change Unity assembly layout; extend this check before using ' + relative(root, path));
    else if (entry.name.endsWith('.cs')) out.push(path);
  }
  return out;
}
const all = scripts(join(root, 'Assets'));
const isEditor = (path) => relative(join(root, 'Assets'), path).split(sep).includes('Editor');
const runtime = all.filter((p) => !isEditor(p)), editorScripts = all.filter(isEditor);
const dlls = readdirSync(managed).filter((n) => n.endsWith('.dll'));
const engine = dlls.filter((n) => n.startsWith('UnityEngine')).map((n) => join(managed, n));
const editorDlls = dlls.filter((n) => n.startsWith('UnityEditor')).map((n) => join(managed, n));
const [major, minor, patch] = version.split(/[.a-z]/);
const common = [
  'UNITY_' + major + '_' + minor + '_' + patch, 'UNITY_' + major + '_' + minor, 'UNITY_' + major,
  'UNITY_5_3_OR_NEWER', 'UNITY_2017_1_OR_NEWER', 'UNITY_2019_1_OR_NEWER', 'UNITY_2020_1_OR_NEWER', 'UNITY_2021_1_OR_NEWER',
  'UNITY_2022_1_OR_NEWER', 'UNITY_2023_1_OR_NEWER', 'UNITY_6000_0_OR_NEWER', 'NET_STANDARD_2_1', 'NET_STANDARD', 'NETSTANDARD2_1',
  'NETSTANDARD', 'CSHARP_7_3_OR_NEWER', 'ENABLE_MONO', 'ENABLE_LEGACY_INPUT_MANAGER', 'UNITY_ANDROID', 'PLATFORM_ANDROID', 'UNITY_ASSERTIONS',
];
const sdk = execFileSync('dotnet', ['--list-sdks'], { encoding: 'utf8' }).trim().split('\n').at(-1);
const [, sdkVersion, sdkRoot] = /^(\S+) \[(.+)\]$/.exec(sdk);
const csc = join(sdkRoot, sdkVersion, 'Roslyn/bincore/csc.dll');
const work = mkdtempSync(join(tmpdir(), 'dreamwalker-unity-compile-'));
let failed = false;
function compile(name, files, references, defines) {
  const file = name.replace(/[^A-Za-z0-9-]+/g, '-'), out = join(work, file + '.dll');
  // Unity's own compiler invocation: no implicit framework, C# 9, serialized-field warnings muted.
  const args = ['-nologo', '-nostdlib+', '-target:library', '-langversion:9.0', '-nullable:disable', '-deterministic',
    '-debug:portable', '-optimize-', '-warn:4', '-nowarn:0169,0649', '-out:' + out,
    '-define:' + defines.join(';'), '-r:' + netstandard, ...references.map((r) => '-r:' + r), ...files];
  const rsp = join(work, file + '.rsp');
  writeFileSync(rsp, args.map((a) => '"' + a.replaceAll('"', '\\"') + '"').join('\n'));
  const run = spawnSync('dotnet', [csc, '-noconfig', '@' + rsp], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const lines = (run.stdout + run.stderr).split('\n').map((l) => l.replace(root + sep, '')).filter(Boolean);
  const errors = lines.filter((l) => /\berror\b/.test(l)), warnings = lines.filter((l) => /\bwarning\b/.test(l));
  for (const l of [...errors, ...warnings]) console.log('  ' + l);
  if (run.status !== 0 || errors.length) {
    failed = true;
    console.log('FAIL Unity ' + version + ' ' + name + ': ' + errors.length + ' errors');
    return null;
  }
  console.log('PASS Unity ' + version + ' ' + name + ': ' + files.length + ' scripts, ' + warnings.length + ' warnings');
  return out;
}
try {
  const assembly = compile('editor Assembly-CSharp', runtime, [...engine, ...editorDlls], [...common, 'UNITY_EDITOR', 'UNITY_EDITOR_64', 'UNITY_EDITOR_LINUX']);
  if (editorScripts.length && assembly)
    compile('editor Assembly-CSharp-Editor', editorScripts, [...engine, ...editorDlls, assembly], [...common, 'UNITY_EDITOR', 'UNITY_EDITOR_64', 'UNITY_EDITOR_LINUX']);
  else if (editorScripts.length) console.log('SKIP Unity ' + version + ' editor Assembly-CSharp-Editor: it references the runtime assembly that failed');
  compile('Android player Assembly-CSharp', runtime, engine, common);
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (failed) process.exit(1);

// Only the Managed and NetStandard folders of the official Linux editor archive are kept.
async function fetchManaged(cache) {
  const target = join(cache, version);
  const editorData = join(target, 'Editor/Data');
  if (existsSync(join(editorData, 'Managed/UnityEngine/UnityEngine.CoreModule.dll')) && existsSync(join(editorData, 'NetStandard/ref/2.1.0/netstandard.dll')))
    return editorData;
  const response = await fetch('https://services.api.unity.com/unity/editor/release/v1/releases?version=' + encodeURIComponent(version) + '&limit=1');
  if (!response.ok) throw Error('Unity release lookup returned HTTP ' + response.status);
  const release = (await response.json()).results?.find((r) => r.version === version);
  const archive = release?.downloads?.find((d) => d.platform === 'LINUX' && d.architecture === 'X86_64' && d.type === 'TAR_XZ')?.url;
  if (!archive || !/^https:\/\/download\.unity3d\.com\//.test(archive)) throw Error('No Linux editor archive for Unity ' + version);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  const run = spawnSync('bash', ['-o', 'pipefail', '-c',
    'curl -sSfL --retry 3 "$1" | xz -dc | tar -x -C "$2" --wildcards --exclude="*.pdb" --exclude="*.xml" "Editor/Data/Managed/*" "Editor/Data/NetStandard/*"', 'fetch', archive, target],
    { stdio: 'inherit' });
  if (run.status !== 0) throw Error('Downloading the Unity ' + version + ' assemblies failed');
  return editorData;
}
