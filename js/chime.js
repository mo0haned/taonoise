// Synthesized soft bell for phase ends: no audio files. A few sine partials with a bell-like inharmonic ratio and an exponential tail,
// scheduled on the audio clock so it lands on time even when the page timers are throttled.
const NOTES = { rest: [659.25, 880, 1318.5], work: [523.25, 783.99] }; // focus ended (rising, resolved) / break ended (two soft notes)
export const chimeGain = vol => 0.32 * (Math.min(100, Math.max(0, vol)) / 100) ** 2;
export function scheduleChime(ctx, out, when, vol, kind = 'rest') {
  const g = chimeGain(vol), freqs = NOTES[kind] || NOTES.rest, nodes = []; if (g <= 0) return { cancel() {} };
  freqs.forEach((f, i) => {
    const t = when + i * 0.3, tail = i === freqs.length - 1 ? 2.4 : 1.4, bus = ctx.createGain(); bus.connect(out); nodes.push(bus);
    bus.gain.setValueAtTime(0.0001, t); bus.gain.linearRampToValueAtTime(g / (1 + i * 0.25), t + 0.012); bus.gain.exponentialRampToValueAtTime(0.0001, t + tail);
    [[1, 1], [2.76, 0.22], [5.4, 0.07]].forEach(([r, a]) => { const o = ctx.createOscillator(), pg = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * r; pg.gain.value = a; o.connect(pg); pg.connect(bus); nodes.push(o); o.start(t); o.stop(t + tail + 0.05); });
    setTimeout(() => bus.disconnect(), (t - ctx.currentTime + tail + 0.3) * 1000);
  });
  return { notes: freqs.length, end: when + (freqs.length - 1) * 0.3 + 2.45, cancel() { for (const n of nodes) try { n.stop ? n.stop() : n.disconnect(); } catch (e) {} } }; // cancel: pause/skip right before the end
}
