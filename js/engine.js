// Audio engine: one AudioContext, a voice per active sound, master chain, scheduler, play/pause/mute, timer fades.
import { makeEnv, createVoice } from './sounds.js';
import { volGain } from './mix.js';
const IOS = typeof navigator !== 'undefined' && (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
export class Engine {
  constructor() { this.ctx = null; this.voices = new Map(); this.master = 80; this.muted = false; this.playing = false; }
  // Must run inside a user gesture the first time (autoplay policies, iOS).
  ensure() {
    if (this.ctx) return this.ctx;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'playback' });
    this.bus = ctx.createGain(); this.fade = ctx.createGain(); this.play = ctx.createGain(); this.mg = ctx.createGain(); this.lim = ctx.createDynamicsCompressor();
    this.lim.threshold.value = -10; this.lim.knee.value = 12; this.lim.ratio.value = 8; this.lim.attack.value = 0.005; this.lim.release.value = 0.2;
    this.an = ctx.createAnalyser(); this.an.fftSize = 512; this.an.smoothingTimeConstant = 0.8; this.play.gain.value = 0;
    this.bus.connect(this.fade); this.fade.connect(this.play); this.play.connect(this.mg); this.mg.connect(this.lim); this.lim.connect(this.an);
    if (IOS) { // iOS keeps audio alive in the background only for media elements: route through a MediaStream into a hidden <audio>
      const md = ctx.createMediaStreamDestination(), el = this.el = new Audio(); el.srcObject = md.stream; el.setAttribute('playsinline', ''); this.an.connect(md); el.play().catch(() => {});
    } else this.an.connect(ctx.destination);
    this.env = makeEnv(ctx, this.bus); this.mg.gain.value = this.muted ? 0 : volGain(this.master) * 1.4;
    setInterval(() => this.tick(), 250);
    const wake = () => { if (this.playing && ctx.state !== 'running') ctx.resume().catch(() => {}); if (this.el && this.playing && this.el.paused) this.el.play().catch(() => {}); };
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { wake(); this.tick(); } }); document.addEventListener('pointerdown', wake, true); ctx.onstatechange = () => { if (this.playing && ctx.state === 'interrupted') wake(); };
    return ctx;
  }
  tick() { if (!this.ctx || this.ctx.state !== 'running') return; const n = this.ctx.currentTime; for (const v of this.voices.values()) v.voice.tick(n, n + 2.5); }
  async start(fi = 0.4) {
    const ctx = this.ensure(); if (ctx.state !== 'running') await ctx.resume().catch(() => {}); if (this.el) this.el.play().catch(() => {});
    this.playing = true; const n = ctx.currentTime; this.play.gain.cancelScheduledValues(n); this.play.gain.setValueAtTime(this.play.gain.value, n); this.play.gain.linearRampToValueAtTime(1, n + fi); this.tick();
  }
  pause() {
    this.playing = false; if (!this.ctx) return; const n = this.ctx.currentTime; this.play.gain.cancelScheduledValues(n); this.play.gain.setValueAtTime(this.play.gain.value, n); this.play.gain.linearRampToValueAtTime(0, n + 0.35);
    setTimeout(() => { if (!this.playing && this.ctx.state === 'running') this.ctx.suspend(); }, 450);
  }
  setMaster(v) { this.master = v; this.applyMaster(); }
  setMuted(m) { this.muted = m; this.applyMaster(); }
  applyMaster() { if (this.ctx) this.mg.gain.setTargetAtTime(this.muted ? 0 : volGain(this.master) * 1.4, this.ctx.currentTime, 0.05); }
  addSound(id, v, c) {
    if (this.voices.has(id)) return; this.ensure(); const ctx = this.ctx, vg = ctx.createGain(); vg.gain.value = 0; vg.connect(this.bus);
    const voice = createVoice(ctx, id, this.env, vg, c); vg.gain.setTargetAtTime(volGain(v), ctx.currentTime, 0.3); this.voices.set(id, { voice, vg }); voice.tick(ctx.currentTime, ctx.currentTime + 2.5);
  }
  removeSound(id) { const e = this.voices.get(id); if (!e) return; this.voices.delete(id); e.vg.gain.setTargetAtTime(0, this.ctx.currentTime, 0.12); setTimeout(() => { e.voice.dispose(); e.vg.disconnect(); }, 900); }
  setVol(id, v) { const e = this.voices.get(id); if (e) e.vg.gain.setTargetAtTime(volGain(v), this.ctx.currentTime, 0.05); }
  setChar(id, c) { const e = this.voices.get(id); if (e) e.voice.setChar(c); }
  // Fade the whole mix from one gain to another starting `delay` s from now (sleep timer fade-out, fade-in on play).
  ramp(from, to, delay, dur) {
    if (!this.ctx) return; const n = this.ctx.currentTime, g = this.fade.gain; g.cancelScheduledValues(n); g.setValueAtTime(from, n);
    if (delay > 0) g.setValueAtTime(from, n + delay);
    g.setValueCurveAtTime(Float32Array.from({ length: 64 }, (_, i) => from + (to - from) * (0.5 - 0.5 * Math.cos(Math.PI * i / 63))), n + delay + 0.001, Math.max(dur, 0.1));
  }
  resetFade() { if (this.ctx) { const g = this.fade.gain; g.cancelScheduledValues(0); g.setValueAtTime(1, this.ctx.currentTime); } }
  level() { if (!this.an) return { lvl: 0, bass: 0, hi: 0 }; const d = this.d || (this.d = new Uint8Array(this.an.frequencyBinCount)); this.an.getByteFrequencyData(d); let b = 0, m = 0, h = 0; for (let i = 0; i < 6; i++) b += d[i]; for (let i = 6; i < 40; i++) m += d[i]; for (let i = 40; i < 140; i++) h += d[i]; return { bass: b / 6 / 255, lvl: (b / 6 + m / 34 + h / 100) / 3 / 255, hi: h / 100 / 255 }; }
}
