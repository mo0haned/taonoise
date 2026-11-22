// Static server with gzip (what any static host does): node tools/serve.mjs [port] [dir]  (default dir: dist if built, else the repo)
import http from 'node:http'; import fs from 'node:fs'; import zlib from 'node:zlib'; import path from 'node:path';
const here = path.resolve(import.meta.dirname, '..'), root = process.argv[3] ? path.resolve(process.argv[3]) : fs.existsSync(path.join(here, 'dist/index.html')) ? path.join(here, 'dist') : here;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
http.createServer((q, r) => {
  const f = path.join(root, q.url.split('?')[0].replace(/\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end('not found'); }
  r.writeHead(200, { 'content-type': T[path.extname(f)] || 'application/octet-stream', 'content-encoding': 'gzip', 'cache-control': 'no-cache' }); r.end(zlib.gzipSync(fs.readFileSync(f), { level: 9 }));
}).listen(+process.argv[2] || 8766, () => console.log('serving', root));
