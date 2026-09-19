// Run with: node tests/control-safety.cjs (no dependencies or hardware needed).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/\r\n/g, '\n');
new vm.Script(script); // Check syntax of the entire application.
function section(from, to) {
  const start = script.indexOf(from);
  const end = script.indexOf(to, start);
  assert(start >= 0 && end > start);
  return script.slice(start, end);
}
function setup() {
  const elements = new Map();
  const events = {};
  const ctx = vm.createContext({
    connected: true, armed: false, testing: false, characteristic: {},
    steerPort: 52, pending: new Map(), document: { hidden: false },
    cfg: { roles: {50: 'drive_rev', 51: 'drive', 52: 'steer', 63: 'light'},
      map: {accel: 'accel', brake: 'brake', steer: 'steer', spin: 'spin', light: 'light'} },
    pad: {id: 'Test controller', mapping: 'standard', accel: 0, brake: 0, steer: 0, spin: 0, light: 0, stop: 0},
    controls: [], commands: [],
    $: id => { if (!elements.has(id)) elements.set(id, {addEventListener() {}}); return elements.get(id); },
    addEventListener: (name, fn) => { events[name] = fn; },
    log() {}, updateRawDebug() {}, updateInputUI() {}, toggleLight() {},
    requestAnimationFrame() {}, shape: x => x,
    readControl: (pad, key) => pad[key], btnValue: pad => pad.stop,
    cmdPower: (port, power) => ({port, power}),
  });
  vm.runInContext(`
    function getPad(){ return pad; }
    function sendControl(...values){ controls.push(values); }
    function queueCommand(key, bytes){ commands.push(bytes); }
  ` + section('const keys = new Set();', 'function getPad(){')
    + section('let lastSteer = null,', '// 検出が効いているのに')
    + section('function setArmed(on){', '/* ============================================================\n   UI 更新'), ctx);
  return {ctx, events, run: code => vm.runInContext(code, ctx)};
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('OK ' + name); }

for (const input of ['accel', 'brake', 'steer', 'spin']) {
  test('held ' + input + ' cannot unlock after connection or STOP', () => {
    const {ctx, run} = setup();
    run(`pad.${input} = 1; loop();`);
    assert.equal(ctx.armed, false);
    assert.equal(ctx.controls.length, 0);
    run(`pad.${input} = 0; loop(); pad.${input} = 1; loop();`);
    assert.equal(ctx.armed, true);
    assert.equal(ctx.controls.length, 2);
    run('stopAll(); controls.length = 0; loop();');
    assert.equal(ctx.armed, false);
    assert.equal(ctx.controls.length, 0);
    assert(ctx.commands.every(c => c.power === 0 && c.port !== 63));
    assert(ctx.commands.some(c => c.port === 50));
    assert(ctx.commands.some(c => c.port === 52));
  });
}
test('equal accelerator and brake inputs cannot unlock', () => {
  const {ctx, run} = setup();
  run('pad.accel = 1; pad.brake = 1; loop();');
  assert.equal(ctx.armed, false);
});
test('B stays stopped while held and requires neutral before resuming', () => {
  const {ctx, run} = setup();
  run('loop(); pad.stop = 1; loop(); loop();');
  assert.equal(ctx.armed, false);
  run('pad.spin = 1; pad.stop = 0; loop();');
  assert.equal(ctx.armed, false);
  run('pad.spin = 0; loop();');
  assert.equal(ctx.armed, true);
});
test('Space stays stopped until released', () => {
  const {ctx, events, run} = setup();
  run('pad = null; loop();');
  events.keydown({code: 'Space', preventDefault() {}});
  run('loop(); loop();');
  assert.equal(ctx.armed, false);
  events.keyup({code: 'Space'});
  run('loop();');
  assert.equal(ctx.armed, true);
});
test('hiding clears keyboard input and suppresses output', () => {
  const {ctx, events, run} = setup();
  run('pad = null; loop();');
  events.keydown({code: 'KeyW'});
  run('loop(); document.hidden = true;');
  events.visibilitychange();
  run('controls.length = 0; loop();');
  assert.equal(ctx.armed, false);
  assert.equal(ctx.controls.length, 0);
  run('document.hidden = false; loop();');
  assert.equal(ctx.armed, true);
  assert.equal(ctx.controls[0][0], 0);
});
test('blur clears keys whose keyup may be lost', () => {
  const {ctx, events, run} = setup();
  run('pad = null; loop();');
  events.keydown({code: 'KeyQ'});
  events.blur();
  run('controls.length = 0; loop();');
  assert.equal(ctx.controls[0][2], 0);
});
test('diagnostics and disconnected state cannot unlock or output', () => {
  const {ctx, run} = setup();
  run('testing = true; loop();');
  assert.equal(ctx.armed, false);
  run('testing = false; connected = false; loop();');
  assert.equal(ctx.armed, false);
  assert.equal(ctx.controls.length, 0);
});
console.log(`${passed} safety checks passed; application syntax checked.`);
