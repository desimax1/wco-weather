#!/usr/bin/env node
'use strict';
/*
 * Build script (no dependencies). It:
 *  1. copies /public and /media into /dist
 *  2. fills in the shared header/footer and the site address
 *  3. turns the Markdown files in /content into JSON data + one web page per blog post
 * Run:  node scripts/build.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BASE = (process.env.BASE_PATH || '').replace(/\/+$/, '');
const SITE_URL = (process.env.SITE_URL || 'http://localhost:8080').replace(/\/+$/, '');

const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fixUrl = (u) => {
  u = String(u).trim();
  if (/^(javascript|data|vbscript):/i.test(u)) return '#';
  return u.startsWith('/') && !u.startsWith('//') ? BASE + u : u;
};

/* ---------- front matter ---------- */
function parseFM(raw) {
  const m = raw.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: raw };
  const data = {};
  m[1].split(/\r?\n/).forEach((line) => {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) return;
    let v = kv[2].trim();
    if (/^(['"])[\s\S]*\1$/.test(v)) v = v.slice(1, -1).replace(/''/g, "'");
    else if (v === 'true') v = true;
    else if (v === 'false') v = false;
    data[kv[1]] = v;
  });
  return { data, body: m[2] };
}

/* ---------- tiny Markdown renderer (HTML in content is escaped) ---------- */
function inline(s) {
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, a, u) => `<img src="${fixUrl(u)}" alt="${a}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) => `<a href="${fixUrl(u)}">${t}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}
function md(src) {
  const out = [];
  let para = [];
  let list = null;
  const flushP = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const flushL = () => {
    if (list) { out.push(`<${list.t}>` + list.items.map((i) => '<li>' + inline(i) + '</li>').join('') + `</${list.t}>`); list = null; }
  };
  for (const line of String(src).replace(/\r/g, '').split('\n')) {
    let m;
    if (!line.trim()) { flushP(); flushL(); continue; }
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { flushP(); flushL(); const n = m[1].length + 1; out.push(`<h${n}>${inline(m[2])}</h${n}>`); continue; }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) { flushP(); flushL(); out.push('<hr>'); continue; }
    if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) { flushP(); if (!list || list.t !== 'ul') { flushL(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) { flushP(); if (!list || list.t !== 'ol') { flushL(); list = { t: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^>\s?(.*)$/))) { flushP(); flushL(); out.push('<blockquote><p>' + inline(m[1]) + '</p></blockquote>'); continue; }
    flushL();
    para.push(line.trim());
  }
  flushP(); flushL();
  return out.join('\n');
}
const plain = (src) => String(src).replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`-]/g, '').replace(/\s+/g, ' ').trim();
const excerpt = (src, n = 200) => { const t = plain(src); return t.length > n ? t.slice(0, n).replace(/\s+\S*$/, '') + '…' : t; };

/* ---------- dates ---------- */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function fmtDate(s) {
  if (!s) return '';
  s = String(s);
  if (/(Z|[+-]\d\d:?\d\d)$/.test(s) && s.includes('T')) {
    const d = new Date(s);
    if (!isNaN(d)) return d.toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'long', timeStyle: 'short' });
  }
  const m = s.match(/^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d))?/);
  if (!m) return s;
  let out = `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}`;
  if (m[4]) { const h = +m[4]; out += `, ${((h + 11) % 12) + 1}:${m[5]} ${h >= 12 ? 'PM' : 'AM'}`; }
  return out;
}
const ts = (s) => { const t = Date.parse(String(s || '').length === 10 ? s + 'T12:00:00' : s); return isNaN(t) ? 0 : t; };

/* ---------- collections ---------- */
function readDir(dir) {
  const p = path.join(ROOT, dir);
  if (!fs.existsSync(p)) return [];
  return fs.readdirSync(p).filter((f) => /\.(md|markdown)$/i.test(f)).map((f) => {
    const fm = parseFM(fs.readFileSync(path.join(p, f), 'utf8'));
    return { slug: f.replace(/\.(md|markdown)$/i, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-'), ...fm };
  });
}
const withBase = (u) => (u ? fixUrl(u) : '');

/* ---------- partial/token replacement ---------- */
const header = read('partials/header.html');
const footer = read('partials/footer.html');
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Inter:wght@400;500;600;700&display=swap">\n';
function fill(html, pagePath) {
  if (/<\/head>/.test(html)) {
    const og = /og:image/.test(html) ? '' : `<meta property="og:image" content="${SITE_URL}/img/logo.png">\n`;
    html = html.replace('</head>', () => FONTS + og + '</head>');
  }
  return html
    .split('<!--HEADER-->').join(header)
    .split('<!--FOOTER-->').join(footer)
    .split('{{base}}').join(BASE)
    .split('{{siteUrl}}').join(SITE_URL)
    .split('{{path}}').join(pagePath);
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/* ---------- build ---------- */
fs.rmSync(DIST, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), DIST, { recursive: true });
if (fs.existsSync(path.join(ROOT, 'media'))) fs.cpSync(path.join(ROOT, 'media'), path.join(DIST, 'media'), { recursive: true });
if (fs.existsSync(path.join(ROOT, 'CNAME'))) fs.copyFileSync(path.join(ROOT, 'CNAME'), path.join(DIST, 'CNAME'));

const pages = [];
walk(DIST).forEach((f) => {
  const rel = '/' + path.relative(DIST, f).split(path.sep).join('/');
  if (/\.html$/.test(f)) {
    fs.writeFileSync(f, fill(fs.readFileSync(f, 'utf8'), rel.replace(/index\.html$/, '')));
    if (!/404|admin/.test(rel)) pages.push(rel.replace(/index\.html$/, ''));
  } else if (/robots\.txt$/.test(f)) {
    fs.writeFileSync(f, fill(fs.readFileSync(f, 'utf8'), rel));
  }
});

// Blog posts
const postTpl = read('templates/post.html');
const posts = readDir('content/posts')
  .filter((p) => p.data.draft !== true)
  .map((p) => ({
    title: p.data.title || p.slug,
    slug: p.slug,
    url: `${BASE}/blog/${p.slug}/`,
    date: p.data.date || '',
    dateText: fmtDate(p.data.date),
    category: p.data.category || 'Other',
    image: withBase(p.data.image),
    imageAlt: p.data.image_alt || '',
    summary: p.data.summary || excerpt(p.body),
    sample: p.data.sample === true,
    html: md(p.body),
  }))
  .sort((a, b) => ts(b.date) - ts(a.date));

posts.forEach((p) => {
  const imageHtml = p.image ? `<figure class="post-hero"><img src="${esc(p.image)}" alt="${esc(p.imageAlt)}"></figure>` : '';
  const sampleHtml = p.sample ? '<p class="sample-note"><strong>Sample content.</strong> This post is an example included with the starter site. It is not a real forecast. Delete it in the CMS.</p>' : '';
  const vals = {
    '{{title}}': esc(p.title), '{{desc}}': esc(p.summary), '{{dateText}}': esc(p.dateText), '{{date}}': esc(p.date),
    '{{category}}': esc(p.category), '{{imageHtml}}': imageHtml, '{{sampleHtml}}': sampleHtml, '{{content}}': p.html,
    '{{ogImage}}': esc(p.image ? (p.image.startsWith('http') ? p.image : SITE_URL + p.image.replace(BASE, '')) : SITE_URL + '/img/logo.png'),
  };
  let html = postTpl;
  Object.keys(vals).forEach((k) => { html = html.split(k).join(vals[k]); });
  const dir = path.join(DIST, 'blog', p.slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), fill(html, `/blog/${p.slug}/`));
  pages.push(`/blog/${p.slug}/`);
});

const dataDir = path.join(DIST, 'data');
fs.mkdirSync(dataDir, { recursive: true });
const json = (name, obj) => fs.writeFileSync(path.join(dataDir, name), JSON.stringify(obj));
json('posts.json', posts.map(({ html, ...rest }) => rest));

// Maps and graphics
const maps = readDir('content/maps')
  .filter((m) => m.data.image)
  .map((m) => ({
    title: m.data.title || m.slug, date: m.data.date || '', dateText: fmtDate(m.data.date), category: m.data.category || 'Other',
    image: withBase(m.data.image), imageAlt: m.data.image_alt || m.data.title || '', caption: m.data.caption || '', sample: m.data.sample === true,
  }))
  .sort((a, b) => ts(b.date) - ts(a.date));
json('maps.json', maps);

// Forecast discussion (single file)
let disc = null;
if (fs.existsSync(path.join(ROOT, 'content/discussion.md'))) {
  const d = parseFM(read('content/discussion.md'));
  disc = { title: d.data.title || 'Forecast discussion', updated: d.data.updated || '', updatedText: fmtDate(d.data.updated), author: d.data.author || '', sample: d.data.sample === true, excerpt: excerpt(d.body, 260), html: md(d.body) };
}
json('discussion.json', disc);
json('meta.json', { built: new Date().toISOString() });

// sitemap
const urls = pages.map((u) => `  <url><loc>${SITE_URL}${u}</loc></url>`).join('\n');
fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);

console.log(`Built ${pages.length} pages, ${posts.length} posts, ${maps.length} maps -> dist/  (base="${BASE}", site=${SITE_URL})`);
