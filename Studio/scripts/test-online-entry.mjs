// A creator-placed button opens the online friendly match: a valid screen action that asks the host to open the match
// and leaves the field, menus and saves as they were. Unity opens StudioOnlineArena for the same action.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const ctx = vm.createContext({ crypto, structuredClone, TextEncoder });
for (const file of ['model', 'rule-machine', 'simulation']) vm.runInContext(await readFile('src/' + file + '.js', 'utf8'), ctx);
const m = vm.runInContext('({seed,problem,widget,FieldRun,INPUTS,actionRefOK,validScreenWidget})', ctx);
assert.equal(m.INPUTS.online, '온라인 친선전 열기');
const project = m.seed();
assert.equal(m.actionRefOK(project, 'online', ''), true);
assert.equal(m.actionRefOK(project, 'online', 'somewhere'), false, 'the action takes no target');
const menu = project.layouts.find((l) => l.id === 'default-menu');
menu.elements.push(m.widget('online', 'button', 10, 70, 30, 10, { action: 'online', text: '친선전' }));
assert.equal(m.problem(project), '');
const run = new m.FieldRun(project, project.startMap, true);
run.press('menu');
const before = JSON.stringify({ menu: run.menu, hp: run.hp, map: run.map.id, flags: [...run.flags] });
run.press('online');
run.press('online');
assert.equal(run.onlineRequests, 2, 'each press asks the host once');
assert.equal(JSON.stringify({ menu: run.menu, hp: run.hp, map: run.map.id, flags: [...run.flags] }), before);
const unity = await readFile('../Assets/Dreamwalker/Scripts/Demo/StudioWorld.cs', 'utf8');
assert.match(unity, /action == "online"[\s\S]{0,200}StudioOnlineArena>\(\)\)\.Open\(\)/);
console.log('PASS online match button: valid screen action without target, host request without state change, Unity opens the match screen');
