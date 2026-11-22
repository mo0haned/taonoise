// Mix model, URL codec and timer math. Pure: no DOM, no audio.
import { BY_ID, SOUNDS } from './catalog.js';
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const int = (x, d) => { const n = Math.round(Number(x)); return Number.isFinite(n) ? n : d; };
// A mix: { name, master 0-100, items: [{ id, v 0-100, c 0-100 }] } with unique known ids.
export function cleanMix(m) {
  const seen = new Set(), items = [];
  for (const i of (m && Array.isArray(m.items) ? m.items : [])) {
    if (!i || !BY_ID[i.id] || seen.has(i.id)) continue; seen.add(i.id);
    items.push({ id: i.id, v: clamp(int(i.v, BY_ID[i.id].dv), 0, 100), c: clamp(int(i.c, BY_ID[i.id].dc), 0, 100) });
  }
  return { name: String((m && m.name) || '').slice(0, 40), master: clamp(int(m && m.master, 80), 0, 100), items };
}
// "#/mix/rain-roof.70.55~fire.40.35~m=80~n=Cabin": id.volume[.character], master, name.
export function encodeMix(m) {
  m = cleanMix(m); const t = m.items.map(i => `${i.id}.${i.v}.${i.c}`); t.push('m=' + m.master); if (m.name) t.push('n=' + encodeURIComponent(m.name).replace(/~/g, '%7E'));
  return '#/mix/' + t.join('~');
}
export function decodeMix(hash) {
  const mm = /^#?\/mix\/(.*)$/.exec(hash || ''); if (!mm) return null;
  const out = { name: '', master: 80, items: [] };
  for (const tok of mm[1].split('~')) {
    if (tok.startsWith('m=')) out.master = int(tok.slice(2), 80);
    else if (tok.startsWith('n=')) { try { out.name = decodeURIComponent(tok.slice(2)); } catch { out.name = ''; } }
    else { const [id, v, c] = tok.split('.'); if (BY_ID[id]) out.items.push({ id, v: int(v, BY_ID[id].dv), c: int(c, BY_ID[id].dc) }); }
  }
  return out.items.length ? cleanMix(out) : null;
}
export function summary(m) { const n = m.items.map(i => BY_ID[i.id].name); return n.length <= 3 ? n.join(' · ') : n.slice(0, 2).join(' · ') + ' +' + (n.length - 2); }
// Surprise me: 2-5 sounds from different groups, random volumes, always at least one bed.
export function surprise(rand = Math.random) {
  const pool = SOUNDS.slice(), n = 2 + Math.floor(rand() * 4), items = [], groups = new Set();
  while (items.length < n && pool.length) {
    const s = pool.splice(Math.floor(rand() * pool.length), 1)[0]; if (groups.has(s.g) && rand() < 0.7) continue; groups.add(s.g);
    items.push({ id: s.id, v: 35 + Math.floor(rand() * 45), c: 20 + Math.floor(rand() * 60) });
  }
  return cleanMix({ name: 'Surprise', master: 75, items });
}
// Volume taper: slider 0-100 to linear gain (squared: feels even).
export const volGain = v => (clamp(v, 0, 100) / 100) ** 2;
// Sleep timer: gain multiplier 1 -> 0 over the last fadeSec before endAt (cosine, so it starts and ends gently).
export function timerGain(endAt, now, fadeSec) { const left = (endAt - now) / 1000; if (left <= 0) return 0; if (left >= fadeSec) return 1; return 0.5 - 0.5 * Math.cos(Math.PI * left / fadeSec); }
export const fadeSecFor = totalMin => Math.min(60, Math.max(5, totalMin * 60 * 0.25));
export function fadeInGain(elapsedSec, durSec) { if (durSec <= 0 || elapsedSec >= durSec) return 1; if (elapsedSec <= 0) return 0; return 0.5 - 0.5 * Math.cos(Math.PI * elapsedSec / durSec); }
export function fmtClock(ms) { const s = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); }
