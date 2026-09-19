const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const effects = fs.readFileSync(path.join(__dirname,'../light-effects.js'),'utf8');
const elements = new Map();
function element(){return {style:{},dataset:{},value:'',textContent:'',innerHTML:'',children:[],
  addEventListener(){},appendChild(e){this.children.push(e);},querySelectorAll(){return [];}};}
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]));
for (const m of effects.matchAll(/id="([^"$]+)"/g)) ids.add(m[1]);
for(let i=0;i<4;i++) ids.add('lightSlot'+i);
const events = {}, intervals=[];
const document = {hidden:false,createElement:element,querySelectorAll:()=>[],getElementById(id){
  assert(ids.has(id),`Unknown element ${id}`);
  if(!elements.has(id)) elements.set(id,element());return elements.get(id);
}};
const context=vm.createContext({document,window:{isSecureContext:true},navigator:{getGamepads:()=>[],bluetooth:{}},
  localStorage:{getItem:()=>null,setItem(){}},performance:{now:()=>1000},
  addEventListener:(key,fn)=>events[key]=fn,requestAnimationFrame(){},setInterval:fn=>intervals.push(fn),setTimeout(){},clearTimeout(){},console,
});
vm.runInContext(effects,context);
vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],context);
vm.runInContext('loop()',context);
intervals.forEach(fn=>fn());
events.blur();events.pagehide();
assert.equal(elements.get('guideStop').textContent,'Menu（≡）');
assert(elements.get('lightEffects').innerHTML.includes('保存して適用'));
assert.equal(elements.get('effect_wave').value,'blink');
assert.equal(elements.get('lightSlot0').value,1);
console.log('Full application startup, lighting UI and page suspension passed.');
