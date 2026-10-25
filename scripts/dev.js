#!/usr/bin/env node
'use strict';
// Local preview:  node scripts/dev.js   then open http://localhost:8080
const http = require('http'), fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'), DIST = path.join(ROOT, 'dist'), PORT = process.env.PORT || 8080;
const build = () => { const r = spawnSync(process.execPath, [path.join(__dirname, 'build.js')], { stdio: 'inherit', env: { ...process.env, BASE_PATH: '', SITE_URL: `http://localhost:${PORT}` } }); return r.status === 0; };
if (!build()) process.exit(1);
let t; ['public', 'content', 'media', 'partials', 'templates'].forEach((d) => {
  try { fs.watch(path.join(ROOT, d), { recursive: true }, () => { clearTimeout(t); t = setTimeout(build, 300); }); } catch (e) { /* watching is optional */ }
});
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.xml': 'application/xml', '.txt': 'text/plain' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(DIST, path.normalize(p).replace(/^(\.\.[\/\\])+/, ''));
  if (!f.startsWith(DIST)) { res.writeHead(403); return res.end('Forbidden'); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404, { 'Content-Type': TYPES['.html'] }); return res.end(fs.readFileSync(path.join(DIST, '404.html'))); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(res);
}).listen(PORT, () => console.log(`\nPreview running at http://localhost:${PORT}  (Ctrl+C to stop)`));
