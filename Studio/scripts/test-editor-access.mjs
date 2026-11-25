import assert from 'node:assert/strict';
import { call, ownerHeaders } from './worker-fixture.mjs';

const invited = 'invited@example.invalid';
const second = 'second@example.invalid';
const identity = email => ({ 'oai-authenticated-user-email': email });
const env = { STUDIO_INITIAL_EDITORS: '  Invited@Example.invalid  \n' + invited };
const request = (route, body, headers) => call(route, body, headers, env);
async function enter(route, headers) {
  const response = await request(route, {}, headers);
  assert.equal(response.status, 200);
  return { ...headers, cookie: response.headers.get('set-cookie').split(';')[0] };
}

// A previously shared account may be the first person to visit a legacy installation.
const first = await enter('editor-session', identity(invited));
const owner = await enter('owner-session', ownerHeaders);
const manage = (action, email) => request('editors', { action, email }, owner);
const list = async () => (await (await request('editors', undefined, owner)).json()).editors;
assert.deepEqual(await list(), [invited]);
assert.equal((await request('editor-session', {}, identity(second))).status, 403);
assert.equal((await request('editor-session', { email: invited })).status, 403);
assert.equal((await request('editor-session', {}, { ...identity(invited), origin: 'https://other.test' })).status, 403);
assert.equal((await request('project', undefined, { cookie: first.cookie })).status, 401);
assert.equal((await request('project', undefined, { ...identity(second), cookie: first.cookie })).status, 401);
for (const [route, body] of [['editors'], ['editors', { action: 'grant', email: second }],
  ['policy', { required: true }], ['claude-connection'], ['owner-session', {}]]) {
  assert.equal((await request(route, body, first)).status, 403, route);
}
const who = await (await request('status', undefined, first)).json();
assert(who.approvedEditor && who.editorSession && who.ok && !who.owner);
assert(!JSON.stringify(who).includes(invited));
const current = await (await request('project', undefined, first)).json();
current.project.title = '공동 편집 확인';
assert.equal((await request('save', { rev: current.rev, project: current.project }, first)).status, 200);
assert.equal((await (await request('project', undefined, owner)).json()).project.title, current.project.title);
assert.equal((await request('policy', { required: true }, owner)).status, 200);
const proposed = { rev: current.rev + 1, project: current.project };
assert.equal((await request('save', proposed, first)).status, 403);
assert.equal((await request('review', { ...proposed, label: '공동 편집 검토' }, first)).status, 200);

assert.equal((await manage('grant', '*@example.invalid')).status, 400);
assert.equal((await manage('grant', ownerHeaders['oai-authenticated-user-email'])).status, 400);
assert.equal((await manage('revoke', invited)).status, 200);
assert.deepEqual(await list(), []);
assert.equal((await request('project', undefined, first)).status, 401);
assert.equal((await request('save', proposed, first)).status, 401);
assert.equal((await request('editor-session', {}, identity(invited))).status, 403);
assert.equal((await manage('grant', invited.toUpperCase())).status, 200);
assert.equal((await request('project', undefined, first)).status, 401);
const restored = await enter('editor-session', identity(invited));
assert.equal((await manage('grant', invited)).status, 200);
assert.equal((await request('project', undefined, restored)).status, 200);
assert.equal((await manage('grant', second)).status, 200);
const other = await enter('editor-session', identity(second));
assert.equal((await request('project', undefined, { ...identity(second), cookie: restored.cookie })).status, 401);
assert.equal((await manage('revoke', invited)).status, 200);
assert.equal((await request('project', undefined, other)).status, 200);

// Parallel grants must never lose a successful update.
const simultaneous = ['a@example.invalid', 'b@example.invalid'];
const results = await Promise.all(simultaneous.map(address => manage('grant', address)));
assert(results.some(r => r.ok) && results.every(r => r.ok || r.status === 409));
for (const [index, result] of results.entries()) {
  if (!result.ok) assert.equal((await manage('grant', simultaneous[index])).status, 200);
}
assert.deepEqual(await list(), [...simultaneous, second].sort());
assert.equal((await request('password', { password: 'test-team-password' }, owner)).status, 200);
assert.equal((await request('project', undefined, other)).status, 401);
const afterRotation = await enter('editor-session', identity(second));
assert.equal((await request('project', undefined, afterRotation)).status, 200);
assert.equal((await request('editor-session', {}, identity(invited))).status, 403);
assert((await (await request('status', undefined, afterRotation)).json()).reviewRequired);
console.log('PASS account editor grants, shared saves, owner review, immediate revocation, concurrent updates and password rotation');
