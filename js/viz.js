// Scenery: a gradient that blends toward the character of the active mix, plus canvas layers driven by the master AnalyserNode
// (rain streaks, water ripples, fire glow + embers, drifting fog, twinkling stars, thunder flashes).
import { VIZ } from './catalog.js';
const KEYS = ['rain', 'water', 'fire', 'wind', 'forest', 'night', 'space', 'machine'];
// [top, bottom] per scene, dark then light
const PAL = {
  dark: { base: [[16, 10, 48], [74, 36, 128]], rain: [[8, 22, 62], [34, 92, 150]], water: [[4, 28, 76], [16, 122, 176]], fire: [[34, 8, 26], [206, 74, 30]], wind: [[24, 30, 74], [96, 116, 184]], forest: [[6, 32, 40], [40, 132, 92]], night: [[8, 8, 40], [78, 50, 146]], space: [[8, 4, 30], [128, 48, 168]], machine: [[22, 16, 44], [84, 72, 130]] },
  light: { base: [[226, 218, 255], [255, 214, 204]], rain: [[216, 228, 252], [170, 198, 236]], water: [[210, 236, 250], [150, 206, 232]], fire: [[255, 236, 222], [255, 188, 140]], wind: [[228, 232, 252], [190, 200, 238]], forest: [[224, 244, 230], [170, 214, 182]], night: [[228, 224, 255], [196, 182, 244]], space: [[234, 224, 255], [204, 170, 244]], machine: [[238, 234, 246], [206, 200, 226]] },
};
export function createViz(canvas, getLevel, reduced) {
  const g = canvas.getContext('2d'); let W = 0, H = 0, dpr = 1, w = {}, tw = {}, last = 0, flash = 0, bassAvg = 0, light = false, running = false, t0 = 0;
  KEYS.forEach(k => (w[k] = tw[k] = 0)); const drops = [], rings = [], embers = [], fogs = [], stars = [];
  const resize = () => { dpr = Math.min(window.devicePixelRatio || 1, 1.5); W = innerWidth; H = innerHeight; canvas.width = W * dpr; canvas.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
  addEventListener('resize', resize); resize();
  for (let i = 0; i < 6; i++) fogs.push({ x: Math.random(), y: 0.2 + Math.random() * 0.6, r: 0.3 + Math.random() * 0.3, s: 0.005 + Math.random() * 0.01 });
  for (let i = 0; i < 90; i++) stars.push({ x: Math.random(), y: Math.random() * 0.8, p: Math.random() * 6, s: 0.6 + Math.random() * 1.4 });
  const mix = (key, i) => { let r = 0, gg = 0, b = 0, tot = 0.35, pal = PAL[light ? 'light' : 'dark']; const add = (c, k) => { r += c[0] * k; gg += c[1] * k; b += c[2] * k; }; add(pal.base[i], 0.35); for (const k of KEYS) if (w[k] > 0.01) { add(pal[k][i], w[k]); tot += w[k]; } return `rgb(${r / tot | 0},${gg / tot | 0},${b / tot | 0})`; };
  function frame(ts) {
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts; const L = getLevel(), s = reduced ? 0 : 1;
    for (const k of KEYS) w[k] += (tw[k] - w[k]) * Math.min(1, dt * 1.5);
    bassAvg += (L.bass - bassAvg) * dt * 2; if (L.bass - bassAvg > 0.16 && w.rain > 0.3 && !reduced) flash = Math.min(1, flash + 0.5);
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, mix('t', 0)); gr.addColorStop(1, mix('b', 1)); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    const lv = 0.55 + L.lvl * 1.2, ink = light ? '70,84,150' : '190,210,255';
    { // orb (moon / sun) and three ridges
      const warm = Math.min(1, w.fire * 1.3), ox = W * (W < 700 ? 0.84 : 0.8), oy = H * (W < 700 ? 0.085 : 0.2), or = Math.min(W, H) * 0.34, c = light ? [255, 190 + 40 * (1 - warm) | 0, 150 + 70 * (1 - warm) | 0] : [225 + 30 * warm | 0, 220 - 50 * warm | 0, 255 - 130 * warm | 0], bre = 1 + 0.05 * Math.sin(ts / 2600) + L.bass * 0.15;
      const og = g.createRadialGradient(ox, oy, 0, ox, oy, or * bre); og.addColorStop(0, `rgba(${c},${light ? 0.75 : 0.55})`); og.addColorStop(0.12, `rgba(${c},${light ? 0.45 : 0.3})`); og.addColorStop(1, `rgba(${c},0)`); g.fillStyle = og; g.fillRect(ox - or * 1.2, oy - or * 1.2, or * 2.4, or * 2.4);
      g.fillStyle = `rgb(${c})`; g.globalAlpha = light ? 0.9 : 0.85; g.beginPath(); g.arc(ox, oy, Math.min(W, H) * (W < 700 ? 0.03 : 0.04), 0, 6.3); g.fill(); g.globalAlpha = 1;
      for (let k = 0; k < 3; k++) { const base = H * (0.78 + k * 0.07), amp = H * (0.07 - k * 0.012), f = 1.4 + k * 0.7; g.fillStyle = light ? `rgba(90,70,170,${0.09 + k * 0.06})` : `rgba(4,2,22,${0.22 + k * 0.17})`; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 20) g.lineTo(x, base - amp * (Math.sin(x / W * f * 5 + k * 2) * 0.5 + Math.sin(x / W * f * 11 + k) * 0.25 + 0.6)); g.lineTo(W, H); g.fill(); }
    }
    if (s) {
      if (!light || w.night + w.space > 0.05) for (const st of stars) { const a = (0.25 + 0.75 * Math.abs(Math.sin(ts / 1400 * st.s + st.p))) * Math.min(1, 0.35 + (w.night + w.space) * 1.2) * (light ? 0.35 : 0.8); g.fillStyle = light ? `rgba(120,90,200,${a})` : `rgba(255,255,255,${a})`; g.fillRect(st.x * W, st.y * H, st.s, st.s); }
      if (w.wind + w.forest + w.space + w.water * 0.4 > 0.05) for (const f of fogs) { f.x += f.s * dt * (0.5 + w.wind * 3); if (f.x > 1.5) f.x = -0.5; const a = Math.min(0.3, (w.wind * 0.5 + w.forest * 0.2 + w.space * 0.2 + w.water * 0.15) * lv * 0.35), r = f.r * W, rg = g.createRadialGradient(f.x * W, f.y * H, 0, f.x * W, f.y * H, r); rg.addColorStop(0, light ? `rgba(255,255,255,${a * 2})` : `rgba(170,170,240,${a})`); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(f.x * W - r, f.y * H - r, r * 2, r * 2); }
      const want = Math.floor(w.rain * (W < 700 ? 70 : 150) * lv); while (drops.length < want) drops.push({ x: Math.random() * (W + 200), y: -Math.random() * H, v: 700 + Math.random() * 600, l: 14 + Math.random() * 26 }); drops.length = Math.min(drops.length, Math.max(want, 0));
      g.lineWidth = 1.2; g.strokeStyle = `rgba(${ink},${0.12 + 0.2 * Math.min(1, w.rain)})`; g.beginPath(); for (const d of drops) { d.y += d.v * dt; d.x -= d.v * dt * 0.18; if (d.y > H) { d.y = -20; d.x = Math.random() * (W + 200); } g.moveTo(d.x, d.y); g.lineTo(d.x + d.l * 0.18, d.y - d.l); } g.stroke();
      if (w.water > 0.05 && Math.random() < dt * (1 + 5 * w.water * lv)) rings.push({ x: Math.random() * W, y: H * (0.45 + Math.random() * 0.5), r: 2, a: 0.5 });
      if (w.rain > 0.2 && Math.random() < dt * 8 * w.rain) rings.push({ x: Math.random() * W, y: H * (0.8 + Math.random() * 0.2), r: 1, a: 0.3 });
      g.lineWidth = 1.5; for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.r += dt * 70; r.a -= dt * 0.28; if (r.a <= 0) { rings.splice(i, 1); continue; } g.strokeStyle = `rgba(${ink},${r.a * 0.8})`; g.beginPath(); g.ellipse(r.x, r.y, r.r, r.r * 0.32, 0, 0, 6.3); g.stroke(); }
      if (w.fire > 0.03) {
        const fl = (0.7 + 0.3 * Math.sin(ts / 90) * Math.sin(ts / 230 + 1) + L.lvl * 0.5) * Math.min(1, w.fire), cx = W / 2, cy = H * 1.02, r = Math.max(W, H) * 0.7 * (0.6 + 0.4 * fl), rg = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        rg.addColorStop(0, light ? `rgba(255,150,70,${0.55 * fl})` : `rgba(255,140,50,${0.5 * fl})`); rg.addColorStop(0.5, `rgba(220,70,40,${0.18 * fl})`); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, W, H);
        if (Math.random() < dt * 14 * w.fire) embers.push({ x: W * (0.3 + 0.4 * Math.random()), y: H, vx: (Math.random() - 0.5) * 30, vy: 60 + Math.random() * 120, a: 1, r: 1 + Math.random() * 2 });
        for (let i = embers.length - 1; i >= 0; i--) { const e = embers[i]; e.x += e.vx * dt + Math.sin(ts / 400 + i) * 0.4; e.y -= e.vy * dt; e.a -= dt * 0.35; if (e.a <= 0) { embers.splice(i, 1); continue; } g.fillStyle = `rgba(255,${150 + 80 * e.a | 0},70,${e.a * 0.9})`; g.beginPath(); g.arc(e.x, e.y, e.r, 0, 6.3); g.fill(); }
      }
      if (flash > 0.01) { g.fillStyle = `rgba(230,236,255,${flash * (light ? 0.35 : 0.22)})`; g.fillRect(0, 0, W, H); flash *= Math.pow(0.02, dt); }
    }
    if (running) { if (s) requestAnimationFrame(frame); else setTimeout(() => requestAnimationFrame(frame), 400); }
  }
  return {
    set(items, isLight) { // items: [{id, v}] of playing sounds
      light = isLight; const nw = {}; KEYS.forEach(k => (nw[k] = 0)); for (const it of items) { const m = VIZ[it.id]; if (m) m.forEach((x, i) => { nw[KEYS[i]] += x * it.v / 100; }); } KEYS.forEach(k => (tw[k] = Math.min(1, nw[k]))); if (!running) frame(performance.now());
    },
    start() { if (!running) { running = true; requestAnimationFrame(frame); } }, stop() { running = false; }, frame: () => frame(performance.now()),
  };
}
