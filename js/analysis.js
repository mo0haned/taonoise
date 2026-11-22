// Small DSP helpers shared by tests and the in-browser checks.
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = a + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
export function rms(x) { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / (x.length || 1)); }
export function peak(x) { let p = 0; for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > p) p = a; } return p; }
export const db = v => 20 * Math.log10(v || 1e-9);
// Welch-style averaged power spectrum, N=4096, hann.
export function spectrum(x, N = 4096) {
  const P = new Float64Array(N / 2), win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  let frames = 0; for (let o = 0; o + N <= x.length; o += N) { const re = new Float64Array(N), im = new Float64Array(N); for (let i = 0; i < N; i++) re[i] = x[o + i] * win[i]; fft(re, im); for (let k = 0; k < N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k]; frames++; }
  for (let k = 0; k < N / 2; k++) P[k] /= frames || 1; return P;
}
export function bandPower(P, sr, lo, hi) { const N = P.length * 2; let s = 0; for (let k = 1; k < P.length; k++) { const f = k * sr / N; if (f >= lo && f < hi) s += P[k]; } return s; }
// Slope of log10(power) vs log10(freq) between lo and hi Hz: white 0, pink -1, brown -2, blue +1, violet +2.
export function slope(x, sr, lo = 100, hi = 8000) {
  const P = spectrum(x), N = P.length * 2, xs = [], ys = [];
  for (let k = 1; k < P.length; k++) { const f = k * sr / N; if (f >= lo && f <= hi) { xs.push(Math.log10(f)); ys.push(Math.log10(P[k] + 1e-30)); } }
  const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n; let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; } return num / den;
}
// Normalised correlation of x with itself shifted by lag.
export function corr(x, lag) { let a = 0, b = 0, c = 0; for (let i = 0; i + lag < x.length; i++) { a += x[i] * x[i + lag]; b += x[i] * x[i]; c += x[i + lag] * x[i + lag]; } return a / Math.sqrt(b * c || 1); }
