import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const ctx=vm.createContext({crypto,structuredClone});
const view=await readFile('src/view.js','utf8');vm.runInContext(view.slice(view.indexOf('function paintCombatOverlay'),view.indexOf('function bindJoystick')),ctx);
const drawn=[];const brush={clearRect(){},save(){},restore(){},setLineDash(){},fillRect:(...v)=>drawn.push(v),strokeRect(){}};
const canvas={clientWidth:1000,clientHeight:600,getContext:()=>brush};
const projection={viewport:{x:0,y:0},hero:{x:50,y:0,face:-1},foes:[],character:{strike:{shape:'box',x:1,y:.8,w:2,h:.8}},stroke:{tick:7,startup:6,active:7}};
ctx.paintCombatOverlay(canvas,projection);assert.deepEqual(drawn[0],[430,447,70,30]);drawn.length=0;projection.stroke.tick=6;ctx.paintCombatOverlay(canvas,projection);assert(!drawn.length);
for(const file of ['model','simulation'])vm.runInContext(await readFile('src/'+file+'.js','utf8'),ctx);
const m=vm.runInContext('({seed,newStory,newNode,newShot,defaultStageTrack,DialogueCursor,stageText,FieldRun,defaultCameraFrame,cameraFrame,MapViewport,defaultMix:undefined,imageRefs,soundRefs,problem,packNativeWorld,prefabFields,prefabImpact,publishPrefab,poseAt,clipMarkers,emptyWork})',ctx);
const p=m.seed(),map=p.scenes[0],s=m.newStory('sequence','연출 검수'),a=s.nodes[0],b=m.newNode('branch'),end=m.newNode('finish');
s.nodes.push(b,end);p.stories=[s];a.text='눈😀길';b.text='분기';a.shot=m.newShot(a);
const portrait=a.shot.layers.find(l=>l.kind==='portrait'),hash='ab'.repeat(32);
a.stageTrack={...m.defaultStageTrack(),rate:60,skipTo:'finish',completeOnSkip:true,cues:[
  {id:'flag0',at:2,kind:'flag',key:'gate',on:true},{id:'flag1',at:2,kind:'flag',key:'gate',on:false},
  {id:'flag2',at:3,kind:'flag',key:'gate',on:true},{id:'arrival',at:4,kind:'move',target:portrait.id,dx:12,dy:-6},
  {id:'pan',at:4,kind:'camera',dx:5,dy:0},{id:'sfx',at:4,kind:'sound',sound:'asset:'+hash},
  {id:'last',at:40,kind:'flag',key:'seen',on:true}]};
a.choices=[{label:'열기',to:b.id,flag:'gate',on:true}];b.stageTrack={...m.defaultStageTrack(),autoTick:2};
assert.equal(m.problem(p),'');
let cursor=new m.DialogueCursor(s);assert(!cursor.allowed(0));assert(!cursor.advance(0));assert.equal(cursor.index,0);
cursor.step(2/60);assert.equal(cursor.visibleText(),'눈😀');assert(!cursor.allowed(0));
cursor.step(1/60);assert(cursor.allowed(0));cursor.step(1/60);
assert.equal(cursor.layers.changes.get(portrait.id).dx,12);assert.equal(cursor.layers.camera.dx,5);
assert.deepEqual([...cursor.sounds],['asset:'+hash]);cursor.sounds.length=0;cursor.step(0);assert(!cursor.sounds.length);
assert(!cursor.advance(0,true));assert.equal(cursor.node.id,'finish');assert(cursor.flags.has('seen'));
map.entryStory=s.id;const run=new m.FieldRun(p,map.id);
run.advance(0);assert.equal(run.dialogue.node.id,a.id);
for(let i=0;i<3;i++)run.tick(1/60);run.advance(0);assert.equal(run.dialogue.node.id,b.id);
run.tick(1/60);run.tick(1/60);assert.equal(run.dialogue.node.id,end.id);run.advance();
const early=m.newStory('entry_0','0틱');early.nodes[0].stageTrack={...m.defaultStageTrack(),cues:[{id:'zero',at:0,kind:'flag',key:'doNotEnter',on:true}]};
early.nodes.push(m.newNode('selected'));p.stories.push(early);const direct=new m.FieldRun(p,map.id,true);direct.openStory(early.id,null,'selected');
assert.equal(direct.dialogue.node.id,'selected');assert(!direct.flags.has('doNotEnter'));
assert(run.completedStories.has(s.id));assert(run.checkpoint().flags.includes('gate'));assert(!run.checkpoint().flags.includes('seen'));
const clone=structuredClone(p);clone.stories[0].nodes[0].stageTrack.cues[3].target='gone';assert(m.problem(clone));
assert(m.soundRefs(p).includes(hash));const guideHash='bc'.repeat(32);p.work={...m.emptyWork(),artGuide:{image:'asset:'+guideHash,mapId:map.id,notes:'기준'}};
assert(m.imageRefs(p).includes(guideHash));assert(!m.imageRefs(m.packNativeWorld(p)).includes(guideHash));assert.equal(m.packNativeWorld(p).stories[0].nodes[0].stageTrack.skipTo,'finish');
const plain=m.newNode('plain');plain.choices=[{label:'검수',to:b.id,flag:'gate'}];s.nodes.push(plain);const serialized=JSON.stringify(p);
assert.equal(m.packNativeWorld(p).stories[0].nodes.at(-1).choices[0].on,true);assert.equal(JSON.stringify(p),serialized);
map.width=350;map.height=200;map.camera.frame={zoom:2,left:10,right:85,bottom:12,top:80};map.camera.follow=0;
const viewport=new m.MapViewport(map,{x:0,y:0});assert.equal(viewport.x,30);assert.equal(viewport.y,18);
assert(m.problem(p)==='');const fadeRun=new m.FieldRun(p,map.id);assert.equal(fadeRun.sceneAge,0);fadeRun.tick(1/60);assert.equal(fadeRun.sceneAge,1);
map.camera.frame.fadeTicks=241;assert(m.problem(p));map.camera.frame.fadeTicks=30;map.camera.frame.fadeColor='#426580';assert.equal(m.problem(p),'');
viewport.follow({x:340,y:175},1);assert.equal(viewport.x,255);assert.equal(viewport.y,120);
const clip={frames:[{ticks:2,image:'a'},{ticks:2,image:'b'}],paint:{repeat:'once'}};assert.equal(m.poseAt(clip,4,true).image,'b');clip.paint.repeat='loop';assert.equal(m.poseAt(clip,4,false).image,'a');
const media={frames:[],cue:'',fx:'',cueTick:5};assert.deepEqual({...m.clipMarkers(media)},{soundTick:5,effectTicks:7});
media.markers={soundTick:14,effectTicks:20};p.characters[0].clips={attack:media};assert.equal(m.problem(p),'');
assert.equal(m.packNativeWorld(p).characters[0].motionClips[0].markers.soundTick,14);
media.markers.effectTicks=0;assert(m.problem(p));media.markers.effectTicks=20;
const src=map.objects.find(o=>o.type==='enemy'),template={id:'t',name:'연결',object:m.prefabFields(src)};src.prefab='t';
const obj={...structuredClone(src),id:'copy'};obj.enemy.health=421;map.objects.push(obj);src.enemy.health=60;src.enemy.sight=39;
const affected=m.prefabImpact(p,template,src).find(v=>v.objectId==='copy');assert(affected.changed.includes('enemy.sight'));assert(affected.overrides.includes('enemy.health'));
m.publishPrefab(p,template,src);assert.equal(obj.enemy.health,421);assert.equal(obj.enemy.sight,39);
console.log('PASS scene camera limits and zoom, stable ordered line cues, gated branches, Korean + surrogate reveals, skip-state policy, automatic line and quest progress, media package and prefab impact');
