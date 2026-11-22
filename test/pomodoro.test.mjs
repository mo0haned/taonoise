import test from 'node:test'; import assert from 'node:assert/strict';
import * as P from '../js/pomodoro.js';
const S = P.cleanSettings({}), MIN = 60000, T0 = Date.UTC(2026, 0, 5, 9, 0, 0);
const run = (st, now) => P.start(st, now);
test('defaults are 25/5/15 with a long break every 4 and auto-start on', () => { assert.deepEqual(S, { focus: 25, short: 5, long: 15, every: 4, auto: true }); const st = P.init(S); assert.equal(st.phase, 'focus'); assert.equal(st.status, 'idle'); assert.equal(st.left, 25 * MIN); });
test('settings validation clamps, rounds and falls back', () => {
  assert.deepEqual(P.cleanSettings({ focus: 0, short: 999, long: -3, every: 1 }), { focus: 1, short: 60, long: 1, every: 2, auto: true });
  assert.deepEqual(P.cleanSettings({ focus: '30', short: 'x', long: NaN, every: 7.6, auto: 0 }), { focus: 30, short: 5, long: 15, every: 8, auto: false });
  assert.deepEqual(P.cleanSettings(null), S); assert.deepEqual(P.cleanSettings('junk'), S);
});
test('sound settings validation: silence only in breaks, unknown sources fall back to keep', () => {
  const c = P.cleanSound({ focusSrc: 'silence', breakSrc: 'silence', chimeVol: 400 }); assert.equal(c.focusSrc, 'keep'); assert.equal(c.breakSrc, 'silence'); assert.equal(c.chimeVol, 100); assert.equal(c.chime, true); assert.equal(c.notify, false);
  assert.equal(P.cleanSound({ focusSrc: 'p:Rainy cabin', breakSrc: 's:My mix' }).focusSrc, 'p:Rainy cabin'); assert.equal(P.cleanSound({ focusSrc: 'zzz', breakSrc: 42 }).breakSrc, 'keep');
  assert.deepEqual(P.parseSrc('p:Rainy cabin'), { mode: 'preset', name: 'Rainy cabin' }); assert.deepEqual(P.parseSrc('silence'), { mode: 'silence' });
});
test('remaining is timestamp based: independent of how often anything ticks', () => {
  const st = run(P.init(S), T0); assert.equal(P.remaining(st, T0), 25 * MIN); assert.equal(P.remaining(st, T0 + 7 * MIN + 123), 25 * MIN - 7 * MIN - 123);
  assert.equal(P.remaining(st, T0 + 99 * MIN), 0); assert.ok(Math.abs(P.progress(st, T0 + 5 * MIN) - 0.2) < 1e-9);
});
test('pause and resume lose nothing but the pause itself (no drift over many cycles)', () => {
  let st = run(P.init(S), T0), t = T0; for (let i = 0; i < 50; i++) { t += 1234; st = P.pause(st, t); assert.equal(st.status, 'paused'); t += 60000 + i; st = run(st, t); }
  assert.equal(P.remaining(st, t), 25 * MIN - 50 * 1234); assert.equal(P.pause(P.pause(st, t), t + 5).left, 25 * MIN - 50 * 1234);
});
test('a focus block ends into a short break, auto-start chains from the exact end time', () => {
  const st = run(P.init(S), T0), r = P.advance(st, T0 + 25 * MIN + 400, S);
  assert.equal(r.events.length, 1); assert.deepEqual([r.events[0].type, r.events[0].phase, r.events[0].minutes, r.events[0].next], ['end', 'focus', 25, 'short']);
  assert.equal(r.state.phase, 'short'); assert.equal(r.state.status, 'running'); assert.equal(r.state.endAt, T0 + 30 * MIN); assert.equal(r.state.done, 1);
});
test('advance before the end changes nothing', () => { const st = run(P.init(S), T0), r = P.advance(st, T0 + 25 * MIN - 1, S); assert.equal(r.state, st); assert.equal(r.events.length, 0); });
test('long break after every 4th block, then a fresh cycle', () => {
  let st = run(P.init(S), T0), t = T0, seq = [];
  for (let i = 0; i < 9; i++) { t = st.endAt; const r = P.advance(st, t, S); seq.push(r.events[0].phase + '>' + r.events[0].next); st = r.state; }
  assert.deepEqual(seq, ['focus>short', 'short>focus', 'focus>short', 'short>focus', 'focus>short', 'short>focus', 'focus>long', 'long>focus', 'focus>short']);
  assert.equal(st.done, 1);
});
test('cadence follows the setting (every 2)', () => { const s = P.cleanSettings({ every: 2 }); let st = run(P.init(s), T0); st = P.advance(st, st.endAt, s).state; st = P.advance(st, st.endAt, s).state; st = P.advance(st, st.endAt, s).state; assert.equal(st.phase, 'long'); });
test('auto-start off: the next phase waits idle and the event says so', () => {
  const s = P.cleanSettings({ auto: false }), r = P.advance(run(P.init(s), T0), T0 + 26 * MIN, s); assert.equal(r.state.status, 'idle'); assert.equal(r.state.phase, 'short'); assert.equal(r.state.left, 5 * MIN); assert.equal(r.events[0].waiting, true);
});
test('a long sleep credits one block and waits instead of faking a pile of sessions', () => {
  const r = P.advance(run(P.init(S), T0), T0 + 5 * 3600000, S); assert.equal(r.events.length, 1); assert.equal(r.events[0].phase, 'focus'); assert.equal(r.state.status, 'idle'); assert.equal(r.state.phase, 'short');
});
test('a tick late by a few seconds still chains focus -> break and keeps the exact boundary', () => {
  const r = P.advance(run(P.init(S), T0), T0 + 25 * MIN + 4000, S); assert.equal(r.events[0].late, 4000); assert.equal(P.remaining(r.state, T0 + 25 * MIN + 4000), 5 * MIN - 4000);
});
test('a following phase that already fully elapsed is not chained: one credit, then wait on the next phase', () => {
  const s = P.cleanSettings({ focus: 1, short: 1 }); const r = P.advance(run(P.init(s), T0), T0 + 2 * MIN + 5000, s); assert.equal(r.events.length, 1); assert.equal(r.events[0].waiting, true); assert.deepEqual([r.state.phase, r.state.status, r.state.done], ['short', 'idle', 1]);
  const live = P.advance(run(P.init(s), T0), T0 + 90000, s); assert.equal(live.state.status, 'running');
});
test('skip: focus -> short break without credit, break -> focus, long break closes the cycle; keeps running', () => {
  let st = run(P.init(S), T0), k = P.skip(st, T0 + 3 * MIN, S); assert.deepEqual([k.phase, k.status, k.done, k.endAt], ['short', 'running', 0, T0 + 8 * MIN]);
  k = P.skip(k, T0 + 4 * MIN, S); assert.equal(k.phase, 'focus'); assert.equal(P.skip(P.init(S), T0, S).status, 'idle');
  const lg = { ...P.init(S), phase: 'long', done: 4, total: 15 * MIN, left: 15 * MIN }; assert.equal(P.skip(lg, T0, S).done, 0);
});
test('reset restarts the phase, and a second reset restarts the whole cycle', () => {
  let st = run(P.init(S), T0); st = P.advance(st, st.endAt, S).state; assert.equal(st.phase, 'short');
  let r = P.reset(st, S); assert.deepEqual([r.phase, r.status, r.left, r.done], ['short', 'idle', 5 * MIN, 1]); r = P.reset(r, S); assert.deepEqual([r.phase, r.done, r.left], ['focus', 0, 25 * MIN]);
});
test('selectPhase and applySettings: idle follows new lengths, running keeps its own', () => {
  assert.equal(P.selectPhase(P.init(S), 'long', S).left, 15 * MIN); assert.equal(P.selectPhase(P.init(S), 'nope', S).phase, 'focus');
  const s2 = P.cleanSettings({ focus: 50 }); assert.equal(P.applySettings(P.init(S), s2).left, 50 * MIN); const r = run(P.init(S), T0); assert.equal(P.applySettings(r, s2).total, 25 * MIN);
  assert.equal(P.applySettings({ ...P.init(S), done: 4 }, P.cleanSettings({ every: 3 })).done, 3);
});
test('dots: filled blocks of the cycle and the current one', () => {
  let st = run(P.init(S), T0); assert.deepEqual(P.cycleDots(st, S), { total: 4, filled: 0, current: 0 }); st = P.advance(st, st.endAt, S).state; assert.deepEqual(P.cycleDots(st, S), { total: 4, filled: 1, current: -1 });
  st = P.advance(st, st.endAt, S).state; assert.deepEqual(P.cycleDots(st, S), { total: 4, filled: 1, current: 1 });
});
test('resume after a reload: persisted state round-trips and keeps counting on the timeline', () => {
  const st = run(P.init(S, 'write the post'), T0), saved = JSON.parse(JSON.stringify(st)), back = P.restore(saved, T0 + 10 * MIN, S);
  assert.deepEqual(back, st); assert.equal(P.remaining(back, T0 + 10 * MIN), 15 * MIN); assert.equal(back.task, 'write the post');
  const paused = JSON.parse(JSON.stringify(P.pause(st, T0 + 4 * MIN))); assert.equal(P.remaining(P.restore(paused, T0 + 90 * MIN, S), T0 + 90 * MIN), 21 * MIN);
  const late = P.advance(P.restore(saved, T0 + 25 * MIN + 1000, S), T0 + 25 * MIN + 1000, S); assert.equal(late.events.length, 1); assert.equal(late.state.phase, 'short');
});
test('restore rejects junk and clamps a clock that moved back', () => {
  for (const bad of [null, 5, {}, { phase: 'x', status: 'idle', total: 1000, left: 1 }, { phase: 'focus', status: 'running', total: 1500000, left: 1, endAt: 'abc' }, { phase: 'focus', status: 'idle', total: 5, left: 1 }, { phase: 'focus', status: 'idle', total: 1500000, left: 2e9 }]) assert.deepEqual(P.restore(bad, T0, S), P.init(S));
  const r = P.restore({ phase: 'focus', status: 'running', total: 25 * MIN, left: 25 * MIN, endAt: T0 + 9e9, done: 2, task: '  a   b ' }, T0, S); assert.equal(r.endAt, T0 + 25 * MIN); assert.equal(r.task, 'a b'); assert.equal(r.done, 2);
});
test('task label is trimmed and capped', () => { assert.equal(P.setTask(P.init(S), 'x'.repeat(200)).task.length, 60); assert.equal(P.setTask(P.init(S), null).task, ''); });
test('title shows time and phase only while a session exists', () => {
  const st = run(P.init(S), T0); assert.equal(P.titleFor(st, T0 + 60000, 'TaoNoise'), '24:00 · Focus - TaoNoise'); assert.equal(P.titleFor(P.pause(st, T0 + 60000), T0 + 9e6, 'TaoNoise'), '24:00 · Focus (paused) - TaoNoise'); assert.equal(P.titleFor(P.init(S), T0, 'TaoNoise'), 'TaoNoise');
  assert.equal(P.endFadeSec(3), 3); assert.equal(P.endFadeSec(300), 8); assert.equal(P.endFadeSec(-2), 0);
});
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
test('history: sessions add up per local day and minutes accumulate', () => {
  let h = {}; h = P.addSession(h, '2026-03-10', 25); h = P.addSession(h, '2026-03-10', 25); h = P.addSession(h, '2026-03-09', 50); assert.deepEqual(h['2026-03-10'], { n: 2, min: 50 }); assert.deepEqual(P.todayStats(h, at(2026, 3, 10, 23)), { n: 2, min: 50 }); assert.deepEqual(P.todayStats(h, at(2026, 3, 11)), { n: 0, min: 0 });
  assert.equal(P.dayKey(new Date(2026, 0, 5, 0, 5).getTime()), '2026-01-05'); assert.equal(P.dayKey(new Date(2026, 0, 5, 23, 59).getTime()), '2026-01-05');
});
test('last 7 days is oldest to newest and crosses month and year ends', () => {
  const h = { '2026-12-30': { n: 1, min: 25 }, '2027-01-02': { n: 3, min: 75 } }, w = P.lastDays(h, at(2027, 1, 2)); assert.equal(w.length, 7); assert.equal(w[0].day, '2026-12-27'); assert.equal(w[6].day, '2027-01-02'); assert.equal(w[3].n, 1); assert.equal(w[6].min, 75); assert.equal(w[5].n, 0);
});
test('streak counts back from today, or from yesterday while today is empty, and breaks on a gap', () => {
  const h = { '2026-03-10': { n: 1, min: 25 }, '2026-03-09': { n: 1, min: 25 }, '2026-03-08': { n: 2, min: 50 }, '2026-03-05': { n: 1, min: 25 } };
  assert.equal(P.streak(h, at(2026, 3, 10)), 3); assert.equal(P.streak(h, at(2026, 3, 11)), 3); assert.equal(P.streak(h, at(2026, 3, 12)), 0); assert.equal(P.streak({}, at(2026, 3, 10)), 0);
});
test('history across the spring DST change keeps one key per day', () => { const w = P.lastDays({}, at(2026, 3, 30), 10).map(d => d.day); assert.equal(new Set(w).size, 10); });
test('history is cleaned and pruned to 90 days; junk dropped', () => {
  const big = {}; for (let i = 0; i < 120; i++) big[P.dayKey(at(2026, 1, 1) + i * 86400000)] = { n: 1, min: 25 }; assert.equal(Object.keys(P.cleanHistory(big)).length, 90);
  assert.deepEqual(P.cleanHistory({ 'bad': { n: 1 }, '2026-01-01': { n: -1 }, '2026-01-02': { n: 2.4, min: '30' } }), { '2026-01-02': { n: 2, min: 30 } }); assert.deepEqual(P.cleanHistory(null), {});
});
test('log keeps the newest 20 with their task', () => {
  let l = []; for (let i = 0; i < 25; i++) l = P.addLog(l, { at: i + 1, minutes: 25, task: 'job ' + i }); assert.equal(l.length, 20); assert.equal(l[0].task, 'job 24'); assert.deepEqual(P.cleanLog('x'), []);
});
