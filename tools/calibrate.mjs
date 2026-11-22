// Renders every sound offline in headless Chrome and writes js/levels.js so each sound lands at a similar loudness.
// PW_FROM=<dir with node_modules/playwright-core> CHROME=<chrome> node tools/calibrate.mjs
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http';
const { chromium } = createRequire(path.join(process.env.PW_FROM || process.cwd(), '/'))('playwright-core');
const root = path.resolve(import.meta.dirname, '..');
const { SOUNDS } = await import('../js/catalog.js');
const TARGET = { storm: 0.07, 'rain-heavy': 0.06, ocean: 0.06, airplane: 0.06, train: 0.06, thunder: 0.02, drips: 0.012, bowl: 0.02, birds: 0.012, crickets: 0.02, heartbeat: 0.04, typing: 0.02, drone: 0.04, space: 0.04, white: 0.07, pink: 0.07, brown: 0.07, blue: 0.06, violet: 0.05, cafe: 0.04, 'rain-window': 0.05, stream: 0.05 };
fs.writeFileSync(path.join(root, 'js/levels.js'), 'export const LEVELS = {};\n');
const srv = http.createServer((q, r) => { const f = path.join(root, q.url.split('?')[0]); if (!f.startsWith(root) || !fs.existsSync(f)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); r.end(fs.readFileSync(f)); }).listen(0);
const port = srv.address().port, b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }), pg = await b.newPage();
await pg.goto(`http://localhost:${port}/test/harness.html`); await pg.waitForFunction('window.ready');
const out = {}, rep = [];
for (const s of SOUNDS) { const st = await pg.evaluate(([id]) => window.renderSound(id, 20), [s.id]); const t = TARGET[s.id] ?? 0.05; out[s.id] = +Math.min(12, 0.7 / (st.peak || 1e-3), Math.max(0.05, t / (st.rms || 1e-6))).toFixed(3); rep.push(`${s.id} rms ${st.rms.toFixed(4)} pk ${st.peak.toFixed(2)} -> x${out[s.id]}`); }
console.log(rep.join('\n'));
fs.writeFileSync(path.join(root, 'js/levels.js'), '// Per-sound loudness calibration (written by tools/calibrate.mjs from offline renders).\nexport const LEVELS = ' + JSON.stringify(out) + ';\n');
await b.close(); srv.close();
