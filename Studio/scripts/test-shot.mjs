import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const ctx=vm.createContext({crypto,structuredClone});
for(const name of ['model','shot-view']) vm.runInContext(await readFile('src/'+name+'.js','utf8'),ctx);
const {seed,newStory,newNode,newShot,newShotLayer,validShot,shotGeometry,shotCoversField,problem,imageRefs,packNativeWorld}=
  vm.runInContext('({seed,newStory,newNode,newShot,newShotLayer,validShot,shotGeometry,shotCoversField,problem,imageRefs,packNativeWorld})',ctx);
const world=seed(),story=newStory('snow','설원의 갈림길'),line=story.nodes[0],next=newNode('shore');
next.text='얼음 호수가 보여.';story.nodes.push(next);world.stories.push(story);
assert.equal(problem(world),'');assert(!Object.hasOwn(line,'shot'));
line.side='right';line.shot=newShot(line);line.choices=[{label:'호수로',to:next.id}];
const pick=kind=>line.shot.layers.find(p=>p.kind===kind);
assert.equal(pick('portrait').x,54);assert.equal(pick('backdrop').locked,true);assert(shotCoversField(line));
const text=pick('text');Object.assign(text,shotGeometry(text,{x:14.26,y:20.41,w:36.62}));
assert.deepEqual([text.x,text.y,text.w],[14.3,20.4,36.6]);
const choices=pick('choices');Object.assign(choices,shotGeometry(choices,{x:99,y:99,w:44,h:10}));
assert.equal(choices.x+choices.w,100);assert.equal(choices.y+choices.h,100);
const overlay=newShotLayer('art'),hash='ab'.repeat(32);overlay.image='asset:'+hash;line.shot.layers.push(overlay);
assert.equal(problem(world),'');assert(imageRefs(world).includes(hash));
next.shot=structuredClone(line.shot);next.shot.layers[0].opacity=80;assert(!shotCoversField(next));
next.shot.layers[0].opacity=100;next.shot.layers[0].radius=1;assert(!shotCoversField(next));
next.shot=newShot({side:'hidden'},'side');assert(!next.shot.layers.find(p=>p.kind==='portrait').visible);
assert.equal(problem(world),'');
const exported=packNativeWorld(world).stories.find(s=>s.id===story.id);
assert.equal(exported.nodes[0].shot.layers.at(-1).image,'asset:'+hash);assert.deepEqual(exported.nodes[1].shot,next.shot);
for(const alter of [
  s=>{s.layers.find(p=>p.kind==='choices').visible=false;},
  s=>{s.layers.find(p=>p.kind==='choices').x=98;},
  s=>{s.layers.find(p=>p.kind==='choices').opacity=0;},
  s=>s.layers.push({...s.layers[0]}),
  s=>s.layers.splice(0,s.layers.length,null),
  s=>s.layers.push({...s.layers[0],id:'shape',kind:'unknown'}),
  s=>{s.layers[0].image='https://invalid.test/image';}
]){
  const bad=structuredClone(line.shot);alter(bad);assert.equal(validShot(bad),false);
}
delete next.shot;assert(!shotCoversField(next));assert.equal(problem(world),'');
console.log('PASS per-line shots: old lines, independent presets, percent bounds, reachable choices, sparse asset references, native export and opaque-stage guard');
