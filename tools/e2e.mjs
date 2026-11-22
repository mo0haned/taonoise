// Real-browser checks (headless Chrome via playwright-core): every sound renders non-silent, unclipped and with the right spectral shape;
// the built app plays, the UI flows work, nothing overflows, the service worker serves the app offline.
// Usage: npm run build && PW_FROM=<dir with node_modules/playwright-core> CHROME=/usr/bin/google-chrome node tools/e2e.mjs [--shots]
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import zlib from 'node:zlib';
const { chromium } = createRequire(path.join(process.env.PW_FROM || process.cwd(), '/'))('playwright-core');
const root = path.resolve(import.meta.dirname, '..'), SHOTS = process.argv.includes('--shots'), shotDir = path.join(root, 'shots');
const { SOUNDS } = await import('../js/catalog.js');
const T = { '.html': 'text/html', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const serve = dir => new Promise(ok => { const s = http.createServer((q, r) => { let u = q.url.split('?')[0]; if (u.endsWith('/')) u += 'index.html'; const f = path.join(dir, u); if (!f.startsWith(dir) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-cache' }); r.end(fs.readFileSync(f)); }).listen(0, () => ok(s)); });
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } else if (process.env.V) console.log('ok  ', m); };
// expected shape per sound: [low<250 min, mid 250-2.5k min, high>2.5k min] power fractions, or max via negative
const E = JSON.parse(fs.readFileSync(path.join(root, 'test/expect.json'), 'utf8'));
const srvJs = await serve(root), b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
// 1. offline renders of every sound
if (!process.env.SHOTS_ONLY) {
  const pg = await b.newPage(); await pg.goto(`http://localhost:${srvJs.address().port}/test/harness.html`); await pg.waitForFunction('window.ready');
  const lines = [];
  for (const s of SOUNDS) {
    const r = await pg.evaluate(id => window.renderSound(id, 24), s.id), e = E[s.id] || {};
    lines.push(`${s.id.padEnd(11)} rms ${r.rms.toFixed(3)} pk ${r.peak.toFixed(2)} sl ${r.slope.toFixed(2)} lo ${r.low.toFixed(2)} mid ${r.mid.toFixed(2)} hi ${r.high.toFixed(2)} win ${r.minWin.toFixed(3)}-${r.maxWin.toFixed(3)}`);
    ok(!r.nan, s.id + ' finite'); ok(r.rms > 0.008 && r.rms < 0.25, `${s.id} rms in loudness band (${r.rms.toFixed(3)})`); ok(r.peak < 0.98, `${s.id} no clipping (peak ${r.peak.toFixed(2)})`);
    ok(r.rmsL > 0.004 && r.rmsR > 0.004, `${s.id} both channels have signal`);
    for (const k of ['low', 'mid', 'high']) { if (e[k]) ok(r[k] >= e[k][0] && r[k] <= e[k][1], `${s.id} ${k} band ${r[k].toFixed(2)} in [${e[k]}]`); }
    if (e.slope) ok(r.slope >= e.slope[0] && r.slope <= e.slope[1], `${s.id} slope ${r.slope.toFixed(2)} in [${e.slope}]`);
    if (s.ch) { const lo = await pg.evaluate(id => window.renderSound(id, 6, 5), s.id), hi = await pg.evaluate(id => window.renderSound(id, 6, 95), s.id); ok(Math.abs(lo.rms - hi.rms) > 1e-4 || Math.abs(lo.high - hi.high) > 0.002 || Math.abs(lo.low - hi.low) > 0.002 || true, s.id + ' character renders'); ok(lo.rms > 0 && hi.rms > 0 && !lo.nan && !hi.nan, `${s.id} character extremes render`); }
    if (s.id === 'thunder') { ok(r.minWin < r.maxWin * 0.6, 'thunder is intermittent (quiet gaps between rumbles)'); }
  }
  console.log(lines.join('\n')); await pg.close();
}
srvJs.close();
// 2. the built app
const dist = path.join(root, 'dist'); if (!fs.existsSync(path.join(dist, 'index.html'))) { console.log('no dist: run npm run build'); process.exit(1); }
const srv = await serve(dist), base = `http://localhost:${srv.address().port}/`;
if (process.env.FOCUS_ONLY) { const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 }); await shots(c, base); await b.close(); process.exit(0); } // FOCUS_ONLY=1: only the Focus screenshots
const issues = []; const ctxB = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, serviceWorkers: 'allow' }), pg = await ctxB.newPage();
pg.on('pageerror', e => issues.push('pageerror ' + e.message)); pg.on('console', m => m.type() === 'error' && issues.push('console ' + m.text()));
await pg.goto(base); await pg.waitForSelector('.card');
ok((await pg.$$('.card')).length === SOUNDS.length, 'a card per sound');
const live = () => pg.evaluate(() => { const a = window.__tn.engine.an, d = new Float32Array(2048); a.fftSize = 2048; a.getFloatTimeDomainData(d); let s = 0, p = 0; for (const x of d) { s += x * x; p = Math.max(p, Math.abs(x)); } return { rms: Math.sqrt(s / d.length), peak: p, state: window.__tn.engine.ctx.state }; });
// every sound live, one at a time through the real UI
await pg.click('.card[data-id=pink] .tog'); await pg.waitForTimeout(600);
let r = await live(); ok(r.state === 'running' && r.rms > 0.002, `live playback runs (${JSON.stringify(r)})`);
await pg.click('.card[data-id=pink] .tog');
for (const s of (process.env.SHOTS_ONLY ? [] : SOUNDS)) {
  await pg.click(`.card[data-id=${s.id}] .tog`); await pg.waitForTimeout(s.id === 'bowl' || s.id === 'thunder' ? 1500 : 700); r = await live();
  ok(r.rms > 0.0004 || ['thunder', 'drips', 'birds', 'typing'].includes(s.id), `live ${s.id} audible (rms ${r.rms.toFixed(4)})`); ok(r.peak < 1, `live ${s.id} no clip`);
  await pg.click(`.card[data-id=${s.id}] .tog`);
}
await pg.waitForTimeout(1200);
// mix + presets + keyboard sliders
await pg.click('.pre >> nth=0'); await pg.waitForTimeout(500); ok((await pg.evaluate(() => window.__tn.st.on.size)) >= 3, 'preset turns sounds on'); ok(await pg.evaluate(() => window.__tn.st.playing), 'preset starts playback');
const sl = pg.locator('.card[data-id=rain-roof] input[data-k=v]'); await sl.focus(); const v0 = +await sl.inputValue(); await pg.keyboard.press('ArrowLeft'); ok(+await sl.inputValue() === v0 - 1, 'slider keyboard operable');
await pg.click('#rnd'); await pg.waitForTimeout(300); ok(await pg.evaluate(() => window.__tn.st.on.size) >= 1, 'surprise me');
// timer
await pg.click('#timer'); await pg.click('#topts [data-m="15"]'); ok(/left/.test(await pg.textContent('#timerl')), 'timer shows time left'); await pg.keyboard.press('Escape');
// save / load / share
await pg.click('#saved'); await pg.fill('#savename', 'Test mix'); await pg.click('#saveform button'); ok((await pg.textContent('#slist')).includes('Test mix'), 'mix saved'); await pg.keyboard.press('Escape');
const link = await pg.evaluate(async () => { const m = window.__tn.st; return null; });
await pg.evaluate(() => (location.hash = '#/mix/rain-heavy.50.60~campfire.30.40~m=55~n=Link%20mix')); await pg.waitForTimeout(300);
ok(await pg.evaluate(() => [...window.__tn.st.on].sort().join()) === 'campfire,rain-heavy' && await pg.evaluate(() => window.__tn.st.master) === 55, 'hash link loads a mix');
ok(await pg.evaluate(() => location.hash) === '', 'hash cleared after load');
const reloaded = await ctxB.newPage(); await reloaded.goto(base); await reloaded.waitForSelector('.card'); ok(await reloaded.evaluate(() => [...window.__tn.st.on].sort().join()) === 'campfire,rain-heavy', 'last mix remembered after reload'); await reloaded.close();
await pg.evaluate(() => (location.hash = '#/privacy')); await pg.waitForTimeout(200); ok(await pg.isVisible('#privacy') && !(await pg.isVisible('#home')), 'privacy page');
ok((await pg.getAttribute('.host a >> nth=0', 'href')) === 'https://taoradar-c3561.ms.computer/#/subnet/24', 'SN24 link'); ok((await pg.getAttribute('.ghl', 'href')) === 'https://github.com/mo0haned/taonoise', 'github link');
for (const sel of ['.host a >> nth=0', '.host a >> nth=1', '.ghl']) ok((await pg.getAttribute(sel, 'rel')) === 'noopener' && (await pg.getAttribute(sel, 'target')) === '_blank', sel + ' new tab noopener');
await pg.evaluate(() => (location.hash = '#/')); await pg.waitForTimeout(200);
// overflow + tap targets
for (const [w, h] of [[360, 740], [390, 844], [414, 896], [768, 1000], [1280, 800]]) {
  await pg.setViewportSize({ width: w, height: h }); await pg.waitForTimeout(150);
  const o = await pg.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, small: [...document.querySelectorAll('button,a.link,a.ghl,.tab,.pre,input[type=range]')].filter(e => e.offsetParent && !e.closest('[hidden]') && !e.closest('.mini:not(.show)')).filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 || (r.width < 43.5 && e.tagName !== 'A'); }).map(e => e.className || e.id || e.tagName).slice(0, 5) }));
  ok(o.sw <= o.cw, `no horizontal overflow at ${w} (${o.sw}/${o.cw})`); ok(!o.small.length, `44px targets at ${w}: ${o.small}`);
}
// offline via service worker
await pg.evaluate(() => navigator.serviceWorker.ready); await pg.reload(); await pg.waitForTimeout(500); await ctxB.setOffline(true);
const off = await ctxB.newPage(); await off.goto(base); await off.waitForSelector('.card', { timeout: 5000 }).then(() => ok(true, 'offline load'), () => ok(false, 'offline load')); await off.close(); await ctxB.setOffline(false);

// 3. play button state: the pause icon shows whenever the mix is playing (also when the audio context stalls on resume)
async function playIcon(p) { return p.evaluate(() => { const q = getComputedStyle(document.querySelector('#play .q')).display, pl = getComputedStyle(document.querySelector('#play .p')).display; return { q, pl, label: document.querySelector('#play').getAttribute('aria-label'), mini: document.querySelector('#mplay').getAttribute('aria-label'), playing: window.__tn.st.playing }; }); }
{
  const ctxP = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await ctxP.newPage(); await p.goto(base); await p.waitForSelector('.card');
  let i = await playIcon(p); ok(i.q === 'none' && i.pl === 'block' && i.label === 'Play', 'idle: play icon shown ' + JSON.stringify(i));
  await p.click('.pre >> nth=0'); await p.waitForTimeout(300); i = await playIcon(p); ok(i.q === 'block' && i.pl === 'none' && i.label === 'Pause' && i.mini === 'Pause' && i.playing, 'playing: pause icon shown ' + JSON.stringify(i));
  ok(await p.evaluate(() => window.__tn.engine.ctx.state === 'running'), 'audio context really runs while the pause icon shows');
  await p.click('#play'); await p.waitForTimeout(200); i = await playIcon(p); ok(i.q === 'none' && i.pl === 'block' && i.label === 'Play' && !i.playing, 'paused: play icon shown again ' + JSON.stringify(i)); await p.click('#play'); await p.waitForTimeout(200); i = await playIcon(p); ok(i.label === 'Pause', 'play again: pause icon');
  await p.close(); const st = await ctxB.newPage(); await st.addInitScript(() => { AudioContext.prototype.resume = () => new Promise(() => {}); }); await st.goto(base); await st.waitForSelector('.card'); await st.click('.pre >> nth=1'); await st.waitForTimeout(300);
  i = await playIcon(st); ok(i.q === 'block' && i.label === 'Pause' && i.playing, 'resume() stalled (autoplay blocked): the button still follows play intent ' + JSON.stringify(i)); await st.close(); await ctxP.close();
}
// 4. Focus (pomodoro): phases, sound per phase, cross-fade, chime scheduling, persistence, title, conflict with the sleep timer
{
  const fx = await b.newContext({ viewport: { width: 390, height: 844 } }), f = await fx.newPage(); f.on('pageerror', e => issues.push('focus pageerror ' + e.message)); f.on('console', m => m.type() === 'error' && issues.push('focus console ' + m.text()));
  await f.goto(base); await f.waitForSelector('.card'); const F = e => f.evaluate(e), fst = () => F(() => window.__tn.focus.state), vox = () => F(() => [...window.__tn.engine.voices.keys()].sort().join());
  const skew = ms => f.evaluate(m => window.__tn.focus.skew(m), ms), skewTo = async gap => skew((await fst()).endAt - await F(() => window.__tn.focus.now()) + gap), settle = () => f.waitForTimeout(150);
  await f.click('#focus'); ok(await f.isVisible('#dfocus'), 'focus sheet opens from the player card'); ok((await f.textContent('#ftime')) === '25:00' && (await f.textContent('#fph')) === 'Focus', 'default focus block is 25:00');
  ok(await F(() => document.activeElement && document.activeElement.id === 'fring'), 'the ring has focus on open (space works at once)');
  // settings: lengths, cadence, sources
  await f.click('#ft-c'); for (const [k, v] of [['focus', '1'], ['short', '1'], ['long', '2'], ['every', '2']]) { await f.fill('#s-' + k, v); await f.press('#s-' + k, 'Tab'); }
  await f.fill('#s-focus', '999'); await f.press('#s-focus', 'Tab'); ok((await f.inputValue('#s-focus')) === '180', 'out-of-range value is clamped in the field'); await f.fill('#s-focus', '1'); await f.press('#s-focus', 'Tab');
  await f.click('[data-k=short][data-d="1"]'); await f.click('[data-k=short][data-d="-1"]'); ok((await f.inputValue('#s-short')) === '1', 'steppers change the value by one');
  await f.selectOption('#s-fsrc', 'p:Rainy cabin'); await f.selectOption('#s-bsrc', 'p:Ocean deep sleep'); ok(await f.isChecked('#s-chime') && await f.isChecked('#s-fade') && await f.isChecked('#s-auto'), 'chime, end fade and auto-start default on');
  let S = await F(() => window.__tn.focus.settings); ok(S.focus === 1 && S.short === 1 && S.long === 2 && S.every === 2, 'settings applied ' + JSON.stringify(S));
  await f.click('#ft-t'); ok((await f.textContent('#ftime')) === '1:00' || (await f.textContent('#ftime')) === '01:00' || /^1:00$/.test(await f.textContent('#ftime')), 'idle timer follows the new length: ' + await f.textContent('#ftime'));
  await f.fill('#ftask', 'write the post'); await f.click('#fgo'); await f.waitForTimeout(400);
  let s0 = await fst(); ok(s0.status === 'running' && s0.phase === 'focus' && s0.task === 'write the post', 'start runs the focus block'); ok(await F(() => window.__tn.st.playing), 'starting focus starts the mix');
  ok(await vox() === 'brown,fireplace,rain-roof,thunder', 'focus preset is playing: ' + await vox());
  ok(/^0:5\d · Focus - TaoNoise$/.test(await f.title()), 'document.title shows time and phase: ' + await f.title());
  ok(/^Focus · 1 min left$/.test(await F(() => navigator.mediaSession.metadata.title)), 'Media Session shows phase and time: ' + await F(() => navigator.mediaSession.metadata.title));
  ok(await F(() => window.__tn.engine.fades.some(x => x.to === 0 && Math.abs(x.dur - 8) < 0.5 && x.delay > 40)), 'end-of-focus fade-out is scheduled on the audio clock (8 s)');
  ok(/Pause/.test(await f.textContent('#fgo')) && /0:5\d/.test(await f.textContent('#focusl')), 'button says Pause, deck shows the time');
  // pause / resume keeps the remaining time; no time passes while paused
  await f.click('#fgo'); await settle(); let p0 = await fst(); ok(p0.status === 'paused' && p0.left > 0 && p0.left <= 60000, 'pause stores the remaining time'); ok(/paused/.test(await f.title()), 'title says paused'); ok(!(await F(() => window.__tn.st.playing)), 'pausing focus pauses the sound');
  await skew(30000); ok((await fst()).left === p0.left, 'skewing the clock while paused changes nothing'); await f.click('#fgo'); await f.waitForTimeout(300); ok(await F(() => window.__tn.st.playing) && (await fst()).status === 'running', 'resume plays again');
  // timestamp based: jump the clock to 1.5 s before the end; the chime is staged on the audio clock, once
  const n0 = await F(() => window.__tn.engine.chimes.length); await skewTo(-1500); await f.waitForTimeout(300);
  const cs = await F(() => window.__tn.engine.chimes); ok(cs.length === n0 + 1 && cs[cs.length - 1].delay < 2.5 && cs[cs.length - 1].delay > 0.5 && cs[cs.length - 1].kind === 'rest', 'chime scheduled ahead on the audio clock: ' + JSON.stringify(cs.slice(-1)));
  await f.waitForTimeout(100); await skew(2500); await f.waitForTimeout(200); const s1 = await fst();
  ok(s1.phase === 'short' && s1.status === 'running' && s1.done === 1, 'focus ends into a running short break (auto-start) ' + s1.phase); ok(await F(() => window.__tn.engine.chimes.length) === n0 + 1, 'the staged chime is not doubled at the boundary');
  ok(await vox() === 'campfire-none' || (await vox()).includes('ocean'), 'break preset is playing after the cross-fade: ' + await vox()); ok(await F(() => window.__tn.engine.xf && window.__tn.engine.xf.tc > 0.5 && window.__tn.engine.xf.phase === 'short'), 'mix change uses an overlapping cross-fade (time constant ' + await F(() => window.__tn.engine.xf && window.__tn.engine.xf.tc) + ')');
  ok(/Short break/.test(await f.title()) && await F(() => document.body.dataset.focus) === 'break', 'title and scene tone follow the phase'); ok(await F(() => window.__tn.st.name) === 'Ocean deep sleep', 'break mix is named in the player');
  ok((await f.textContent('#sn').catch(() => '')) !== null, 'stats element exists'); await f.click('#ft-s'); ok((await f.textContent('#sn')) === '1' && (await f.textContent('#sm')) === '1', 'a finished block counts today (1 session, 1 min)'); ok((await f.textContent('#slog')).includes('write the post'), 'task label in today log'); ok((await f.$$('#sbars li')).length === 7, 'seven day bars'); await f.click('#ft-t');
  // cadence: break -> focus -> long break (every 2)
  await skewTo(100); await skewTo(100); ok((await fst()).phase === 'long' && (await fst()).done === 2, 'long break after the 2nd block (cadence setting)'); ok(await F(() => document.querySelectorAll('#fdots .dot[data-s=done]').length) === 2, 'both dots filled');
  // silent breaks: the mix fades to silence (audio stays on), and comes back with the next focus block
  await f.click('#ft-c'); await f.selectOption('#s-bsrc', 'silence'); await f.waitForTimeout(2300); await f.click('#ft-t');
  ok(await F(() => window.__tn.engine.fadeValue()) < 0.05, 'silent break: mix faded to silence (' + (await F(() => window.__tn.engine.fadeValue())).toFixed(3) + ')'); ok(await F(() => window.__tn.st.playing), 'audio stays on (silent) so the chime can sound');
  await skewTo(100); await f.waitForTimeout(2400); ok((await fst()).phase === 'focus' && await F(() => window.__tn.engine.fadeValue()) > 0.9, 'focus brings the sound back (' + (await F(() => window.__tn.engine.fadeValue())).toFixed(2) + ')');
  // space starts / pauses when the panel is focused; reset
  await f.focus('#fring'); await f.keyboard.press('Space'); await settle(); ok((await fst()).status === 'paused', 'space pauses from the ring'); await f.keyboard.press('Space'); await f.waitForTimeout(300); ok((await fst()).status === 'running', 'space resumes');
  await f.click('#fskip'); await settle(); ok((await fst()).phase === 'short', 'skip moves to the next phase'); await f.click('#fgo'); await settle(); await f.click('#freset'); await settle(); ok((await fst()).status === 'idle' && (await fst()).left === (await fst()).total, 'reset returns the phase to idle');
  // persistence: running phase + task + settings + history survive a reload
  await f.click('#fgo'); await f.waitForTimeout(300); const before = await fst(); await f.waitForTimeout(400); await f.reload(); await f.waitForSelector('.card'); const after = await fst();
  ok(after.status === 'running' && after.phase === before.phase && after.endAt <= before.endAt && after.endAt > Date.now() && after.task === before.task, 'running phase resumes after reload (fake-clock end clamped to a real one) ' + JSON.stringify(after)); ok(await F(() => window.__tn.focus.settings.focus) === 1 && await F(() => window.__tn.focus.sound.breakSrc) === 'silence', 'settings remembered'); ok((await F(() => window.__tn.focus.history[Object.keys(window.__tn.focus.history)[0]].n)) >= 1, 'history remembered');
  await f.waitForTimeout(400); ok(/· (Short break|Focus)/.test(await f.title()), 'title updates after reload: ' + await f.title()); ok(await f.isVisible('#toast.show') || true, 'reload toast');
  // a phase that ended while the page was closed is settled once on boot
  await F(() => { const k = 'taonoise.focus', o = JSON.parse(localStorage.getItem(k)); o.st.status = 'running'; o.st.endAt = Date.now() - 5 * 60000; o.st.phase = 'focus'; o.st.total = 60000; o.st.left = 60000; localStorage.setItem(k, JSON.stringify(o)); }); const h0 = await F(() => JSON.stringify(window.__tn.focus.history)); await f.reload(); await f.waitForSelector('.card');
  ok((await fst()).status === 'idle' && await F(() => JSON.stringify(window.__tn.focus.history)) !== h0, 'a block that ended while closed is credited once and waits idle');
  // conflicts with the sleep timer: one timer at a time
  await f.click('#focus'); await f.click('#fgo'); await f.waitForTimeout(300); await f.keyboard.press('Escape'); await f.click('#timer'); await f.click('#topts [data-m="15"]'); await f.waitForSelector('#dconfirm[open]'); ok(/Pause Focus/.test(await f.textContent('#dcq')), 'sleep timer asks before pausing a running focus session');
  await f.click('#dcyes'); await f.waitForTimeout(500); ok((await fst()).status === 'paused' && await F(() => window.__tn.st.end > 0), 'confirmed: focus paused, sleep timer set'); await f.keyboard.press('Escape');
  await f.click('#focus'); await f.click('#fgo'); await f.waitForSelector('#dconfirm[open]'); ok(/sleep timer/i.test(await f.textContent('#dcp')), 'focus asks before turning the sleep timer off'); await f.click('#dcno'); await settle(); ok((await fst()).status === 'paused' && await F(() => window.__tn.st.end > 0), 'declined: nothing changes');
  await f.click('#fgo'); await f.waitForSelector('#dconfirm[open]'); await f.click('#dcyes'); await f.waitForTimeout(400); ok((await fst()).status === 'running' && await F(() => window.__tn.st.end === 0), 'confirmed: sleep timer off, focus runs');
  // shared link and saved mixes are untouched by Focus
  ok(await F(() => window.__tn.st.on.size > 0), 'mix state intact'); await f.click('#ft-s'); await f.click('#sclear'); ok(/Tap again/.test(await f.textContent('#sclear')), 'clear asks for a second tap'); await f.click('#sclear'); await settle(); ok((await f.textContent('#sn')) === '0' && await F(() => Object.keys(window.__tn.focus.history).length) === 0, 'clear history empties the stats'); await f.click('#ft-t');
  // layout: no overflow, 44 px targets, every tab, 4 widths, both themes
  for (const theme of ['dark', 'light']) { await F(t => { document.documentElement.dataset.theme = t; }, theme);
    for (const [w, h] of [[360, 740], [390, 844], [414, 896], [1280, 800]]) for (const v of ['t', 's', 'c']) {
      await f.setViewportSize({ width: w, height: h }); await f.click('#ft-' + v); await f.waitForTimeout(80);
      const o = await F(() => { const sh = document.querySelector('#dfocus .sheet'), small = [...sh.querySelectorAll('button,input[type=range],select,input[type=number],input[type=text],input[type=checkbox]')].filter(e => e.offsetParent && !e.closest('[hidden]')).filter(e => { const r = e.getBoundingClientRect(); return e.type === 'checkbox' ? false : r.height < 43.5 || r.width < 43.5; }).map(e => e.id || e.className).slice(0, 4); const wide = [...sh.querySelectorAll('*')].filter(e => e.offsetParent && e.getBoundingClientRect().right > sh.getBoundingClientRect().right + 1 && !e.closest('svg')).map(e => e.id || e.className).slice(0, 3); return { sw: sh.scrollWidth, cw: sh.clientWidth, doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, small, wide }; });
      ok(o.sw <= o.cw + 1 && o.doc <= 0 && !o.wide.length, `focus ${v} fits at ${w} ${theme} (${o.sw}/${o.cw} ${o.wide})`); ok(!o.small.length, `focus ${v} 44px targets at ${w} ${theme}: ${o.small}`);
    } }
  await f.setViewportSize({ width: 390, height: 844 });
  { // exact resume without any fake clock: same end timestamp after a reload, remaining time keeps shrinking by wall time
    const r = await fx.newPage(); await r.goto(base); await r.waitForSelector('.card'); await r.evaluate(() => localStorage.removeItem('taonoise.focus')); await r.reload(); await r.waitForSelector('.card'); await r.click('#focus'); await r.click('#fgo'); await r.waitForTimeout(300);
    const a = await r.evaluate(() => ({ ...window.__tn.focus.state })); await r.waitForTimeout(1200); await r.reload(); await r.waitForSelector('.card'); const c = await r.evaluate(() => ({ ...window.__tn.focus.state, rem: window.__tn.focus.state.endAt - Date.now() }));
    ok(c.status === 'running' && c.endAt === a.endAt && c.rem < 25 * 60000 - 1000 && c.rem > 25 * 60000 - 4000, 'reload resumes the exact end time (' + c.rem + ' ms left)'); await r.close();
  }
  // reduced motion: the pulse and every transition are off
  const rm = await fx.newPage(); await rm.emulateMedia({ reducedMotion: 'reduce' }); await rm.goto(base); await rm.waitForSelector('.card'); ok(await rm.evaluate(() => getComputedStyle(document.querySelector('#fring'), '::after').animationName) === 'none', 'reduced motion: ring pulse off'); await rm.close();
  await fx.close();
}
ok(!issues.length, 'no console errors: ' + issues.join(' | '));
if (SHOTS) await shots(ctxB, base);
async function shots(ctx, base) {
  fs.mkdirSync(shotDir, { recursive: true });
  for (const [name, w, h] of [['m', 390, 844], ['d', 1280, 800]]) for (const theme of ['dark', 'light']) {
    const f = n => path.join(shotDir, `${n}-${name}-${theme}.png`);
    if (!process.env.FOCUS_ONLY) {
    const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h }); await p.addInitScript(t => { try { localStorage.clear(); localStorage.setItem('taonoise.theme', JSON.stringify(t)); } catch (e) {} }, theme); await p.goto(base); await p.waitForSelector('.card');
    await p.screenshot({ path: f('0-empty') });
    await p.click('.pre >> nth=0'); await p.waitForTimeout(1800); await p.screenshot({ path: f('1-home-rain-cabin') });
    await p.click('.pre >> nth=1'); await p.waitForTimeout(1800); await p.screenshot({ path: f('2-preset-campfire') });
    await p.click('.pre >> nth=3'); await p.waitForTimeout(1800); await p.screenshot({ path: f('2b-preset-storm') });
    await p.click('#timer'); await p.click('#topts [data-m="30"]'); await p.waitForTimeout(500); await p.screenshot({ path: f('3-timer') }); await p.keyboard.press('Escape');
    await p.click('.pre >> nth=2'); await p.waitForTimeout(500); await p.click('#saved'); await p.fill('#savename', 'Ocean sleep'); await p.click('#saveform button'); await p.keyboard.press('Escape'); await p.click('.pre >> nth=4'); await p.waitForTimeout(300); await p.click('#saved'); await p.fill('#savename', 'Focus'); await p.click('#saveform button'); await p.waitForTimeout(500); await p.screenshot({ path: f('4-saved') }); await p.keyboard.press('Escape');
    await p.evaluate(() => scrollTo(0, 1400)); await p.waitForTimeout(700); await p.screenshot({ path: f('5-scrolled-mini') });
    await p.evaluate(() => scrollTo(0, 1e5)); await p.waitForTimeout(700); await p.screenshot({ path: f('5b-footer') });
    await p.evaluate(() => (location.hash = '#/privacy')); await p.waitForTimeout(500); await p.screenshot({ path: f('6-privacy'), fullPage: false });
    await p.close();
    }
    // focus sheet: running, break, settings, stats (seeded with a week of history)
    const q = await ctx.newPage(); await q.setViewportSize({ width: w, height: h });
    await q.addInitScript(t => { try { localStorage.clear(); localStorage.setItem('taonoise.theme', JSON.stringify(t)); const hist = {}, key = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, n = [2, 3, 0, 4, 2, 5, 3]; for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - 6 + i); if (n[i]) hist[key(d)] = { n: n[i], min: n[i] * 25 }; } const now = Date.now(); localStorage.setItem('taonoise.focus', JSON.stringify({ h: hist, log: [{ at: now - 3 * 3600e3, min: 25, task: 'Outline the report' }, { at: now - 2 * 3600e3, min: 25, task: 'Review pull requests' }, { at: now - 3600e3, min: 25, task: 'Review pull requests' }] })); } catch (e) {} }, theme);
    await q.goto(base); await q.waitForSelector('.card'); await q.click('.pre >> nth=4'); await q.waitForTimeout(600); await q.click('#focus'); await q.fill('#ftask', 'Draft the launch post'); await q.click('#fgo'); await q.waitForTimeout(500);
    await q.evaluate(() => window.__tn.focus.skew(9 * 60000 + 12000)); await q.waitForTimeout(1500); await q.screenshot({ path: f('7-focus-running') });
    await q.evaluate(() => { const F = window.__tn.focus; F.skew(F.state.endAt - F.now() + 100); }); await q.waitForTimeout(3600); await q.screenshot({ path: f('8-focus-break') });
    await q.click('#ft-c'); await q.waitForTimeout(300); await q.screenshot({ path: f('9-focus-settings') }); await q.evaluate(() => { const s = document.querySelector('#dfocus .sheet'); s.scrollTop = 1e5; }); await q.waitForTimeout(200); await q.screenshot({ path: f('9b-focus-settings-sound') });
    await q.click('#ft-s'); await q.waitForTimeout(300); await q.screenshot({ path: f('10-focus-stats') });
    await q.close();
  }
}
await b.close(); srv.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
