const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8').replace(/\r\n/g, '\n');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
function section(from, to) {
  const start = script.indexOf(from), end = script.indexOf(to, start);
  assert(start >= 0 && end > start);
  return script.slice(start, end);
}
const ctx = vm.createContext({
  cfg: {roles: {}, lightColor: -1, lampBrightness: 65},
  detectedType: {50: 0x56, 51: 0x56, 52: 0x57, 53: 0x58, 54: 0x59, 63: 0x17},
  detected: {50: 'motor', 51: 'motor', 52: 'steer', 53: '6LEDS', 54: 'PLAYVM', 63: 'RGB'},
  connected: true, lampsOn: true, lightState: null, badPorts: new Set(),
  notifyWorking: true, commands: [], log() {},
});
vm.runInContext(`
  const SIX_LIGHT_TYPE = 0x58, PLAYVM_TYPE = 0x59, RGB_LIGHT_TYPE = 0x17;
  function queueCommand(key, bytes){ commands.push({key, bytes: Array.from(bytes)}); }
` + section('function cmdBrightness(', '// Port Input Format Setup')
  + section('function lightPort(){', 'function logAssignment(){')
  + section('function portUsable(', 'function sendControl(')
  + section('const TEST_PORTS', '// テスト用の直接送信')
  + section('const SENSOR_TYPES', '$("lightScanBtn").addEventListener'), ctx);
const run = code => vm.runInContext(code, ctx);
const json = code => JSON.parse(JSON.stringify(run(code)));
assert.deepEqual(json('Array.from(cmdLamp(53, 65))'), [9,0,0x81,53,0x11,0x51,0,0x36,65]);
assert.deepEqual(json('Array.from(cmdLamp(53, 0))'), [9,0,0x81,53,0x11,0x51,0,0x36,0]);
assert.equal(run('cmdLamp(53, 999)[8]'), 100);
assert.equal(run('cmdLamp(53, -5)[8]'), 0);
assert.deepEqual(json('lightRolePorts()'), [53]);
run('toggleLight();');
assert.equal(ctx.commands.length, 1);
assert.equal(ctx.commands[0].bytes[8], 0);
run('toggleLight();');
assert.equal(ctx.commands[1].bytes[8], 65);
assert(ctx.commands.every(c => c.bytes[3] === 53)); // No drive, steering, PLAYVM or status LED writes.
run('cfg.roles = {53: "light", 54: "light", 63: "light", 1: "light"}; detected[1] = "LED"; detectedType[1] = 8;');
assert.deepEqual(json('lightRolePorts()'), [1,53]); // Deduplication and RGB/PLAYVM exclusion.
assert.deepEqual(json('Array.from(cmdLamp(1, 65))'), [8,0,0x81,1,0x11,0x51,0,65]);
assert.deepEqual(json('scanPorts()'), [50,51,52]);
assert.deepEqual(json('lampCandidates()'), [1,53]);
run('badPorts.add(53); commands.length = 0; setLampsOn(true);');
assert.equal(ctx.commands.length, 1);
assert.equal(ctx.commands[0].bytes[3], 1);
run('badPorts.clear(); cfg.lightColor = 9; commands.length = 0; applyLight();');
assert(ctx.commands.some(c => c.bytes[3] === 63 && c.bytes[7] === 9));
assert(ctx.commands.some(c => c.bytes[3] === 53 && c.bytes[8] === 65));
run('detected = {53: "6LEDS"}; detectedType = {53: 0x58};');
assert.deepEqual(json('scanPorts()'), []); // No fallback to guessed motor ports.
console.log('Light packet, toggle, detection, legacy LED and diagnostic checks passed.');
