// Pomodoro state machine, settings, history. Pure: no DOM, no audio, no clock of its own (every function takes `now` in ms).
// Time is always an absolute timestamp (`endAt`) while running and a remaining span (`left`) while paused or idle, so a sleeping
// phone, a throttled background tab or a reload cannot drift it. Nothing is counted down.
import { fmtClock } from './mix.js';
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const int = (x, d) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? n : d; };
export const PHASES = ['focus', 'short', 'long'];
export const PHASE_NAME = { focus: 'Focus', short: 'Short break', long: 'Long break' };
export const DEFAULTS = { focus: 25, short: 5, long: 15, every: 4, auto: true };
export const LIMITS = { focus: [1, 180], short: [1, 60], long: [1, 120], every: [2, 12] };
export const SOUND_DEFAULTS = { focusSrc: 'keep', breakSrc: 'keep', chime: true, chimeVol: 60, fadeEnd: true, notify: false, wake: false };
export const FADE_END_SEC = 8;

export function cleanSettings(s) {
  s = s && typeof s === 'object' ? s : {}; const o = {};
  for (const k of ['focus', 'short', 'long', 'every']) o[k] = clamp(int(s[k], DEFAULTS[k]), LIMITS[k][0], LIMITS[k][1]);
  o.auto = s.auto === undefined ? DEFAULTS.auto : !!s.auto; return o;
}
// A sound source is 'keep' (leave the mix as it is), 'silence' (breaks only), 'p:<preset name>' or 's:<saved mix name>'.
const src = (v, allowSilence) => { v = typeof v === 'string' ? v.slice(0, 44) : ''; if (v === 'keep' || (allowSilence && v === 'silence')) return v; return /^[ps]:.+/.test(v) ? v : 'keep'; };
export function cleanSound(s) {
  s = s && typeof s === 'object' ? s : {}; const D = SOUND_DEFAULTS;
  return { focusSrc: src(s.focusSrc, false), breakSrc: src(s.breakSrc, true), chime: s.chime === undefined ? D.chime : !!s.chime, chimeVol: clamp(int(s.chimeVol, D.chimeVol), 0, 100), fadeEnd: s.fadeEnd === undefined ? D.fadeEnd : !!s.fadeEnd, notify: !!s.notify, wake: !!s.wake };
}
export const parseSrc = v => (v === 'keep' || v === 'silence' ? { mode: v } : { mode: v[0] === 'p' ? 'preset' : 'saved', name: v.slice(2) });
export const phaseMs = (phase, s) => s[phase] * 60000;
const cleanTask = t => String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, 60);

// ---- state: { phase, status 'idle'|'running'|'paused', done (focus blocks finished in this cycle), total, left, endAt, task } ----
const mk = (phase, done, s, task, status = 'idle', endAt = 0) => { const total = phaseMs(phase, s); return { phase, status, done, total, left: total, endAt, task }; };
export const init = (s, task = '') => mk('focus', 0, s, cleanTask(task));
export const remaining = (st, now) => (st.status === 'running' ? Math.max(0, st.endAt - now) : st.left);
export const progress = (st, now) => (st.total > 0 ? clamp(1 - remaining(st, now) / st.total, 0, 1) : 0);
export function start(st, now) { if (st.status === 'running') return st; const left = st.left > 0 ? st.left : st.total; return { ...st, status: 'running', left, endAt: now + left }; }
export function pause(st, now) { return st.status === 'running' ? { ...st, status: 'paused', left: Math.max(0, st.endAt - now), endAt: 0 } : st; }
export const setTask = (st, task) => ({ ...st, task: cleanTask(task) });
// After a focus block: the long break once `every` blocks are done, else a short one. After any break: focus (a long break closes the cycle).
function after(st, s) {
  if (st.phase === 'focus') { const done = st.done + 1; return mk(done >= s.every ? 'long' : 'short', done, s, st.task); }
  return mk('focus', st.phase === 'long' ? 0 : st.done, s, st.task);
}
// Move on the timeline to `now`. Phases that ended are reported as events (the app chimes, credits the day, switches the sound).
// Auto-start chains the next phase from the exact end of the last one, so a late tick loses nothing; but a phase that has already
// fully elapsed while nobody was looking (a long sleep, a closed tab) is not chained or credited: the timer waits, idle.
export function advance(st, now, s) {
  const events = []; let cur = st;
  while (cur.status === 'running' && now >= cur.endAt) {
    const at = cur.endAt, nxt = after(cur, s); events.push({ type: 'end', phase: cur.phase, at, minutes: Math.round(cur.total / 60000), task: cur.task, next: nxt.phase, late: now - at });
    if (s.auto && at + nxt.left > now) cur = { ...nxt, status: 'running', endAt: at + nxt.left }; else { cur = nxt; events[events.length - 1].waiting = true; break; }
  }
  return { state: cur, events };
}
// Skip: focus -> a short break (no credit, the cycle count is unchanged), break -> focus. Keeps running if it was running.
export function skip(st, now, s) {
  const nxt = st.phase === 'focus' ? mk('short', st.done, s, st.task) : mk('focus', st.phase === 'long' ? 0 : st.done, s, st.task);
  return st.status === 'running' ? { ...nxt, status: 'running', endAt: now + nxt.left } : nxt;
}
// Reset: restart the current phase; when it is already untouched, reset the whole cycle (back to the first focus block).
export function reset(st, s) { return st.status === 'idle' && st.left === st.total ? mk('focus', 0, s, st.task) : mk(st.phase, st.done, s, st.task); }
export function selectPhase(st, phase, s) { return PHASES.includes(phase) ? mk(phase, st.done, s, st.task) : st; }
// New settings reach an idle phase at once; a running or paused phase keeps the length it started with.
export function applySettings(st, s) { const done = Math.min(st.done, s.every); return st.status === 'idle' ? { ...mk(st.phase, done, s, st.task) } : { ...st, done }; }
export const cycleDots = (st, s) => ({ total: s.every, filled: Math.min(st.done, s.every), current: st.phase === 'focus' && st.status !== 'idle' ? Math.min(st.done, s.every - 1) : -1 });
// Validate what came out of storage, then clamp a running phase that sits impossibly far in the future (the device clock moved back).
export function restore(o, now, s) {
  if (!o || typeof o !== 'object' || !PHASES.includes(o.phase) || !['idle', 'running', 'paused'].includes(o.status)) return init(s);
  const total = int(o.total, 0), left = int(o.left, -1), endAt = Number(o.endAt);
  if (total < 1000 || total > 4 * 3600000 || left < 0 || left > total || (o.status === 'running' && !Number.isFinite(endAt))) return init(s);
  const done = clamp(int(o.done, 0), 0, s.every);
  return { phase: o.phase, status: o.status, done, total, left, endAt: o.status === 'running' ? Math.min(endAt, now + total) : 0, task: cleanTask(o.task) };
}

// ---- audio planning ----
// Master gain for the optional fade-out in the last `fadeSec` of a focus block (same cosine as the sleep timer).
export const endFadeSec = leftSec => Math.min(FADE_END_SEC, Math.max(0, leftSec));
export const titleFor = (st, now, base) => (st.status === 'idle' ? base : `${fmtClock(remaining(st, now))} · ${PHASE_NAME[st.phase]}${st.status === 'paused' ? ' (paused)' : ''} - TaoNoise`);
export const subtitleFor = (st, s) => (st.phase === 'focus' ? `Block ${Math.min(st.done + 1, s.every)} of ${s.every}` : st.phase === 'long' ? 'Cycle complete' : `After block ${st.done}`);

// ---- history: { 'YYYY-MM-DD': { n sessions, min minutes } } in local days; only localStorage ever sees it ----
export const dayKey = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const KEEP_DAYS = 90, DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export function cleanHistory(h) {
  const out = {}; if (h && typeof h === 'object') for (const [k, v] of Object.entries(h)) if (DAY_RE.test(k) && v && v.n > 0) out[k] = { n: clamp(int(v.n, 0), 0, 999), min: clamp(int(v.min, 0), 0, 99999) };
  const keys = Object.keys(out).sort(); for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_DAYS))) delete out[k]; return out;
}
export function addSession(h, day, minutes) { const d = h[day] || { n: 0, min: 0 }; return cleanHistory({ ...h, [day]: { n: d.n + 1, min: d.min + Math.max(0, int(minutes, 0)) } }); }
const shift = (ts, days) => { const d = new Date(ts); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + days); return d.getTime(); };
export const lastDays = (h, ts, n = 7) => Array.from({ length: n }, (_, i) => { const day = dayKey(shift(ts, i - n + 1)), v = h[day]; return { day, n: v ? v.n : 0, min: v ? v.min : 0 }; });
export const todayStats = (h, ts) => h[dayKey(ts)] || { n: 0, min: 0 };
// Streak: consecutive days with at least one block, ending today (or yesterday while today is still empty).
export function streak(h, ts) { let i = h[dayKey(ts)] ? 0 : -1, c = 0; while (h[dayKey(shift(ts, i))]) { c++; i--; } return c; }
// Recent completed blocks with their task label, newest first.
export function cleanLog(l) { return (Array.isArray(l) ? l : []).filter(e => e && Number.isFinite(e.at) && e.min > 0).slice(0, 20).map(e => ({ at: e.at, min: clamp(int(e.min, 0), 1, 999), task: cleanTask(e.task) })); }
export const addLog = (l, e) => cleanLog([{ at: e.at, min: e.minutes, task: e.task }, ...l]);
