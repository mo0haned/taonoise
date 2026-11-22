// Production build, node only, no dependencies: node tools/build.mjs
import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const root = path.resolve(import.meta.dirname, '..'), js = path.join(root, 'js'), dist = path.join(root, 'dist'), BUDGET = 60 * 1024, gz = s => zlib.gzipSync(s, { level: 9 }).length;
const IMP = /^import\s+(.+?)\s+from\s+'([^']+)';?[ \t]*$/gm, norm = (from, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
const graph = new Map();
(function walk(id) { if (graph.has(id)) return; const src = fs.readFileSync(path.join(js, id), 'utf8'); graph.set(id, src); for (const m of src.matchAll(IMP)) walk(norm(id, m[2])); })('app.js');
function transform(id, src) {
  const names = [];
  src = src.replace(IMP, (_, what, spec) => `const ${what.replace(/\s+as\s+/g, ': ')} = __r(${JSON.stringify(norm(id, spec))});`);
  src = src.replace(/^export\s+((?:async\s+)?function\*?|const|let|class)\s+([A-Za-z0-9_$]+)/gm, (_, kind, name) => { names.push(name); return kind + ' ' + name; });
  if (/^export\s+(default|\{)/m.test(src)) throw new Error('unsupported export in ' + id);
  return `${JSON.stringify(id)}:function(exports,__r){"use strict";\n${src}\n${names.map(n => `exports.${n}=${n};`).join('')}}`;
}
const minJs = s => s.split('\n').map(l => l.replace(/^\s+/, '')).filter(l => l && !l.startsWith('//')).join('\n');
const minCss = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s*\n\s*/g, '').replace(/\s*([{};,>])\s*/g, '$1').replace(/;}/g, '}');
const table = `{${[...graph].map(([id, s]) => transform(id, s)).join(',\n')}}`;
const script = minJs(`(function(){var D=${table},C={};function __r(i){var m=C[i];if(m)return m.e;m=C[i]={e:{}};D[i](m.e,__r);return m.e}__r("app.js")})();`);
const css = minCss(fs.readFileSync(path.join(root, 'css/app.css'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('<!--CSS-->', () => `<style>${css}</style>`).replace('<!--JS-->', () => `<script>${script.replace(/<\/script/gi, '<\\/script')}</script>`);
fs.rmSync(dist, { recursive: true, force: true }); fs.mkdirSync(dist);
fs.writeFileSync(path.join(dist, 'index.html'), html);
const files = ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'favicon.svg', 'favicon-32.png', 'manifest.webmanifest', 'sw.js'];
for (const f of files) fs.copyFileSync(path.join(root, f), path.join(dist, f));
const first = gz(html) + gz(fs.readFileSync(path.join(dist, 'favicon.svg')));
let total = gz(html); for (const f of files) total += gz(fs.readFileSync(path.join(dist, f)));
console.log(`dist/index.html ${html.length} B raw, ${gz(html)} B gzip. First load (html + favicon) ${first} B gzip, budget ${BUDGET}: ${first <= BUDGET ? 'OK' : 'OVER'}. Whole dist incl. PNG icons ${total} B.`);
