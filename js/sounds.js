// Procedural synthesis of every sound. Each recipe builds a small Web Audio graph and registers scheduler callbacks
// (random drops, gusts, pops...) that are run a little ahead of the clock, so nothing ever loops audibly.
// Works on AudioContext and OfflineAudioContext alike (the tests render offline).
import { genNoise } from './noise.js';
import { LEVELS } from './levels.js';
const rand = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)], lerp = (a, b, t) => a + (b - a) * t;
const SEEDS = { white: 11, pink: 23, brown: 37, blue: 41, violet: 53 }, NOISE_SECONDS = 10;
// Shared per-context resources: stereo noise buffers (made once) and a reverb send.
export function makeEnv(ctx, dest) {
  const bufs = {};
  const env = {
    buf(kind) {
      if (bufs[kind]) return bufs[kind];
      const n = Math.floor(ctx.sampleRate * NOISE_SECONDS), b = ctx.createBuffer(2, n, ctx.sampleRate);
      b.copyToChannel(genNoise(kind, n, SEEDS[kind]), 0); b.copyToChannel(genNoise(kind, n, SEEDS[kind] + 1000), 1); return (bufs[kind] = b);
    },
  };
  const cv = ctx.createConvolver(), len = Math.floor(ctx.sampleRate * 2.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-3.2 * i / len * 2.2) * (i < 800 ? i / 800 : 1); }
  cv.buffer = ir; const wet = ctx.createGain(); wet.gain.value = 0.6; env.verb = ctx.createGain(); env.verb.connect(cv); cv.connect(wet); wet.connect(dest);
  return env;
}
function makeCtx(ctx, env, out) {
  const nodes = [], ticks = [], charFns = [], c = { ctx, out, char: 0.5, rand, pick, lerp };
  c.g = v => { const g = ctx.createGain(); g.gain.value = v; return g; };
  c.f = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  c.pan = p => { const s = ctx.createStereoPanner(); s.pan.value = p; return s; };
  c.chain = (...a) => { for (let i = 0; i < a.length - 1; i++) a[i].connect(a[i + 1]); return a[a.length - 1]; };
  c.track = n => (nodes.push(n), n);
  c.noise = (kind, rate = 1) => { const s = ctx.createBufferSource(); s.buffer = env.buf(kind); s.loop = true; s.playbackRate.value = rate; s.start(0, Math.random() * (NOISE_SECONDS - 1)); return c.track(s); };
  c.osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return c.track(o); };
  c.send = (node, amt) => { const g = c.g(amt); node.connect(g); g.connect(env.verb); return g; };
  c.onChar = fn => { charFns.push(fn); fn(c.char); };
  c.sched = fn => { let next = null; ticks.push((now, hor) => { if (next === null || next < now - 0.5) next = now + 0.05; while (next < hor) next += Math.max(0.005, fn(next)); }); };
  c.poisson = (rate, cb) => c.sched(t => { cb(t); return -Math.log(1 - Math.random()) / Math.max(0.01, rate()); });
  c.wander = (param, lo, hi, tmin, tmax) => c.sched(t => { const d = rand(tmin, tmax); param.setTargetAtTime(rand(lo(), hi()), t, d / 3); return d; });
  // one-shot filtered noise burst (the building block of drops, pops, clicks, thuds)
  c.burst = (t, o) => {
    const s = ctx.createBufferSource(); s.buffer = env.buf(o.kind || 'white'); const f = c.f(o.type || 'bandpass', o.f, o.q ?? 1), g = ctx.createGain(); g.channelCount = 1; g.channelCountMode = 'explicit';
    const p = c.pan(o.pan ?? rand(-0.8, 0.8)), a = o.attack || 0.002; s.connect(f); f.connect(g); g.connect(p); p.connect(o.dest || out);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.amp, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.dur);
    s.start(t, Math.random() * (NOISE_SECONDS - 1), a + o.dur + 0.05); s.onended = () => p.disconnect();
  };
  // one-shot sine/tri note with optional glide
  c.note = (t, o) => {
    const os = ctx.createOscillator(), g = ctx.createGain(), p = c.pan(o.pan ?? rand(-0.6, 0.6)); os.type = o.type || 'sine'; os.frequency.setValueAtTime(o.f, t);
    if (o.f2) os.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.dur)); const a = o.attack || 0.005;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.amp, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + o.dur);
    os.connect(g); g.connect(p); p.connect(o.dest || out); if (o.verb) c.send(p, o.verb); os.start(t); os.stop(t + a + o.dur + 0.05); os.onended = () => p.disconnect();
  };
  return { c, nodes, ticks, charFns };
}
const R = {};
const color = k => c => c.chain(c.noise(k), c.out);
['white', 'pink', 'brown', 'blue', 'violet'].forEach(k => (R[k] = color(k)));

// ---- rain family: a pink noise bed plus a stream of tiny filtered noise-burst drops ----
function rain(c, o) {
  const bg = c.g(o.bed), pk = c.f('peaking', o.pkf, 0.8); pk.gain.value = o.pk;
  c.chain(c.noise('pink'), c.f('highpass', o.hp), pk, c.f('lowpass', o.lp), bg, c.out);
  if (o.low) c.chain(c.noise('brown'), c.f('lowpass', 500), c.g(o.low), c.out);
  c.onChar(l => bg.gain.setTargetAtTime(o.bed * (0.55 + 0.9 * l), c.ctx.currentTime, 0.15));
  c.poisson(() => o.rate * (0.25 + 1.5 * c.char), t => c.burst(t, { f: rand(o.f0, o.f1), q: o.q, dur: rand(0.006, 0.02) * (o.dd || 1), amp: rand(0.04, 0.22) * o.da * (0.7 + 0.6 * c.char) }));
}
R['rain-light'] = c => rain(c, { bed: 0.28, hp: 700, lp: 9000, pk: 4, pkf: 3500, rate: 22, f0: 2500, f1: 7000, q: 2, da: 1 });
R['rain-heavy'] = c => rain(c, { bed: 0.75, hp: 300, lp: 8500, pk: 3, pkf: 1800, rate: 26, f0: 1500, f1: 6500, q: 1.5, da: 1.3, low: 0.12 });
R['rain-window'] = c => { rain(c, { bed: 0.22, hp: 500, lp: 4200, pk: 4, pkf: 2200, rate: 6, f0: 1800, f1: 3400, q: 5, dd: 1.4, da: 1.8 }); c.poisson(() => 0.5 + c.char * 1.6, t => c.burst(t, { f: rand(250, 520), q: 3, dur: 0.09, amp: rand(0.15, 0.35), type: 'bandpass' })); };
R['rain-roof'] = c => { rain(c, { bed: 0.4, hp: 250, lp: 5200, pk: 3, pkf: 900, rate: 18, f0: 400, f1: 1300, q: 3, dd: 1.8, da: 1.8, low: 0.1 }); c.poisson(() => 0.4 + c.char * 1.4, t => c.burst(t, { f: rand(120, 220), q: 2, dur: 0.12, amp: rand(0.2, 0.5) })); };
R['rain-tent'] = c => rain(c, { bed: 0.4, hp: 350, lp: 3000, pk: 4, pkf: 1100, rate: 15, f0: 600, f1: 1600, q: 1.6, dd: 2.2, da: 1.3, low: 0.12 });
function thunder(c, dest, meanS) {
  const bursts = (t) => {
    const dist = Math.random(), dur = rand(4.5, 8.5), s = c.ctx.createBufferSource(), lp = c.f('lowpass', lerp(700, 220, dist), 0.7), g = c.ctx.createGain(), p = c.pan(rand(-0.7, 0.7));
    s.buffer = c.env.buf('brown'); s.connect(lp); lp.connect(g); g.connect(p); p.connect(dest);
    lp.frequency.setValueAtTime(lerp(700, 220, dist), t); lp.frequency.exponentialRampToValueAtTime(55, t + dur);
    const amp = lerp(1.3, 0.55, dist), a = lerp(0.05, 1.2, dist); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + a);
    for (let i = 1; i < 5; i++) { const tt = t + a + i * dur * 0.14 * rand(0.6, 1.4); g.gain.linearRampToValueAtTime(amp * rand(0.4, 0.95) * (1 - i * 0.12), tt); }
    g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.start(t, Math.random() * 4, dur + 0.1); s.onended = () => p.disconnect();
    if (dist < 0.4) c.burst(t, { f: rand(900, 1800), q: 0.8, dur: 0.18, amp: 0.6 * (1 - dist), kind: 'white', dest, pan: 0 });
  };
  c.sched(t => { bursts(t); return rand(0.5, 1.5) * meanS(); });
}
R.thunder = c => { c.env = c.ctx.__env; thunder(c, c.out, () => lerp(42, 9, c.char)); };
R.storm = c => {
  c.env = c.ctx.__env; rain(c, { bed: 0.8, hp: 250, lp: 8000, pk: 3, pkf: 1700, rate: 26, f0: 1400, f1: 6500, q: 1.5, da: 1.3, low: 0.15 });
  const bp = c.f('bandpass', 450, 0.7), wg = c.g(0.3); c.chain(c.noise('pink'), bp, wg, c.out);
  c.wander(bp.frequency, () => 250, () => 900, 1, 3.5); c.wander(wg.gain, () => 0.1, () => 0.25 + c.char * 0.7, 1, 3); thunder(c, c.out, () => lerp(26, 7, c.char));
};
// ---- wind: noise through a band-pass whose centre and gain wander; gustiness sets the range ----
function wind(c, trees) {
  const bp = c.f('bandpass', 420, 0.9), g = c.g(0.3), whi = c.f('bandpass', 800, 7), wg = c.g(0.04);
  c.chain(c.noise('pink'), bp, g, c.out); c.chain(c.noise('pink', 0.9), whi, wg, c.out);
  c.wander(bp.frequency, () => 220 + 100 * c.char, () => 500 + 700 * c.char, 1.5, 5); c.wander(g.gain, () => 0.05, () => 0.25 + c.char * 0.75, 1.2, 4.5);
  c.wander(whi.frequency, () => 500, () => 1300, 2, 6); c.wander(wg.gain, () => 0.0, () => 0.05 + 0.08 * c.char, 1.5, 4);
  if (trees) { const lg = c.g(0.1); c.chain(c.noise('white', 1.1), c.f('highpass', 2200), c.f('lowpass', 8000), lg, c.out); c.wander(lg.gain, () => 0.01, () => 0.12 + c.char * 0.3, 0.12, 0.6); }
}
R.wind = c => wind(c, 0); R['wind-trees'] = c => wind(c, 1);
// ---- ocean: brown body + white foam, one slow wave swell at a time, filter opening on the crest ----
R.ocean = c => {
  const lp = c.f('lowpass', 250, 0.6), bg = c.g(0.1), foam = c.f('highpass', 1600, 0.5), fg = c.g(0), pn = c.pan(0);
  c.chain(c.noise('brown'), lp, bg, pn, c.out); c.chain(c.noise('pink', 1.3), foam, c.f('lowpass', 7000), fg, c.out); c.wander(pn.pan, () => -0.4, () => 0.4, 4, 9);
  c.sched(t => {
    const p = rand(8, 13) * lerp(1.25, 0.8, c.char), up = p * 0.38, k = 0.4 + 0.8 * c.char;
    bg.gain.setTargetAtTime(0.9 * k + 0.2, t, up / 3); bg.gain.setTargetAtTime(0.08, t + up, p * 0.22);
    lp.frequency.setTargetAtTime(1400 + 700 * c.char, t, up / 3); lp.frequency.setTargetAtTime(220, t + up, p * 0.25);
    fg.gain.setTargetAtTime(0.6 * k, t + up * 0.7, up / 3); fg.gain.setTargetAtTime(0.005, t + up * 1.2, p * 0.25); return p;
  });
};
R.stream = c => {
  const g = c.g(0.35), bp = c.f('bandpass', 1500, 0.5), hg = c.g(0.1); c.chain(c.noise('pink'), bp, g, c.out); c.chain(c.noise('white'), c.f('highpass', 4000), hg, c.out);
  c.wander(g.gain, () => 0.2, () => 0.45, 0.2, 0.8); c.wander(hg.gain, () => 0.03, () => 0.14, 0.15, 0.6); c.wander(bp.frequency, () => 900, () => 2200, 0.5, 2);
  c.poisson(() => 14 + 50 * c.char, t => { const f = rand(450, 2200); c.note(t, { f, f2: f * rand(1.4, 2.1), glide: rand(0.02, 0.06), dur: rand(0.03, 0.09), amp: rand(0.02, 0.1) }); });
};
R.waterfall = c => {
  const hg = c.g(0.1), mg = c.g(0.35); c.chain(c.noise('brown'), c.f('lowpass', 700), c.g(0.7), c.out); c.chain(c.noise('pink'), c.f('bandpass', 2500, 0.35), mg, c.out); c.chain(c.noise('white', 1.2), c.f('highpass', 5000), hg, c.out);
  c.onChar(l => { hg.gain.setTargetAtTime(0.03 + 0.25 * l, c.ctx.currentTime, 0.1); });
  c.wander(mg.gain, () => 0.25, () => 0.45, 0.4, 1.4);
};
R.drips = c => {
  c.poisson(() => 0.4 + 3 * c.char, t => {
    const f = rand(650, 1900), pn = rand(-0.7, 0.7), o = { f, f2: f * 1.9, glide: 0.04, dur: rand(0.07, 0.14), amp: rand(0.12, 0.28), pan: pn, verb: 0.9 };
    c.note(t, o); if (Math.random() < 0.6) c.note(t + rand(0.1, 0.2), { ...o, amp: o.amp * 0.3, f: f * 1.02 });
  });
  c.chain(c.noise('brown'), c.f('lowpass', 200), c.g(0.04), c.out);
};
R.underwater = c => {
  const lp = c.f('lowpass', 380, 0.8), g = c.g(0.9); c.chain(c.noise('brown', 0.9), lp, g, c.out); c.chain(c.noise('pink', 0.7), c.f('lowpass', 900), c.g(0.2), c.out);
  c.onChar(l => { lp.frequency.setTargetAtTime(lerp(700, 220, l), c.ctx.currentTime, 0.2); }); c.wander(lp.detune, () => -300, () => 350, 2, 6); c.wander(g.gain, () => 0.6, () => 1, 3, 7);
  c.poisson(() => 0.7, t => { const f = rand(180, 650); c.note(t, { f, f2: f * rand(1.3, 1.8), glide: 0.12, dur: rand(0.1, 0.25), amp: rand(0.05, 0.14), verb: 0.5 }); });
};
// ---- fire: low roar plus a poisson stream of crackle pops (ticks, snaps, rare big cracks, small clusters) ----
function fire(c, cosy) {
  const rg = c.g(0.32), mg = c.g(0.1); c.chain(c.noise('brown'), c.f('lowpass', cosy ? 320 : 480), rg, c.out); c.chain(c.noise('pink', 0.8), c.f('bandpass', cosy ? 500 : 900, 0.6), mg, c.out);
  c.wander(rg.gain, () => 0.2, () => 0.6, 0.2, 0.9); c.wander(mg.gain, () => 0.03, () => cosy ? 0.12 : 0.2, 0.15, 0.7);
  if (cosy) { const cg = c.g(0.15); c.chain(c.noise('brown', 0.6), c.f('bandpass', 120, 1.2), cg, c.out); c.wander(cg.gain, () => 0.05, () => 0.4, 1.5, 4); }
  const pop = t => {
    const r = Math.random(), soft = (cosy ? 0.6 : 1) * 2.6;
    if (r < 0.62) c.burst(t, { type: 'highpass', f: rand(1800, cosy ? 3500 : 6000), q: 0.7, dur: rand(0.003, 0.012), amp: rand(0.1, 0.45) * soft });
    else if (r < 0.93) c.burst(t, { f: rand(2200, 4600), q: 3, dur: rand(0.015, 0.03), amp: rand(0.25, 0.6) * soft });
    else { c.burst(t, { f: rand(350, 700), q: 1.2, dur: 0.09, amp: rand(0.5, 0.9) * soft }); c.burst(t, { f: rand(2000, 3500), q: 1, dur: 0.02, amp: 0.5 * soft }); }
    if (Math.random() < 0.3) for (let i = 1; i < 1 + Math.floor(rand(1, 4)); i++) c.burst(t + i * rand(0.01, 0.03), { f: rand(2000, 5000), q: 2, dur: 0.006, amp: rand(0.1, 0.3) * soft });
  };
  c.poisson(() => (cosy ? 2 : 3) + (cosy ? 12 : 22) * c.char, pop);
}
R.campfire = c => fire(c, 0); R.fireplace = c => fire(c, 1);
R.forest = c => {
  const g = c.g(0.1); c.chain(c.noise('white', 1.15), c.f('highpass', 3000), c.f('lowpass', 9500), g, c.out); const lg = c.g(0.15); c.chain(c.noise('pink'), c.f('bandpass', 320, 0.7), lg, c.out);
  c.sched(t => { g.gain.setTargetAtTime(Math.random() < 0.2 ? 0.003 : rand(0.02, 0.1 + 0.45 * c.char), t, 0.025); return rand(0.03, 0.14); }); c.wander(lg.gain, () => 0.03, () => 0.25, 2, 6);
};
R.crickets = c => {
  c.chain(c.noise('pink'), c.f('lowpass', 500), c.g(0.05), c.out);
  for (let i = 0; i < 6; i++) {
    const f = rand(4100, 5200), o = c.osc('sine', f), g = c.g(0), pn = c.pan(rand(-0.9, 0.9)), per = rand(0.5, 0.85), np = 3 + (i % 2), sp = rand(0.04, 0.055); c.chain(o, g, pn, c.out);
    c.sched(t => { if (i < 2 + c.char * 4.2) for (let k = 0; k < np; k++) { const s = t + k * sp; g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.045, s + 0.008); g.gain.linearRampToValueAtTime(0, s + 0.028); } return per * rand(0.92, 1.1); });
  }
};
R.birds = c => {
  const note = (t, f, f2, d, amp, pan) => c.note(t, { f, f2, dur: d, amp, pan, verb: 0.5, attack: 0.01 });
  c.sched(t => {
    const pan = rand(-0.8, 0.8), a = rand(0.05, 0.1), sp = rand(0.9, 1.2), kind = Math.floor(rand(0, 3));
    if (kind === 0) { const f = rand(2300, 3800); for (let i = 0; i < 2 + Math.floor(rand(0, 4)); i++) note(t + i * 0.13 * sp, f * rand(0.95, 1.05), f * rand(1.2, 1.45), 0.08, a, pan); }
    else if (kind === 1) { const f = rand(3000, 4500); for (let i = 0; i < 9 + Math.floor(rand(0, 6)); i++) note(t + i * 0.045, f * (i % 2 ? 1.12 : 1), f * (i % 2 ? 1 : 1.12), 0.03, a * 0.7, pan); }
    else { const f = rand(2600, 3600); note(t, f * 1.3, f * 1.05, 0.16, a, pan); note(t + 0.24 * sp, f, f * 0.8, 0.22, a, pan); }
    return rand(1.2, 6) / (0.35 + 1.65 * c.char);
  });
};
// ---- places and machines ----
R.fan = c => {
  const lp = c.f('lowpass', 700, 0.7), g = c.g(0.7), am = c.g(0.15), lfo = c.osc('sine', 9), lg = c.g(0.1);
  c.chain(c.noise('brown'), lp, g, c.out); c.chain(c.noise('pink'), c.f('bandpass', 1500, 0.4), c.g(0.45), am, c.out); lfo.connect(lg); lg.connect(am.gain);
  const h1 = c.osc('sine', 100), h2 = c.osc('sine', 200.4), hg = c.g(0.03); c.chain(h1, hg, c.out); c.chain(h2, hg);
  c.onChar(l => { const n = c.ctx.currentTime; lp.frequency.setTargetAtTime(lerp(380, 1100, l), n, 0.2); lfo.frequency.setTargetAtTime(lerp(5, 14, l), n, 0.2); h1.frequency.setTargetAtTime(lerp(80, 130, l), n, 0.2); h2.frequency.setTargetAtTime(lerp(160, 260.5, l), n, 0.2); });
  c.wander(g.gain, () => 0.6, () => 0.8, 3, 8);
};
R.train = c => {
  c.chain(c.noise('brown'), c.f('lowpass', 260), c.g(0.9), c.out); const bg = c.g(0.1); c.chain(c.noise('pink'), c.f('lowpass', 1400), bg, c.out); c.wander(bg.gain, () => 0.06, () => 0.16, 3, 8);
  const clack = (t, amp) => { c.note(t, { f: 75, f2: 42, dur: 0.14, amp: 0.4 * amp, pan: 0 }); c.burst(t, { f: 750, q: 1.2, dur: 0.05, amp: 0.3 * amp, pan: rand(-0.3, 0.3) }); };
  c.sched(t => { const per = lerp(0.72, 0.26, c.char); clack(t, 1); clack(t + per * 0.2, 0.7); return per * rand(0.97, 1.03); });
};
R.airplane = c => {
  const lp = c.f('lowpass', 1100, 0.6), g = c.g(0.6), tg = c.g(0.03); c.chain(c.noise('pink'), lp, g, c.out); c.chain(c.noise('brown'), c.f('lowpass', 300), c.g(0.8), c.out); c.chain(c.noise('white'), c.f('highpass', 3500), c.g(0.05), c.out); c.chain(c.noise('pink'), c.f('bandpass', 900, 0.5), c.g(0.25), c.out);
  c.chain(c.osc('sine', 94), tg, c.out); c.chain(c.osc('sine', 94.6), tg); c.chain(c.osc('sine', 188.7), c.g(0.5), tg);
  c.onChar(l => { tg.gain.setTargetAtTime(0.012 + 0.05 * l, c.ctx.currentTime, 0.2); }); c.wander(lp.frequency, () => 850, () => 1300, 3, 8);
};
R.cafe = c => {
  const room = c.g(0.15); c.chain(c.noise('pink'), c.f('lowpass', 700), room, c.out);
  for (let i = 0; i < 7; i++) {
    const b1 = c.f('bandpass', rand(450, 800), 3.5), b2 = c.f('bandpass', rand(1300, 2300), 4), g = c.g(0), pn = c.pan(rand(-0.9, 0.9)), s = c.noise('pink', rand(0.8, 1.3)); s.connect(b1); s.connect(b2); b1.connect(g); b2.connect(g); c.chain(g, pn, c.out);
    c.sched(t => {
      const on = i < 3 + c.char * 4.2 && Math.random() > 0.2; g.gain.setTargetAtTime(on ? rand(0.1, 0.5) : 0, t, 0.03); b1.frequency.setTargetAtTime(rand(420, 850), t, 0.04); b2.frequency.setTargetAtTime(rand(1200, 2400), t, 0.04);
      return Math.random() < 0.12 ? rand(0.4, 1.4) : rand(0.1, 0.24);
    });
  }
  c.poisson(() => 0.12 + 0.3 * c.char, t => { const f = rand(3000, 5200), pn = rand(-0.8, 0.8); c.note(t, { f, dur: 0.22, amp: 0.025, pan: pn, verb: 0.4 }); c.note(t, { f: f * 2.76, dur: 0.1, amp: 0.012, pan: pn }); });
};
R.typing = c => {
  const key = t => { const a = rand(0.5, 1); c.burst(t, { f: rand(2500, 4500), q: 2, dur: 0.012, amp: 1.1 * a }); c.burst(t, { f: rand(200, 320), q: 1.5, dur: 0.035, amp: 2.4 * a, pan: 0 }); };
  let left = 0; c.sched(t => { if (left <= 0) { left = 6 + Math.floor(rand(0, 26)); return rand(1.2, 5); } left--; key(t); return rand(0.06, 0.22) * lerp(1.6, 0.6, c.char); });
};
// ---- tones and body ----
R.heartbeat = c => {
  const bed = c.g(0.35), lp = c.f('lowpass', 150, 0.7); lp.connect(c.out); c.chain(c.noise('brown'), c.f('lowpass', 260), bed, c.out); c.chain(c.noise('pink', 0.6), c.f('lowpass', 700), c.g(0.07), c.out); c.wander(bed.gain, () => 0.25, () => 0.4, 2, 5);
  const beat = (t, f, amp) => c.note(t, { f, f2: f * 0.7, glide: 0.12, dur: 0.16, amp, attack: 0.02, pan: 0, dest: lp });
  c.sched(t => { const p = 60 / (48 + 52 * c.char); beat(t, 54, 0.9); beat(t + 0.29, 62, 0.6); return p * rand(0.98, 1.02); });
};
R.bowl = c => {
  const rat = [1, 2.76, 5.4, 8.93], amp = [1, 0.5, 0.24, 0.1], dec = [11, 6, 3.5, 1.8];
  c.sched(t => {
    const f0 = lerp(170, 440, c.char) * rand(0.99, 1.01), pn = rand(-0.4, 0.4);
    rat.forEach((r, i) => [-1.1, 1.1].forEach(d => c.note(t, { f: f0 * r + d * (1 + i * 0.4), dur: dec[i], amp: 0.1 * amp[i], attack: 0.015 + i * 0.004, pan: pn, verb: 0.7 })));
    return rand(10, 18);
  });
};
R.drone = c => {
  const f = 112, l = c.osc('sine', f), r = c.osc('sine', f + 4), gl = c.g(0.35), gr = c.g(0.35); c.chain(l, gl, c.pan(-1), c.out); c.chain(r, gr, c.pan(1), c.out);
  const o2 = c.osc('sine', f * 2), o3 = c.osc('triangle', f * 1.5), g2 = c.g(0.07), g3 = c.g(0.05); c.chain(o2, g2, c.out); c.chain(o3, c.f('lowpass', 500), g3, c.out);
  c.chain(c.noise('brown'), c.f('lowpass', 200), c.g(0.25), c.out); c.onChar(x => r.frequency.setTargetAtTime(f + 2 + x * 10, c.ctx.currentTime, 0.2)); c.wander(g2.gain, () => 0.02, () => 0.1, 4, 9); c.wander(g3.gain, () => 0.01, () => 0.08, 5, 11);
};
R.space = c => {
  const lp = c.f('lowpass', 220, 0.8), g = c.g(0.12), sg = c.g(0.01); [55, 55.35, 82.4, 54.6].forEach(f => c.chain(c.osc('sawtooth', f), lp)); lp.connect(g); g.connect(c.out); c.send(g, 0.5);
  const bg = c.g(0.7); c.chain(c.noise('brown', 0.7), c.f('lowpass', 100), bg, c.out); c.wander(bg.gain, () => 0.3, () => 1, 5, 11);
  const sh = c.osc('sine', 880.5); c.chain(sh, sg, c.out); c.send(sg, 0.8); c.wander(sg.gain, () => 0.0, () => 0.012, 4, 9); const v = c.osc('sine', 0.13), vg = c.g(2); v.connect(vg); vg.connect(sh.frequency);
  c.onChar(x => lp.frequency.setTargetAtTime(lerp(140, 420, x), c.ctx.currentTime, 0.3)); c.wander(lp.detune, () => -500, () => 700, 6, 14);
};
// Build one voice. Returns { tick(now, horizon), setChar(0-100), dispose() }.
export function createVoice(ctx, id, env, dest, char = 50) {
  ctx.__env = env; const lvl = ctx.createGain(), L = LEVELS[id] || 1; lvl.gain.value = L; lvl.connect(dest);
  const { c, nodes, ticks, charFns } = makeCtx(ctx, env, lvl); c.env = env; c.char = char / 100; R[id](c);
  return {
    tick(now, hor) { for (const t of ticks) t(now, hor); },
    setChar(v) { c.char = v / 100; charFns.forEach(f => f(c.char)); },
    dispose() { nodes.forEach(n => { try { n.stop(); } catch (e) {} }); lvl.disconnect(); },
  };
}
export const HAS = id => !!R[id];
