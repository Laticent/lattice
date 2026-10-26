#!/usr/bin/env node
/**
 * check-edge-shift — does choosing a different spectrum-bar placement MOVE anything on the slide?
 *
 * The spectrum bar is a real `border` on the `section` (`spectrum-edge: top|left|right|bottom`),
 * and a border takes layout room, so the content box, and every absolutely positioned element
 * that measures from the padding box (header, footer, page number, the draft/confidential stamp),
 * lands somewhere slightly different for each placement. The same deck, one front-matter key
 * apart, wobbles by the bar's width. This tool measures that.
 *
 * `check:jank` asks whether a layout stays put as CONTENT grows. This asks the sibling question:
 * does it stay put as the BAR moves. Same instrument (render through the CLI, measure real
 * geometry in Chromium), different axis.
 *
 * METHOD. Build ONE deck: every component's own manifest skeleton (light and dark), plus a fixed
 * set of ordinary slides carrying each state stamp. Render it once per placement with the running
 * chrome on (`header:`, `footer:`, `paginate:`). For every element of every slide, record its
 * distance from each of the four slide edges. The same element in the same slide must sit at the
 * same distances under every placement; the spread is the shift.
 *
 *   --placements a,b   which `spectrum-edge:` values to compare (default top,left,right,bottom,off)
 *   --components a,b   only these components (default: every manifest with a skeleton/sample)
 *   --limit N          the first N components only (a quick pass)
 *   --no-dark          skip the dark twin of each slide
 *   --variants         also render each component once per modifier its manifest declares
 *                      (`topic fact`, `collage bleed`, ...), light only
 *   --each-class a,b|all  one plain `content` slide per class instead of the components (`all` is every
 *                      class the engine reserves), to find the modifier that moves the box
 *   --classes 'a b'    add these classes to every slide (`footer-inset`, `claim-bleed`, `safe`, ...)
 *   --front-matter 'k: v'  add a deck directive (`spectrum: off`, `finish: atrium`); repeatable
 *   --no-chrome        render without header / footer / page number
 *   --family NAME      canvas family (wide|square|tall|strip, default wide)
 *   --tolerance PX     movement below this is rounding (default 0.5)
 *   --detail           list every moved element, not just the worst per slide
 *   --bars             also list the components that draw NO bar under a placement (a border OR the
 *                      `.slide-bar` overlay counts), so a bar lost silently cannot read as stable
 *   --positions FILE   write every element's measured position to FILE (JSON), to diff two builds
 *   --dump DIR         also save each placement's rendered HTML as DIR/edge-<placement>.html
 *   --json             machine-readable result
 *   --advisory         always exit 0 once it has measured (the default exits 1 on any shift)
 *
 * NOT MEASURED: the `finish:` backdrop (`.backdrop`). It fills the area the bar leaves, because a layer
 * that reached under the bar would paint over it, so its edge differs by the bar's strip by design.
 *
 * EXIT. 0 = nothing moved. 1 = something moved. 2 = it could not measure (no Chromium, a
 * placement that did not take effect, a render that dropped slides): never a silent pass
 * (HARD RULE #23). The placement check is the arm that proves the tool can fail: under `top`
 * the section must carry a top border and under `off` none, or the sweep is comparing a deck
 * with itself.
 *
 * Context: engineering/decisions/2026-10-26-spectrum-edge-shift.md.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  ROOT, SIZE_ALIAS, FAMILIES, findManifest, renderProbe,
} = require('./lib/calibrate-core.js');
const { resolveChrome } = require('./lib/resolve-chrome.js');

const USAGE = 'usage: node tools/check-edge-shift.js [--placements top,left,right,bottom,off] '
  + '[--components a,b] [--limit N] [--no-dark] [--variants] [--each-class a,b|all] [--classes "a b"] [--front-matter "k: v"] [--no-chrome] [--family wide] [--tolerance 0.5] '
  + '[--theme indaco] [--detail] [--json] [--advisory] [--dump DIR] [--bars] [--positions FILE]';

function die(msg, code = 2) { console.error(`check-edge-shift: ${msg}`); process.exit(code); }

// ── argv — parsed, and unknown flags are refusals (the check-jank lesson) ──────────────────
const VALUE_FLAGS = new Set(['placements', 'components', 'limit', 'family', 'tolerance', 'theme', 'dump', 'positions', 'classes', 'front-matter', 'each-class']);
const BOOL_FLAGS = new Set(['no-dark', 'no-chrome', 'detail', 'json', 'advisory', 'help', 'variants', 'bars']);
const opts = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const m = /^--([\w-]+)(?:=(.*))?$/.exec(process.argv[i]);
  if (!m) die(`unexpected argument '${process.argv[i]}'.\n\n${USAGE}`);
  const [, name, inline] = m;
  if (BOOL_FLAGS.has(name)) { opts.set(name, true); continue; }
  if (!VALUE_FLAGS.has(name)) die(`unknown flag --${name}.\n\n${USAGE}`);
  const value = inline ?? process.argv[++i];
  if (value == null || value === '' || value.startsWith('--')) die(`--${name} needs a value.`);
  if (name === 'front-matter') opts.set(name, [...(opts.get(name) || []), value]); else opts.set(name, value);
}
if (opts.has('help')) { console.log(USAGE); process.exit(0); }

const PLACEMENTS = (opts.get('placements') || 'top,left,right,bottom,off').split(',').map((s) => s.trim());
const KNOWN_PLACEMENTS = ['top', 'left', 'right', 'bottom', 'off'];
for (const p of PLACEMENTS) if (!KNOWN_PLACEMENTS.includes(p)) die(`unknown placement '${p}'. Known: ${KNOWN_PLACEMENTS.join(', ')}.`);
if (PLACEMENTS.length < 2) die('--placements needs at least two values; one placement has nothing to compare against.');
const FAMILY = opts.get('family') || 'wide';
if (!FAMILIES.includes(FAMILY)) die(`unknown family '${FAMILY}'. Known: ${FAMILIES.join(', ')}.`);
const TOL = Number(opts.get('tolerance') ?? 0.5);
if (!(TOL >= 0)) die('--tolerance must be a number of pixels, 0 or more.');
const THEME = opts.get('theme') || 'indaco';
const LIMIT = opts.has('limit') ? Number(opts.get('limit')) : Infinity;
if (!(LIMIT >= 1)) die('--limit must be at least 1.');
const DARK = !opts.has('no-dark');
const CHROME = !opts.has('no-chrome');
const JSON_OUT = opts.has('json');
const REFERENCE = PLACEMENTS.includes('top') ? 'top' : PLACEMENTS[0];
const EXTRA_CLASSES = (opts.get('classes') || '').trim();
const EXTRA_FRONT_MATTER = opts.get('front-matter') || [];
for (const entry of EXTRA_FRONT_MATTER) {
  if (!/^[A-Za-z_][\w-]*:\s*\S/.test(entry) || /[\r\n]/.test(entry)) die(`--front-matter '${entry}' is not a one-line \`key: value\` entry.`);
  if (/^(size|spectrum-edge):/.test(entry)) die(`--front-matter cannot set '${entry.split(':')[0]}': the sweep owns it.`);
}

// ── the deck ───────────────────────────────────────────────────────────────────────────────

/** Every component manifest that carries a slide to render, in catalog order. */
function componentNames() {
  const root = path.join(ROOT, 'lib', 'components');
  const names = [];
  for (const bucket of fs.readdirSync(root).sort()) {
    const dir = path.join(root, bucket);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir).sort()) {
      const m = findManifest(name);
      if (m && (m.skeleton || m.sample)) names.push(name);
    }
  }
  return names;
}

/** The skeleton as an author writes it: its own `_class` comment dropped so ours leads. */
function bodyOf(name) {
  const m = findManifest(name);
  const text = m.skeleton || m.sample;
  return text.split('\n').filter((l) => !/^\s*<!--\s*_class:/.test(l)).join('\n').trim();
}

/** The variant's own sample when the manifest has one, else the component skeleton. */
function variantBody(name, variant) {
  const m = findManifest(name);
  const doc = m.variantDocs?.[variant];
  const text = doc?.sample ? doc.sample : (m.skeleton || m.sample);
  return text.split('\n').filter((l) => !/^\s*<!--\s*_class:/.test(l)).join('\n').trim();
}

// Ordinary slides carrying each state stamp and each canvas, so the corner marks that anchor
// to the section are measured even though no component's skeleton carries one.
const STAMP_BODY = '# Heading\n\n- One\n- Two\n- Three';
const FIXED = [
  { label: 'plain-content', cls: 'content' },
  { label: 'content+accent', cls: 'content accent' },
  { label: 'content+draft', cls: 'content draft' },
  { label: 'content+confidential', cls: 'content confidential' },
  { label: 'content+wip', cls: 'content wip' },
  { label: 'content+draft+dark', cls: 'content draft dark' },
].map((s) => ({ ...s, body: STAMP_BODY }));

function slideList() {
  if (opts.has('each-class')) {
    const v = opts.get('each-class');
    const classes = v === 'all' ? [...require('../lib/packages/reserved-classes.generated.js').names] : v.split(',').map((c) => c.trim()).filter(Boolean);
    return [...classes.map((c) => ({ label: `.${c}`, cls: `content ${c}`, body: STAMP_BODY })), { ...FIXED[0], probe: true }];
  }
  const wanted = opts.has('components') ? opts.get('components').split(',').map((s) => s.trim()) : null;
  let names = wanted || componentNames();
  if (wanted) for (const n of wanted) if (!findManifest(n)) die(`no manifest for '${n}'.`);
  names = names.slice(0, LIMIT);
  const slides = [];
  for (const n of names) {
    slides.push({ label: n, cls: n, body: bodyOf(n) });
    if (DARK) slides.push({ label: `${n}+dark`, cls: `${n} dark`, body: bodyOf(n) });
  }
  if (opts.has('variants')) {
    for (const n of names) {
      const m = findManifest(n);
      for (const v of m.variants || []) slides.push({ label: `${n}+${v}`, cls: `${n} ${v}`, body: variantBody(n, v) });
    }
  }
  // The plain `content` slide is always present: it is the probe that proves each placement took.
  slides.push(...(wanted ? FIXED.slice(0, 1) : FIXED).map((x, i) => (i === 0 ? { ...x, probe: true } : x)));
  return slides;
}

function deckFor(slides, placement) {
  const fm = [
    '---',
    `size: ${SIZE_ALIAS[FAMILY]}`,
    `spectrum-edge: ${placement}`,
    ...(CHROME ? ['header: HEADER', 'footer: FOOTER', 'paginate: true'] : []),
    ...EXTRA_FRONT_MATTER,
    '---',
  ].join('\n');
  return `${fm}\n\n${slides.map((s) => `<!-- _class: ${s.cls}${EXTRA_CLASSES && !s.probe ? ` ${EXTRA_CLASSES}` : ''} -->\n\n${s.body}\n`).join('\n---\n\n')}`;
}

// ── the measurement, run inside the page ───────────────────────────────────────────────────

function measureInPage() {
  const px = (v) => (v && v !== 'auto' ? parseFloat(v) : null);
  const kindOf = (el) => {
    const tag = el.tagName.toLowerCase();
    const cls = typeof el.className === 'string' ? el.className : '';
    if (tag === 'header') return 'header';
    if (tag === 'footer') return 'footer';
    if (/\blat-pagination\b/.test(cls)) return 'pagination';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    return 'content';
  };
  return [...document.querySelectorAll('section')].map((sec) => {
    const sb = sec.getBoundingClientRect();
    const cs = getComputedStyle(sec);
    const els = {};
    const walk = (el, path) => {
      [...el.children].forEach((child, i) => {
        const tag = child.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta') return;
        // The finish backdrop fills what the bar leaves: a layer that extended under the bar would paint
        // over it (negative z-planes paint above the section's own border), so its edge differs by the
        // strip the bar occupies. It is the canvas, not content or chrome, and is not measured.
        if (typeof child.className === 'string' && /(^|\s)backdrop(\s|$)/.test(child.className)) return;
        const key = `${path}/${i}:${tag}`;
        const r = child.getBoundingClientRect();
        const ccs = getComputedStyle(child);
        if (r.width > 0 && r.height > 0 && ccs.display !== 'none' && ccs.visibility !== 'hidden') {
          const cls = typeof child.className === 'string' ? child.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
          els[key] = {
            name: cls ? `${tag}.${cls}` : tag,
            kind: kindOf(child),
            edges: [r.left - sb.left, r.top - sb.top, sb.right - r.right, sb.bottom - r.bottom],
            size: [r.width, r.height],
          };
        }
        if (tag !== 'svg') walk(child, key);
      });
    };
    walk(sec, '');
    // The area the section's own background image paints in (an `![bg]` photo, a gradient line): where
    // it starts depends on `background-origin` and on the borders, so it is measured like a box.
    if (cs.backgroundImage && cs.backgroundImage !== 'none') {
      const bw = [px(cs.borderLeftWidth), px(cs.borderTopWidth), px(cs.borderRightWidth), px(cs.borderBottomWidth)];
      const pw = [px(cs.paddingLeft), px(cs.paddingTop), px(cs.paddingRight), px(cs.paddingBottom)];
      const origin = cs.backgroundOrigin.split(',')[0].trim();
      const edges = origin === 'border-box' ? [0, 0, 0, 0] : origin === 'content-box' ? bw.map((b, i) => b + pw[i]) : bw;
      els['::background'] = { name: 'section background', kind: 'content', edges, size: [sb.width - edges[0] - edges[2], sb.height - edges[1] - edges[3]] };
    }
    // Generated boxes hung on the section itself (the state stamp, the paginator): not in the
    // DOM, so read their resolved inset and size from computed style.
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(sec, pseudo);
      if (ps.content === 'none' || ps.content === 'normal' || ps.display === 'none') continue;
      if (ps.position !== 'absolute' && ps.position !== 'fixed') continue;
      const w = px(ps.width); const h = px(ps.height);
      const l = px(ps.left); const t = px(ps.top); const rr = px(ps.right); const bb = px(ps.bottom);
      if (![l, t, rr, bb].every((n) => n != null)) continue;
      // `left/right` are insets from the PADDING box; convert to distances from the slide edge.
      const bl = px(cs.borderLeftWidth); const bt = px(cs.borderTopWidth);
      const br = px(cs.borderRightWidth); const bbw = px(cs.borderBottomWidth);
      els[pseudo] = {
        name: `section${pseudo}`, kind: 'stamp',
        edges: [l + bl, t + bt, rr + br, bb + bbw], size: [w, h],
      };
    }
    // The `.slide-bar` overlay is a strip: the side it sits on is the edge it touches, and it is
    // absent (zero-size) until a placement or register asks for a bar.
    const overlay = sec.querySelector(':scope > .slide-bar');
    let overlaySide = null;
    if (overlay) {
      const r = overlay.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        const near = (a, b) => Math.abs(a - b) < 1;
        if (r.width < r.height) overlaySide = near(r.left, sb.left) ? 'left' : 'right';
        else overlaySide = near(r.top, sb.top) ? 'top' : 'bottom';
      }
    }
    return {
      overlay: overlaySide,
      cls: sec.className,
      border: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].map(px),
      els,
    };
  });
}

// ── run ────────────────────────────────────────────────────────────────────────────────────

const EDGES = ['left', 'top', 'right', 'bottom'];

async function main() {
  const chrome = resolveChrome();
  if (!chrome) die('no Chromium (set CHROME_PATH): nothing was measured.');
  const slides = slideList();
  if (!JSON_OUT) console.error(`check-edge-shift: ${slides.length} slides × ${PLACEMENTS.length} placements (${PLACEMENTS.join(', ')}), theme ${THEME}, family ${FAMILY}`);

  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const byPlacement = {};
  try {
    for (const placement of PLACEMENTS) {
      const render = renderProbe(deckFor(slides, placement), `edge-shift-${placement}`, { format: 'html', palette: THEME, keep: true });
      try {
        if (!fs.existsSync(render.out)) die(`the render for '${placement}' produced no HTML.`);
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1200 });
        if (opts.has('dump')) {
          fs.mkdirSync(opts.get('dump'), { recursive: true });
          fs.copyFileSync(render.out, path.join(opts.get('dump'), `edge-${placement}.html`));
        }
        await page.goto(`file://${render.out}`, { waitUntil: 'networkidle0', timeout: 180_000 });
        await page.evaluate(() => document.fonts.ready);
        byPlacement[placement] = await page.evaluate(measureInPage);
        await page.close();
      } finally {
        render.cleanup();
      }
      if (byPlacement[placement].length !== byPlacement[PLACEMENTS[0]].length) {
        die(`'${placement}' rendered ${byPlacement[placement].length} slides but '${PLACEMENTS[0]}' rendered ${byPlacement[PLACEMENTS[0]].length}: the placements are not comparable slide for slide.`);
      }
      if (!JSON_OUT) console.error(`  measured ${placement}`);
    }
  } finally {
    await browser.close();
  }

  if (opts.has('positions')) fs.writeFileSync(opts.get('positions'), JSON.stringify({ slides: slides.map((x) => x.label), byPlacement }));
  // A component that splits into several sections on a narrow canvas breaks the name-per-slide
  // mapping; the placements still agree with each other, so compare by position and label by index.
  const count = byPlacement[PLACEMENTS[0]].length;
  const named = count === slides.length;
  if (!named && !JSON_OUT) console.error(`  note: ${count} sections rendered for ${slides.length} slides written (a component split); labelling by section index.`);
  const labelOf = (i) => (named ? slides[i].label : `#${i + 1}`);
  // The arm that proves the tool can fail: the placement must have taken effect.
  const side = { top: 0, right: 1, bottom: 2, left: 3 };
  const barRegister = EXTRA_FRONT_MATTER.some((e) => /^spectrum(-trim|-card)?:/.test(e));
  if (barRegister && !JSON_OUT) console.error('  note: a deck-level `spectrum:` register is set, so the placement-took-effect check is skipped.');
  for (const placement of barRegister ? [] : PLACEMENTS) {
    const probe = byPlacement[placement][named ? slides.findIndex((x) => x.label === 'plain-content') : count - FIXED.length];
    const want = placement in side ? side[placement] : -1;
    const bad = probe.border.some((w, i) => (i === want ? !(w > 0) : w > 0));
    if (bad) die(`placement '${placement}' did not take effect on a plain slide (border widths t/r/b/l = ${probe.border.join('/')}). The sweep would compare a deck with itself.`);
  }

  // ── compare ──────────────────────────────────────────────────────────────────────────────
  const moved = []; // one row per (slide, element) whose spread exceeds TOL
  const totals = {}; // kind -> { n, moved, max }
  const vsRef = {}; // placement -> kind -> [max |Δ| per edge]
  let compared = 0;
  Array.from({ length: count }, (_, i) => ({ label: labelOf(i) })).forEach((slide, i) => {
    const sets = PLACEMENTS.map((p) => byPlacement[p][i].els);
    const keys = Object.keys(sets[0]).filter((k) => sets.every((s) => s[k] && s[k].name === sets[0][k].name));
    for (const key of keys) {
      const ref = byPlacement[REFERENCE][i].els[key];
      const kind = ref.kind;
      const t = (totals[kind] ||= { n: 0, moved: 0, max: 0 });
      t.n++; compared++;
      const spread = [0, 1, 2, 3].map((e) => {
        const vals = sets.map((s) => s[key].edges[e]);
        return Math.max(...vals) - Math.min(...vals);
      });
      const worst = Math.max(...spread);
      if (worst > t.max) t.max = worst;
      if (worst > TOL) {
        t.moved++;
        moved.push({ slide: slide.label, key, name: ref.name, kind, spread, worst });
      }
      for (const p of PLACEMENTS) {
        if (p === REFERENCE) continue;
        const cur = byPlacement[p][i].els[key];
        const rec = ((vsRef[p] ||= {})[kind] ||= [0, 0, 0, 0]);
        for (let e = 0; e < 4; e++) rec[e] = Math.max(rec[e], Math.abs(cur.edges[e] - ref.edges[e]));
      }
    }
  });

  if (compared === 0) die('no element was comparable across placements: nothing was measured.');

  const sideOf = { top: 0, right: 1, bottom: 2, left: 3 };
  const barless = {};
  if (opts.has('bars')) {
    Array.from({ length: count }, (_, i) => i).forEach((i) => {
      const label = labelOf(i);
      if (/^(plain-content|content\+)/.test(label) || /\+dark$/.test(label)) return;
      const miss = ['top', 'left', 'right', 'bottom'].filter((pl) => {
        if (!byPlacement[pl]) return false;
        const sec = byPlacement[pl][i];
        return !(sec.border[sideOf[pl]] > 0 || sec.overlay === pl);
      });
      if (miss.length) (barless[miss.join('+')] ||= []).push(label);
    });
  }
  const slidesMoved = new Set(moved.map((m) => m.slide));
  const result = {
    placements: PLACEMENTS, reference: REFERENCE, tolerance: TOL, slides: slides.length,
    elementsCompared: compared, elementsMoved: moved.length, slidesMoved: slidesMoved.size,
    slidesStable: Array.from({ length: count }, (_, i) => labelOf(i)).filter((l) => !slidesMoved.has(l)),
    byKind: totals, vsReference: vsRef, ...(opts.has('bars') ? { barless } : {}),
    worst: [...moved].sort((a, b) => b.worst - a.worst).slice(0, opts.has('detail') ? Infinity : 25),
  };

  if (JSON_OUT) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const f = (n) => n.toFixed(1).padStart(5);
    console.log(`\nCompared ${compared} elements across ${count} slides; ${moved.length} moved more than ${TOL}px between placements (${slidesMoved.size} slides affected).\n`);
    if (opts.has('bars')) {
      console.log('Bars: components that draw no bar under a placement (a border or the overlay counts):');
      for (const [k, v] of Object.entries(barless)) console.log(`  none on ${k.padEnd(22)} ${v.length}: ${v.join(', ')}`);
      if (!Object.keys(barless).length) console.log('  none: every component draws a bar on every placement measured');
      console.log('');
    }
    if (result.slidesStable.length) console.log(`Slides that do not move: ${result.slidesStable.join(', ')}\n`);
    console.log('By kind (spread = largest difference for ONE element across all placements):');
    console.log('  kind         elements   moved   max spread');
    for (const [kind, t] of Object.entries(totals).sort((a, b) => b[1].max - a[1].max)) {
      console.log(`  ${kind.padEnd(12)} ${String(t.n).padStart(8)} ${String(t.moved).padStart(7)}   ${f(t.max)}px`);
    }
    console.log(`\nShift of each placement against '${REFERENCE}' (largest |Δ| in px; columns are distance from the slide's ${EDGES.join(' / ')} edge):`);
    for (const p of PLACEMENTS) {
      if (p === REFERENCE) continue;
      console.log(`  ${p}`);
      for (const [kind, v] of Object.entries(vsRef[p] || {})) {
        if (Math.max(...v) > TOL) console.log(`    ${kind.padEnd(11)} ${v.map(f).join(' ')}`);
      }
    }
    console.log(`\n${opts.has('detail') ? 'Every moved element' : 'Worst 25 moved elements'} (slide · element · spread l/t/r/b):`);
    for (const m of result.worst) {
      console.log(`  ${m.slide.padEnd(34)} ${m.name.padEnd(36)} ${m.spread.map(f).join(' ')}`);
    }
    console.log(moved.length ? '\nFAIL: the bar placement moves content.' : '\nPASS: no element moves with the bar placement.');
  }
  process.exit(moved.length && !opts.has('advisory') ? 1 : 0);
}

main().catch((e) => die(e.stack || String(e)));
