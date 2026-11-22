// Pure noise generators (no Web Audio): used by the app to fill AudioBuffers and by the tests to measure them.
export function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const RMS = { white: 0.22, pink: 0.22, brown: 0.2, blue: 0.2, violet: 0.2 };
// Seamless looping buffer: n samples, the tail is equal-power cross-faded into the head so the loop point has no click.
export function genNoise(kind, n, seed = 1) {
  const r = rng(seed), f = Math.min(Math.floor(n / 8), 4096), len = n + f, x = new Float32Array(len), w = () => r() * 2 - 1;
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0, pw = 0, pp = 0;
  for (let i = 0; i < len + 2000; i++) {
    const wh = w(); let v;
    if (kind === 'white') v = wh;
    else if (kind === 'violet') { v = wh - pw; pw = wh; }
    else if (kind === 'brown') { br = (br + 0.02 * wh) / 1.02; v = br * 3.5; }
    else { // Paul Kellet pink
      b0 = 0.99886 * b0 + wh * 0.0555179; b1 = 0.99332 * b1 + wh * 0.0750759; b2 = 0.969 * b2 + wh * 0.153852; b3 = 0.8665 * b3 + wh * 0.3104856;
      b4 = 0.55 * b4 + wh * 0.5329522; b5 = -0.7616 * b5 - wh * 0.016898; v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + wh * 0.5362; b6 = wh * 0.115926;
      if (kind === 'blue') { const p = v; v = p - pp; pp = p; }
    }
    if (i >= 2000) x[i - 2000] = v; // skip the filter warm-up
  }
  const out = new Float32Array(n); let m = 0; for (let i = 0; i < len; i++) m += x[i]; m /= len;
  for (let i = 0; i < n; i++) out[i] = x[i] - m;
  for (let i = 0; i < f; i++) { const a = (i / f) * Math.PI / 2; out[i] = (x[i] - m) * Math.sin(a) + (x[n + i] - m) * Math.cos(a); }
  let s = 0; for (let i = 0; i < n; i++) s += out[i] * out[i]; const g = (RMS[kind] || 0.2) / Math.sqrt(s / n || 1);
  let pk = 0; for (let i = 0; i < n; i++) { out[i] *= g; pk = Math.max(pk, Math.abs(out[i])); }
  if (pk > 0.95) for (let i = 0; i < n; i++) out[i] *= 0.95 / pk;
  return out;
}
