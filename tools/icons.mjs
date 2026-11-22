// Renders the mark to the PNG icons with headless Chrome: PW_FROM=<dir with node_modules/playwright-core> CHROME=<chrome binary> node tools/icons.mjs
import { createRequire } from 'node:module'; import fs from 'node:fs'; import path from 'node:path';
const { chromium } = createRequire(path.join(process.env.PW_FROM || process.cwd(), '/'))('playwright-core');
const root = path.resolve(import.meta.dirname, '..');
const bars = `<g stroke-linecap="round" stroke-width="3.2"><path d="M7 13v6" stroke="#9b8cff"/><path d="M11.8 9v14" stroke="#b6a6ff"/><path d="M16 5.5v21" stroke="#ffc2a8"/><path d="M20.2 10v12" stroke="#b6a6ff"/><path d="M25 14v4" stroke="#9b8cff"/></g>`;
const svg = (scale, r) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="100%" height="100%"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2b1d6e"/><stop offset="1" stop-color="#150e3a"/></linearGradient></defs><rect width="32" height="32" rx="${r}" fill="url(#g)"/><g transform="translate(16 16) scale(${scale}) translate(-16 -16)">${bars}</g></svg>`;
const OUT = [['apple-touch-icon.png', 180, 1.05, 0], ['icon-192.png', 192, 1.05, 9], ['icon-512.png', 512, 1.05, 9], ['icon-maskable-512.png', 512, 0.78, 0], ['favicon-32.png', 32, 1.1, 8]];
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--no-sandbox'] });
for (const [name, px, scale, r] of OUT) { const pg = await b.newPage({ viewport: { width: Math.max(px, 200), height: Math.max(px, 200) } }); await pg.setContent(`<body style="margin:0;width:${px}px;height:${px}px">${svg(scale, r)}</body>`); fs.writeFileSync(path.join(root, name), await pg.screenshot({ clip: { x: 0, y: 0, width: px, height: px }, omitBackground: true })); await pg.close(); }
await b.close(); console.log('icons written');
