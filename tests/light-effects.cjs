const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname,'../light-effects.js'),'utf8');
function setup(saved){
  const elements = new Map(), actions = [], probes = [], writes = [], storage = new Map();
  if (saved) storage.set('legocon.lightEffects.v1',JSON.stringify(saved));
  function el(id){
    if (!elements.has(id)) elements.set(id,{value:'',textContent:'',dataset:{}, handlers:{},
      addEventListener(type,fn){this.handlers[type]=fn;},
      querySelectorAll(selector){return selector === '[data-effect]' ? actions : probes;},
    });
    return elements.get(id);
  }
  for (const name of ['allblink','all','left','right','a','x']) {const e=el(name);e.dataset.effect=name;actions.push(e);}
  for(let i=0;i<4;i++){const e=el('probe'+i);e.dataset.lightTest=String(i);probes.push(e);}
  const ctx = vm.createContext({document:{getElementById:el},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},setInterval(){}});
  vm.runInContext(source,ctx);
  const api = vm.runInContext('LightEffects',ctx);
  let now=0,connected=true,paused=false,on=true,clears=0;
  api.init({connected:()=>connected,paused:()=>paused,hasLights:()=>true,now:()=>now,brightness:()=>80,ports:()=>[53],
    sendFrame:(port,groups)=>groups.forEach(({mask,value})=>writes.push({port,mask,value})),clear:()=>{clears++;},message(){},toggle:()=>{on=!on;api.steady(on);}});
  const frame=()=>{
    writes.length=0;api.invalidate();api.tick();
    if (!writes.length) return [];
    const values=Array(6).fill(null);
    writes.forEach(({mask,value})=>values.forEach((_,bit)=>{if(mask & (1<<bit)) values[bit]=value;}));
    return values;
  };
  return {api,el,storage,writes,frame,setTime:v=>now=v,setConnected:v=>connected=v,setPaused:v=>paused=v};
}
const {api,el,frame,setTime,storage,setConnected,setPaused}=setup();
assert.deepEqual(frame(),[0,80,80,0,80,80]);
api.action('allblink');assert.deepEqual(frame(),[0,100,100,0,100,100]);
setTime(600);assert.deepEqual(frame(),[0,0,0,0,0,0]);
api.action('left');assert.deepEqual(frame(),[0,80,100,0,100,80]);
api.action('right');assert.deepEqual(frame(),[0,100,80,0,80,100]);
api.action('right');assert.deepEqual(frame(),[0,80,80,0,80,80]);
api.action('allblink');api.action('all');assert.deepEqual(frame(),[0,0,0,0,0,0]);
api.action('all');assert.deepEqual(frame(),[0,80,80,0,80,80]);
// Swap physical front-left and front-right, then verify the left-only target.
el('lightSlot0').value='1';el('lightSlot0').handlers.change();
api.action('left');assert.deepEqual(frame(),[0,100,80,0,100,80]);
assert.deepEqual(JSON.parse(storage.get('legocon.lightEffects.v1')).slots,[1,2,4,5]);
// Configure and retain independent presets.
el('effectPreset').handlers.change({target:{value:'1'}});
Object.entries({wave:'fade',period:'2000',low:'20',high:'80',duty:'50',target:'rear'}).forEach(([k,v])=>el('effect_'+k).value=v);
el('saveEffect').handlers.click();
api.action('x');assert.deepEqual(frame(),[0,80,80,0,20,20]);
setTime(1600);assert.deepEqual(frame(),[0,80,80,0,80,80]);
setTime(2600);assert.deepEqual(frame(),[0,80,80,0,20,20]);
const persisted=JSON.parse(storage.get('legocon.lightEffects.v1'));
assert.equal(persisted.presets[0].wave,'blink');assert.equal(persisted.presets[1].low,20);
const restored=setup(persisted);restored.api.action('x');assert.deepEqual(restored.frame(),[0,80,80,0,20,20]);
// No output during disconnection/diagnostics; reconnect resets effects to steady.
setConnected(false);assert.deepEqual(frame(),[]);setConnected(true);assert.deepEqual(frame(),[0,80,80,0,80,80]);
setPaused(true);assert.deepEqual(frame(),[]);setPaused(false);
// One-lamp test terminates and restores steady light.
el('probe0').handlers.click();assert.deepEqual(frame(),[0,70,0,0,0,0]);
setTime(4700);assert.deepEqual(frame(),[0,80,80,0,80,80]);
// Press edges, release gate and B priority.
const pad=(...down)=>({buttons:Array.from({length:10},(_,i)=>({value:down.includes(i)?1:0}))});
api.poll(pad(3),false);assert.deepEqual(frame(),[0,80,80,0,80,80]);
api.poll(pad(),false);api.poll(pad(3),false);assert.deepEqual(frame(),[0,20,20,0,20,20]);
api.poll(pad(3),false);assert.deepEqual(frame(),[0,20,20,0,20,20]);
api.poll(pad(),false);api.poll(pad(1,3),false);assert.deepEqual(frame(),[0,0,0,0,0,0]);
api.poll(pad(),true);api.poll(pad(1),false);assert.deepEqual(frame(),[0,0,0,0,0,0]);
// Malformed saved values are bounded and duplicate light assignments rejected.
const bad=api.normalize({slots:[1,1,1,1],presets:[{period:-1,low:90,high:10,duty:200},null]});
assert.equal(bad.presets[0].period,400);assert.equal(bad.presets[0].high,90);assert.equal(new Set(bad.slots).size,4);
assert.equal(api.level({wave:'fade',period:1000,low:0,high:100,duty:50},250),50);
console.log('Light effects: masks, switching, fade, persistence, slot swap, input edges, reconnect and bounds passed.');

// Old defaults migrate once; calibrated layouts and presets survive reloads.
const legacy = {slots:[1,2,4,5],selected:1,presets:persisted.presets};
const migrated = setup(legacy);
const migratedConfig = JSON.parse(migrated.storage.get('legocon.lightEffects.v1'));
assert.deepEqual(migratedConfig.slots,[2,1,4,5]);
assert.deepEqual(migratedConfig.presets,legacy.presets);
assert.equal(migratedConfig.selected,1);
assert.deepEqual(JSON.parse(setup(migratedConfig).storage.get('legocon.lightEffects.v1')),migratedConfig);
assert.deepEqual(JSON.parse(setup({...legacy,slots:[5,4,2,1]}).storage.get('legocon.lightEffects.v1')).slots,[5,4,2,1]);
assert.deepEqual(JSON.parse(setup({...legacy,layoutVersion:2}).storage.get('legocon.lightEffects.v1')).slots,[1,2,4,5]);

// Synchronous groups: all four hazard lamps share one physical command.
const grouped = setup();
grouped.api.action('allblink');grouped.frame();
assert.deepEqual(grouped.writes.filter(w=>w.value===100),[{port:53,mask:0x36,value:100}]);
grouped.setTime(600);grouped.frame();
assert.deepEqual(grouped.writes,[{port:53,mask:0x3f,value:0}]);
grouped.api.action('left');grouped.frame();
assert.deepEqual(grouped.writes.filter(w=>w.value===100),[{port:53,mask:0x14,value:100}]);
grouped.api.action('right');grouped.frame();
assert.deepEqual(grouped.writes.filter(w=>w.value===100),[{port:53,mask:0x22,value:100}]);
grouped.api.action('x');grouped.setTime(1100);grouped.frame();
assert.deepEqual(grouped.writes.filter(w=>w.value===50),[{port:53,mask:0x36,value:50}]);

// A partially sent old frame must be fully superseded without losing motor commands.
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const fn=html.slice(html.indexOf('function queueLampFrame('),html.indexOf('function setLampsOn('));
const pending=new Map([['motor',{bytes:'motor'}],['led:99:1',{bytes:'other hub port'}]]);
const q=vm.createContext({pending,cmdLamp:(port,value,mask)=>({port,value,mask}),noteOutput(){},drain(){}});
vm.runInContext(fn,q);
q.groups=grouped.api.groups([0,100,100,0,100,100]);vm.runInContext('queueLampFrame(53,groups)',q);
// Pretend the off command has already been sent while the remaining group is queued.
pending.delete('led:53:9');
q.groups=grouped.api.groups([0,80,0,0,0,80]);vm.runInContext('queueLampFrame(53,groups)',q);
assert(!pending.has('led:53:54'));assert(pending.has('motor'));assert(pending.has('led:99:1'));
const actual=Array(6).fill(100);
for(const [key,{bytes}] of pending) if(key.startsWith('led:53:')) for(let bit=0;bit<6;bit++) if(bytes.mask & 1<<bit) actual[bit]=bytes.value;
assert.deepEqual(actual,[0,80,0,0,0,80]);
console.log('Layout migration, synchronous lamp groups and latest-frame queue replacement passed.');
