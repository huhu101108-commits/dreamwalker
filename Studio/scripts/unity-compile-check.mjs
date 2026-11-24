// Compiles the project's Unity scripts with the .NET SDK C# compiler against the managed assemblies of the Unity
// version in ProjectSettings/ProjectVersion.txt. It needs no Unity license and does not enter play mode.
//   node scripts/unity-compile-check.mjs <Unity Editor/Data directory>
//   node scripts/unity-compile-check.mjs --fetch <cache directory>   downloads only Managed, NetStandard and uGUI source once
// Assemblies are formed as Unity forms them: each .asmdef owns its folder (the nearest one wins), the remaining scripts
// go to Assembly-CSharp, or Assembly-CSharp-Editor below a folder named Editor. Packages the manifest lists are compiled
// from source when a project assembly needs them: built-in ones from the editor, registry ones downloaded once.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const version = /m_EditorVersion:\s*(\S+)/.exec(readFileSync(join(root, 'ProjectSettings/ProjectVersion.txt'), 'utf8'))[1];
const [mode, location] = process.argv.slice(2);
if (!mode) throw Error('Use: node scripts/unity-compile-check.mjs <Editor/Data> | --fetch <cache directory>');
const cache = mode === '--fetch' ? resolve(location || join(tmpdir(), 'dreamwalker-unity')) : null;
const data = cache ? await fetchManaged(cache) : resolve(mode);
const packageCache = cache ? join(cache, 'packages') : process.env.DREAMWALKER_UNITY_PACKAGES || join(tmpdir(), 'dreamwalker-unity-packages');
const managed = join(data, 'Managed/UnityEngine'), netstandard = join(data, 'NetStandard/ref/2.1.0/netstandard.dll');
for (const need of [join(managed, 'UnityEngine.CoreModule.dll'), join(managed, 'UnityEditor.CoreModule.dll'), netstandard])
  if (!existsSync(need)) throw Error('Missing ' + need + '. Pass the Editor/Data directory of Unity ' + version + '.');
const builtIn = join(data, 'Resources/PackageManager/BuiltInPackages');
const manifest = JSON.parse(readFileSync(join(root, 'Packages/manifest.json'), 'utf8')).dependencies || {};

const dlls = readdirSync(managed).filter((n) => n.endsWith('.dll'));
const engine = dlls.filter((n) => n.startsWith('UnityEngine')).map((n) => join(managed, n));
const editorDlls = dlls.filter((n) => n.startsWith('UnityEditor')).map((n) => join(managed, n));
const engineModules = new Set(dlls.map((n) => n.slice(0, -4)));
// Facades Unity adds for .NET Framework builds of precompiled libraries, such as the NUnit the Test Framework ships.
const netfx = join(data, 'NetStandard/compat/2.1.0/shims/netfx');
const shims = existsSync(netfx) ? readdirSync(netfx).filter((n) => n.endsWith('.dll')).map((n) => join(netfx, n)) : [];
const [major, minor, patch] = version.split(/[.a-z]/);
const common = [
  'UNITY_' + major + '_' + minor + '_' + patch, 'UNITY_' + major + '_' + minor, 'UNITY_' + major,
  'UNITY_5_3_OR_NEWER', 'UNITY_2017_1_OR_NEWER', 'UNITY_2019_1_OR_NEWER', 'UNITY_2020_1_OR_NEWER', 'UNITY_2021_1_OR_NEWER',
  'UNITY_2022_1_OR_NEWER', 'UNITY_2023_1_OR_NEWER', 'UNITY_6000_0_OR_NEWER', 'NET_STANDARD_2_1', 'NET_STANDARD', 'NETSTANDARD2_1',
  'NETSTANDARD', 'CSHARP_7_3_OR_NEWER', 'ENABLE_MONO', 'ENABLE_LEGACY_INPUT_MANAGER', 'UNITY_ANDROID', 'PLATFORM_ANDROID', 'UNITY_ASSERTIONS',
];
const editorDefines = [...common, 'UNITY_EDITOR', 'UNITY_EDITOR_64', 'UNITY_EDITOR_LINUX'];

// ---- packages ----
// Registry packages are fetched once per version, with their package dependencies.
async function registryPackage(name, wanted) {
  const folder = join(packageCache, name + '@' + wanted);
  if (existsSync(join(folder, 'package.json'))) return folder;
  const response = await fetch('https://packages.unity.com/' + encodeURIComponent(name));
  if (!response.ok) throw Error('Unity package registry returned HTTP ' + response.status + ' for ' + name);
  const tarball = (await response.json()).versions?.[wanted]?.dist?.tarball;
  if (!tarball || !/^https:\/\/download\.packages\.unity\.com\//.test(tarball)) throw Error('No registry download for ' + name + '@' + wanted);
  rmSync(folder, { recursive: true, force: true });
  mkdirSync(folder, { recursive: true });
  const run = spawnSync('bash', ['-o', 'pipefail', '-c', 'curl -sSfL --retry 3 "$1" | tar -xz -C "$2" --strip-components=1', 'fetch', tarball, folder], { stdio: 'inherit' });
  if (run.status !== 0) throw Error('Downloading ' + name + '@' + wanted + ' failed');
  return folder;
}
const packageFolders = new Map();
async function addPackage(name, wanted) {
  if (packageFolders.has(name) || name.startsWith('com.unity.modules.')) return;
  const local = join(builtIn, name);
  const folder = existsSync(join(local, 'package.json')) ? local : await registryPackage(name, wanted);
  packageFolders.set(name, folder);
  const info = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
  for (const [dep, depVersion] of Object.entries(info.dependencies || {})) await addPackage(dep, depVersion);
}
for (const [name, wanted] of Object.entries(manifest)) await addPackage(name, wanted);
const installed = new Map([...Object.entries(manifest)]);
for (const [name, folder] of packageFolders) installed.set(name, JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')).version);

// ---- assemblies ----
// Folders ending in ~ and hidden folders are ignored by Unity; package Tests folders compile only for testables.
function walk(folder, inPackage, visit) {
  for (const entry of readdirSync(folder, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || entry.name.endsWith('~')) continue;
    const path = join(folder, entry.name);
    if (entry.isDirectory()) { if (!(inPackage && entry.name === 'Tests')) walk(path, inPackage, visit); }
    else visit(path);
  }
}
const assemblies = new Map();
function collect(base, inPackage) {
  const defs = [], scripts = [];
  walk(base, inPackage, (path) => {
    if (path.endsWith('.asmref')) throw Error('Assembly references are not supported by this check: ' + relative(root, path));
    if (path.endsWith('.asmdef')) defs.push(path);
    else if (path.endsWith('.cs')) scripts.push(path);
  });
  for (const path of defs) {
    const def = JSON.parse(readFileSync(path, 'utf8'));
    if (assemblies.has(def.name)) throw Error('Two assembly definitions are named ' + def.name);
    assemblies.set(def.name, { name: def.name, def, folder: dirname(path), files: [], project: !inPackage });
  }
  const owners = [...assemblies.values()].filter((a) => a.folder.startsWith(base)).sort((a, b) => b.folder.length - a.folder.length);
  const loose = [];
  for (const file of scripts) {
    const owner = owners.find((a) => file.startsWith(a.folder + sep));
    if (owner) owner.files.push(file);
    else loose.push(file);
  }
  return loose;
}
for (const folder of packageFolders.values()) collect(folder, true);
const loose = collect(join(root, 'Assets'), false);
const isEditorPath = (path) => relative(join(root, 'Assets'), path).split(sep).includes('Editor');
assemblies.set('Assembly-CSharp', { name: 'Assembly-CSharp', predefined: true, project: true, files: loose.filter((p) => !isEditorPath(p)), def: {} });
assemblies.set('Assembly-CSharp-Editor', { name: 'Assembly-CSharp-Editor', predefined: true, editorOnly: true, project: true, files: loose.filter(isEditorPath), def: {} });

// nunit.framework.dll and other precompiled references shipped inside packages.
const precompiled = new Map();
for (const folder of packageFolders.values())
  walk(folder, true, (path) => { if (path.endsWith('.dll') && !precompiled.has(basename(path))) precompiled.set(basename(path), path); });
// Precompiled assemblies Unity references from every assembly that does not override its references (such as the
// Newtonsoft.Json the Unity services packages use): those whose import settings are not "explicitly referenced".
const autoPrecompiled = [...precompiled.values()].filter((path) => {
  try { return !/isExplicitlyReferenced: 1/.test(readFileSync(path + '.meta', 'utf8')); } catch { return false; }
});

function semverAtLeast(have, need) {
  const a = String(have).split(/[.-]/).map(Number), b = String(need).split(/[.-]/).map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return true;
}
// versionDefines: a define is set when the named package is installed (and, for a plain version, at least that version).
function versionDefines(def) {
  return (def.versionDefines || []).filter((v) => {
    if (v.name === 'Unity') return false;
    const have = installed.get(v.name);
    if (!have) return false;
    return !v.expression || /^[0-9.]+$/.test(v.expression) ? semverAtLeast(have, v.expression || '0') : true;
  }).map((v) => v.define);
}
const isTest = (a) => (a.def.defineConstraints || []).includes('UNITY_INCLUDE_TESTS');
// includePlatforms / excludePlatforms: an assembly builds only for the platforms it allows, and Unity leaves references
// to assemblies that are not built for the target out (package stubs stand in for store-specific code).
const forPlatform = (a, platform) => {
  const include = a.def.includePlatforms || [], exclude = a.def.excludePlatforms || [];
  return include.length ? include.includes(platform) : !exclude.includes(platform);
};
const editorOnly = (a) => a.editorOnly || (a.def.includePlatforms || []).length === 1 && a.def.includePlatforms[0] === 'Editor';

const sdk = execFileSync('dotnet', ['--list-sdks'], { encoding: 'utf8' }).trim().split('\n').at(-1);
const [, sdkVersion, sdkRoot] = /^(\S+) \[(.+)\]$/.exec(sdk);
const csc = join(sdkRoot, sdkVersion, 'Roslyn/bincore/csc.dll');
const work = mkdtempSync(join(tmpdir(), 'dreamwalker-unity-compile-'));
let failed = false;
function compile(label, name, files, references, defines, unsafe) {
  const folder = join(work, label.replace(/[^A-Za-z0-9-]+/g, '-'));
  mkdirSync(folder, { recursive: true });
  const out = join(folder, name + '.dll');
  // Unity's own compiler invocation: no implicit framework, C# 9, serialized-field warnings muted.
  const args = ['-nologo', '-nostdlib+', '-target:library', '-langversion:9.0', '-nullable:disable', '-deterministic',
    '-debug:portable', '-optimize-', '-warn:4', '-nowarn:0169,0649', '-out:' + out, ...(unsafe ? ['-unsafe+'] : []),
    '-define:' + defines.join(';'), '-r:' + netstandard, ...references.map((r) => '-r:' + r), ...files];
  const rsp = join(folder, name + '.rsp');
  writeFileSync(rsp, args.map((a) => '"' + a.replaceAll('"', '\\"') + '"').join('\n'));
  const run = spawnSync('dotnet', [csc, '-noconfig', '@' + rsp], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const lines = (run.stdout + run.stderr).split('\n').map((l) => l.replace(root + sep, '')).filter(Boolean);
  const errors = lines.filter((l) => /\berror\b/.test(l)), warnings = lines.filter((l) => /\bwarning\b/.test(l));
  for (const l of [...errors, ...warnings]) console.log('  ' + l);
  if (run.status !== 0 || errors.length) {
    failed = true;
    console.log('FAIL Unity ' + version + ' ' + label + ' ' + name + ': ' + errors.length + ' errors');
    return null;
  }
  console.log('PASS Unity ' + version + ' ' + label + ' ' + name + ': ' + files.length + ' scripts, ' + warnings.length + ' warnings');
  return out;
}

// One configuration (editor or player): compiles what the project needs, references first.
function build(label, editor) {
  const built = new Map(), building = new Set();
  const base = [...(editor ? [...engine, ...editorDlls] : engine), ...shims];
  const platform = editor ? 'Editor' : 'Android';
  const wanted = (a) => a.files.length > 0 && (editor || !editorOnly(a) && !isTest(a)) && (a.predefined || forPlatform(a, platform));
  function compileAssembly(a) {
    if (built.has(a.name)) return built.get(a.name);
    if (building.has(a.name)) throw Error('Assembly reference cycle at ' + a.name);
    building.add(a.name);
    const def = a.def, refs = [];
    let names = def.references || [];
    // Predefined assemblies see every auto-referenced assembly; the editor one also sees Assembly-CSharp.
    if (a.predefined) {
      names = [...assemblies.values()].filter((o) => !o.predefined && o.def.autoReferenced !== false && !isTest(o) &&
        (o.project || o.name === 'UnityEngine.UI') && wanted(o)).map((o) => o.name);
      if (a.name === 'Assembly-CSharp-Editor') names.push('Assembly-CSharp');
    }
    // uGUI was part of the engine; Unity still gives every assembly with engine references UnityEngine.UI.
    if (!def.noEngineReferences && !a.predefined && a.name !== 'UnityEngine.UI' && !names.includes('UnityEngine.UI') && assemblies.has('UnityEngine.UI'))
      names = [...names, 'UnityEngine.UI'];
    let ok = true;
    for (const ref of names) {
      const target = assemblies.get(ref);
      if (target) {
        if (!target.files.length || !editor && editorOnly(target) || !target.predefined && !forPlatform(target, platform)) continue;
        const path = compileAssembly(target);
        if (path) refs.push(path); else ok = false;
      } else if (!engineModules.has(ref) && !ref.startsWith('GUID:') && installedName(ref)) {
        console.log('  ' + a.name + ' references ' + ref + ', which this check cannot build');
      }
    }
    for (const dll of def.overrideReferences ? def.precompiledReferences || [] : []) {
      if (precompiled.has(dll)) refs.push(precompiled.get(dll));
      else { console.log('  ' + a.name + ' needs ' + dll + ', which no installed package provides'); ok = false; }
    }
    if (!def.overrideReferences) refs.push(...autoPrecompiled);
    building.delete(a.name);
    if (!ok) { console.log('SKIP Unity ' + version + ' ' + label + ' ' + a.name + ': a reference did not compile'); built.set(a.name, null); return null; }
    const defines = [...(editor ? editorDefines : common), ...versionDefines(def), ...(isTest(a) ? ['UNITY_INCLUDE_TESTS'] : [])];
    const constraints = (def.defineConstraints || []).filter((c) => c !== 'UNITY_INCLUDE_TESTS');
    if (!constraints.every((c) => c.startsWith('!') ? !defines.includes(c.slice(1)) : defines.includes(c))) {
      console.log('SKIP Unity ' + version + ' ' + label + ' ' + a.name + ': define constraints ' + constraints.join(', ') + ' are not met');
      built.set(a.name, null);
      return null;
    }
    const out = compile(label, a.name, a.files, [...base, ...refs], defines, def.allowUnsafeCode);
    built.set(a.name, out);
    return out;
  }
  for (const a of assemblies.values()) if (a.project && wanted(a)) compileAssembly(a);
}
// A missing assembly from an installed package (rather than an optional one such as the Input System) is reported.
function installedName(ref) {
  return [...packageFolders.values()].some((folder) => {
    let found = false;
    walk(folder, true, (path) => { if (path.endsWith('.asmdef') && JSON.parse(readFileSync(path, 'utf8')).name === ref) found = true; });
    return found;
  });
}
try {
  build('editor', true);
  build('Android player', false);
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (failed) process.exit(1);

// Only the Managed and NetStandard folders and the uGUI package source of the official Linux editor archive are kept.
async function fetchManaged(cacheFolder) {
  const target = join(cacheFolder, version);
  const editorData = join(target, 'Editor/Data');
  if (existsSync(join(editorData, 'Managed/UnityEngine/UnityEngine.CoreModule.dll')) && existsSync(join(editorData, 'NetStandard/ref/2.1.0/netstandard.dll')) &&
      existsSync(join(editorData, 'Resources/PackageManager/BuiltInPackages/com.unity.ugui/package.json')))
    return editorData;
  const response = await fetch('https://services.api.unity.com/unity/editor/release/v1/releases?version=' + encodeURIComponent(version) + '&limit=1');
  if (!response.ok) throw Error('Unity release lookup returned HTTP ' + response.status);
  const release = (await response.json()).results?.find((r) => r.version === version);
  const archive = release?.downloads?.find((d) => d.platform === 'LINUX' && d.architecture === 'X86_64' && d.type === 'TAR_XZ')?.url;
  if (!archive || !/^https:\/\/download\.unity3d\.com\//.test(archive)) throw Error('No Linux editor archive for Unity ' + version);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  const run = spawnSync('bash', ['-o', 'pipefail', '-c',
    'curl -sSfL --retry 3 "$1" | xz -dc | tar -x -C "$2" --wildcards --exclude="*.pdb" --exclude="*.xml" "Editor/Data/Managed/*" "Editor/Data/NetStandard/*" ' +
    '"Editor/Data/Resources/PackageManager/BuiltInPackages/com.unity.ugui/*"', 'fetch', archive, target],
    { stdio: 'inherit' });
  if (run.status !== 0) throw Error('Downloading the Unity ' + version + ' assemblies failed');
  return editorData;
}
