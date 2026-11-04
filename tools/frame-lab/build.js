#!/usr/bin/env node
/**
 * Frame Lab — every component's gallery, rendered by the engine, in a frame you can narrow.
 *
 * It answers one question: if a slide could grow and shrink, would each component reflow and
 * still look good? Each gallery is rendered through the CLI, then hosted in its own frame page
 * with three changes, all made in the lab and none in the engine:
 *   - the engine's shape labels (`data-family`, `data-orientation`) are removed, so only CSS
 *     responds;
 *   - the slide has no height limit (it grows to its content, with a 16:9 minimum for its width);
 *   - type either HOLDS its 1280px-slide size (`cqi` measured against a fixed 1280px reference,
 *     the responsive test) or SCALES with the frame (the engine's own behavior).
 * A viewer page lists every component with a headless measurement per width (content spilling
 * past the frame's edge, header/footer spill, slide height) and shows any one of them resizable
 * or side by side at five widths. The `table-types` entry is the responsive-table prototype
 * (tools/frame-lab/proto/), with an on/off switch.
 *
 * Usage:
 *   npm run lab:build                      → .scratch/frame-lab/ (open index-local.html)
 *   npm run lab:build -- --out DIR         another output folder
 *   npm run lab:build -- --only table,kpi  a few galleries (by name)
 *   npm run lab:build -- --no-scan         skip the headless measurement
 *
 * The output is a static site: `index.html` is the viewer body (it is published as an artifact,
 * which supplies the document skeleton), `index-local.html` the same page wrapped for a local
 * browser, `f/` one frame per component, `css/` the deduplicated stylesheets. Serve the folder
 * over HTTP to use it; the frames talk to the viewer with postMessage.
 *
 * Born from the 2026-11-03 responsive audit; see
 * engineering/decisions/2026-11-03-responsive-tables.md.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, execFileSync } = require('node:child_process');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..', '..');
const HERE = __dirname;
const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const OUT = path.resolve(ROOT, flag('--out') || '.scratch/frame-lab');
const ONLY = flag('--only') ? new Set(flag('--only').split(',').map((s) => s.trim())) : null;
const SCAN = !args.includes('--no-scan');

// Runs inside each frame: keeps `--_sec-1cqi` in step with the type mode, strips the shape
// labels, and reports each slide's height and any content past its right edge.
const FRAME_SCRIPT = `
(function(){
  var REF = 1280;
  var root = document.documentElement;
  // The lab is a continuous host: the slide grows, so a narrow layout never has to be held.
  root.setAttribute('data-lattice-flow', 'continuous');
  var secs = Array.prototype.slice.call(document.querySelectorAll('#deck > section'));
  function measure(){
    var hold = root.getAttribute('data-lab-type') !== 'follow';
    var out = [];
    secs.forEach(function(s){
      s.removeAttribute('data-family'); s.removeAttribute('data-orientation');
      s.style.setProperty('--_sec-1cqi', ((hold ? REF : s.offsetWidth) / 100).toFixed(3) + 'px');
      s.style.setProperty('--_sec-1cqh', '7.2px');
    });
    secs.forEach(function(s){
      var r = s.getBoundingClientRect(), over = 0, chromeOver = 0;
      var tw = document.createTreeWalker(s, NodeFilter.SHOW_TEXT, null), n, range = document.createRange();
      while ((n = tw.nextNode())) {
        if (!n.nodeValue.trim()) continue;
        var el = n.parentElement;
        if (!el || el.closest('[aria-hidden="true"],[data-lattice-berth]')) continue;
        var cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        range.selectNodeContents(n);
        var rs = range.getClientRects();
        var isChrome = !!el.closest('header,footer,.lat-pagination');
        // Chrome: measure what a reader SEES. Text an ancestor clips (the footer band's designed ellipsis,
        // a clipping cell) is not past the slide's edge, so the visible box is the nearest
        // horizontally clipping ancestor's, not the text's own. (Without this the chrome column
        // counted the footer's ellipsis as a spill on nearly every component.)
        // Content is the other way round: clipped content is CUT text, which a reader loses, so it
        // still counts at its full width.
        var vl = -Infinity, vr = Infinity;
        for (var a = el; isChrome && a && a !== s; a = a.parentElement) {
          if (getComputedStyle(a).overflowX !== 'visible') { var ab = a.getBoundingClientRect(); vl = Math.max(vl, ab.left); vr = Math.min(vr, ab.right); }
        }
        for (var k = 0; k < rs.length; k++) {
          var q = rs[k]; if (!q.width || !q.height) continue;
          var d = Math.max(Math.min(q.right, vr) - r.right, r.left - Math.max(q.left, vl));
          if (isChrome) chromeOver = Math.max(chromeOver, d); else over = Math.max(over, d);
        }
      }
      s.querySelectorAll('img,svg,video,canvas,table,pre').forEach(function(m){
        if (m.closest('[aria-hidden="true"],[data-lattice-berth],header,footer') || (m.tagName === 'svg' && m.parentElement.closest('svg'))) return;
        var q = m.getBoundingClientRect(); if (q.width > 4 && q.height > 4) over = Math.max(over, q.right - r.right, r.left - q.left);
      });
      out.push({ top: s.offsetTop, h: s.offsetHeight, over: Math.round(over), chrome: Math.round(chromeOver), cls: s.getAttribute('data-class') || '' });
    });
    parent.postMessage({ lab: 'size', id: window.name, total: document.getElementById('deck').scrollHeight, slides: out }, '*');
  }
  var pending = false;
  function soon(){ if (pending) return; pending = true; requestAnimationFrame(function(){ pending = false; measure(); }); }
  window.addEventListener('message', function(e){
    var m = e.data || {};
    if (m.lab === 'frame') { root.setAttribute('data-lab-type', m.type === 'follow' ? 'follow' : 'hold'); root.setAttribute('data-proto', m.proto === 'off' ? 'off' : 'on'); soon(); }
  });
  if (window.ResizeObserver) new ResizeObserver(soon).observe(document.getElementById('deck'));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(soon);
  window.addEventListener('load', soon);
  soon();
})();`;

// The root is a fixed 720px-tall size container, so a component's `cqh` resolves to a stable
// 7.2px instead of feeding back on the frame's own growing height.
const FRAME_CSS = `
html { container-type: size; height: 720px; }
html, body { margin: 0 !important; padding: 0 !important; background: transparent !important; overflow: hidden !important; }
body { width: 100vw; height: auto; }
.lat-skip-link { display: none !important; }
#deck { display: flex !important; flex-direction: column !important; align-items: flex-start !important; gap: 48px !important; padding: 0 !important; margin: 0 !important; width: 100vw; }
html[data-lab-type="hold"] #deck, html:not([data-lab-type]) #deck { container-type: inline-size; width: 1280px; }
html body #deck > section[data-lattice-slide] {
  width: 100vw !important; height: auto !important; min-height: calc(100vw * 9 / 16) !important; max-height: none !important;
  flex: 0 0 auto !important; transform: none !important; translate: none !important; scale: none !important;
}
html[data-lab-type="follow"] body #deck > section[data-lattice-slide] { container-type: inline-size !important; }
html[data-lab-type="hold"] body #deck > section[data-lattice-slide], html:not([data-lab-type]) body #deck > section[data-lattice-slide] { container-type: normal !important; }`;

const SAMPLE_RE = /file:\/\/\/[^"')\s]*\/lib\/samples\/([\w.-]+)/g;

/** Every component and chart-kind gallery, plus the table prototype deck. */
function galleries() {
  const files = execFileSync('git', ['ls-files', 'lib/components/*/*/*.gallery.md', 'lib/plugins/chart-family/kinds/*/*.gallery.md'], { cwd: ROOT, encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
  const list = files.map((rel) => ({
    rel,
    name: path.basename(rel, '.gallery.md'),
    bucket: rel.includes('chart-family') ? 'chart' : rel.split('/')[2],
    manifest: path.join(ROOT, path.dirname(rel), `${path.basename(rel, '.gallery.md')}.manifest.json`),
  }));
  list.push({ rel: path.relative(ROOT, path.join(HERE, 'proto', 'table-types.md')), name: 'table-types', bucket: 'prototype', proto: true });
  return ONLY ? list.filter((g) => ONLY.has(g.name)) : list;
}

/** Render every gallery to HTML, a few at a time. */
function renderAll(list, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const queue = [...list];
  const width = Math.max(1, Math.min(4, os.cpus().length));
  let failed = 0;
  return new Promise((resolve) => {
    let live = 0;
    const next = () => {
      if (!queue.length && !live) return resolve(failed);
      while (live < width && queue.length) {
        const g = queue.shift();
        live++;
        const p = spawn(process.execPath, [path.join(ROOT, 'lattice.js'), g.rel, path.join(dir, `${g.name}.html`), '-q'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] });
        let err = '';
        p.stderr.on('data', (d) => { err += d; });
        p.on('close', (code) => { if (code) { failed++; console.error(`render failed: ${g.name}\n${err.slice(0, 400)}`); } live--; next(); });
      }
    };
    next();
  });
}

/** Turn one rendered gallery into a frame page. */
function framePage(g, html, cssSeen, imgs) {
  const links = [];
  for (const m of html.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)) {
    const css = m[2].replace(SAMPLE_RE, (_, f) => { imgs.add(f); return `../img/${f}`; });
    const hash = crypto.createHash('sha1').update(css).digest('hex').slice(0, 10);
    if (!cssSeen.has(hash)) { fs.writeFileSync(path.join(OUT, 'css', `${hash}.css`), css); cssSeen.add(hash); }
    links.push(`<link rel="stylesheet" href="../css/${hash}.css">`);
  }
  const htmlTag = (html.match(/<html[^>]*>/) || ['<html lang="en">'])[0];
  // Parse rather than slice: the frame keeps the slides and drops every script (the runtime,
  // which the lab replaces with its own frame script). A regex strip was case-sensitive and
  // single-pass, so a parser is the honest tool even for our own CLI output.
  const doc = new JSDOM(html).window.document;
  for (const el of doc.querySelectorAll('script')) el.remove();
  let body = doc.body.innerHTML;
  body = body.replace(SAMPLE_RE, (_, f) => { imgs.add(f); return `../img/${f}`; });
  const slides = (body.match(/<section[\s>]/g) || []).length;
  const proto = g.proto
    ? ['<link rel="stylesheet" href="../proto/proto.css">', '<script src="../proto/proto.js"></script>']
    : ['', ''];
  const page = `<!doctype html>\n${htmlTag}<head><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
    `<title>${g.name}</title>${links.join('')}<style>${FRAME_CSS}</style>${proto[0]}</head><body>${body}${proto[1]}<script>${FRAME_SCRIPT}</script></body></html>`;
  fs.writeFileSync(path.join(OUT, 'f', `${g.name}.html`), page);
  return slides;
}

/** Headless measurement, type held at slide size: spill, header/footer spill and height per width. */
async function scan(comps) {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { console.error('scan skipped: playwright is not installed'); return {}; }
  const http = require('node:http');
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
    const file = path.join(OUT, rel);
    if (!file.startsWith(OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    const type = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, { 'content-type': type });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/f/`;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const out = {};
  for (const c of comps) {
    await page.goto(`${base}${c.name}.html`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    out[c.name] = {};
    for (const w of [1280, 960, 640, 480, 360]) {
      await page.setViewportSize({ width: w, height: 900 });
      const slides = await page.evaluate(() => new Promise((r) => {
        const on = (e) => { if (e.data && e.data.lab === 'size') { removeEventListener('message', on); r(e.data.slides); } };
        addEventListener('message', on);
        postMessage({ lab: 'frame', type: 'hold' }, '*');
      }));
      const content = slides.slice(1); // slide 1 is the gallery's own title card
      const hs = content.map((s) => s.h).sort((a, b) => a - b);
      out[c.name][w] = {
        spill: content.filter((s) => s.over > 2).length,
        max: Math.max(0, ...content.map((s) => s.over)),
        chrome: content.filter((s) => s.chrome > 2).length,
        h: hs.length ? hs[Math.floor(hs.length / 2)] : 0,
      };
    }
  }
  await browser.close();
  server.close();
  return out;
}

async function main() {
  const list = galleries();
  fs.rmSync(OUT, { recursive: true, force: true });
  for (const d of ['css', 'img', 'f', 'proto']) fs.mkdirSync(path.join(OUT, d), { recursive: true });
  const renders = path.join(OUT, '.renders');
  console.log(`rendering ${list.length} galleries…`);
  const failed = await renderAll(list, renders);

  const cssSeen = new Set();
  const imgs = new Set();
  const comps = [];
  for (const g of list) {
    const file = path.join(renders, `${g.name}.html`);
    if (!fs.existsSync(file)) continue;
    const slides = framePage(g, fs.readFileSync(file, 'utf8'), cssSeen, imgs);
    let man = {};
    try { if (g.manifest) man = JSON.parse(fs.readFileSync(g.manifest, 'utf8')); } catch { /* a gallery without a manifest */ }
    comps.push({ name: g.name, bucket: g.bucket, slides, mode: man.adapt?.mode || '', families: man.adapt?.families || [] });
  }
  execFileSync(process.execPath, [path.join(HERE, 'proto', 'gen-css.js'), path.join(OUT, 'proto', 'proto.css')], { stdio: 'ignore' });
  fs.copyFileSync(path.join(HERE, 'proto', 'proto.js'), path.join(OUT, 'proto', 'proto.js'));
  for (const f of imgs) fs.copyFileSync(path.join(ROOT, 'lib/samples', f), path.join(OUT, 'img', f));
  fs.rmSync(renders, { recursive: true, force: true });

  const measured = SCAN ? await scan(comps) : {};
  const viewer = fs.readFileSync(path.join(HERE, 'viewer.html'), 'utf8')
    .replace('window.SCAN = null; /*SCAN*/', `window.SCAN = ${JSON.stringify(measured)};`)
    .replace('init(/*COMPONENTS*/[]);', `init(${JSON.stringify(comps)});`);
  fs.writeFileSync(path.join(OUT, 'index.html'), viewer);
  fs.writeFileSync(path.join(OUT, 'index-local.html'),
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>${viewer}</body></html>`);
  console.log(`frame lab: ${comps.length} components, ${cssSeen.size} stylesheets → ${path.relative(ROOT, OUT)}/` +
    `${failed ? ` (${failed} renders failed)` : ''}. Serve that folder over HTTP and open index-local.html.`);
  if (failed) process.exitCode = 1;
}

main().catch((err) => { console.error(err); process.exit(1); });
