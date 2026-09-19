const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const elements = new Map();
const ctx = vm.createContext({
  pad: null,
  cfg: {map: {
    accel:{kind:'button',index:7,dir:1}, brake:{kind:'button',index:6,dir:1},
    steer:{kind:'axis',index:0,dir:1}, spin:{kind:'axis',index:2,dir:1}, light:{kind:'button',index:3,dir:1},
  }},
  $: id => {
    assert(html.includes(`id="${id}"`), `Missing element ${id}`);
    if (!elements.has(id)) elements.set(id, {style:{}, textContent:''});
    return elements.get(id);
  },
});
vm.runInContext('function getPad(){return pad;}' + script.slice(script.indexOf('function describeMap('), script.indexOf('// 3 秒間サンプリング')), ctx);
const run = code => vm.runInContext(code, ctx);
run('renderMap()');
assert.equal(elements.get('guideAccel').textContent, 'RT · 右トリガー');
assert.equal(elements.get('guideLight').textContent, 'Y');
run('cfg.map.light.index = 0; renderMap()');
assert.equal(elements.get('guideLight').textContent, 'A');
assert.equal(elements.get('guideStop').textContent, 'B');
run('pad = {mapping:""}; renderMap()');
assert.equal(elements.get('guideLight').textContent, 'button[0]');
assert.equal(elements.get('guideStop').textContent, 'button[1]');
assert.equal(elements.get('controllerDiagram').style.display, 'none');
run('pad = {mapping:"standard"}; cfg.map.steer.dir = -1; renderMap()');
assert.equal(elements.get('guideSteer').textContent, '左スティック ↔（反転）');
assert.equal(elements.get('controllerDiagram').style.display, 'block');
console.log('Controller guide: defaults, remapping, fixed STOP and non-standard fallback passed.');
