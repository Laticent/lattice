#!/usr/bin/env node
/**
 * measure-pane-fit — which SHARES a component reads at in a pane, side by side and stacked,
 * measured through the real export instead of judged. It sets each manifest's `pane.side` and
 * `pane.stack` (the least share a pane of it holds), which decide whether a panes slide renders
 * as written, re-oriented, or split into slides (lib/core/pane-spec.js `arrangePanes`).
 *
 * THE EXPERIMENT. One deck per component, rendered by lattice-emulator.js at 16:9 (panes are a
 * 16:9 composition: every other size splits them). Each slide puts the component in the FIRST
 * pane at one share — side by side at 25, 35, 50 and 65%, stacked at 30, 40, 50 and 60% — with
 * one short line of `content` in the second. The pane holds REALISTIC content: the component's
 * own gallery example, cut to the count a pane is budgeted to hold in that direction
 * (`pane.budget.side.sweet` or `.stack.sweet`,
 * at least `max(2, budget.min || capacity.min)`) top-level items or table rows. Only a component
 * with no gallery example falls back to the calibration builders (tools/lib/calibrate-core.js)
 * at half its `density.soft`: their short uniform elements pass what real content clips. A share
 * PASSES when the export neither clips the page (its OVERFLOW and CONTENT CLIPPED probes) nor
 * sets a figure's text below the type floor (TYPE FLOOR), AND a pass over the rendered page finds
 * no text running past the pane's edge and no two text runs overprinting — the jank a squeezed
 * row makes without clipping, which a first review deck showed the probes miss. A component's `side` is the least tested share
 * that passes AND every larger one does; `false` when 65% does not.
 *
 * WHAT IT DOES NOT DECIDE. A component that cannot be measured (no builder and no gallery
 * example) is reported, never guessed. The numbers are proposals for the manifests; a human
 * reviews them (the owner's call, engineering/decisions/2026-09-25-panes-two-components-one-slide.md).
 *
 * Usage:
 *   node tools/measure-pane-fit.js <component>… | --all  [--json <file>] [--review-deck <file>]
 *
 * `--review-deck` writes a deck holding each component at its measured least share, side by
 * side and stacked, with the same content — the page a human looks at before the numbers go
 * into the manifests, because a pane can pass the probes and still read badly.
 */
const fs = require('node:fs');
const path = require('node:path');
const components = require('../lib/components');
const { BUILDERS, BODY_WRAP, renderProbe } = require('./lib/calibrate-core.js');

// Jank the export's probes do not see, measured on the rendered page: rows squeezed until their
// text OVERPRINTS (a stacked checklist at 40%), and content running past the pane's edge
// sideways. Each pane's text-bearing leaf elements are compared pairwise; runs are per slide.
function paneJank() {
  const out = [];
  for (const sec of document.querySelectorAll('section[data-lattice-slide]')) {
    const pane = sec.querySelector('lat-pane');
    if (!pane) { out.push(null); continue; }
    const pr = pane.getBoundingClientRect();
    // HTML text only. A figure's own labels (inside an <svg>) and typeset math overlap by design
    // and have their own checks (the chart kernels' collision rules, the TYPE FLOOR probe); an
    // absolutely placed mark (a pricing card's badge) sits over its card on purpose.
    const leaves = [...pane.querySelectorAll('*')]
      .filter((el) => !el.closest('svg, .katex, math, mjx-container'))
      .filter((el) => {
        // Anything inside an absolutely placed box is decoration or visually hidden (a chart's
        // screen-reader data table sits off the canvas on purpose): not the pane's layout.
        for (let at = el; at && at !== pane; at = at.parentElement) {
          const cs = getComputedStyle(at);
          if (['absolute', 'fixed'].includes(cs.position) || cs.visibility === 'hidden') return false;
        }
        return true;
      })
      .filter((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .map((el) => el.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    let past = 0;
    for (const r of leaves) if (r.right - pr.right > 2 || pr.left - r.left > 2) past++;
    let overlap = 0;
    for (let i = 0; i < leaves.length; i++) {
      for (let j = i + 1; j < leaves.length; j++) {
        const a = leaves[i];
        const b = leaves[j];
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const inside = (x, y) => x.left >= y.left - 1 && x.right <= y.right + 1 && x.top >= y.top - 1 && x.bottom <= y.bottom + 1;
        if (w > 2 && h > 2 && !inside(a, b) && !inside(b, a)) overlap++;
      }
    }
    out.push({ past, overlap });
  }
  return out;
}

const argv = process.argv.slice(2);
const flagValue = (flag) => (argv.indexOf(flag) >= 0 ? argv[argv.indexOf(flag) + 1] : null);
const JSON_OUT = flagValue('--json');
const REVIEW_OUT = flagValue('--review-deck');
const flagValues = new Set(['--json', '--review-deck'].map((f) => argv.indexOf(f) + 1).filter((i) => i > 0));
const names = argv.filter((a, i) => !a.startsWith('--') && !flagValues.has(i));
const MANIFESTS = components.loadAll();
const byName = Object.fromEntries(MANIFESTS.map((m) => [m.name, m]));
const targets = argv.includes('--all')
  // Every component with a pane field, whole-slide frames (a title, a divider) included: their
  // manifests DECLARE they fit no pane, and a frame that measures as fitting is a reviewer's
  // question, not a change this tool makes.
  ? MANIFESTS.filter((m) => m.pane).map((m) => m.name).sort()
  : names;
if (!targets.length) {
  console.error('usage: node tools/measure-pane-fit.js <component>… | --all [--json <file>]');
  process.exit(2);
}

const SIDE = [25, 35, 50, 65];
const STACK = [30, 40, 50, 60];

/** The least content a pane of this component holds: its budget minimum, or its slide minimum. */
function minimumCount(m) {
  return Math.max(2, m.pane?.budget?.min || m.capacity?.min || 2);
}

/** The component's gallery example body, with its heading and spot directives removed. */
function galleryBody(name) {
  const candidates = [];
  const root = path.join(__dirname, '..', 'lib', 'components');
  for (const bucket of fs.readdirSync(root)) {
    const f = path.join(root, bucket, name, `${name}.gallery.md`);
    if (fs.existsSync(f)) candidates.push(f);
  }
  if (!candidates.length) return null;
  // Slides split on a `---` line OUTSIDE fenced code: a Mermaid source carries its own `---`
  // front matter, and a plain split cut the diagram example in half.
  const slides = [];
  let cur = [];
  let fence = false;
  for (const line of fs.readFileSync(candidates[0], 'utf8').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (!fence && line.trim() === '---') { slides.push(cur.join('\n')); cur = []; continue; }
    cur.push(line);
  }
  slides.push(cur.join('\n'));
  const slide = slides.find((s) => new RegExp(`_class:\\s*${name}(\\s|-->)`).test(s));
  if (!slide) return null;
  return slide.split('\n').filter((l) => !/^<!--\s*_/.test(l.trim())).join('\n').replace(/^#{1,2} .*$/m, '').trim();
}

/** Cut a markdown body to its first `n` top-level list items, or `n` table rows. */
function trim(body, n) {
  const lines = body.split('\n');
  const out = [];
  let items = 0;
  let rows = 0;
  let fence = false;
  for (const line of lines) {
    // A fenced block (code, a Mermaid source) is one element, kept whole: a line inside it that
    // looks like a list item is not one, and cutting before its close would swallow every slide
    // after it (the first review deck lost 75 of its 107 slides that way).
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    if (fence || /^\s*(```|~~~)/.test(line)) { out.push(line); continue; }
    if (/^([-*+]|\d{1,9}[.)])\s/.test(line)) {
      items++;
      if (items > n) break;
    }
    if (/^\|/.test(line) && !/^\|\s*:?-{2,}/.test(line)) {
      rows++;
      if (rows > n + 1) continue; // the header row plus n body rows
    }
    out.push(line);
  }
  return out.join('\n').trim();
}

/** Half the words of a run of prose, keeping each inline code span (a pill, a value) whole. */
function halveWords(text) {
  const tokens = text.match(/`[^`]*`|\S+/g) || [];
  if (tokens.length <= 2) return text;
  return tokens.slice(0, Math.ceil(tokens.length / 2)).join(' ');
}

/** The gallery example at PANE density: every list item, table cell and paragraph keeps half its
 *  words (a pane's content is written tighter, lib/base/base.docs.md § Panes). Fenced code, and
 *  comments, stay as written: a code line is not prose, and its length is what a pane must hold. */
function atPaneDensity(body) {
  let fence = false;
  return body.split('\n').map((line) => {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return line; }
    if (fence || /^\s*<!--/.test(line) || !line.trim()) return line;
    if (/^\s*\|/.test(line)) {
      if (/^\s*\|\s*:?-{2,}/.test(line)) return line;
      return line.split('|').map((cell) => (cell.trim() ? ` ${halveWords(cell.trim())} ` : cell)).join('|');
    }
    const lead = line.match(/^(\s*(?:[-*+]|\d{1,9}[.)]|>)?\s*)/)[1];
    return lead + halveWords(line.slice(lead.length));
  }).join('\n');
}

function paneBody(m, dir = 'side') {
  // REALISTIC content first: the component's own gallery example (its real word lengths, its
  // real code lines), cut to the count a pane is budgeted to hold. Synthetic builder elements are
  // short and uniform, and a first run showed they pass what real content clips (a code pane's
  // long lines, a kpi row's second tile); they stay as the fallback for a component with no
  // gallery example.
  const n = Math.max(minimumCount(m), m.pane?.budget?.[dir]?.sweet || 0);
  const g = galleryBody(m.name);
  // Only PROSE is written tighter in a pane. A chart's rows are data, a formula is not words, and
  // halving them measured broken charts and raw TeX (the second review deck's pie, progress,
  // scatter and math panes): those stay as the gallery wrote them.
  const prose = !(m.bucket === 'chart' || ['math', 'code', 'diagram'].includes(m.name));
  if (g) return { body: prose ? atPaneDensity(trim(g, n)) : trim(g, n), source: `gallery, first ${n}${prose ? ', half words' : ''}` };
  const build = BUILDERS[m.name];
  if (!build) return null;
  const words = Math.ceil(parseInt(m.density?.soft || 12, 10) / 2);
  const body = Array.from({ length: n }, () => build(words)).join('\n');
  return { body: (BODY_WRAP[m.name] || ((x) => x))(body), source: `builder × ${n}` };
}

const cases = [...SIDE.map((s) => ({ dir: 'side', share: s })), ...STACK.map((s) => ({ dir: 'stack', share: s }))];
const results = {};
const review = [];
(async () => {
const puppeteer = require('puppeteer');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, args: ['--no-sandbox'] });
for (const name of targets) {
  const m = byName[name];
  if (!m) { console.error(`no manifest for '${name}'`); process.exit(2); }
  const made = paneBody(m);
  const stacked = paneBody(m, 'stack');
  if (!made) {
    results[name] = { unmeasured: 'no builder and no gallery example' };
    console.log(`${name.padEnd(24)} UNMEASURED — no builder and no gallery example`);
    continue;
  }
  const slides = cases.map(({ dir, share }) => `## ${name} · ${dir} ${share}%\n\n<!-- panes: ${dir === 'stack' ? 'stack ' : ''}${share}/${100 - share} -->\n\n<!-- pane: ${name} -->\n\n${(dir === 'stack' ? stacked : made).body}\n\n<!-- pane: content -->\n\nOne short line.\n`);
  // Page numbers and a footer, as nearly every real deck carries: the footer band takes stage
  // height, and a first review deck with them clipped what a bare deck had passed.
  const deck = `---\nsize: hd\npaginate: true\nfooter: "Footer"\n---\n\n${slides.join('\n---\n\n')}`;
  const probe = renderProbe(deck, `pane-fit-${name}`, { format: 'html', keep: true });
  // The pages a probe's warning line names ("TYPE FLOOR — … page 3 at …", "CONTENT CLIPPED — …
  // pages 2, 5.").
  const pagesOn = (label) => {
    const line = probe.log.split('\n').find((l) => l.includes(`${label} —`)) || '';
    const list = line.match(/pages?\s+([\d,\s]+)/g) || [];
    return new Set(list.flatMap((g) => g.replace(/pages?\s+/, '').split(',').map((x) => Number(x.trim())).filter(Boolean)));
  };
  const underFloor = new Set([...((probe.log.split('\n').find((l) => l.includes('TYPE FLOOR —')) || '').matchAll(/page (\d+)/g))].map((x) => Number(x[1])));
  const contentClipped = pagesOn('CONTENT CLIPPED');
  let jank = [];
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    await page.emulateMediaType('print');
    await page.goto(`file://${probe.out}`, { waitUntil: 'load' });
    jank = await page.evaluate(paneJank);
    await page.close();
  } finally {
    probe.cleanup();
  }
  const pass = cases.map((c, i) => {
    const j = jank[i] || { past: 0, overlap: 0 };
    const clipped = probe.overflowed.has(i + 1) || contentClipped.has(i + 1) || j.past > 0;
    const overlap = j.overlap > 0;
    const floor = underFloor.has(i + 1);
    return { ...c, ok: !clipped && !overlap && !floor, clipped, overlap, floor };
  });
  const least = (dir) => {
    const row = pass.filter((p) => p.dir === dir);
    let min = false;
    for (let k = row.length - 1; k >= 0 && row[k].ok; k--) min = row[k].share;
    return min;
  };
  results[name] = { source: made.source, side: least('side'), stack: least('stack'), cases: pass };
  for (const dir of ['side', 'stack']) {
    const at = results[name][dir];
    if (at !== false) review.push(slides[cases.findIndex((c) => c.dir === dir && c.share === at)]);
  }
  const cell = (p) => `${p.share}${p.ok ? '+' : p.clipped ? 'x' : p.overlap ? 'o' : 'f'}`; // + fits, x clips, o overprints, f under the type floor
  console.log(`${name.padEnd(24)} side ${String(results[name].side).padEnd(5)} stack ${String(results[name].stack).padEnd(5)} │ ${pass.filter((p) => p.dir === 'side').map(cell).join(' ')} │ ${pass.filter((p) => p.dir === 'stack').map(cell).join(' ')} │ side ${made.source}; stack ${stacked.source}`);
}
await browser.close();
if (REVIEW_OUT) fs.writeFileSync(REVIEW_OUT, `---\nsize: hd\npaginate: true\nfooter: "Footer"\n---\n\n${review.join('\n---\n\n')}`);
if (JSON_OUT) fs.writeFileSync(JSON_OUT, `${JSON.stringify(results, null, 2)}\n`);
})();
