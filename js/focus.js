// Focus (pomodoro) panel: markup, the timer loop, and the glue to the mixer (sound per phase, cross-fades, chime, title, Media Session,
// notifications, wake lock). The rules live in pomodoro.js; this file only reads the clock and touches the page.
import * as P from './pomodoro.js';
import { fmtClock } from './mix.js';
const XFADE = 2.4, DUCK = 1.8, LOOKAHEAD = 2.5; // seconds: mix cross-fade, fade to silence, chime scheduled this far ahead on the audio clock
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const focusMarkup = (ic, esc) => `<dialog id="dfocus" aria-labelledby="dft" data-ph="focus"><div class="sheet fsheet">
<div class="sh"><h2 id="dft">Focus</h2><button class="ib" data-close type="button" aria-label="Close">${ic('i-x')}</button></div>
<div class="seg" role="tablist" aria-label="Focus sections"><button type="button" role="tab" id="ft-t" data-v="t" aria-selected="true" aria-controls="fp-t">Timer</button><button type="button" role="tab" id="ft-s" data-v="s" aria-selected="false" aria-controls="fp-s" tabindex="-1">Stats</button><button type="button" role="tab" id="ft-c" data-v="c" aria-selected="false" aria-controls="fp-c" tabindex="-1">Settings</button></div>
<div id="fp-t" role="tabpanel" aria-labelledby="ft-t">
<div class="phases" id="fphases" role="group" aria-label="Phase"><button type="button" data-p="focus">Focus</button><button type="button" data-p="short">Short break</button><button type="button" data-p="long">Long break</button></div>
<div class="ring" id="fring" tabindex="0" autofocus role="timer" aria-label="Focus timer"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="rt" cx="60" cy="60" r="54"/><circle class="rp" id="frp" cx="60" cy="60" r="54" pathLength="100"/></svg>
<div class="rc"><b id="ftime">25:00</b><span id="fph">Focus</span><small id="fsub"></small></div></div>
<div class="dots" id="fdots" role="img" aria-label=""></div>
<label class="task"><span class="sr">What are you focusing on?</span><input id="ftask" type="text" maxlength="60" placeholder="What are you focusing on?" autocomplete="off"></label>
<div class="fctl"><button class="ib big" id="freset" type="button" aria-label="Reset">${ic('i-reset')}</button><button class="btn pri fgo" id="fgo" type="button">${ic('i-play')}<span>Start</span></button><button class="ib big" id="fskip" type="button" aria-label="Skip to next phase">${ic('i-skip')}</button></div>
<p class="fhint" id="fnext"></p><p class="sr" id="flive" aria-live="polite"></p></div>
<div id="fp-s" role="tabpanel" aria-labelledby="ft-s" hidden>
<div class="stats"><div class="stat"><b id="sn">0</b><span>sessions today</span></div><div class="stat"><b id="sm">0</b><span>minutes focused</span></div><div class="stat"><b id="ss">0</b><span>day streak</span></div></div>
<h3>Last 7 days</h3><ol class="bars" id="sbars"></ol>
<h3>Today</h3><ul class="slog" id="slog"></ul>
<div class="srow"><button class="btn" id="sclear" type="button">${ic('i-trash')}<span>Clear history</span></button></div><p class="note">History is kept only in this browser's local storage. It never leaves your device.</p></div>
<div id="fp-c" role="tabpanel" aria-labelledby="ft-c" hidden>
<h3>Lengths</h3>${[['focus', 'Focus', 'min'], ['short', 'Short break', 'min'], ['long', 'Long break', 'min'], ['every', 'Long break every', 'blocks']].map(([k, l, u]) => `<div class="row"><label for="s-${k}">${l}</label><div class="step"><button class="ib" type="button" data-k="${k}" data-d="-1" aria-label="Less ${l.toLowerCase()}">${ic('i-minus')}</button><input id="s-${k}" type="number" inputmode="numeric" min="${P.LIMITS[k][0]}" max="${P.LIMITS[k][1]}" data-k="${k}"><span class="u">${u}</span><button class="ib" type="button" data-k="${k}" data-d="1" aria-label="More ${l.toLowerCase()}">${ic('i-plus')}</button></div></div>`).join('')}
<label class="chk"><input type="checkbox" id="s-auto"><span>Start the next phase automatically</span></label>
<h3>Sound</h3><div class="row sel"><label for="s-fsrc">During focus</label><select id="s-fsrc"></select></div><div class="row sel"><label for="s-bsrc">During breaks</label><select id="s-bsrc"></select></div>
<label class="chk"><input type="checkbox" id="s-fade"><span>Fade the mix out at the end of a focus block</span></label>
<label class="chk"><input type="checkbox" id="s-chime"><span>Soft chime when a phase ends</span></label>
<div class="row vol"><label for="s-cvol">Chime volume</label><div class="cv"><input type="range" id="s-cvol" min="0" max="100" aria-label="Chime volume"><button class="btn" id="s-ctest" type="button">Test</button></div></div>
<h3>Alerts</h3><label class="chk" id="s-nl"><input type="checkbox" id="s-notify"><span>Notify me when a phase ends</span></label><p class="note" id="s-nn">Shows a banner when a phase ends while you are in another tab. It only works while this page is open (in a tab or the installed app): there is no server that could wake it.</p>
<label class="chk" id="s-wl"><input type="checkbox" id="s-wake"><span>Keep the screen on during a session</span></label>
<div class="srow"><button class="btn" id="s-def" type="button">Reset to defaults</button></div></div>
</div></dialog>
<dialog id="dconfirm" aria-labelledby="dcq"><div class="sheet"><div class="sh"><h2 id="dcq"></h2></div><p class="sub" id="dcp"></p><div class="opts two"><button class="btn" id="dcno" type="button">Cancel</button><button class="btn pri" id="dcyes" type="button"></button></div></div></dialog>`;

export function createFocus(d) {
  const { $, $$, store, st, engine, esc, PRESETS } = d; let skew = 0; const now = () => Date.now() + skew;
  const saved = store.get('focus', {}); let S = P.cleanSettings(saved.s), snd = P.cleanSound(saved.snd), hist = P.cleanHistory(saved.h), log = P.cleanLog(saved.log);
  let fs = P.restore(saved.st, now(), S), pend = null, ducked = false, lastTitle = '', lastMedia = '', lastRender = '', view = 't';
  const run = () => fs.status === 'running', active = () => fs.status !== 'idle', isBreak = () => fs.phase !== 'focus';
  const save = () => store.set('focus', { s: S, snd, st: fs, h: hist, log });
  const dlg = $('#dfocus'), tab = v => { view = v; $$('.seg [role=tab]', dlg).forEach(b => { const on = b.dataset.v === v; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; $('#fp-' + b.dataset.v).hidden = !on; }); render(true); };
  // ---- sound ----
  const resolve = src => { const p = P.parseSrc(src); if (p.mode === 'preset') return PRESETS.find(x => x.name === p.name) || null; if (p.mode === 'saved') return d.saved().find(x => x.name === p.name) || null; return null; };
  const srcFor = ph => (ph === 'focus' ? snd.focusSrc : snd.breakSrc);
  const unduck = (sec = DUCK) => { if (ducked && st.playing) engine.ramp(engine.fadeValue(), 1, 0, sec); ducked = false; };
  const duck = (sec = DUCK) => { if (!st.playing) return; ducked = true; engine.ramp(engine.fadeValue(), 0, 0, sec); };
  // The sound of the phase we are in: swap the mix with an overlapping cross-fade (smooth), or fade to silence for a silent break.
  function applySound(smooth) {
    const src = srcFor(fs.phase), mode = P.parseSrc(src).mode;
    if (mode === 'silence') { smooth ? duck() : (ducked = true, st.playing && engine.resetFade(0)); return; }
    const m = resolve(src); if (m) d.applyMix(m, false, smooth ? XFADE / 3 : 0);
    if (ducked) unduck(smooth ? DUCK : 0.4); else if (st.playing && !smooth) engine.resetFade();
    if (m && smooth) engine.xf = { phase: fs.phase, at: Date.now(), tc: XFADE / 3, to: m.name };
  }
  // Audio-clock fade-out over the last seconds of a focus block (the sleep timer's cosine ramp, same engine call).
  function arm() {
    if (!st.playing || !run()) return;
    if (P.parseSrc(srcFor(fs.phase)).mode === 'silence') { if (!ducked) { ducked = true; engine.resetFade(0); } return; }
    ducked = false; const g = engine.fadeValue(), steps = [], up = g < 0.99 ? DUCK * (1 - g) : 0, left = P.remaining(fs, now()) / 1000, f = P.endFadeSec(left);
    if (up) steps.push({ to: 1, at: 0, dur: up }); // coming back from silence or a fade: ramp up first, then the end fade, in one schedule
    if (fs.phase === 'focus' && snd.fadeEnd && left > 0.1) steps.push({ to: 0, at: Math.max(0, left - f), dur: Math.min(f, left) });
    if (steps.length) engine.rampSeq(g, steps);
  }
  const cancelChime = () => { if (pend) { try { pend.h.cancel(); } catch (e) {} pend = null; } };
  function stage() { // schedule the chime on the audio clock a moment before the boundary
    if (!run() || !snd.chime || pend && pend.endAt === fs.endAt) return; const left = fs.endAt - now(); if (left > LOOKAHEAD * 1000) return;
    const h = engine.chime(left / 1000, snd.chimeVol, fs.phase === 'focus' ? 'rest' : 'work'); if (h) pend = { endAt: fs.endAt, h };
  }
  function notify(e) {
    if (!snd.notify || typeof Notification === 'undefined' || Notification.permission !== 'granted' || (document.visibilityState === 'visible' && document.hasFocus())) return;
    const title = e.phase === 'focus' ? 'Focus block done' : 'Break is over', body = e.phase === 'focus' ? `${e.minutes} minutes${e.task ? ': ' + e.task : ''}. Time for a ${e.next === 'long' ? 'long' : 'short'} break.` : 'Ready for the next focus block.', o = { body, tag: 'taonoise-focus', icon: '/icon-192.png', silent: true };
    try { if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(r => r.showNotification(title, o)).catch(() => {}); else new Notification(title, o); } catch (er) { try { new Notification(title, o); } catch (e2) {} }
  }
  // ---- transitions ----
  function commit(next, events) {
    const prev = fs; fs = next;
    for (const e of events) {
      if (e.phase === 'focus') { hist = P.addSession(hist, P.dayKey(e.at), e.minutes); log = P.addLog(log, e); }
      if (!(pend && pend.endAt === e.at) && snd.chime && e.late < 4000) engine.chime(0, snd.chimeVol, e.phase === 'focus' ? 'rest' : 'work'); pend = null; notify(e);
    }
    if (events.length) {
      const last = events[events.length - 1]; $('#flive').textContent = `${P.PHASE_NAME[last.phase]} finished. ${P.PHASE_NAME[fs.phase]} ${fs.status === 'running' ? 'started' : 'is ready'}.`;
      if (st.playing) { if (fs.status === 'running') applySound(true); else { ducked = false; d.pause(); } } // waiting for you: the sound stops with the phase
      if (fs.status === 'running') arm();
    }
    d.wake(snd.wake && run()); save(); render(true); d.refresh();
  }
  function tick() {
    const t = now(), r = P.advance(fs, t, S); if (r.events.length) commit(r.state, r.events); else if (run()) stage(); render(); title(); mediaSess();
  }
  async function toggle() {
    if (run()) return pauseRun();
    if (d.sleepOn()) { if (!await d.confirm('Turn off the sleep timer?', `The sleep timer has ${d.sleepLeft()} left. Only one timer runs at a time, so starting Focus turns it off.`, 'Turn it off and start')) return; d.clearSleep(); }
    const was = fs.status; fs = P.start(fs, now()); cancelChime(); try { engine.ensure(); } catch (e) {} // a gesture is on the stack: create the context now so the chime can sound later
    if (P.parseSrc(srcFor(fs.phase)).mode === 'silence') { if (st.playing) applySound(true); else ducked = true; } else { applySound(false); if (!st.playing) await d.play(); }
    arm(); d.wake(snd.wake); save(); render(true); d.refresh(); if (was === 'idle') $('#flive').textContent = `${P.PHASE_NAME[fs.phase]} started.`;
  }
  function pauseRun() { fs = P.pause(fs, now()); cancelChime(); engine.resetFade(); ducked = false; if (st.playing) d.pause(); d.wake(false); save(); render(true); d.refresh(); }
  function skip() { const was = fs.status; fs = P.skip(fs, now(), S); cancelChime(); if (was === 'running') { applySound(true); arm(); } else { engine.resetFade(); ducked = false; } save(); render(true); d.refresh(); }
  function reset() { const was = fs.status; fs = P.reset(fs, S); cancelChime(); ducked = false; engine.resetFade(); if (was !== 'idle' && st.playing) d.pause(); d.wake(false); save(); render(true); d.refresh(); }
  function choose(ph) { if (run()) return; fs = P.selectPhase(fs, ph, S); cancelChime(); save(); render(true); d.refresh(); }
  function setS(k, v) { S = P.cleanSettings({ ...S, [k]: v }); fs = P.applySettings(fs, S); save(); render(true); d.refresh(); }
  function setSnd(k, v) {
    snd = P.cleanSound({ ...snd, [k]: v }); save(); const live = st.playing && run();
    if (live && (k === 'focusSrc' ? fs.phase === 'focus' : k === 'breakSrc' ? fs.phase !== 'focus' : false)) { applySound(true); arm(); } else if (live && k === 'fadeEnd') { engine.resetFade(ducked ? 0 : 1); arm(); } if (k === 'wake') d.wake(snd.wake && run()); render(true); }
  // ---- page chrome: title, Media Session, deck button ----
  function title() { const t = P.titleFor(fs, now(), d.baseTitle()), tt = active() ? t : d.baseTitle(); if (tt !== lastTitle) { lastTitle = tt; document.title = tt; } }
  function mediaSess() {
    const left = Math.ceil(P.remaining(fs, now()) / 60000), key = fs.phase + fs.status + left; if (key === lastMedia) return; lastMedia = key; d.media();
    if (active() && 'mediaSession' in navigator) try { navigator.mediaSession.setPositionState({ duration: fs.total / 1000, position: Math.min(fs.total, fs.total - P.remaining(fs, now())) / 1000, playbackRate: 1 }); } catch (e) {}
  }
  const mediaInfo = () => (active() ? { title: `${P.PHASE_NAME[fs.phase]} · ${Math.ceil(P.remaining(fs, now()) / 60000)} min left${fs.status === 'paused' ? ' (paused)' : ''}`, artist: 'TaoNoise Focus' } : null);
  // ---- render ----
  const srcOpts = (brk, cur) => { const sv = d.saved(), o = (v, l) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`; return o('keep', 'Keep my current mix') + (brk ? o('silence', 'Silence') : '') + `<optgroup label="Presets">${PRESETS.map(p => o('p:' + p.name, p.name)).join('')}</optgroup>` + (sv.length ? `<optgroup label="Saved mixes">${sv.map(m => o('s:' + m.name, m.name)).join('')}</optgroup>` : ''); };
  function render(force) {
    title(); const t = now(), rem = P.remaining(fs, t), clock = fmtClock(rem), ph = isBreak() ? 'break' : 'focus', dots = P.cycleDots(fs, S);
    document.body.dataset.focus = active() ? ph : ''; d.tone(active() ? ph : null);
    $('#focus').toggleAttribute('data-on', active()); $('#focusl').textContent = active() ? `${clock} · ${fs.phase === 'focus' ? 'Focus' : 'Break'}` : 'Focus';
    if (!dlg.open) return;
    const key = clock + fs.phase + fs.status + view; if (!force && key === lastRender) return; lastRender = key;
    dlg.dataset.ph = ph; $('#ftime').textContent = clock; $('#fph').textContent = P.PHASE_NAME[fs.phase]; $('#fsub').textContent = P.subtitleFor(fs, S);
    $('#frp').style.strokeDashoffset = (P.progress(fs, t) * 100).toFixed(2); const ring = $('#fring'); ring.setAttribute('aria-label', `${P.PHASE_NAME[fs.phase]}, ${clock} left, ${fs.status === 'running' ? 'running' : fs.status === 'paused' ? 'paused' : 'not started'}`); ring.dataset.s = fs.status;
    $('#fdots').innerHTML = Array.from({ length: dots.total }, (_, i) => `<i class="dot" data-s="${i < dots.filled ? 'done' : i === dots.current ? 'cur' : 'todo'}"></i>`).join(''); $('#fdots').setAttribute('aria-label', `${dots.filled} of ${dots.total} focus blocks done in this cycle`);
    $$('#fphases button').forEach(b => { b.setAttribute('aria-pressed', b.dataset.p === fs.phase); b.disabled = run(); });
    const go = $('#fgo'), lab = run() ? 'Pause' : fs.status === 'paused' ? 'Resume' : 'Start'; go.querySelector('span').textContent = lab; go.firstElementChild.firstElementChild.setAttribute('href', run() ? '#i-pause' : '#i-play');
    if (document.activeElement !== $('#ftask')) $('#ftask').value = fs.task; $('#ftask').disabled = false;
    const nxt = fs.phase === 'focus' ? (fs.done + 1 >= S.every ? 'long' : 'short') : 'focus';
    $('#fnext').textContent = run() ? `Ends at ${new Date(fs.endAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. Next: ${P.PHASE_NAME[nxt]}, ${S[nxt]} min.` : `Next: ${P.PHASE_NAME[nxt]}, ${S[nxt]} min.`;
    if (view === 's') renderStats(t); if (view === 'c') renderSettings(force);
  }
  function renderStats(t) {
    const td = P.todayStats(hist, t), wk = P.lastDays(hist, t, 7), mx = Math.max(60, ...wk.map(x => x.min)); $('#sn').textContent = td.n; $('#sm').textContent = td.min; $('#ss').textContent = P.streak(hist, t);
    $('#sbars').innerHTML = wk.map((x, i) => `<li aria-label="${DAYS[new Date(x.day + 'T12:00').getDay()]}: ${x.n} ${x.n === 1 ? 'session' : 'sessions'}, ${x.min} minutes"><span class="bar" data-z="${x.min ? 1 : 0}" ${i === 6 ? 'data-t' : ''} style="--v:${Math.round(x.min / mx * 100)}%"></span><span class="bl">${DAYS[new Date(x.day + 'T12:00').getDay()][0]}</span></li>`).join('');
    const today = log.filter(e => P.dayKey(e.at) === P.dayKey(t)).slice(0, 5); $('#slog').innerHTML = today.length ? today.map(e => `<li><b>${esc(e.task || 'Focus block')}</b><span>${e.min} min · ${new Date(e.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span></li>`).join('') : '<li class="empty">No finished blocks yet today.</li>';
    $('#sclear').disabled = !Object.keys(hist).length && !log.length;
  }
  function renderSettings(force) {
    for (const k of ['focus', 'short', 'long', 'every']) { const i = $('#s-' + k); if (document.activeElement !== i) i.value = S[k]; } $('#s-auto').checked = S.auto;
    if (force || !$('#s-fsrc').options.length) { $('#s-fsrc').innerHTML = srcOpts(false, snd.focusSrc); $('#s-bsrc').innerHTML = srcOpts(true, snd.breakSrc); if (resolve(snd.focusSrc) === null && P.parseSrc(snd.focusSrc).mode !== 'keep') $('#s-fsrc').value = 'keep'; if (resolve(snd.breakSrc) === null && !['keep', 'silence'].includes(snd.breakSrc)) $('#s-bsrc').value = 'keep'; }
    $('#s-fade').checked = snd.fadeEnd; $('#s-chime').checked = snd.chime; $('#s-cvol').value = snd.chimeVol; $('#s-cvol').style.setProperty('--p', snd.chimeVol + '%'); $('#s-cvol').disabled = !snd.chime; $('#s-notify').checked = snd.notify; $('#s-wake').checked = snd.wake;
  }
  // ---- events ----
  const open = () => { lastRender = ''; render(true); dlg.showModal(); render(true); };
  $('#focus').onclick = open; $('#fgo').onclick = toggle; $('#fskip').onclick = skip; $('#freset').onclick = reset;
  $('#fphases').onclick = e => { const b = e.target.closest('[data-p]'); if (b && !b.disabled) choose(b.dataset.p); };
  $('.seg', dlg).onclick = e => { const b = e.target.closest('[data-v]'); if (b) tab(b.dataset.v); };
  $('.seg', dlg).onkeydown = e => { const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (!k) return; const v = ['t', 's', 'c'], n = v[(v.indexOf(view) + k + 3) % 3]; tab(n); $('#ft-' + n).focus(); e.preventDefault(); };
  $('#ftask').onchange = $('#ftask').oninput = e => { fs = P.setTask(fs, e.target.value); save(); };
  // space starts/pauses when the panel itself has focus (not while typing or on a control that uses space)
  dlg.addEventListener('keydown', e => { if (e.code === 'Space' && view === 't' && !e.target.closest('button,input,select,textarea,[role=tab]')) { e.preventDefault(); toggle(); } });
  $('#fp-c').addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) setS(b.dataset.k, S[b.dataset.k] + +b.dataset.d); });
  $('#fp-c').addEventListener('change', e => {
    const i = e.target, k = i.dataset.k; if (k && i.type === 'number') { setS(k, i.value); i.value = S[k]; return; }
    if (i.id === 's-auto') setS('auto', i.checked); else if (i.id === 's-fsrc') setSnd('focusSrc', i.value); else if (i.id === 's-bsrc') setSnd('breakSrc', i.value); else if (i.id === 's-fade') setSnd('fadeEnd', i.checked); else if (i.id === 's-chime') setSnd('chime', i.checked); else if (i.id === 's-wake') setSnd('wake', i.checked);
    else if (i.id === 's-notify') askNotify(i);
  });
  $('#s-cvol').oninput = e => { snd = P.cleanSound({ ...snd, chimeVol: +e.target.value }); e.target.style.setProperty('--p', snd.chimeVol + '%'); save(); };
  $('#s-ctest').onclick = () => { try { engine.ensure(); } catch (e) {} engine.chime(0, snd.chimeVol, 'rest'); };
  $('#s-def').onclick = () => { S = P.cleanSettings({}); snd = P.cleanSound({ notify: snd.notify }); fs = P.applySettings(fs, S); save(); render(true); d.refresh(); d.toast('Focus settings reset'); };
  async function askNotify(box) { // permission is requested only from this tap
    if (!box.checked) return setSnd('notify', false);
    if (typeof Notification === 'undefined') { box.checked = false; return d.toast('This browser has no notifications'); }
    let p = Notification.permission; if (p === 'default') { try { p = await Notification.requestPermission(); } catch (e) {} }
    if (p !== 'granted') { box.checked = false; setSnd('notify', false); return d.toast('Notifications are blocked in this browser. Allow them in the site settings.'); } setSnd('notify', true);
  }
  let armClear = 0; $('#sclear').onclick = () => { const t = Date.now(); if (t - armClear > 4000) { armClear = t; $('#sclear span').textContent = 'Tap again to clear'; setTimeout(() => ($('#sclear span').textContent = 'Clear history'), 4000); return; } armClear = 0; hist = {}; log = []; save(); $('#sclear span').textContent = 'Clear history'; render(true); d.toast('Focus history cleared'); };
  if (typeof Notification === 'undefined') $('#s-nl').hidden = true; if (!('wakeLock' in navigator)) $('#s-wl').hidden = true;
  dlg.addEventListener('close', () => { lastRender = ''; });
  render(true); setInterval(tick, 250); document.addEventListener('visibilitychange', tick);
  // boot: a restored phase that ended while the page was closed is settled (credited once) before anything is shown
  { const r = P.advance(fs, now(), S); if (r.events.length) { fs = r.state; for (const e of r.events) if (e.phase === 'focus') { hist = P.addSession(hist, P.dayKey(e.at), e.minutes); log = P.addLog(log, e); } save(); } }
  return {
    active, running: run, title() { lastTitle = ''; title(); }, toggle, pause: () => run() && pauseRun(), arm, render, tick, mediaInfo, open,
    onPlay() { ducked = false; arm(); }, wantsWake: () => snd.wake && run(),
    // test hook: move the clock forward without waiting (the app only ever reads time through now())
    skew: ms => { skew += ms; tick(); }, now, get state() { return fs; }, get settings() { return S; }, get history() { return hist; }, get sound() { return snd; },
  };
}
