#!/usr/bin/env node
/**
 * check-glance — does status still read at a glance, from the back row, on a real projector?
 *
 * Every contrast gate in this repo scores pixels as the browser paints them. A boardroom does
 * not see those pixels. It sees them through a projector in a lit room, which lifts the blacks,
 * from several screen-heights away, which blurs every edge. A status pill whose fill sits at
 * 1.4:1 off the slide and leans on a 2px border passes every static check and can vanish at the
 * back of the room. This tool renders the deck, puts each slide through those two losses, and
 * then measures every status mark on what is left.
 *
 * THE MODEL (both halves physical, both on the linear-light screenshot):
 *
 *   WASHOUT — room light adds to every pixel the projector draws, so the screen's black is no
 *   longer black: `lin' = (lin + f) / (1 + f)`, where `f` is the stray light as a share of the
 *   projector's white. `dim` (f = 0.01) is a darkened room, about 100:1 on screen; `lit`
 *   (f = 0.05) is a meeting room with the lights on, about 20:1, which is what projector makers'
 *   own ANSI figures fall to in ambient light. `none` skips it (a monitor or a TV close up).
 *
 *   DISTANCE — the eye blurs detail smaller than its acuity. The back row sits `k` screen-heights
 *   away (`VENUE_BACK_ROW`, lib/core/resolve-venue.js, the same table the type scale is built
 *   on — engineering/typography.md §"Why the room reduces to one number"), so one slide pixel
 *   subtends `3438 / (720 × k)` arcminutes on a 720px-tall slide. A viewer who resolves `a`
 *   arcminutes sees a blur whose half-height width is `a`, a Gaussian with
 *   `sigma = a / arcminPerPx / 2.355`. Two viewers:
 *     back-row  a = 2   (20/40: the mixed audience typography.md designs for, readers over 60
 *                        included)
 *     squint    a = 10  (20/200: the designer's squint test — what survives is the slide's
 *                        masses of value and color, which is what a glance actually reads)
 *
 * WHAT IT MEASURES, per status mark, on the simulated slide:
 *
 *   SEPARATION — does the mark stand off what surrounds it? The larger of two ratios: the mark's
 *   fill (the middle of its box) against its surround (a ring 3-6px outside the box), and its
 *   edge band (the outer 2px inside the box) against that surround. A mark whose identity is a
 *   pale fill inside a darker border passes on the border while the border survives the blur,
 *   and fails when it does not. Floor at the back row: 3:1, WCAG 1.4.11's non-text minimum
 *   applied to what the back row actually sees. This is the one blocking finding (`--strict`).
 *
 *   DISTINCTNESS — can two different statuses on one slide still be told apart? The OKLab
 *   distance between the simulated fills of every pair of statuses, the smallest one reported.
 *   Below 0.08 (four times the ~0.02 just-noticeable difference) is flagged "merges". Report-only:
 *   the number is proposed, not calibrated against viewers yet.
 *
 * WHAT COUNTS AS A STATUS MARK (found in the DOM, so the tool needs no per-deck setup): a chart
 * member carrying `data-s` that paints an AREA at least 6px each way (an HTML box with a background,
 * an SVG rect / circle / ellipse / polygon / path with a fill: pills, progress fills, gantt bars,
 * state tiles, risk cells), a `.lat-state` / `td .state` disc, a checklist row's `::before` disc,
 * and a `.lat-pill` that wears one of the slide's status fills (a kpi pill; not a citation pill).
 * Text that carries `data-s`, the drawn mark glyph, and a sliver (a gantt bar's 4px leading accent,
 * read with the bar it belongs to) are not marks of their own. The status is read from `data-s`,
 * the state class, or, for a pill, the status fill it matches.
 *
 * Usage:
 *   node tools/check-glance.js <deck.md|deck.html>... [--palette=indaco] [--venues=conference,hall]
 *        [--room=lit|dim|none] [--out=DIR] [--json] [--strict]
 * Writes `<out>/<deck>.glance.png` (each slide: as painted, then each venue's back-row and squint
 * view, failing marks boxed in red) and prints a table. Exit 1 only under `--strict`, on a mark
 * below the back-row floor. A `.md` is rendered with dist/lattice.js first (`npm run build`).
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PNG } = require('pngjs');
const { VENUE_BACK_ROW } = require('../lib/core/resolve-venue.js');
const { contrastRatio, oklabDistance, rgbToHex } = require('../lib/core/color.js');

const ROOT = path.join(__dirname, '..');
const SLIDE_H = 720;
const ROOMS = Object.freeze({ none: 0, dim: 0.01, lit: 0.05 });
const VIEWERS = Object.freeze({ 'back-row': 2, squint: 10 });
const BACK_ROW_FLOOR = 3;
const MERGE_DE = 0.08;
const STATUS_OF = Object.freeze({
  'on-track': 'pass', done: 'pass', live: 'pass', pass: 'pass',
  'at-risk': 'warn', warn: 'warn',
  blocked: 'fail', fail: 'fail',
  pilot: 'info', decision: 'info', info: 'info',
  deferred: 'mute', mute: 'mute', skip: 'mute', unknown: 'mute',
});

// ── the optics (pure; unit-tested) ─────────────────────────────────────────
const toLin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toSrgb = (l) => { const v = l <= 0.0031308 ? 12.92 * l : 1.055 * l ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
const arcminPerPx = (k, slideH = SLIDE_H) => 3438 / (slideH * k);
const sigmaFor = (acuityArcmin, k, slideH = SLIDE_H) => acuityArcmin / arcminPerPx(k, slideH) / 2.355;

/** RGBA bytes → three Float32Array planes in linear light. */
function toLinearPlanes(png) {
  const n = png.width * png.height;
  const planes = [new Float32Array(n), new Float32Array(n), new Float32Array(n)];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) planes[c][i] = toLin(png.data[i * 4 + c]);
  return planes;
}
/** The washout: stray light `f` added to every pixel, renormalized so white stays white. */
function applyFlare(planes, f) {
  if (!f) return planes;
  return planes.map((p) => p.map((v) => (v + f) / (1 + f)));
}
/** A separable Gaussian blur in linear light (how optics blur), edges clamped. */
function gaussianBlur(planes, w, h, sigma) {
  if (sigma < 0.3) return planes;
  const r = Math.ceil(sigma * 3);
  const kern = new Float32Array(2 * r + 1);
  let sum = 0;
  for (let i = -r; i <= r; i++) { kern[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); sum += kern[i + r]; }
  for (let i = 0; i < kern.length; i++) kern[i] /= sum;
  return planes.map((src) => {
    const tmp = new Float32Array(src.length);
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += src[y * w + Math.min(w - 1, Math.max(0, x + i))] * kern[i + r];
      tmp[y * w + x] = a;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -r; i <= r; i++) a += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x] * kern[i + r];
      out[y * w + x] = a;
    }
    return out;
  });
}
/** Linear planes → a PNG (sRGB bytes). */
function toPng(planes, w, h) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    for (let c = 0; c < 3; c++) png.data[i * 4 + c] = toSrgb(planes[c][i]);
    png.data[i * 4 + 3] = 255;
  }
  return png;
}

// ── sampling a mark (pure; unit-tested) ────────────────────────────────────
function medianHex(planes, w, h, pts) {
  const ok = pts.filter(([x, y]) => x >= 0 && y >= 0 && x < w && y < h);
  if (!ok.length) return null;
  const ch = [0, 1, 2].map((c) => ok.map(([x, y]) => planes[c][y * w + x]).sort((a, b) => a - b)[ok.length >> 1]);
  return rgbToHex(ch.map(toSrgb));
}
function regions(rect) {
  const x0 = Math.round(rect.x), y0 = Math.round(rect.y), x1 = Math.round(rect.x + rect.w) - 1, y1 = Math.round(rect.y + rect.h) - 1;
  const inner = [], edge = [], ring = [];
  const ix = Math.max(1, Math.round(rect.w / 4)), iy = Math.max(1, Math.round(rect.h / 4));
  for (let y = y0 + iy; y <= y1 - iy; y++) for (let x = x0 + ix; x <= x1 - ix; x++) inner.push([x, y]);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.min(x - x0, x1 - x, y - y0, y1 - y);
    if (d < 2) edge.push([x, y]);
  }
  for (let y = y0 - 6; y <= y1 + 6; y++) for (let x = x0 - 6; x <= x1 + 6; x++) {
    const d = Math.max(x0 - x, x - x1, y0 - y, y - y1); // distance outside the box
    if (d >= 3 && d <= 6) ring.push([x, y]);
  }
  return { inner: inner.length ? inner : [[Math.round(rect.x + rect.w / 2), Math.round(rect.y + rect.h / 2)]], edge, ring };
}
/** Fill, edge and surround of one mark on one (simulated) slide, and how well it separates. */
function measureMark(planes, w, h, rect) {
  const r = regions(rect);
  const fill = medianHex(planes, w, h, r.inner);
  const edge = medianHex(planes, w, h, r.edge);
  const surround = medianHex(planes, w, h, r.ring);
  if (!fill || !surround) return null;
  const sep = Math.max(contrastRatio(fill, surround), edge ? contrastRatio(edge, surround) : 1);
  return { fill, edge, surround, sep };
}
/** The closest pair of DIFFERENT statuses on a slide, by simulated fill. */
function closestPair(marks) {
  const byKey = new Map();
  for (const m of marks) if (m.m && !byKey.has(m.key)) byKey.set(m.key, m.m.fill);
  const keys = [...byKey.keys()];
  let best = null;
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
    const d = oklabDistance(byKey.get(keys[i]), byKey.get(keys[j]));
    if (!best || d < best.d) best = { a: keys[i], b: keys[j], d };
  }
  return best;
}

// ── the page side: find every status mark ──────────────────────────────────
/* Runs in the page. Returns, per slide, every status mark's box relative to the slide. */
const FIND_MARKS = (STATUS_OF) => {
  const out = [];
  const slides = [...document.querySelectorAll('section[data-lattice-slide]')];
  slides.forEach((sec, page) => {
    const s = sec.getBoundingClientRect();
    const add = (r, key, kind) => { if (r.width >= 3 && r.height >= 3) out.push({ page, key, kind, rect: { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height } }); };
    const clear = (c) => !c || c === 'none' || c === 'transparent' || /^rgba\(.*,\s*0\)$/.test(c);
    // A status MARK paints an area: an HTML box with a background, or an SVG shape with a fill. Text that carries
    // `data-s` (a gantt caption, a state label or numeral), a group, and the drawn mark glyph (`.chart-status-mark`,
    // which the measuring shot hides on purpose) are not marks: measured, each is its own surround, a false 1.00:1.
    // A pill (or any HTML box) is a status mark only when it wears one of this slide's status fills (a kpi pill does; a citation pill
    // on the canvas tint, or a kanban card washed toward its status, does not). A probe painted with each `--state-X-hue` reads the slide's own fills, intensity
    // register included, so the match is exact rather than guessed from the pill's words.
    // Colors are compared as painted pixels: a fill from `color-mix(in oklab, …)` serializes as `oklab(…)`, the same
    // color written another way, so string equality would miss it.
    const px = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgbOf = (c) => { px.clearRect(0, 0, 1, 1); px.fillStyle = '#000'; px.fillStyle = c; px.fillRect(0, 0, 1, 1); return [...px.getImageData(0, 0, 1, 1).data]; };
    const fills = [];
    for (const st of ['pass', 'warn', 'fail', 'info', 'mute']) {
      const probe = document.createElement('span');
      probe.style.cssText = `position:absolute;width:1px;height:1px;background:var(--state-${st}-hue)`;
      sec.appendChild(probe);
      fills.push([rgbOf(getComputedStyle(probe).backgroundColor), st]);
      probe.remove();
    }
    const fillOf = (c) => {
      if (clear(c)) return null;
      const v = rgbOf(c);
      if (v[3] < 250) return null;
      const hit = fills.find(([f]) => f.slice(0, 3).every((x, i) => Math.abs(x - v[i]) <= 2));
      return hit ? hit[1] : null;
    };
    const SHAPES = new Set(['rect', 'circle', 'ellipse', 'polygon', 'path']);
    for (const el of sec.querySelectorAll('[data-s]')) {
      const st = STATUS_OF[(el.getAttribute('data-s') || '').toLowerCase()];
      const r = el.getBoundingClientRect();
      // A sliver under 6px is part of a larger mark (a gantt bar's leading accent): its own 3-6px ring would sample the
      // shape it belongs to as its surround, so it is read with that shape, not scored alone.
      if (!st || !(r.width >= 6 && r.height >= 6 && r.width < s.width * 0.9)) continue;
      const tag = el.tagName.toLowerCase();
      const cs = getComputedStyle(el);
      const svg = el instanceof SVGElement;
      if (svg ? !SHAPES.has(tag) || el.classList.contains('chart-status-mark') || clear(cs.fill) : !fillOf(cs.backgroundColor)) continue;
      add(r, st, el.className.baseVal ?? el.className);
    }
    for (const el of sec.querySelectorAll('.lat-state, td .state')) {
      const st = ['pass', 'warn', 'fail', 'info', 'mute', 'skip', 'unknown'].find((c) => el.classList.contains(c));
      if (st) add(el.getBoundingClientRect(), STATUS_OF[st], 'state');
    }
    for (const li of sec.querySelectorAll('li.state')) {
      const st = ['pass', 'warn', 'fail'].find((c) => li.classList.contains(c));
      const b = getComputedStyle(li, '::before');
      if (!st || b.content === 'none' || b.position !== 'absolute') continue;
      const lr = li.getBoundingClientRect();
      const w = parseFloat(b.width), h = parseFloat(b.height), left = parseFloat(b.left);
      add({ left: lr.left + left, top: lr.top + lr.height / 2 - h / 2, width: w, height: h }, st, 'disc');
    }
    for (const el of sec.querySelectorAll('.lat-pill')) {
      const st = fillOf(getComputedStyle(el).backgroundColor);
      if (st) add(el.getBoundingClientRect(), st, 'pill');
    }
  });
  return out;
};

/* Every glyph transparent, every shape kept: text, SVG text, and the drawn marks (a pill's
 * `::before` mark paints in currentColor, so `color` takes it too; a disc's mark is its `::after`). */
const GLYPHS_OFF = `
  section[data-lattice-slide] *, section[data-lattice-slide] *::before { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }
  section[data-lattice-slide] svg text, section[data-lattice-slide] .chart-status-mark { fill: transparent !important; stroke: transparent !important; }
  section[data-lattice-slide] li.state::after, section[data-lattice-slide] .lat-state::after, section[data-lattice-slide] .state::after { visibility: hidden !important; }
`;

// ── drawing the contact sheet ──────────────────────────────────────────────
function blit(dst, src, ox, oy, scale) {
  for (let y = 0; y < Math.floor(src.height * scale); y++) for (let x = 0; x < Math.floor(src.width * scale); x++) {
    const sx = Math.floor(x / scale), sy = Math.floor(y / scale);
    const si = (sy * src.width + sx) * 4, di = ((oy + y) * dst.width + ox + x) * 4;
    for (let c = 0; c < 4; c++) dst.data[di + c] = src.data[si + c];
  }
}
function box(png, rect, rgb) {
  const x0 = Math.max(0, Math.round(rect.x) - 3), y0 = Math.max(0, Math.round(rect.y) - 3);
  const x1 = Math.min(png.width - 1, Math.round(rect.x + rect.w) + 2), y1 = Math.min(png.height - 1, Math.round(rect.y + rect.h) + 2);
  const put = (x, y) => { const i = (y * png.width + x) * 4; png.data[i] = rgb[0]; png.data[i + 1] = rgb[1]; png.data[i + 2] = rgb[2]; };
  for (let t = 0; t < 2; t++) {
    for (let x = x0; x <= x1; x++) { put(x, Math.min(y1, y0 + t)); put(x, Math.max(y0, y1 - t)); }
    for (let y = y0; y <= y1; y++) { put(Math.min(x1, x0 + t), y); put(Math.max(x0, x1 - t), y); }
  }
}

// ── main ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { files: [], venues: ['conference', 'hall'], room: 'lit', out: null, json: false, strict: false, palette: null };
  for (const a of argv) {
    if (a.startsWith('--venues=')) o.venues = a.slice(9).split(',').filter(Boolean);
    else if (a.startsWith('--room=')) o.room = a.slice(7);
    else if (a.startsWith('--out=')) o.out = a.slice(6);
    else if (a.startsWith('--palette=')) o.palette = a.slice(10);
    else if (a === '--json') o.json = true;
    else if (a === '--strict') o.strict = true;
    else o.files.push(a);
  }
  for (const v of o.venues) if (!(v in VENUE_BACK_ROW)) throw new Error(`unknown venue "${v}" (one of ${Object.keys(VENUE_BACK_ROW).join(', ')})`);
  if (!(o.room in ROOMS)) throw new Error(`unknown room "${o.room}" (one of ${Object.keys(ROOMS).join(', ')})`);
  return o;
}

function renderToHtml(file, palette, tmp) {
  if (file.endsWith('.html')) return path.resolve(file);
  const cli = path.join(ROOT, 'dist', 'lattice.js');
  if (!fs.existsSync(cli)) throw new Error('dist/lattice.js is missing: run `npm run build` first');
  const out = path.join(tmp, path.basename(file).replace(/\.md$/, '') + '.html');
  execFileSync(process.execPath, [cli, file, out, ...(palette ? [palette] : [])], { stdio: 'pipe' });
  return out;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.files.length) { console.error('usage: node tools/check-glance.js <deck.md|deck.html>... [--palette=] [--venues=] [--room=] [--out=] [--json] [--strict]'); process.exit(2); }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'glance-'));
  const outDir = opts.out || tmp;
  fs.mkdirSync(outDir, { recursive: true });
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox', '--font-render-hinting=none'] });
  const report = [];
  let below = 0;
  try {
    for (const file of opts.files) {
      const html = renderToHtml(file, opts.palette, tmp);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
      await page.goto('file://' + html, { waitUntil: 'networkidle0' });
      await page.evaluate(() => document.fonts.ready);
      const marks = await page.evaluate(FIND_MARKS, STATUS_OF);
      const sections = await page.$$('section[data-lattice-slide]');
      const conds = opts.venues.flatMap((v) => Object.entries(VIEWERS).map(([viewer, a]) => ({ venue: v, viewer, sigma: sigmaFor(a, VENUE_BACK_ROW[v]) })));
      const tileW = 640, tileH = 360, cols = 1 + conds.length;
      const sheet = new PNG({ width: tileW * cols, height: tileH * sections.length });
      // Two shots per slide: as painted (what the sheet shows) and with every glyph made transparent (what is
      // measured). A pill is mostly its words: sampled with the text on, the "fill" is half white letters.
      const shots = [];
      for (const s of sections) shots.push(PNG.sync.read(await s.screenshot({ type: 'png' })));
      await page.addStyleTag({ content: GLYPHS_OFF });
      const bare = [];
      for (const s of sections) bare.push(PNG.sync.read(await s.screenshot({ type: 'png' })));
      for (let p = 0; p < sections.length; p++) {
        const shot = shots[p];
        const w = shot.width, h = shot.height;
        const scale = h / SLIDE_H;
        const slideMarks = marks.filter((m) => m.page === p).map((m) => ({ ...m, rect: { x: m.rect.x * scale, y: m.rect.y * scale, w: m.rect.w * scale, h: m.rect.h * scale } }));
        blit(sheet, shot, 0, p * tileH, tileW / w);
        const lin = toLinearPlanes(shot);
        const linBare = toLinearPlanes(bare[p]);
        conds.forEach((c, ci) => {
          const sigma = c.sigma * scale, flare = ROOMS[opts.room];
          const sim = gaussianBlur(applyFlare(lin, flare), w, h, sigma);
          const simBare = gaussianBlur(applyFlare(linBare, flare), w, h, sigma);
          const measured = slideMarks.map((m) => ({ ...m, m: measureMark(simBare, w, h, m.rect) }));
          const png = toPng(sim, w, h);
          for (const m of measured) {
            if (!m.m) continue;
            const fail = c.viewer === 'back-row' && m.m.sep < BACK_ROW_FLOOR;
            if (fail) { below++; box(png, m.rect, [230, 20, 20]); }
            report.push({ deck: path.basename(file), slide: p + 1, venue: c.venue, viewer: c.viewer, room: opts.room, key: m.key, kind: m.kind, sep: +m.m.sep.toFixed(2), fill: m.m.fill, surround: m.m.surround, below: fail });
          }
          const pair = closestPair(measured);
          if (pair) report.push({ deck: path.basename(file), slide: p + 1, venue: c.venue, viewer: c.viewer, room: opts.room, closest: `${pair.a} ~ ${pair.b}`, dE: +pair.d.toFixed(3), merges: pair.d < MERGE_DE });
          blit(sheet, png, tileW * (ci + 1), p * tileH, tileW / w);
        });
      }
      const sheetPath = path.join(outDir, path.basename(file).replace(/\.(md|html)$/, '') + '.glance.png');
      fs.writeFileSync(sheetPath, PNG.sync.write(sheet));
      if (!opts.json) console.log(`\n${file}\n  sheet: ${sheetPath}\n  columns: as painted | ${conds.map((c) => `${c.venue} ${c.viewer} (blur ${c.sigma.toFixed(2)}px)`).join(' | ')}  · room ${opts.room}`);
      await page.close();
    }
  } finally { await browser.close(); }
  if (opts.json) { console.log(JSON.stringify(report, null, 1)); }
  else {
    const rows = report.filter((r) => r.key && r.viewer === 'back-row');
    const worst = new Map();
    for (const r of rows) { const k = `${r.deck} p${r.slide} ${r.venue} ${r.key}`; if (!worst.has(k) || r.sep < worst.get(k).sep) worst.set(k, r); }
    console.log('\n  back-row separation (worst mark per status, floor 3:1):');
    for (const r of worst.values()) console.log(`    ${r.below ? 'BELOW' : 'ok   '} ${`${r.deck} p${r.slide}`.padEnd(28)} ${r.venue.padEnd(10)} ${r.key.padEnd(28).slice(0, 28)} ${r.sep.toFixed(2)}:1`);
    console.log('\n  closest two statuses per slide (OKLab, "merges" below 0.08):');
    for (const r of report.filter((x) => x.closest)) console.log(`    ${r.merges ? 'MERGES' : 'ok    '} ${`${r.deck} p${r.slide}`.padEnd(28)} ${`${r.venue} ${r.viewer}`.padEnd(20)} ${r.closest.padEnd(40).slice(0, 40)} ${r.dE.toFixed(3)}`);
    console.log(`\n  ${below} mark-views below the back-row floor${opts.strict ? '' : ' (report only; --strict to fail)'}`);
  }
  process.exit(opts.strict && below ? 1 : 0);
}

module.exports = { arcminPerPx, sigmaFor, applyFlare, gaussianBlur, toLinearPlanes, toPng, measureMark, closestPair, regions, ROOMS, VIEWERS, BACK_ROW_FLOOR, MERGE_DE, STATUS_OF };

if (require.main === module) main().catch((e) => { console.error(e.message || e); process.exit(2); });
