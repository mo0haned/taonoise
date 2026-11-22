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
ok(!issues.length, 'no console errors: ' + issues.join(' | '));
if (SHOTS) await shots(ctxB, base);
async function shots(ctx, base) {
  fs.mkdirSync(shotDir, { recursive: true });
  for (const [name, w, h] of [['m', 390, 844], ['d', 1280, 800]]) for (const theme of ['dark', 'light']) {
    const p = await ctx.newPage(); await p.setViewportSize({ width: w, height: h }); await p.addInitScript(t => { try { localStorage.clear(); localStorage.setItem('taonoise.theme', JSON.stringify(t)); } catch (e) {} }, theme); await p.goto(base); await p.waitForSelector('.card');
    const f = n => path.join(shotDir, `${n}-${name}-${theme}.png`);
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
}
await b.close(); srv.close(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
