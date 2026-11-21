#!/usr/bin/env node
/**
 * preset-gate — the machine half of the deck-preset judging gate: render the preset corpus
 * deck under a recipe in three rows, run the machine gates, and hand the judges a contact
 * sheet per row only when every gate passes.
 *
 * WHY. engineering/decisions/2026-11-20-deck-preset-study.md §8 sets the rule every preset
 * wave follows: a preset is judged on a 30-slide corpus deck (test/fixtures/preset-corpus.md),
 * in its own palette and mode ("own"), the opposite mode ("flip") and indaco light ("house"),
 * as PNG AND as the exported PDF, and the machine gates run before any judge sees it. Six
 * rounds of the study ran those steps by hand; this is the same procedure as one command, so
 * every wave runs it the same way and a judge's score is never spent on a slide a machine
 * could have failed.
 *
 * IT BUILDS NOTHING NEW. Each gate is an existing tool (HARD RULE #15):
 *   overflow   the CLI's own lost-content reports, read from the PNG and the PDF render:
 *              `⚠ OVERFLOW` and `⚠ CONTENT CLIPPED` (the two tools/check-overflow-corpus.js
 *              unions) and `⚠ TYPE FLOOR` (a scaled chart whose labels fall below the floor).
 *   text       tools/check-slide-contrast.js's PROBE (every rendered text run, 4.5:1, its
 *              decorative-exemption ledger), run in-page. It resolves ink and backdrop from
 *              computed style and the layout, so it reads no pixels and the scale does not matter.
 *   marks      every mark the chart manifests DECLARE (tools/lib/chart-render.js
 *              `declaredMarks`) as encoding identity by hue: its FILL held to 3:1 against the
 *              pixels actually behind it, as the study measured it (§2). `markContrast` below
 *              says why it samples instead of reusing tools/chart-contrast-solve.js's modeled
 *              backdrop. Ramp marks (a heatmap cell) carry their value as text, which the text
 *              gate owns.
 *   jank       tools/check-jank.js on the bookends and a card grid, each with a named anchor
 *              (the running footer or header) and the recipe passed as front matter: does the
 *              chrome HOLD STILL, and stay clear of the content, as a heading or a card count grows.
 *   pixel      tools/pixel-check.js `pixelDiff`, with `--against <earlier run>`: did any row's
 *              exported PDF move since then. The calibration anchors (classic, editorial) must
 *              not move between waves unless the wave says so. Without `--against` it is
 *              skipped and says so; this run's directory is the next run's `--against`.
 *
 * FAIL FAST, per preset, in that order: a failing gate stops that preset's later gates
 * (`--keep-going` runs them anyway). The contact sheets are always written, because a failed
 * preset still needs a human to see why. Only a preset whose verdict is `pass` goes to judges;
 * the judge protocol is §8 of the study note ("The judge protocol").
 *
 * USAGE
 *   node tools/preset-gate.js --preset classic,editorial,brand,minimal
 *   node tools/preset-gate.js --recipe .scratch/earnings.yml --preset classic,editorial
 *   node tools/preset-gate.js --preset editorial --against .scratch/preset-gate/<earlier>
 *
 *   --preset a,b      shipped presets to gate (`preset: <name>` is the whole recipe)
 *   --recipe FILE     a candidate's front matter, `key: value` per line; its name is the file's
 *                     basename. Repeatable. This is how a wave gates a preset before it ships.
 *   --rows own,flip,house   which rows (default all three)
 *   --out DIR         where renders, sheets and the summary go
 *                     (default .scratch/preset-gate/<timestamp>, gitignored)
 *   --against DIR     an earlier run's --out, for the pixel gate
 *   --no-jank         skip the jank sweeps (each is ~4 s; listed in the summary as skipped)
 *   --keep-going      run every gate even after one fails
 *   --json            print the summary JSON instead of the table
 *
 * ROWS ON TODAY'S PRESETS. The four shipped presets set no palette or mode, so their own and house
 * rows render the same deck. That is by the spec, and it stops being redundant the moment a wave's
 * presets carry `theme:` (D1); `--rows own,flip` halves the cost for a run on shipped presets only.
 *
 * OUTPUT  <out>/summary.json (machine-readable), <out>/summary.md (the table for a PR body),
 *         <out>/<name>/<row>/{deck.md, deck.pdf, deck.NNN.png}, and the contact sheets
 *         <out>/<name>/sheet-<row>-png.png and sheet-<row>-pdf.png.
 *
 * Exit 0 when every preset passes, 1 when any fails a gate, 2 on a setup error (no build, no
 * browser, a tool that did not run). A setup error inside one preset marks it `error` and the run
 * carries on, so the summary is always written. It is on-demand, like overflow:check and bench:check: a
 * full run is real Chromium for minutes, never a per-PR CI gate.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const CLI = path.join(ROOT, 'dist', 'lattice.js');
const CORPUS = path.join(ROOT, 'test', 'fixtures', 'preset-corpus.md');
const ROWS = ['own', 'flip', 'house'];
const HOUSE = { theme: 'indaco', 'color-mode': 'light' };
const TEXT_FLOOR = 4.5;
const MARK_FLOOR = 3;
// The bookends are where presets differ most (the study's §8 V4), and cards-grid is the dense
// body slide every preset restyles. `axis` as check-jank names it. Each sweep NAMES AN ANCHOR,
// the running chrome a reader expects in the same place on every slide: without one check-jank
// has nothing to measure drift or collision against, exits 0 whatever moves, and the stage could
// only ever fail on a vacuous sweep. The bookends drop the running header (anchor-chrome rule)
// and keep the footer; the divider and the card grid keep the header, which a growing heading
// or a fourth card is likeliest to reach. The chrome's text is the corpus's own.
const JANK = [
  { component: 'title', axis: 'heading', anchor: 'footer' },
  { component: 'divider', axis: 'heading', anchor: 'header' },
  { component: 'closing', axis: 'heading', anchor: 'footer' },
  { component: 'cards-grid', axis: 'count', anchor: 'header' },
];
const JANK_CHROME = ['header: Northwind Freight · FY2026 board review', 'footer: Confidential · prepared for the board'];

function die(msg) { console.error(`preset-gate: ${msg}`); process.exit(2); }

/** A setup failure inside one preset: recorded as that preset's `error`, so the run still writes its summary. */
class GateError extends Error {}
const fault = (msg) => { throw new GateError(msg); };

// ── arguments ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const o = { presets: [], recipes: [], rows: ROWS, out: null, against: null, jank: true, keepGoing: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => { if (i + 1 >= argv.length) die(`${a} needs a value`); return argv[++i]; };
    if (a === '--preset') o.presets.push(...val().split(',').map((s) => s.trim()).filter(Boolean));
    else if (a === '--recipe') o.recipes.push(val());
    else if (a === '--rows') o.rows = val().split(',').map((s) => s.trim());
    else if (a === '--out') o.out = val();
    else if (a === '--against') o.against = val();
    else if (a === '--no-jank') o.jank = false;
    else if (a === '--keep-going') o.keepGoing = true;
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(0); }
    else die(`unknown argument ${a} (--help lists them)`);
  }
  for (const r of o.rows) if (!ROWS.includes(r)) die(`unknown row "${r}" (own, flip, house)`);
  if (!o.presets.length && !o.recipes.length) die('name at least one --preset or --recipe');
  return o;
}

/**
 * Read text with its line endings folded to LF and its BOM stripped (a sanctioned boundary in
 * tools/check-ownership.js). A Windows-saved recipe or corpus would otherwise defeat the `^---`
 * anchor, and the recipe would land in the BODY: every row would render the default look and
 * the gate would judge a preset nobody chose.
 */
function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

/** A recipe file: `key: value` per line; blank lines and `#` comments ignored. */
function readRecipe(file) {
  if (!fs.existsSync(file)) die(`no such recipe ${file}`);
  const values = {};
  for (const raw of readText(file).split('\n')) {
    // A comment is `#` after whitespace AND followed by a space, so a value like `#0a3` survives.
    const line = raw.replace(/\s+#\s.*$/, '').trim();
    if (!line || line.startsWith('#') || line === '---') continue;
    const m = line.match(/^([a-z][a-z0-9-]*)\s*:\s*(.+)$/i);
    if (!m) die(`${file}: cannot read "${raw}" as key: value`);
    values[m[1]] = m[2].trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return { name: path.basename(file).replace(/\.[^.]+$/, ''), values };
}

/** The row's front matter: the recipe, then the row's override (flip the mode; or indaco light). */
function rowValues(recipe, row) {
  const { presetValue } = require(path.join(ROOT, 'lib', 'core', 'front-matter-key.js'));
  const preset = recipe.values.preset;
  // An unset color-mode means "the theme's own scheme" (front-matter-key.js), and every shipped
  // `*-dark` theme is dark by default; a legacy `class: dark` pins dark too. Missing either made
  // the flip row of a dark-default recipe render the same mode as own.
  const theme = recipe.values.theme || (preset && presetValue(preset, 'theme')) || '';
  const ownMode = recipe.values['color-mode'] || (preset && presetValue(preset, 'color-mode'))
    || (/-dark$/.test(theme) || /(^|\s)dark(\s|$)/.test(recipe.values.class || '') ? 'dark' : 'light');
  if (row === 'own') return { ...recipe.values };
  if (row === 'flip') return { ...recipe.values, 'color-mode': ownMode === 'dark' ? 'light' : 'dark' };
  return { ...recipe.values, ...HOUSE };
}

/** The corpus with `values` written into its front matter. The corpus carries no look key, so nothing collides. */
function deckFor(values) {
  const src = readText(CORPUS);
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) die(`${CORPUS} has no front matter`);
  const lines = Object.entries(values).map(([k, v]) => `${k}: ${v}`);
  return `---\n${m[1]}\n${lines.join('\n')}\n---\n${src.slice(m[0].length)}`;
}

// ── gates ────────────────────────────────────────────────────────────────────
function render(deck, out, extra = []) {
  const r = spawnSync(process.execPath, [CLI, deck, out, ...extra], { cwd: ROOT, encoding: 'utf8', timeout: 600000 });
  const log = `${r.stdout || ''}${r.stderr || ''}`;
  if (r.status !== 0) return { ok: false, error: `render ${path.basename(out)} exited ${r.status}: ${log.trim().split('\n').slice(-3).join(' | ')}` };
  // ALL THREE of the CLI's lost-content channels, unioned, as tools/check-overflow-corpus.js does
  // for the first two (#1300): `⚠ OVERFLOW` (geometry past the frame), `⚠ CONTENT CLIPPED` (copy
  // lost inside a box that clips: an ellipsized label, a line-clamped card) and `⚠ TYPE FLOOR` (a
  // scaled figure whose labels fall below the legibility floor, which never overflows at all).
  const pages = lostPages(log);
  const html = (log.match(/HTML:[^\n]*?→\s+(.+?\.html)(?=\s|$)/m) || [])[1] || null;
  return { ok: true, overflow: pages, html: html && path.resolve(ROOT, html), log };
}

/** The pages the CLI's log says lost content, from its three channels (see render). */
function lostPages(log) {
  const grab = (re) => { const m = log.match(re); return m ? m[1].split(',').map((x) => Number(x.trim())).filter(Number.isFinite) : []; };
  const floorLine = (log.match(/TYPE FLOOR —[^\n]*/) || [''])[0];
  return [...new Set([
    ...grab(/OVERFLOW[^\n]*?pages? ([\d,\s]+)/),
    ...grab(/CONTENT CLIPPED[^\n]*?pages? ([\d,\s]+)/),
    ...[...floorLine.matchAll(/page (\d+) at/g)].map((m) => Number(m[1])),
  ])].sort((x, y) => x - y);
}

async function textContrast(browser, html) {
  const { PROBE } = require('./check-slide-contrast.js');
  const page = await browser.newPage();
  try {
    // deviceScaleFactor 2 is the study's "full resolution": the slide at 2560x1440.
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts?.ready);
    const rows = await page.evaluate(PROBE);
    const fails = rows.filter((x) => x.r < x.need && !x.exempt)
      .map((x) => ({ page: x.page, cls: x.cls, text: String(x.text).slice(0, 60), ratio: +x.r.toFixed(2), need: x.need }));
    const worst = rows.filter((x) => !x.exempt).reduce((w, x) => (w === null || x.r < w ? x.r : w), null);
    return { runs: rows.length, fails, worst: worst === null ? null : +worst.toFixed(2) };
  } finally {
    await page.close();
  }
}

/**
 * MARK FILLS, MEASURED FROM PIXELS. Every mark the chart manifests declare as encoding identity by
 * hue (`declaredMarks`, tools/lib/chart-render.js) is held to 3:1 against what is ACTUALLY behind
 * it. Two shots of each chart slide: as rendered, and with every declared mark hidden
 * (`visibility`, so nothing reflows). The second shot is the backdrop, finish, rail, gridline and all. The mark's
 * own color comes from computed style (exact, alpha included; a pixel is antialiased) and is
 * composited over each backdrop pixel, and the mark scores the lower quartile of its points
 * (see the comment at the score for why not the single worst).
 *
 * WHY NOT chart-contrast-solve's marks. That tool SAMPLES text but MODELS a mark's backdrop
 * from computed style and takes the worse end of any gradient, and says so in its header. Under a
 * finish that is wrong: on Editorial's ledger finish it scored solid dark bars on a near-white
 * slide at 2.1:1, because the finish is a gradient with a dark stop. Sampling the backdrop is the
 * fix it names and declines for cost ("hiding one mark and re-shooting per mark"); hiding every
 * mark at once costs one extra shot per slide, since no two marks of a chart overlap.
 *
 * WHY THE FILL, not the fill-or-edge rule the family's own contract uses
 * (engineering/chart-styling.md, "every mark carries an ink edge"). The study measured the fill
 * (§2), and F6 raises `etch`'s fill to meet 3:1; a preset is judged on the fill a board member
 * sees from the back of the room.
 */
async function markContrast(browser, html) {
  const { declaredMarks } = require('./lib/chart-render.js');
  const { PNG } = require('pngjs');
  const marks = {};
  const hide = new Set();
  for (const [member, list] of Object.entries(declaredMarks())) {
    const hue = list.filter((m) => m.encodes === 'hue' || m.encodes === 'layered').map((m) => m.class);
    if (hue.length) marks[member] = hue;
    // EVERY declared mark leaves the backdrop shot, not just the measured ones: a line's dots sit
    // on its own path, and with only the dots hidden the "backdrop" under each one was the line,
    // in the same ink, which scored every line chart at 1.0:1.
    for (const m of list) hide.add(`.${m.class}`);
  }
  const hideSel = [...hide].join(', ');
  const page = await browser.newPage();
  const fails = [];
  let measured = 0;
  try {
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 2 });
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts?.ready);
    const count = await page.evaluate(() => document.querySelectorAll('section').length);
    for (let i = 0; i < count; i++) {
      const found = await page.evaluate(MARK_PROBE, i, marks);
      if (!found) continue;
      const shot = async () => PNG.sync.read(Buffer.from(await page.screenshot({ clip: found.box })));
      await page.evaluate((idx, sel) => {
        for (const el of document.querySelectorAll('section')[idx].querySelectorAll(sel)) el.style.setProperty('visibility', 'hidden', 'important');
      }, i, `${hideSel}, svg text`);
      const under = await shot();
      await page.evaluate((idx, sel) => {
        for (const el of document.querySelectorAll('section')[idx].querySelectorAll(sel)) el.style.removeProperty('visibility');
      }, i, `${hideSel}, svg text`);
      // EVERY CHART SLIDE MEASURES, not just the deck: a kind that renders as a fallback tile, or
      // whose marks yield no in-fill point, would otherwise drop out while another chart measured.
      let onSlide = 0;
      for (const m of found.marks) {
        // A paint this probe cannot read is a FAILURE, never a skip: passing it would certify a
        // mark nobody measured.
        if (m.unreadable) { fails.push({ page: i + 1, member: found.member, cls: m.cls, fill: null, unreadable: m.unreadable }); continue; }
        const ratios = [];
        for (const [x, y] of m.points) {
          const px = Math.min(under.width - 1, Math.round(x * 2));
          const py = Math.min(under.height - 1, Math.round(y * 2));
          const k = (py * under.width + px) * 4;
          const back = [under.data[k], under.data[k + 1], under.data[k + 2]];
          const shown = m.color.slice(0, 3).map((c, j) => c * m.alpha + back[j] * (1 - m.alpha));
          const r = contrastRatio(shown, back);
          if (process.env.PRESET_GATE_TRACE && r < MARK_FLOOR) console.error('trace', i + 1, m.cls, [x, y], m.color, m.alpha, back, r.toFixed(2));
          ratios.push(r);
        }
        if (!ratios.length) continue;
        // THE LOWER QUARTILE, not the single worst point. The backdrop shot shows what the marks
        // COVER as well as what surrounds them: a gridline running behind a bar scored a bar that
        // clearly stands off a dark slide at 1.74:1, because one row of the 5x5 grid landed on the
        // hairline. A hairline is at most one row (a fifth of the points); a gradient's darker
        // half, or a mark sitting on a second surface, is more, and still sets the score. The
        // chart's own text (an in-bar value) is hidden in the backdrop shot with the marks, so a
        // label is never read as the surface a mark sits on.
        ratios.sort((p, q) => p - q);
        const worst = ratios[Math.floor((ratios.length - 1) / 4)];
        measured++;
        onSlide++;
        if (worst < MARK_FLOOR) fails.push({ page: i + 1, member: found.member, cls: m.cls, fill: +worst.toFixed(2) });
      }
      if (!onSlide) fails.push({ page: i + 1, member: found.member, cls: '(none)', fill: null, unmeasured: 'a chart slide where no mark could be measured' });
    }
  } finally {
    await page.close();
  }
  // One row per member and class, the weakest kept: a bar chart of five bars is one finding.
  const byKey = new Map();
  for (const f of fails) {
    const k = `${f.member}/${f.cls}`;
    if (!byKey.has(k) || (f.fill ?? -1) < (byKey.get(k).fill ?? -1)) byKey.set(k, f);
  }
  return { measured, fails: [...byKey.values()] };
}

/** WCAG relative-luminance contrast of two sRGB triples (0..255). */
function contrastRatio(a, b) {
  const lum = (c) => {
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * In-page: the hue marks on section `idx`, each with its computed color, its effective alpha and
 * up to 25 points (section-relative CSS px) that lie inside the mark's own shape, so a donut's
 * hole or a wedge's empty bounding-box corner is never sampled as the mark.
 */
function MARK_PROBE(idx, marks) {
  const sec = document.querySelectorAll('section')[idx];
  // A chart is the slide's own class, or a pane of a `columns` / `rows` host; the mark classes
  // are the family's, so the union finds both, and the member is named by the pane when there is one.
  const all = [...new Set(Object.values(marks).flat())];
  const selector = all.map((c) => `.${c}`).join(', ');
  const chartClass = Object.keys(marks).some((m) => sec.classList.contains(m));
  if (!chartClass && !sec.querySelector(selector)) return null;
  const member = Object.keys(marks).find((m) => sec.classList.contains(m))
    || Object.keys(marks).find((m) => sec.querySelector(`.${m}`)) || [...sec.classList][0];
  sec.scrollIntoView();
  const box = sec.getBoundingClientRect();
  // ANY CSS color, through the browser itself: Chromium serializes a computed fill as rgb(),
  // color(srgb …) or oklab(…) depending on how the token was written, and a hand parser for each
  // is a parser that falls behind. A 1x1 canvas resolves whatever the engine resolves and reads
  // back sRGB. A paint the canvas rejects (a `url(#gradient)`) is unreadable.
  const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
  const parse = (v) => {
    if (!v || v === 'none' || /^url\(/.test(v)) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = v;
    const probe = ctx.fillStyle;
    ctx.fillStyle = '#fff';
    ctx.fillStyle = v;
    if (ctx.fillStyle !== probe) return null; // rejected: the assignment kept the previous value
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const out = [];
  for (const el of sec.querySelectorAll(selector)) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const svg = el instanceof SVGElement;
    const paint = svg ? cs.fill : cs.backgroundColor;
    const color = parse(paint);
    if (paint === 'none' || (color && color[3] === 0)) continue;
    const r0 = el.getBoundingClientRect();
    if (!color) { if (r0.width >= 1 && r0.height >= 1) out.push({ cls: [...el.classList].find((c) => all.includes(c)), unreadable: paint }); continue; }
    let alpha = color[3] * (svg ? Number(cs.fillOpacity || 1) : 1);
    for (let n = el; n && n !== sec.parentElement; n = n.parentElement) alpha *= Number(getComputedStyle(n).opacity || 1);
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const points = [];
    for (let gx = 1; gx <= 5; gx++) {
      for (let gy = 1; gy <= 5; gy++) {
        const x = r.left + (r.width * gx) / 6;
        const y = r.top + (r.height * gy) / 6;
        // GEOMETRY, not hit-testing: chart marks are `pointer-events: none`, so elementFromPoint
        // never returns them. An SVG shape is asked in its own user space (isPointInFill through
        // the inverse screen matrix); an HTML swatch is its box.
        let inside = true;
        if (typeof el.isPointInFill === 'function' && el.getScreenCTM()) {
          const pt = new DOMPoint(x, y).matrixTransform(el.getScreenCTM().inverse());
          inside = el.isPointInFill(pt);
        }
        if (inside) points.push([x - box.left, y - box.top]);
      }
    }
    if (points.length) out.push({ cls: [...el.classList].find((c) => all.includes(c)), color, alpha, points });
  }
  // Puppeteer's screenshot clip is in DOCUMENT coordinates; the rect is in the viewport's.
  return { member, selector, marks: out, box: { x: box.left + window.scrollX, y: box.top + window.scrollY, width: box.width, height: box.height } };
}

function jank(ownValues) {
  const fm = Object.entries(ownValues).filter(([k]) => k !== 'theme').flatMap(([k, v]) => ['--front-matter', `${k}: ${v}`]);
  // check-jank writes `theme: indaco` unless told otherwise, which would override a preset's own palette.
  const { presetValue } = require(path.join(ROOT, 'lib', 'core', 'front-matter-key.js'));
  const ownTheme = ownValues.theme || (ownValues.preset && presetValue(ownValues.preset, 'theme'));
  const theme = ownTheme ? ['--theme', ownTheme] : [];
  const chrome = JANK_CHROME.flatMap((kv) => ['--front-matter', kv]);
  return JANK.map(({ component, axis, anchor }) => {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'check-jank.js'), component, '--axis', axis,
      '--anchor', anchor, ...theme, ...chrome, ...fm, '--json'], {
      cwd: ROOT, encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status === 2) return { component, axis, anchor, ok: false, error: (r.stderr || r.stdout).trim().split('\n')[0] };
    let s;
    try { s = JSON.parse(r.stdout).summary; } catch { return { component, axis, anchor, ok: false, error: 'check-jank emitted no JSON' }; }
    // A vacuous sweep measured nothing, which is not a pass: it is the false clean check-jank warns about.
    const ok = r.status === 0 && !s.vacuous;
    return {
      component, axis, anchor, ok,
      collision: s.collision ? s.collision.clearance ?? true : null,
      drift: s.drift ?? null,
      crowded: s.crowded ? `${s.crowded.breathing}px at step ${s.crowded.step} (advisory)` : null,
      vacuous: s.vacuous,
    };
  });
}

function pixel(prevPdf, curPdf, label) {
  const { pixelDiff } = require('./pixel-check.js');
  const d = pixelDiff(prevPdf, curPdf, label.replace(/[^a-z0-9-]/gi, '_'));
  const moved = d.perPage.filter((p) => p.pixels !== 0).map((p) => ({ page: p.page, pixels: p.pixels, note: p.note }));
  fs.rmSync(d.tmpDir, { recursive: true, force: true });
  return { pages: d.pages, moved };
}

// ── contact sheets ───────────────────────────────────────────────────────────
function sheet(pngs, outPng, title) {
  if (!pngs.length) return null;
  const r = spawnSync('montage', [...pngs, '-tile', '6x', '-geometry', '640x360+6+6', '-background', '#777',
    '-title', title, '-pointsize', '28', outPng], { encoding: 'utf8' });
  return r.status === 0 ? outPng : null;
}

function rasterizePdf(pdf, prefix) {
  // 2560 px wide, the PNG export's own size, so the two sheets compare slide for slide.
  spawnSync('pdftoppm', ['-png', '-scale-to-x', '2560', '-scale-to-y', '-1', pdf, prefix], { stdio: 'ignore' });
  const dir = path.dirname(prefix);
  const base = path.basename(prefix);
  const n = (f) => Number((f.match(/-(\d+)\.png$/) || [])[1]);
  return fs.readdirSync(dir).filter((f) => f.startsWith(`${base}-`) && f.endsWith('.png')).sort((a, b) => n(a) - n(b)).map((f) => path.join(dir, f));
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(CLI)) die('dist/lattice.js is missing; run `npm run build` (this repo\'s own build, never a published copy)');
  const chrome = process.env.CHROME_PATH || require('./lib/resolve-chrome.js').resolveChrome();
  if (!chrome) die('no Chromium; export CHROME_PATH (engineering/development.md)');
  for (const bin of ['pdftoppm', 'montage']) if (spawnSync('which', [bin]).status !== 0) die(`${bin} is not installed; install it (poppler-utils / imagemagick)`);
  const { isKnownPreset } = require(path.join(ROOT, 'lib', 'core', 'front-matter-key.js'));
  const recipes = [
    ...o.presets.map((p) => { if (!isKnownPreset(p)) die(`unknown preset "${p}"`); return { name: p, values: { preset: p } }; }),
    ...o.recipes.map(readRecipe),
  ];
  const out = path.resolve(o.out || path.join(ROOT, '.scratch', 'preset-gate', new Date().toISOString().replace(/[:.]/g, '-')));
  fs.mkdirSync(out, { recursive: true });
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox', '--font-render-hinting=none'] });
  const summary = { corpus: path.relative(ROOT, CORPUS), out: path.relative(ROOT, out), rows: o.rows, floors: { text: TEXT_FLOOR, marks: MARK_FLOOR }, presets: [] };
  try {
    for (const recipe of recipes) {
      const res = { name: recipe.name, recipe: recipe.values, verdict: 'pass', failedAt: null, rows: {}, jank: null, sheets: {} };
      summary.presets.push(res);
      const fail = (gate) => { if (res.verdict === 'pass') { res.verdict = 'fail'; res.failedAt = gate; } };
      const go = () => res.verdict === 'pass' || o.keepGoing;
      const log = (msg) => { if (!o.json) process.stderr.write(`  ${recipe.name.padEnd(12)} ${msg}\n`); };
      try {
        // 1. render every row (PNG keeps its HTML for the contrast gates; the PDF is the export) — overflow
        for (const row of o.rows) {
          const dir = path.join(out, recipe.name, row);
          fs.rmSync(dir, { recursive: true, force: true });
          fs.mkdirSync(dir, { recursive: true });
          const values = rowValues(recipe, row);
          const deck = path.join(dir, 'deck.md');
          fs.writeFileSync(deck, deckFor(values));
          log(`${row}: rendering PNG + PDF`);
          const png = render(deck, path.join(dir, 'deck.png'), ['--keep-html']);
          const pdf = render(deck, path.join(dir, 'deck.pdf'));
          if (!png.ok || !pdf.ok) fault(`${recipe.name}/${row}: ${(png.ok ? pdf : png).error}`);
          const r = { values, overflow: { png: png.overflow, pdf: pdf.overflow }, html: png.html };
          res.rows[row] = r;
          if (png.overflow.length || pdf.overflow.length) fail('overflow');
          // contact sheets, always
          const pngs = fs.readdirSync(dir).filter((f) => /^deck\.\d+\.png$/.test(f)).sort().map((f) => path.join(dir, f));
          const pdfPngs = rasterizePdf(path.join(dir, 'deck.pdf'), path.join(dir, 'pdfpage'));
          res.sheets[row] = {
            png: sheet(pngs, path.join(out, recipe.name, `sheet-${row}-png.png`), `${recipe.name} · ${row} · PNG export`),
            pdf: sheet(pdfPngs, path.join(out, recipe.name, `sheet-${row}-pdf.png`), `${recipe.name} · ${row} · PDF export (rasterized)`),
          };
          for (const f of pdfPngs) fs.rmSync(f);
          for (const k of ['png', 'pdf']) if (res.sheets[row][k]) res.sheets[row][k] = path.relative(ROOT, res.sheets[row][k]);
        }
        // 2. contrast: text and chart marks, every row
        for (const row of o.rows) {
          if (!go()) break;
          const r = res.rows[row];
          if (!r.html || !fs.existsSync(r.html)) fault(`${recipe.name}/${row}: the render kept no HTML for the contrast gates`);
          log(`${row}: contrast`);
          r.text = await textContrast(browser, r.html);
          r.marks = await markContrast(browser, r.html);
          if (!r.marks.measured) fault(`${recipe.name}/${row}: the mark gate measured no chart mark, so it would pass vacuously`);
          if (r.text.fails.length) fail('text-contrast');
          if (r.marks.fails.length) fail('mark-contrast');
        }
        // 3. jank, once per preset in its own palette and mode (geometry does not change with the mode)
        if (o.jank && go() && o.rows.includes('own')) {
          log('jank');
          res.jank = jank(res.rows.own.values);
          const broken = res.jank.find((j) => j.error);
          if (broken) fault(`${recipe.name}: check-jank ${broken.component} could not run: ${broken.error}`);
          if (res.jank.some((j) => !j.ok)) fail('jank');
        } else if (!o.jank) res.jank = 'skipped (--no-jank)';
        // 4. pixel, against an earlier run
        for (const row of o.rows) {
          if (!go()) break;
          const r = res.rows[row];
          if (!o.against) { r.pixel = 'skipped (no --against)'; continue; }
          const prev = path.resolve(o.against, recipe.name, row, 'deck.pdf');
          if (!fs.existsSync(prev)) { r.pixel = `skipped (${path.relative(ROOT, prev)} is missing)`; continue; }
          log(`${row}: pixel diff`);
          r.pixel = pixel(prev, path.join(out, recipe.name, row, 'deck.pdf'), `${recipe.name}-${row}`);
          if (r.pixel.moved.length) fail('pixel');
        }
      } catch (e) {
        if (!(e instanceof GateError)) throw e;
        // A gate that could not run is not a verdict: `error`, exit 2, and the other presets still run.
        res.verdict = 'error';
        res.error = e.message;
        log(`ERROR ${e.message}`);
      }
      for (const row of Object.keys(res.rows)) {
        const r = res.rows[row];
        if (r.html) { fs.rmSync(r.html, { force: true }); delete r.html; }
      }
      log(`verdict ${res.verdict}${res.failedAt ? ` (first failure: ${res.failedAt})` : ''}`);
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(out, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  const md = table(summary);
  fs.writeFileSync(path.join(out, 'summary.md'), md);
  if (o.json) console.log(JSON.stringify(summary, null, 2));
  else console.log(`\n${md}\nsummary: ${path.relative(ROOT, path.join(out, 'summary.json'))}`);
  if (summary.presets.some((p) => p.verdict === 'error')) process.exit(2);
  process.exit(summary.presets.every((p) => p.verdict === 'pass') ? 0 : 1);
}

/** The PR-body table: one line per preset and row. */
function table(s) {
  const lines = [
    `| Preset | Row | Overflow (PNG / PDF) | Text runs below ${s.floors.text}:1 (worst) | Mark fills below ${s.floors.marks}:1 | Jank | Pixel | Verdict |`,
    '|---|---|---|---|---|---|---|---|',
  ];
  for (const p of s.presets) {
    const jank = typeof p.jank === 'string' ? p.jank
      : p.jank ? p.jank.map((j) => `${j.component} ${j.ok ? 'ok' : 'FAIL'}`).join(', ') : 'not run';
    s.rows.forEach((row, i) => {
      const r = p.rows[row];
      const ov = (a) => (a.length ? `p${a.join(', p')}` : '0');
      const text = r.text ? `${r.text.fails.length} (${r.text.worst}:1)` : 'not run';
      const marks = r.marks ? String(r.marks.fails.length) : 'not run';
      const pixel = typeof r.pixel === 'string' ? r.pixel.split(' (')[0] : r.pixel ? `${r.pixel.moved.length} pages moved` : 'not run';
      if (!r) { if (i === 0) lines.push(`| ${p.name} | ${row} | error: ${p.error} |  |  |  |  | **error** |`); return; }
      const verdict = i === 0 ? `**${p.verdict}**${p.failedAt ? ` (${p.failedAt})` : ''}` : '';
      lines.push(`| ${i === 0 ? p.name : ''} | ${row} | ${ov(r.overflow.png)} / ${ov(r.overflow.pdf)} | ${text} | ${marks} | ${i === 0 ? jank : ''} | ${pixel} | ${verdict} |`);
    });
  }
  return `${lines.join('\n')}\n`;
}

if (require.main === module) main().catch((e) => die(e.stack || e.message));

module.exports = { rowValues, deckFor, readRecipe, table, markContrast, contrastRatio, lostPages };
