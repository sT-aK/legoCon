/* Four configurable light positions, two persistent presets, one composed output. */
const LightEffects = (() => {
  const positions = ['左前', '右前', '左後', '右後'];
  const defaults = () => ({slots:[1,2,4,5], selected:0, presets:[
    {wave:'blink', period:1000, low:0, high:100, duty:50, target:'all'},
    {wave:'fade', period:2000, low:0, high:100, duty:50, target:'all'},
  ]});
  const clamp = (v, lo, hi, fallback) => Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : fallback;
  function normalize(raw){
    const d = defaults();
    if (!raw || typeof raw !== 'object') return d;
    if (Array.isArray(raw.slots) && raw.slots.length === 4 && new Set(raw.slots).size === 4 && raw.slots.every(n => Number.isInteger(n) && n >= 0 && n < 6)) d.slots = [...raw.slots];
    d.selected = raw.selected === 1 ? 1 : 0;
    d.presets = d.presets.map((p,i) => {
      const s = raw.presets && raw.presets[i] || p;
      const low = Math.round(clamp(s.low,0,100,0));
      return {wave:s.wave === 'fade' ? 'fade' : 'blink', period:Math.round(clamp(s.period,400,10000,p.period)),
        low, high:Math.round(clamp(s.high,low,100,100)), duty:Math.round(clamp(s.duty,10,90,50)),
        target:['all','left','right','front','rear'].includes(s.target) ? s.target : 'all'};
    });
    return d;
  }
  function level(p, elapsed){
    const phase = ((elapsed % p.period) + p.period) % p.period / p.period;
    const split = p.duty / 100;
    const v = p.wave === 'blink' ? (phase < split ? 1 : 0)
      : (phase < split ? (1 - Math.cos(Math.PI * phase / split)) / 2
        : (1 + Math.cos(Math.PI * (phase - split) / (1-split))) / 2);
    return Math.round(p.low + (p.high-p.low)*v);
  }
  function indices(target){ return ({all:[0,1,2,3],left:[0,2],right:[1,3],front:[0,1],rear:[2,3]})[target] || [0,1,2,3]; }
  let config = defaults(), adapter = null, active = null, baseOn = true, last = new Map(), held = new Set(), inputReady = false;
  let connectedBefore = false, test = null, ready = false;
  function save(){
    try { localStorage.setItem('legocon.lightEffects.v1', JSON.stringify(config)); return true; }
    catch { adapter.message('設定を保存できません。ブラウザの保存領域を確認してください。'); return false; }
  }
  function invalidate(){ last.clear(); }
  function status(){
    if (!ready) return;
    document.getElementById('effectStatus').textContent = test ? '1灯確認中（2秒）'
      : active ? `${active.label} · モード${active.preset+1}` : baseOn ? '登録4灯：点灯' : '登録4灯：消灯';
  }
  function clearQueued(){ if (adapter) adapter.clear(); invalidate(); }
  function steady(on){
    baseOn = on; active = null; test = null; clearQueued(); status(); tick();
  }
  function setBase(on){ baseOn = on; clearQueued(); status(); tick(); }
  function suspend(){ active = null; test = null; inputReady = false; held.clear(); clearQueued(); status(); }
  function activate(target, preset, label){
    if (!adapter.connected()) { adapter.message('先にハブへ接続してください。'); return; }
    if (!adapter.hasLights()) { adapter.message('6LEDSが検出されていません。接続とポート検出を確認してください。'); return; }
    const same = active && active.target === target && active.preset === preset && active.label === label;
    active = same ? null : {target, preset, label, start:adapter.now()};
    test = null; clearQueued(); status(); tick();
  }
  function action(name){
    if (!ready || !adapter.connected() || adapter.paused()) return;
    if (name === 'all') { adapter.toggle(); return; }
    if (name === 'a' || name === 'x') {
      const n = name === 'a' ? 0 : 1;
      config.selected = n; save(); renderEditor();
      activate(config.presets[n].target,n,name === 'a' ? 'A カスタム' : 'X カスタム');
    } else activate(name,config.selected,({allblink:'ハザード',left:'左ウインカー',right:'右ウインカー'})[name] || 'ハザード');
  }
  function poll(pad, blocked){
    const down = new Set([0,1,2,3,4,5].filter(i => pad && (typeof pad.buttons[i] === 'number' ? pad.buttons[i] : pad.buttons[i]?.value || 0) > .5));
    if (!ready || blocked || !pad) { held = down; inputReady = false; return; }
    // A held button on reconnect/resume must be released before it can trigger an action.
    if (!inputReady) { held = down; if (!down.size) inputReady = true; return; }
    const actions = {0:'a',1:'all',2:'x',3:'allblink',4:'left',5:'right'};
    // B has priority when multiple lighting buttons are pressed together.
    if (down.has(1) && !held.has(1)) action('all');
    else for (const i of [0,2,3,4,5]) if (down.has(i) && !held.has(i)) { action(actions[i]); break; }
    held = down;
  }
  function tick(){
    if (!ready) return;
    const connected = adapter.connected();
    if (!connected) { if (connectedBefore) suspend(); connectedBefore = false; return; }
    if (!connectedBefore) { invalidate(); connectedBefore = true; }
    if (adapter.paused()) { invalidate(); return; }
    const now = adapter.now();
    if (test && now >= test.until) { test = null; clearQueued(); status(); }
    const values = Array(6).fill(0);
    config.slots.forEach(bit => {values[bit] = baseOn ? adapter.brightness() : 0;});
    if (active){
      const p = config.presets[active.preset], value = level(p,now-active.start);
      indices(active.target).forEach(i => {values[config.slots[i]] = value;});
    }
    if (test) { values.fill(0); values[test.bit] = 70; }
    // Six independent queue keys prevent a newer left command from replacing a right command.
    adapter.ports().forEach(port => values.forEach((value,bit) => {
      const key = `${port}:${bit}`;
      if (last.get(key) !== value) { adapter.send(port,bit,value); last.set(key,value); }
    }));
  }
  function renderEditor(){
    const p = config.presets[config.selected];
    document.getElementById('effectPreset').value = config.selected;
    for (const k of ['wave','period','low','high','duty','target']) document.getElementById('effect_'+k).value = p[k];
  }
  function init(a){
    adapter = a;
    try { config = normalize(JSON.parse(localStorage.getItem('legocon.lightEffects.v1'))); } catch { config = defaults(); }
    const host = document.getElementById('lightEffects');
    host.innerHTML = `<h2>ライトの操作</h2>
      <p class="note">Y：4灯ハザード ／ B：全灯オン・オフ ／ LB・RB：左・右ウインカー。もう一度押すと点滅を終了します。全灯は登録した車体4灯です。</p>
      <div class="row"><button type="button" data-effect="allblink">Y ハザード</button><button type="button" data-effect="all">B 全灯</button><button type="button" data-effect="left">LB 左</button><button type="button" data-effect="right">RB 右</button></div>
      <div class="row" style="margin-top:8px"><button type="button" data-effect="a">A モード1</button><button type="button" data-effect="x">X モード2</button></div>
      <p id="effectStatus" role="status" class="note"></p>
      <details open><summary>点灯モードを設定・保存</summary>
      <p class="note">Aはモード1、Xはモード2を呼び出します。Y・LB・RBは選択中のモードの周期と明るさを使います。保存して適用後、設定はこのブラウザに残ります。</p>
      <div class="grid">
        <div><label for="effectPreset">編集するモード</label><select id="effectPreset"><option value="0">モード1（A）</option><option value="1">モード2（X）</option></select></div>
        <div><label for="effect_wave">点滅の方式</label><select id="effect_wave"><option value="blink">オン・オフ切り替え</option><option value="fade">グラデーション</option></select></div>
        <div><label for="effect_period">1周期（ミリ秒・400〜10000）</label><input id="effect_period" type="number" min="400" max="10000" step="100"></div>
        <div><label for="effect_duty">点灯／明るくなる時間の割合（%）</label><input id="effect_duty" type="number" min="10" max="90" step="5"></div>
        <div><label for="effect_low">最小の明るさ（0〜100%）</label><input id="effect_low" type="number" min="0" max="100"></div>
        <div><label for="effect_high">最大の明るさ（0〜100%）</label><input id="effect_high" type="number" min="0" max="100"></div>
        <div><label for="effect_target">A・Xで点滅する場所</label><select id="effect_target"><option value="all">4灯すべて</option><option value="left">左2灯</option><option value="right">右2灯</option><option value="front">前2灯</option><option value="rear">後2灯</option></select></div>
      </div><button id="saveEffect" type="button" style="margin-top:10px">保存して適用</button><p id="effectSaveStatus" role="status" class="note"></p></details>
      <details style="margin-top:12px"><summary>前後左右のライトを入れ替える</summary>
      <p class="note">初期の位置は仮設定です。各位置にLED 1〜6を割り当て、「確認」で1灯ずつ点けてください。同じ番号を選ぶと位置を交換します。設定は自動保存されます。</p>
      <div class="grid">${positions.map((name,i) => `<div><label for="lightSlot${i}">${name}</label><select id="lightSlot${i}">${Array.from({length:6},(_,bit) => `<option value="${bit}">LED ${bit+1}</option>`).join('')}</select><button type="button" class="ghost" data-light-test="${i}" style="margin-top:6px">${name}を確認（2秒）</button></div>`).join('')}</div></details>
      <p class="note">点滅はページを開いている間に動作します。切断・画面を離れたときは点滅を解除します。緊急停止はMenu（≡）・画面STOP・Spaceです。</p>`;
    host.querySelectorAll('[data-effect]').forEach(el => el.addEventListener('click',() => action(el.dataset.effect)));
    document.getElementById('effectPreset').addEventListener('change',e => {config.selected = Number(e.target.value); save(); renderEditor();});
    document.getElementById('saveEffect').addEventListener('click',() => {
      const candidate = {};
      for (const k of ['wave','period','low','high','duty','target']) candidate[k] = document.getElementById('effect_'+k).value;
      config.presets[config.selected] = candidate;
      config = normalize(config);
      const saved = save(); renderEditor();
      if (active) active.start = adapter.now();
      clearQueued(); tick();
      document.getElementById('effectSaveStatus').textContent = saved ? `モード${config.selected+1}を保存しました。` : '保存できませんでした。このページ内のみで適用します。';
    });
    config.slots.forEach((bit,i) => {
      const el = document.getElementById('lightSlot'+i); el.value = bit;
      el.addEventListener('change',() => {
        const next = Number(el.value), other = config.slots.indexOf(next), old = config.slots[i];
        if (other >= 0) config.slots[other] = old;
        config.slots[i] = next;
        config.slots.forEach((v,j) => {document.getElementById('lightSlot'+j).value = v;});
        test = null; save(); clearQueued(); tick(); status();
      });
    });
    host.querySelectorAll('[data-light-test]').forEach(el => el.addEventListener('click',() => {
      if (!adapter.connected() || !adapter.hasLights() || adapter.paused()) { adapter.message('6LEDSが検出された接続中に確認してください。'); return; }
      active = null; test = {bit:config.slots[Number(el.dataset.lightTest)], until:adapter.now()+2000};
      clearQueued(); tick(); status();
    }));
    ready = true; renderEditor(); status(); setInterval(tick,100);
  }
  return {init, poll, steady, setBase, suspend, invalidate, action, tick, normalize, level, indices, get ready(){return ready;}};
})();
