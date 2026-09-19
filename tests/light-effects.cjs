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
    send:(port,bit,value)=>writes.push({port,bit,value}),clear:()=>{clears++;},message(){},toggle:()=>{on=!on;api.steady(on);}});
  const frame=()=>{writes.length=0;api.invalidate();api.tick();return writes.map(w=>w.value);};
  return {api,el,storage,writes,frame,setTime:v=>now=v,setConnected:v=>connected=v,setPaused:v=>paused=v};
}
const {api,el,frame,setTime,storage,setConnected,setPaused}=setup();
assert.deepEqual(frame(),[0,80,80,0,80,80]);
api.action('allblink');assert.deepEqual(frame(),[0,100,100,0,100,100]);
setTime(600);assert.deepEqual(frame(),[0,0,0,0,0,0]);
api.action('left');assert.deepEqual(frame(),[0,100,80,0,100,80]);
api.action('right');assert.deepEqual(frame(),[0,80,100,0,80,100]);
api.action('right');assert.deepEqual(frame(),[0,80,80,0,80,80]);
api.action('allblink');api.action('all');assert.deepEqual(frame(),[0,0,0,0,0,0]);
api.action('all');assert.deepEqual(frame(),[0,80,80,0,80,80]);
// Swap physical front-left and front-right, then verify the left-only target.
el('lightSlot0').value='2';el('lightSlot0').handlers.change();
api.action('left');assert.deepEqual(frame(),[0,80,100,0,100,80]);
assert.deepEqual(JSON.parse(storage.get('legocon.lightEffects.v1')).slots,[2,1,4,5]);
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
el('probe0').handlers.click();assert.deepEqual(frame(),[0,0,70,0,0,0]);
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
