import test from 'node:test'; import assert from 'node:assert/strict';
import { genNoise } from '../js/noise.js'; import { rms, peak, slope, corr } from '../js/analysis.js';
const SR = 44100, N = SR * 6;
const want = { white: [0, 0.15], pink: [-1, 0.15], brown: [-2, 0.3], blue: [1, 0.2], violet: [2, 0.3] };
for (const [k, [s, tol]] of Object.entries(want)) {
  test(`${k} noise: spectral slope ~ ${s}, RMS in band, no clipping, no NaN`, () => {
    const x = genNoise(k, N, 7), sl = slope(x, SR, 100, 8000); assert.ok(Math.abs(sl - s) < tol + 0.35, `slope ${sl}`);
    const r = rms(x); assert.ok(r > 0.1 && r < 0.3, 'rms ' + r); assert.ok(peak(x) <= 0.951, 'peak ' + peak(x)); assert.ok(x.every(Number.isFinite));
    const m = x.reduce((a, b) => a + b, 0) / x.length; assert.ok(Math.abs(m) < 0.01, 'dc ' + m);
  });
  test(`${k} noise: loops without repetition and without a seam click`, () => {
    const x = genNoise(k, N, 9); for (const lag of [1500, 12345, 44100, 100000, 200000]) { const c = Math.abs(corr(x, lag)); assert.ok(c < (k === 'brown' ? 0.35 : 0.1), `lag ${lag} corr ${c}`); }
    let d = 0; for (let i = 1; i < 20000; i++) d += (x[i] - x[i - 1]) ** 2; d = Math.sqrt(d / 19999); assert.ok(Math.abs(x[0] - x[N - 1]) < 8 * d + 1e-3, 'seam');
  });
}
test('different seeds give different noise, same seed is reproducible', () => { const a = genNoise('pink', 5000, 1), b = genNoise('pink', 5000, 2), c = genNoise('pink', 5000, 1); assert.deepEqual(a, c); assert.ok(Math.abs(corr(a.map((v, i) => v), 0) - 1) < 1e-9); assert.ok(Math.abs(corr(Float32Array.from(a.map((v, i) => v * b[i]), x => x), 0)) <= 1); let same = 0; for (let i = 0; i < 5000; i++) if (a[i] === b[i]) same++; assert.ok(same < 5); });
test('pink is steeper than white, brown steeper than pink', () => { const s = k => slope(genNoise(k, N, 3), SR); assert.ok(s('white') > s('pink') && s('pink') > s('brown') && s('blue') > s('white') && s('violet') > s('blue')); });
