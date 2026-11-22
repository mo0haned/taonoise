import { GROUPS, SOUNDS, BY_ID, PRESETS } from './catalog.js';
import { Engine } from './engine.js';
import { createViz } from './viz.js';
import { cleanMix, encodeMix, decodeMix, summary, surprise, timerGain, fadeSecFor, fmtClock } from './mix.js';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = { get(k, d) { try { const v = localStorage.getItem('taonoise.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('taonoise.' + k, JSON.stringify(v)); } catch (e) {} } };
const ic = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" aria-hidden="true"><use href="#${n}"/></svg>`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const engine = new Engine();
const st = { on: new Set(), vol: {}, chr: {}, master: 80, muted: false, playing: false, name: '', end: 0, totalMin: 0, filter: 'all', fadeIn: false, wake: false };
SOUNDS.forEach(s => { st.vol[s.id] = s.dv; st.chr[s.id] = s.dc; });
const GH = 'https://github.com/mo0haned/taonoise';

// ---- markup ----
const card = s => { const g = GROUPS.find(x => x.id === s.g); return `<article class="card" data-id="${s.id}" data-g="${s.g}" style="--h:${g.hue}"><button class="tog" type="button" aria-pressed="false"><span class="tile">${ic('g-' + s.g)}</span><span class="nm">${esc(s.name)}</span></button>
<label class="sl"><span class="sr">${esc(s.name)} volume</span><input type="range" min="0" max="100" value="${s.dv}" data-k="v" aria-label="${esc(s.name)} volume"></label>
${s.ch ? `<label class="sl ch"><span class="lbl">${esc(s.ch)}</span><input type="range" min="0" max="100" value="${s.dc}" data-k="c" aria-label="${esc(s.name)} ${esc(s.ch)}"></label>` : ''}</article>`; };
$('#app').innerHTML = `
<div class="wrap">
<header class="top"><a class="brand" href="#/" aria-label="TaoNoise home"><svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><use href="#mark"/></svg><span>TaoNoise</span></a>
<button class="ib" id="theme" type="button" aria-label="Switch theme">${ic('i-moon', 'moon')}${ic('i-sun', 'sun')}</button></header>
<div id="home">
<section class="hero"><h1>Make your own quiet.</h1><p>Rain, fire, wind, ocean and 30 more sounds, synthesized live in your browser. Layer as many as you like.</p></section>
<section class="deck" aria-label="Player">
<div class="deck-main"><button class="bigplay" id="play" type="button" aria-label="Play">${ic('i-play', 'p')}${ic('i-pause', 'q')}</button>
<div class="now"><h2 id="nowt" aria-live="polite">Pick a sound to begin</h2><div class="chips" id="chips"></div></div></div>
<div class="ctl"><div class="mv"><button class="ib" id="mute" type="button" aria-label="Mute" aria-pressed="false">${ic('i-vol', 'v')}${ic('i-mute', 'm')}</button><label class="sl"><span class="sr">Master volume</span><input type="range" id="master" min="0" max="100" value="80" aria-label="Master volume"></label></div>
<div class="acts"><button class="btn" id="timer" type="button">${ic('i-timer')}<span id="timerl">Sleep timer</span></button><button class="btn" id="rnd" type="button">${ic('i-shuffle')}<span>Surprise me</span></button><button class="btn" id="saved" type="button">${ic('i-save')}<span>Save &amp; mixes</span></button><button class="btn" id="share" type="button">${ic('i-share')}<span>Share link</span></button></div></div>
</section>
<section class="presets" aria-label="Presets"><h2>Start from a scene</h2><div class="prow" id="prow">${PRESETS.map((p, i) => `<button class="pre" type="button" data-i="${i}">${esc(p.name)}</button>`).join('')}</div></section>
<section aria-label="Sounds"><div class="tabs" id="tabs"><button type="button" class="tab" data-f="all" aria-pressed="true">${ic('i-all')}All<span class="n">${SOUNDS.length}</span></button>${GROUPS.map(g => `<button type="button" class="tab" data-f="${g.id}" aria-pressed="false" style="--h:${g.hue}">${ic('g-' + g.id)}${g.name}</button>`).join('')}</div>
<div class="grid" id="grid">${SOUNDS.map(card).join('')}</div></section>
</div>
<section id="privacy" hidden><a class="back" href="#/">${ic('i-back')}Back to the mixer</a><article class="doc"><h1>Privacy and policy</h1>
<p>TaoNoise is a static page. It has no server of its own, no account, no analytics and no third-party scripts, fonts or trackers. Nothing you do here is sent anywhere.</p>
<h2>What is stored on your device</h2><ul><li><strong>Your last mix and settings</strong> (which sounds, volumes, master volume, theme, timer options) in this browser's local storage, so the page reopens as you left it.</li><li><strong>Mixes you save</strong>, in local storage, under a name you choose.</li><li><strong>An offline copy of the app</strong> (the page and its icons) in the browser cache, so it opens without a network.</li></ul>
<p>Clear this site's data in your browser settings and all of it is gone. You can also delete saved mixes inside the app.</p>
<h2>What is not collected</h2><ul><li>No cookies, no accounts, no analytics, no logs of what you play.</li><li>No audio files are downloaded: every sound is generated on your device by your browser's Web Audio engine.</li><li>No microphone or camera access.</li></ul>
<h2>Share links</h2><p>A share link keeps the mix inside the part of the address after the <code>#</code>. Browsers never send that part to a server. Whoever opens the link gets the same mix.</p>
<h2>Hosting</h2><p>The site is hosted as static files on Bittensor SN24 via ms.computer, which serves the page like any web host (it can see the request for the page, as every host can). The code is open source and MIT licensed at <a href="${GH}" target="_blank" rel="noopener">github.com/mo0haned/taonoise</a>.</p></article></section>
<footer class="foot"><ul class="pills"><li>${ic('i-nodl')}No downloads</li><li>${ic('i-noacct')}No account</li><li>${ic('i-offline')}Works offline</li></ul>
<div class="frow"><a class="link" href="#/privacy">${ic('i-shield')}Privacy and policy</a>
<p class="host">Hosted on Bittensor <a href="https://taoradar-c3561.ms.computer/#/subnet/24" target="_blank" rel="noopener">SN24</a> · <a href="https://ms.computer" target="_blank" rel="noopener">ms.computer</a></p></div>
<div class="gh"><a class="ghl" href="${GH}" target="_blank" rel="noopener">${ic('i-gh')}<span>mo0haned/taonoise</span></a><span class="ghs">Add your features or build your own</span></div></footer>
</div>
<div class="mini" id="mini" aria-hidden="true"><button class="ib mplay" id="mplay" type="button" aria-label="Play" tabindex="-1">${ic('i-play', 'p')}${ic('i-pause', 'q')}</button><div class="mt"><b id="mnow">TaoNoise</b><span id="mtime"></span></div><button class="ib" id="mmute" type="button" aria-label="Mute" tabindex="-1">${ic('i-vol', 'v')}${ic('i-mute', 'm')}</button><label class="sl msl"><span class="sr">Master volume</span><input type="range" id="mmaster" min="0" max="100" value="80" aria-label="Master volume" tabindex="-1"></label></div>
<dialog id="dtimer" aria-labelledby="dtt"><div class="sheet"><div class="sh"><h2 id="dtt">Sleep timer</h2><button class="ib" data-close type="button" aria-label="Close">${ic('i-x')}</button></div>
<p class="sub">The mix fades out gently, then stops. <span id="tleft"></span></p><div class="opts" id="topts">${[15, 30, 45, 60, 90, 120].map(m => `<button class="btn" type="button" data-m="${m}">${m} min</button>`).join('')}<button class="btn" type="button" data-m="0">Off</button></div>
<label class="chk"><input type="checkbox" id="fadein"><span>Fade in over 10 seconds when I press play</span></label><label class="chk" id="wakel"><input type="checkbox" id="wake"><span>Keep the screen on while playing</span></label></div></dialog>
<dialog id="dsaved" aria-labelledby="dst"><div class="sheet"><div class="sh"><h2 id="dst">Save &amp; mixes</h2><button class="ib" data-close type="button" aria-label="Close">${ic('i-x')}</button></div>
<form class="save" id="saveform"><input id="savename" maxlength="40" placeholder="Name this mix" aria-label="Mix name" autocomplete="off"><button class="btn pri" type="submit">${ic('i-save')}Save current mix</button></form><ul class="list" id="slist"></ul></div></dialog>
<div class="toast" id="toast" role="status" aria-live="polite"></div>`;
const svgMark = `<symbol id="mark" viewBox="0 0 32 32"><rect width="32" height="32" rx="9" fill="#1b1245"/><g stroke-linecap="round" stroke-width="3.2"><path d="M7 13v6" stroke="#9b8cff"/><path d="M11.800 9v14" stroke="#b6a6ff"/><path d="M16 5.500v21" stroke="#ffc2a8"/><path d="M20.200 10v12" stroke="#b6a6ff"/><path d="M25 14v4" stroke="#9b8cff"/></g></symbol>`;
$('svg defs').insertAdjacentHTML('beforeend', svgMark);

// ---- state helpers ----
const mix = () => cleanMix({ name: st.name, master: st.master, items: [...st.on].map(id => ({ id, v: st.vol[id], c: st.chr[id] })) });
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const viz = createViz($('#scene'), () => engine.level(), reduced);
let toastT; const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); };
const isLight = () => document.documentElement.dataset.theme === 'light';
function setTheme(t, keep) { document.documentElement.dataset.theme = t; if (!keep) store.set('theme', t); $('meta[name=theme-color]').content = t === 'light' ? '#f1ecff' : '#0c0820'; $('#theme').setAttribute('aria-label', t === 'light' ? 'Switch to dark theme' : 'Switch to light theme'); paint(); }
let saveT; const persist = () => { clearTimeout(saveT); saveT = setTimeout(() => store.set('last', { ...mix(), t: Date.now() }), 250); };
const fill = i => i.style.setProperty('--p', i.value + '%');
const remaining = () => (st.end ? st.end - Date.now() : 0);

function paint() {
  $$('.card').forEach(c => { const id = c.dataset.id, on = st.on.has(id); c.toggleAttribute('data-on', on); $('.tog', c).setAttribute('aria-pressed', on); $$('input', c).forEach(i => { const v = st[i.dataset.k === 'v' ? 'vol' : 'chr'][id]; if (+i.value !== v) i.value = v; fill(i); i.setAttribute('aria-valuetext', v + ' percent'); }); });
  const m = mix(), has = m.items.length > 0, t = st.name || summary(m);
  $('#nowt').textContent = has ? t : 'Pick a sound to begin'; $('#mnow').textContent = has ? t : 'TaoNoise';
  $('#chips').innerHTML = m.items.map(i => `<button class="chip" type="button" data-id="${i.id}" style="--h:${GROUPS.find(g => g.id === BY_ID[i.id].g).hue}" aria-label="Remove ${esc(BY_ID[i.id].name)}">${esc(BY_ID[i.id].name)}${ic('i-x')}</button>`).join('');
  document.body.toggleAttribute('data-playing', st.playing); $$('#play, #mplay').forEach(b => b.setAttribute('aria-label', st.playing ? 'Pause' : 'Play'));
  $$('#mute, #mmute').forEach(b => { b.setAttribute('aria-pressed', st.muted); b.setAttribute('aria-label', st.muted ? 'Unmute' : 'Mute'); b.toggleAttribute('data-muted', st.muted); });
  [$('#master'), $('#mmaster')].forEach(i => { i.value = st.master; fill(i); i.setAttribute('aria-valuetext', st.master + ' percent'); });
  $$('#prow .pre').forEach(b => b.toggleAttribute('data-on', PRESETS[b.dataset.i].name === st.name));
  viz.set(m.items.map(i => ({ id: i.id, v: st.playing ? st.vol[i.id] : st.vol[i.id] * 0.3 })), isLight()); tickTimer(); media(); persist();
}
function syncEngine() {
  if (!st.playing) return; for (const id of st.on) if (!engine.voices.has(id)) engine.addSound(id, st.vol[id], st.chr[id]); for (const id of [...engine.voices.keys()]) if (!st.on.has(id)) engine.removeSound(id);
}
async function play() {
  if (!st.on.size) { applyMix(PRESETS[0], false); }
  st.playing = true; engine.setMaster(st.master); engine.setMuted(st.muted); await engine.start(st.fadeIn ? 10 : 0.4); engine.resetFade(); syncEngine(); armTimer(); wakeLock(); paint();
}
function pause() { st.playing = false; engine.pause(); paint(); }
const toggle = () => (st.playing ? pause() : play());
function applyMix(m, auto = true) {
  m = cleanMix(m); st.on = new Set(m.items.map(i => i.id)); m.items.forEach(i => { st.vol[i.id] = i.v; st.chr[i.id] = i.c; }); st.master = m.master; st.name = m.name;
  syncEngine(); paint(); if (auto && !st.playing) play(); else if (st.playing) { engine.setMaster(st.master); for (const i of m.items) { engine.setVol(i.id, i.v); engine.setChar(i.id, i.c); } }
}
function setOn(id, on) {
  on ? st.on.add(id) : st.on.delete(id); st.name = ''; if (on && !st.playing) { play(); return; } syncEngine(); paint();
}
// ---- timer ----
function armTimer() {
  if (!st.end || !st.playing) return; const left = remaining() / 1000, fade = Math.min(fadeSecFor(st.totalMin), left);
  if (left <= 0) return endTimer(); const g = timerGain(st.end, Date.now(), fade); if (left > fade) engine.ramp(1, 0, left - fade, fade); else engine.ramp(g, 0, 0, left);
}
function setTimer(min) { st.totalMin = min; st.end = min ? Date.now() + min * 60000 : 0; if (!min) engine.resetFade(); else armTimer(); store.set('opts', { fadeIn: st.fadeIn, wake: st.wake }); tickTimer(); toast(min ? `Sleep timer set for ${min} minutes` : 'Sleep timer off'); }
function endTimer() { st.end = 0; st.totalMin = 0; if (st.playing) { pause(); toast('Sleep timer finished'); } setTimeout(() => engine.resetFade(), 800); }
function tickTimer() {
  const left = remaining(); if (st.end && left <= 0) return endTimer();
  const txt = st.end ? fmtClock(left) : ''; $('#timerl').textContent = st.end ? txt + ' left' : 'Sleep timer'; $('#mtime').textContent = txt ? txt + ' left' : (st.playing ? 'Playing' : 'Paused'); $('#timer').toggleAttribute('data-on', !!st.end);
  $('#tleft').textContent = st.end ? `${txt} left.` : ''; $$('#topts [data-m]').forEach(b => b.toggleAttribute('data-on', st.end ? +b.dataset.m === st.totalMin : b.dataset.m === '0'));
}
setInterval(tickTimer, 500); document.addEventListener('visibilitychange', () => { tickTimer(); if (!document.hidden) wakeLock(); });
// ---- media session + wake lock ----
function media() {
  if (!('mediaSession' in navigator)) return; const m = mix(); try {
    navigator.mediaSession.metadata = new MediaMetadata({ title: st.name || summary(m) || 'TaoNoise', artist: 'TaoNoise', album: 'Mixed live in your browser', artwork: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }); navigator.mediaSession.playbackState = st.playing ? 'playing' : 'paused';
  } catch (e) {}
}
if ('mediaSession' in navigator) { for (const [a, f] of [['play', () => !st.playing && play()], ['pause', () => st.playing && pause()], ['stop', () => st.playing && pause()]]) try { navigator.mediaSession.setActionHandler(a, f); } catch (e) {} }
let lock = null; async function wakeLock() { if (!st.wake || !st.playing || !('wakeLock' in navigator)) return; try { if (!lock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => (lock = null)); } } catch (e) {} }
// ---- saved mixes ----
const saved = () => store.get('saved', []);
function renderSaved() {
  const l = saved(); $('#slist').innerHTML = l.length ? l.map((m, i) => `<li><div class="si"><b>${esc(m.name || 'Untitled')}</b><span>${esc(summary(cleanMix(m)))}</span></div><button class="btn" type="button" data-a="load" data-i="${i}">Load</button><button class="ib" type="button" data-a="share" data-i="${i}" aria-label="Copy link to ${esc(m.name)}">${ic('i-share')}</button><button class="ib" type="button" data-a="del" data-i="${i}" aria-label="Delete ${esc(m.name)}">${ic('i-trash')}</button></li>`).join('') : '<li class="empty">No saved mixes yet. Build something you like and save it here.</li>';
}
async function copyLink(m) { const url = location.origin + location.pathname + encodeMix(m); try { await navigator.clipboard.writeText(url); toast('Link copied. The mix lives in the link itself.'); } catch (e) { prompt('Copy this link', url); } }
// ---- events ----
$('#play').onclick = $('#mplay').onclick = toggle;
$('#mute').onclick = $('#mmute').onclick = () => { st.muted = !st.muted; engine.setMuted(st.muted); paint(); };
$$('#master, #mmaster').forEach(i => (i.oninput = () => { st.master = +i.value; engine.setMaster(st.master); paint(); }));
$('#grid').addEventListener('click', e => { const b = e.target.closest('.tog'); if (b) { const id = b.closest('.card').dataset.id; setOn(id, !st.on.has(id)); } });
$('#grid').addEventListener('input', e => {
  const i = e.target.closest('input'); if (!i) return; const id = i.closest('.card').dataset.id, v = +i.value; st.name = '';
  if (i.dataset.k === 'v') { st.vol[id] = v; if (!st.on.has(id) && v > 0) return setOn(id, true); engine.setVol(id, v); } else { st.chr[id] = v; engine.setChar(id, v); } paint();
});
$('#chips').onclick = e => { const b = e.target.closest('.chip'); if (b) setOn(b.dataset.id, false); };
$('#prow').onclick = e => { const b = e.target.closest('.pre'); if (b) applyMix(PRESETS[b.dataset.i]); };
$('#rnd').onclick = () => applyMix(surprise());
$('#share').onclick = () => { const m = mix(); m.items.length ? copyLink(m) : toast('Add a sound first'); };
$('#tabs').onclick = e => { const b = e.target.closest('.tab'); if (!b) return; st.filter = b.dataset.f; $$('.tab').forEach(t => t.setAttribute('aria-pressed', t === b)); $$('.card').forEach(c => (c.hidden = st.filter !== 'all' && c.dataset.g !== st.filter)); };
const dlg = id => $(id); document.addEventListener('click', e => { if (e.target.closest('[data-close]')) e.target.closest('dialog').close(); else if (e.target.tagName === 'DIALOG') e.target.close(); });
$('#timer').onclick = () => { tickTimer(); dlg('#dtimer').showModal(); };
$('#topts').onclick = e => { const b = e.target.closest('[data-m]'); if (b) { setTimer(+b.dataset.m); } };
$('#fadein').onchange = e => { st.fadeIn = e.target.checked; store.set('opts', { fadeIn: st.fadeIn, wake: st.wake }); };
$('#wake').onchange = e => { st.wake = e.target.checked; store.set('opts', { fadeIn: st.fadeIn, wake: st.wake }); if (st.wake) wakeLock(); else if (lock) lock.release(); };
if (!('wakeLock' in navigator)) $('#wakel').hidden = true;
$('#saved').onclick = () => { renderSaved(); $('#savename').value = st.name; dlg('#dsaved').showModal(); };
$('#saveform').onsubmit = e => { e.preventDefault(); const m = mix(); if (!m.items.length) return toast('Add a sound first'); m.name = $('#savename').value.trim().slice(0, 40) || summary(m); const l = saved().filter(x => x.name !== m.name); l.unshift(m); store.set('saved', l.slice(0, 50)); st.name = m.name; renderSaved(); paint(); toast('Saved'); };
$('#slist').onclick = e => { const b = e.target.closest('[data-a]'); if (!b) return; const l = saved(), m = l[+b.dataset.i]; if (b.dataset.a === 'load') { dlg('#dsaved').close(); applyMix(m); } else if (b.dataset.a === 'share') copyLink(m); else { l.splice(+b.dataset.i, 1); store.set('saved', l); renderSaved(); } };
$('#theme').onclick = () => setTheme(isLight() ? 'dark' : 'light');
document.addEventListener('keydown', e => { if (e.code === 'Space' && e.target === document.body) { e.preventDefault(); toggle(); } });
// mini player appears when the main player scrolls out of view
const mini = $('#mini'); new IntersectionObserver(([en]) => { const show = !en.isIntersecting; mini.classList.toggle('show', show); mini.setAttribute('aria-hidden', !show); $$('button,input', mini).forEach(x => (x.tabIndex = show ? 0 : -1)); }, { threshold: 0 }).observe($('.deck'));
// ---- routing ----
function route() {
  const h = location.hash, m = decodeMix(h);
  if (m) { history.replaceState(null, '', location.pathname); applyMix(m, false); toast('Shared mix loaded. Press play.'); return; }
  const p = h === '#/privacy'; $('#home').hidden = p; $('#privacy').hidden = !p; mini.style.display = p ? 'none' : ''; scrollTo(0, 0); document.title = p ? 'Privacy and policy - TaoNoise' : 'TaoNoise - mix your own white noise';
}
addEventListener('hashchange', route);
// ---- boot ----
const th = store.get('theme', null); setTheme(th || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'), !th);
const o = store.get('opts', {}); st.fadeIn = !!o.fadeIn; st.wake = !!o.wake; $('#fadein').checked = st.fadeIn; $('#wake').checked = st.wake;
const last = store.get('last', null); if (last && last.items && last.items.length) { const m = cleanMix(last); st.on = new Set(m.items.map(i => i.id)); m.items.forEach(i => { st.vol[i.id] = i.v; st.chr[i.id] = i.c; }); st.master = m.master; st.name = m.name; }
paint(); viz.start(); route();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('/sw.js').catch(() => {});
window.__tn = { engine, st };
