import test from 'node:test'; import assert from 'node:assert/strict';
import { SOUNDS, BY_ID, PRESETS, GROUPS, VIZ } from '../js/catalog.js';
import { cleanMix, encodeMix, decodeMix, summary, surprise, volGain, timerGain, fadeSecFor, fadeInGain, fmtClock } from '../js/mix.js';
test('catalog has 24+ unique sounds, each in a known group with a viz mapping', () => {
  assert.ok(SOUNDS.length >= 24); assert.equal(new Set(SOUNDS.map(s => s.id)).size, SOUNDS.length);
  for (const s of SOUNDS) { assert.ok(GROUPS.some(g => g.id === s.g), s.id); assert.ok(VIZ[s.id], s.id); assert.ok(s.dv >= 0 && s.dv <= 100); }
});
test('presets reference real sounds and survive the codec', () => {
  assert.ok(PRESETS.length >= 8);
  for (const p of PRESETS) { assert.ok(p.items.length >= 2, p.name); for (const i of p.items) assert.ok(BY_ID[i.id], i.id); assert.deepEqual(decodeMix(encodeMix(p)), cleanMix(p), p.name); }
});
test('cleanMix drops unknown ids and duplicates and clamps values', () => {
  const m = cleanMix({ name: 'x'.repeat(99), master: 400, items: [{ id: 'rain-light', v: 150, c: -3 }, { id: 'nope', v: 5 }, { id: 'rain-light', v: 1 }, { id: 'fire' }, { id: 'campfire', v: 'abc' }] });
  assert.equal(m.items.length, 2); assert.deepEqual(m.items[0], { id: 'rain-light', v: 100, c: 0 }); assert.equal(m.master, 100); assert.equal(m.name.length, 40); assert.equal(m.items[1].v, BY_ID.campfire.dv);
});
test('hash codec: round trip, name escaping, garbage input', () => {
  const m = cleanMix({ name: 'Rain & fire ~ #1', master: 66, items: [{ id: 'rain-roof', v: 70, c: 55 }, { id: 'campfire', v: 30, c: 80 }] });
  const h = encodeMix(m); assert.match(h, /^#\/mix\//); assert.ok(!/[ &#]/.test(h.slice(1))); assert.deepEqual(decodeMix(h), m);
  for (const bad of ['', '#/', '#/privacy', '#/mix/', '#/mix/zzz.1.2', '#/mix/m=5', null, undefined, '#/mix/%E0%A4%A']) assert.equal(decodeMix(bad), null, String(bad));
  assert.equal(decodeMix('#/mix/rain-light.40~bogus~n=%E0%A4%A').items.length, 1);
  assert.ok(encodeMix(cleanMix({ items: SOUNDS.map(s => ({ id: s.id, v: 100, c: 100 })) })).length < 1200);
});
test('surprise gives a valid 2-5 sound mix', () => { for (let i = 0; i < 200; i++) { const m = surprise(); assert.ok(m.items.length >= 1 && m.items.length <= 5); assert.deepEqual(cleanMix(m), m); } });
test('summary', () => { assert.equal(summary(cleanMix({ items: [{ id: 'wind' }] })), 'Wind'); assert.match(summary(cleanMix({ items: [{ id: 'wind' }, { id: 'fan' }, { id: 'cafe' }, { id: 'bowl' }] })), /\+2$/); });
test('volume taper is monotonic, 0 to 1', () => { assert.equal(volGain(0), 0); assert.equal(volGain(100), 1); let p = -1; for (let v = 0; v <= 100; v += 5) { assert.ok(volGain(v) > p); p = volGain(v); } assert.equal(volGain(-5), 0); assert.equal(volGain(500), 1); });
test('sleep timer fade: full volume, then cosine to silence at the end', () => {
  const end = 1_000_000, fade = 60; assert.equal(timerGain(end, end - 600_000, fade), 1); assert.equal(timerGain(end, end - 60_000, fade), 1);
  assert.ok(Math.abs(timerGain(end, end - 30_000, fade) - 0.5) < 1e-9); assert.equal(timerGain(end, end, fade), 0); assert.equal(timerGain(end, end + 5, fade), 0);
  let p = 2; for (let s = 60; s >= 0; s -= 3) { const g = timerGain(end, end - s * 1000, fade); assert.ok(g <= p + 1e-12); p = g; }
});
test('fade length scales with the timer and stays within 5-60 s', () => { assert.equal(fadeSecFor(1), 15); assert.equal(fadeSecFor(0.1), 5); assert.equal(fadeSecFor(15), 60); assert.equal(fadeSecFor(120), 60); });
test('fade-in curve', () => { assert.equal(fadeInGain(0, 10), 0); assert.equal(fadeInGain(10, 10), 1); assert.ok(Math.abs(fadeInGain(5, 10) - 0.5) < 1e-9); assert.equal(fadeInGain(3, 0), 1); });
test('clock text', () => { assert.equal(fmtClock(0), '0:00'); assert.equal(fmtClock(61_000), '1:01'); assert.equal(fmtClock(3_725_000), '1:02:05'); assert.equal(fmtClock(500), '0:01'); });
