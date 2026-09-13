#!/usr/bin/env node
/**
 * chart-language-census — measure what each chart-family member ACTUALLY paints.
 *
 * The chart family shares tokens, kernels and a frame, and still reads as five
 * authors. Prose cannot settle that argument and neither can a still: the
 * question is whether two charts that mean the same thing ("this is a value
 * printed next to a mark", "this is a tick in the gutter") paint it the same
 * way, and that is a property of RESOLVED STYLE, not of the source.
 *
 * So this opens the rendered deck in a real browser and reads
 * getComputedStyle on every text node and every data mark inside each chart
 * section — after the cascade, after light-dark(), after color-mix(). What it
 * reports per member:
 *
 *   type      the (family, size, weight, transform) tuples actually used, and
 *             which SEMANTIC ROLE each carries — a value, a tick, a category,
 *             a series name, an axis title
 *   fill      how a data mark is filled: flat, linear wash, radial dome,
 *             translucent overlay — read off the paint server, not the class
 *   grid      which axis furniture is drawn (gridlines, axis lines, plot box,
 *             baseline, tick marks)
 *   key       how categories are named: a legend rail, direct end-labels,
 *             in-figure titles, or nothing
 *   marks     how many marks carry data-mark (popover) and data-anima-role
 *             (motion), the two interaction handles
 *   keying    WHICH ATTRIBUTE a mark carries its slot on — data-cat, data-mark,
 *             data-cell, data-s, or nothing. This is the arm that decides
 *             whether a rule written against one attribute reaches a member at
 *             all, and it is the one the first census did not have: a finish
 *             spec written entirely against [data-cat] measured as a no-op on
 *             most of the family, silently, because every selector simply
 *             missed. A member with `none` cannot be reached by ANY attribute
 *             selector; it needs an emitter change first.
 *
 * A census, not a gate. It fails on nothing and asserts nothing about what the
 * right answer is — it exists so a design argument starts from the same numbers
 * for everyone, and so the same command re-run after the work shows what moved.
 *
 * Usage:
 *   node tools/chart-language-census.js [deck.md] [--theme <name>] [--json <path>]
 *   node tools/chart-language-census.js --check        hold every manifest's
 *                                                      kernel.marks to the render
 *
 * Defaults to the chart bucket gallery, which is the one deck that carries every
 * member exactly once.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_DECK = path.join(REPO, 'lib/components/chart/chart.gallery.md');

function parseArgs(argv) {
  const out = { deck: DEFAULT_DECK, theme: null, json: null, check: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--theme') out.theme = argv[++i];
    else if (argv[i] === '--json') out.json = argv[++i];
    else if (argv[i] === '--check') out.check = true;
    else rest.push(argv[i]);
  }
  if (rest[0]) out.deck = path.resolve(rest[0]);
  return out;
}

/**
 * The semantic roles a chart prints text in — the job the text does, named
 * independently of whatever the member called its class. That independence is
 * the whole point: the census asks whether two members painting the SAME job
 * paint it the same way.
 *
 * EVERY NAME BELOW IS ONE THE ENGINE ACTUALLY EMITS. An earlier revision of
 * this list was written from memory and was wrong in both directions — it
 * invented `map-label`, `map-tick`, `kanban-title`, `radar-axis-title` and
 * `sbar-value`, none of which exist, and it missed `quadrant-axis-name`,
 * `line-series`, `gantt-lane-label` and `waterfall-delta`, which do. Matching
 * was also by SUBSTRING, so `radar-ticks` (a <g> CONTAINER) matched the
 * `radar-tick` role and reported the group's inherited body face as a second
 * tick face — a "split" no rendered text has. Regenerate this list from a real
 * render rather than editing it by hand:
 *
 *   grep -o '<text[^>]*class="[^"]*"' <rendered.html> | sort -u
 *
 * HTML members (kanban, progress, roadmap, timeline-list, matrix-grid, journey,
 * state-chart) emit no <text> at all; their labels are HTML elements, listed
 * here too so the type arm covers all 21 rather than only the SVG ones.
 */
const TEXT_ROLES = [
  // The PRIMARY figure — the number the slide is about. Display face, large.
  ['value', [
    'cart-value', 'funnel-value', 'bullet-value', 'slope-value', 'sbar-total',
    'waterfall-delta', 'waterfall-total-value', 'wc-word', 'progress-pct',
  ]],
  // The SECONDARY figure — a rate, a target, a component of the primary. The
  // family already distinguishes these two and does it consistently: funnel's
  // conversion, bullet's plan marker and stacked-bar's part are all the label
  // face at 6.5px against the primary's display face at 9px, in three members
  // that arrived there independently. Naming it as its own role is what stops a
  // census reporting a deliberate convention as a "split".
  ['value-2nd', ['funnel-conv', 'bullet-plan', 'sbar-part']],
  // A tick in the gutter, on the canvas, never on a mark.
  ['tick', ['cart-tick', 'radar-tick', 'quadrant-tick', 'gantt-tick']],
  // What a mark IS — the reader's entry point into the plot.
  ['category', [
    'cart-cat', 'funnel-label', 'radar-axis-label', 'quadrant-label',
    'quadrant-dot-label', 'scatter-label', 'gantt-lane-label', 'gantt-bar-label',
    'gantt-mlabel', 'bullet-name', 'sbar-name', 'slope-name', 'progress-label',
    'kanban-card-title', 'timeline-title', 'state-label', 'journey-lane-label',
    'journey-actor-name', 'cell-state-text',
  ]],
  // An inline series name — direct labeling, a first-class register.
  ['series', ['cart-series', 'line-series']],
  // The axis caption.
  ['axis-title', ['cart-axis-title', 'quadrant-axis-name']],
  // A key entry naming a category away from the mark.
  ['legend', [
    'chart-key-label', 'chart-key-value', 'gantt-legend-label',
    'roadmap-legend-label', 'state-legend-label', 'wc-key-label',
    'journey-mood-key-label',
  ]],
  // A column / lane / state heading — a bin's name, not a mark's.
  ['heading', ['kanban-column-header', 'cell-state-label']],
];

/**
 * The data marks every chart member declares, keyed by member name. This is the
 * census's source of truth for what a mark IS — see the comment at `markSel`.
 */
function declaredMarks() {
  const { loadAll } = require(path.join(REPO, 'lib/components'));
  const byMember = new Map();
  for (const m of loadAll()) {
    if (m.kernel && Array.isArray(m.kernel.marks)) byMember.set(m.name, m.kernel.marks);
  }
  return byMember;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const DECLARED = declaredMarks();
  const DECLARED_CLASSES = [...new Set([...DECLARED.values()].flat().map((x) => x.class))].sort();
  const chrome = process.env.CHROME_PATH;
  if (!chrome) {
    console.error('chart-language-census: CHROME_PATH is unset — this measures RESOLVED style,');
    console.error('which needs a real browser. Re-export it (see engineering/development.md).');
    process.exit(2);
  }
  if (!fs.existsSync(args.deck)) {
    console.error(`chart-language-census: no such deck — ${args.deck}`);
    process.exit(2);
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chart-census-'));
  const html = path.join(tmp, 'deck.html');
  const emulator = path.join(REPO, 'dist/lattice-emulator.js');
  const emuArgs = [emulator, args.deck, html];
  if (args.theme) emuArgs.push(args.theme);
  execFileSync(process.execPath, emuArgs, { stdio: ['ignore', 'ignore', 'inherit'] });

  const puppeteer = require('puppeteer');
  let browser;
  let report;
  try {
    browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`file://${html}`, { waitUntil: 'networkidle0' });

    report = await page.evaluate((TEXT_ROLES_SERIAL, DECLARED_SERIAL) => {
      const TEXT_ROLES = TEXT_ROLES_SERIAL;
      const DECLARED_CLASSES = DECLARED_SERIAL;
      // Whole-token match, never substring. `radar-ticks` (the <g> CONTAINER)
      // contains `radar-tick` (the painted label), so a substring test filed the
      // group under the tick role — and a <g> carries no font rule, so it
      // reported the inherited body face and manufactured a "split" that no
      // rendered text has.
      const roleOf = (classList) => {
        const tokens = (classList || '').split(/\s+/).filter(Boolean);
        for (const [role, classes] of TEXT_ROLES) {
          for (const c of classes) if (tokens.includes(c)) return role;
        }
        return null;
      };

      // A chart section is one the chart frame claims. The class that is not
      // structural chrome is the member's own name.
      const CHROME = new Set([
        'chart-frame', 'viz-frame', 'standard', 'print', 'dark', 'light',
        'lr', 'td', 'silent', 'title', 'has-notes', 'split', 'auto-split',
      ]);

      const members = [];
      for (const sec of document.querySelectorAll('section.chart-frame')) {
        const name = [...sec.classList].find((c) => !CHROME.has(c) && !c.startsWith('size-') && !c.startsWith('deck-'));
        if (!name) continue;

        // ── type: the (role → resolved face) map, deduped ──────────────────
        const type = {};
        for (const el of sec.querySelectorAll('text, tspan, .chart-key-label, .chart-key-value, [class*="label"], [class*="value"], [class*="tick"], [class*="name"], [class*="title"]')) {
          const txt = (el.textContent || '').trim();
          if (!txt) continue;
          // Only elements that PAINT text. An SVG <g>/<svg> holds text without
          // drawing any, and carries no font rule of its own — measuring one
          // reports an inherited face that appears nowhere on the slide.
          const tag = el.tagName.toLowerCase();
          if (tag === 'g' || tag === 'svg' || tag === 'defs') continue;
          const cs = getComputedStyle(el);
          // A tspan inherits its face from the <text>; only record where the
          // element itself carries the paint, so one label is not counted twice.
          const cls = el.getAttribute('class') || '';
          const role = roleOf(cls) || (el.parentElement && roleOf(el.parentElement.getAttribute('class') || ''));
          if (!role) continue;
          const face = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
          const key = `${face} ${Math.round(parseFloat(cs.fontSize) * 10) / 10}px ${cs.fontWeight}${cs.textTransform !== 'none' ? ' ' + cs.textTransform : ''}`;
          (type[role] ||= new Set()).add(key);
        }

        // ── fill: read the paint server off the actual mark ────────────────
        // A mark is anything carrying a categorical or status slot. What we
        // want is the SHAPE of the paint (flat / linear / radial / alpha),
        // which is a property of the referenced <defs> node, not of the class.
        const fills = new Set();
        // THE MARK LIST IS THE MANIFESTS', not this file's. Every chart member
        // declares its data marks in `kernel.marks`, and the census reads that
        // declaration rather than carrying a second copy of it — a hand-written
        // table here would be the very thing the declaration exists to retire,
        // and it drifted twice while it lived here. The slot ATTRIBUTES ride
        // alongside so a mark that carries a slot but is declared NOWHERE still
        // shows up: that is the undeclared-mark case `--check` fails on.
        const markSel = [
          '[data-hue]', '[data-s]', '[data-series]', '[data-cell]',
          ...DECLARED_CLASSES.map((c) => '.' + c),
        ].join(', ');
        // The class half of markSel, for grouping a mark by what a rule could
        // actually name it: the attribute half selects marks that carry a slot,
        // which is the very thing the keying arm below is measuring.
        const MARK_CLASSES = new Set(DECLARED_CLASSES);
        for (const el of sec.querySelectorAll(markSel)) {
          const cs = getComputedStyle(el);
          const svgFill = el.getAttribute('fill') || cs.fill;
          const bg = cs.backgroundImage;
          let shape = null;
          if (svgFill && /^url\(/.test(svgFill)) {
            const id = svgFill.replace(/^url\(["']?#?/, '').replace(/["']?\)$/, '');
            const def = sec.querySelector(`#${CSS.escape(id)}`);
            if (def) {
              const tag = def.tagName.toLowerCase();
              shape = tag === 'lineargradient' ? 'linear-gradient'
                : tag === 'radialgradient' ? 'radial-gradient'
                : tag === 'pattern' ? 'pattern' : tag;
            } else shape = 'url(unresolved)';
          } else if (bg && bg !== 'none') {
            shape = /radial/.test(bg) ? 'radial-gradient' : /linear/.test(bg) ? 'linear-gradient' : 'image';
          } else {
            const paint = svgFill && svgFill !== 'none' ? svgFill : cs.backgroundColor;
            // Alpha is the FOURTH component of rgba() / the slash operand of the
            // modern syntax — never "the last number in the string", which reads
            // the BLUE channel out of a 3-component rgb() and calls an opaque
            // fill translucent.
            let a = 1;
            const parts = /^rgba?\(([^)]*)\)/.exec(paint || '');
            if (parts) {
              const comps = parts[1].split(/[,/]/).map((t) => t.trim()).filter(Boolean);
              if (comps.length === 4) a = parseFloat(comps[3]);
            }
            shape = !paint || paint === 'none' || a === 0 ? 'none'
              : a < 0.95 ? `translucent(${a.toFixed(2)})` : 'flat';
          }
          if (shape) fills.add(shape);
        }

        // ── grid: which axis furniture is actually drawn ───────────────────
        const grid = [];
        const has = (sel) => sec.querySelector(sel) !== null;
        if (has('.cart-grid, .grid-line, [class*="gridline"], [class*="grid-"]')) grid.push('gridlines');
        if (has('.cart-axis, .axis-line, [class*="axis-line"]')) grid.push('axis-line');
        // `bar` draws a zero rule rather than an axis — deliberately, since
        // buildAxisRule draws at the plot EDGE, which is only zero while every
        // value is positive. Without this pattern bar reported no furniture at
        // all, which the rendered page plainly contradicts.
        if (has('.cart-baseline, .cart-zero, [class*="baseline"]')) grid.push('baseline');
        if (has('.cart-tickmark, [class*="tick-mark"], [class*="tickmark"]')) grid.push('tick-marks');
        if (has('.cart-plotbox, .quadrant-bounds, [class*="plot-box"], [class*="plotbox"], [class*="frame-box"]')) grid.push('plot-box');
        if (has('.quadrant-split')) grid.push('split-lines');
        if (has('.radar-web, .radar-ring, .radar-spoke')) grid.push('polar-web');

        // ── occlusion: do this member's marks OVERLAP each other? ──────────
        // The axis that tells radar apart from quadrant, which no other reading
        // does — both paint a <radialGradient>, so a census that reads the
        // element name buckets them together. They are opposites: quadrant's
        // four zones TILE (abut, never overlap) and its ramp travels 40
        // hue-mix points; radar's polygons LAYER (three series over one web)
        // and its ramp is one colour at three opacities. Only a LAYERED member
        // has any reason to be translucent — for a TILED or SEPARATE one,
        // transparency buys nothing and costs contrast.
        //
        // Measured off real geometry (getBBox on the painted marks), not
        // declared: whether marks overlap is a property of the drawing.
        const MARK_SEL = [
          '.wedge', '.funnel-band', '.radar-poly', '.bar-mark', '.waterfall-bar',
          '.sbar-seg', '.quadrant-tint', '.quadrant-dot', '.map-region',
          '.scatter-dot', '.scatter-bubble', '.gantt-bar', '.line-area', '.line-band',
        ].join(', ');
        // Same-class only, and shape-accurate. Two things make a bounding-box
        // test lie here. A pie wedge's bbox is a rectangle over its arc, so
        // adjacent wedges' boxes overlap heavily while the SHAPES only abut —
        // bbox alone calls the pie "layered", which is exactly backwards. And
        // comparing a quadrant DOT against a quadrant ZONE finds an overlap
        // that means nothing: a dot is supposed to sit on its field. So group
        // by class, and test real fill containment with isPointInFill.
        const byClass = new Map();
        for (const m of sec.querySelectorAll(MARK_SEL)) {
          if (m.namespaceURI !== 'http://www.w3.org/2000/svg') continue;
          if (typeof m.isPointInFill !== 'function' || typeof m.getBBox !== 'function') continue;
          const k = (m.getAttribute('class') || '').split(/\s+/)[0];
          if (!byClass.has(k)) byClass.set(k, []);
          byClass.get(k).push(m);
        }
        const svg = sec.querySelector('svg');
        let overlaps = 0;
        let pairs = 0;
        let occMarks = 0;
        if (svg) {
          for (const group of byClass.values()) {
            occMarks += group.length;
            for (let i = 0; i < group.length; i++) {
              for (let j = i + 1; j < group.length; j++) {
                pairs++;
                const a = group[i]; const b = group[j];
                let box;
                try { box = a.getBBox(); } catch { continue; }
                if (!(box.width > 0 && box.height > 0)) continue;
                let hit = false;
                // Sample a 7x7 lattice inside A's box; a point counts only if it
                // is inside BOTH fills, which is true overlap rather than
                // bounding-box proximity.
                for (let px = 1; px < 8 && !hit; px++) {
                  for (let py = 1; py < 8 && !hit; py++) {
                    const pt = svg.createSVGPoint();
                    pt.x = box.x + (box.width * px) / 8;
                    pt.y = box.y + (box.height * py) / 8;
                    try { if (a.isPointInFill(pt) && b.isPointInFill(pt)) hit = true; } catch { /* non-geometry */ }
                  }
                }
                if (hit) overlaps++;
              }
            }
          }
        }
        const occlusion = !pairs ? 'n/a'
          : overlaps === 0 ? 'tiled/separate'
          : overlaps >= pairs * 0.5 ? 'layered'
          : 'partial';

        // ── bearing: does a mark CARRY text, measured by geometry ──────────
        // The one fact a finish cannot afford to get wrong. A mark that carries
        // its own label has to stay quiet enough for that label to clear 4.5:1,
        // so a finish may only pick a body level inside a cap; a mark that
        // carries none is the finish's to set outright.
        //
        // THIS IS MEASURED, NOT LISTED, and the record says why twice.
        // `el.textContent` measures CONTAINMENT, and an SVG <rect> can have its
        // label drawn ON it as a SIBLING <text> — measured that way `gantt`
        // reports "no" while its bars plainly carry task names. And the
        // hand-written list in spend-rules.md §7 declared `funnel-band`
        // text-bearing on the assumption that a band carries its own label; it
        // does not, the labels sit in the LEFT GUTTER, and that one wrong datum
        // is why funnel rendered byte-identical under all three finishes.
        //
        // MAX-OVERLAP, NEVER FIRST-MATCH. A label pairs with the mark it sits
        // MOST inside, not the first one whose box it touches — "first match"
        // was wrong three separate times in the prototype that preceded this.
        // The threshold is 60% of the TEXT's own box inside the mark's box: a
        // label centered on a bar clears it comfortably, a tick abutting one
        // does not.
        const bearing = {};
        //
        // TWO FILTERS, both paid for by a wrong number on the first run.
        // A VISUALLY HIDDEN label is not text on a mark: matrix-grid clips a
        // `.cell-sr-label` ("reachable") to a 1px box behind `clip-path:
        // inset(50%)` for anything reading DOM text, and counting it scored
        // `cell-outlined` — a mark with no body at all — 10 of 10 text-bearing.
        // And a mark's OWN text content is the commonest bearing shape in the
        // HTML members: `<span class="cell cell-filled">Distinguished</span>`
        // has no child element to measure, so excluding the element itself
        // reported matrix-grid's filled cells as bare when they carry the
        // grade name. Both directions were wrong in the same member.
        const hidden = (el) => {
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) return true;
          if (/inset\(\s*50%/.test(cs.clipPath || '')) return true;
          const r = el.getBoundingClientRect();
          return r.width <= 1 || r.height <= 1;
        };
        const textNodes = [...sec.querySelectorAll('text, tspan, span, div, p, li, td, th')]
          .filter((t) => [...t.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
          .filter((t) => !hidden(t))
          .map((t) => ({ el: t, r: t.getBoundingClientRect() }))
          .filter((t) => t.r.width > 0 && t.r.height > 0);
        const frac = (mr, tr) => {
          const ox = Math.max(0, Math.min(mr.right, tr.right) - Math.max(mr.left, tr.left));
          const oy = Math.max(0, Math.min(mr.bottom, tr.bottom) - Math.max(mr.top, tr.top));
          return (ox * oy) / (tr.width * tr.height);
        };
        // EVERY DECLARED CLASS ON THE ELEMENT, NOT THE FIRST ONE. A mark often
        // carries a base class and a modifier — `class="map-region map-region--on"`,
        // `"radar-poly radar-poly--target"`, `"slope-dot slope-dot-from"` — and
        // both are real selectors a finish rule can name, with DIFFERENT
        // declarations behind them (`map-region` encodes nothing, `--on` is the
        // choropleth ramp). Taking the first match filed all of them under the
        // base and reported fourteen declared rows as exercised by no deck at
        // all, `map-region--on` among them, on a gallery that renders 175 of
        // them. Same "first match" trap the prototype hit three times.
        for (const el of sec.querySelectorAll(markSel)) {
          const classes = [...el.classList].filter((c) => MARK_CLASSES.has(c));
          if (!classes.length) continue;
          for (const cls of classes) {
          const b = (bearing[cls] ||= { n: 0, withText: 0, samples: [], paint: new Set(), encodes: new Set() });
          b.n += 1;
          // The stamped attributes, per CLASS — what `--check` compares against
          // the declaration. The static gate can only match these as a SET over
          // a whole file; here each value is tied to the element it lands on,
          // which is the check that actually holds a member to its manifest.
          if (el.hasAttribute('data-paint')) b.paint.add(el.getAttribute('data-paint'));
          if (el.hasAttribute('data-encodes')) b.encodes.add(el.getAttribute('data-encodes'));
          const mr = el.getBoundingClientRect();
          if (!mr.width || !mr.height) continue;
          // The mark's OWN best label: the text whose box lies most inside it.
          // Both a SIBLING (an SVG <text> drawn over a <rect>) and a DESCENDANT
          // (kanban's card title, matrix-grid's cell text) count — text on the
          // mark is text on the mark, whatever the tree says — and so is the
          // mark's OWN text content, which is how every HTML member labels.
          // A BOUNDING BOX LIES ON A NON-RECTANGULAR MARK, and three of the
          // family's marks are non-rectangular. A pie wedge's bbox is a
          // rectangle over its arc, a funnel band is a trapezoid, a radar
          // polygon is a star — so a label sitting in the CORNER of the box is
          // nowhere near the shape. The occlusion arm above already learned
          // this (bbox alone calls the pie "layered", which is backwards). So
          // for an SVG mark the text's CENTER must also land inside the real
          // fill, which is what `isPointInFill` answers.
          const inShape = (tr) => {
            if (!(el instanceof SVGGraphicsElement) || typeof el.isPointInFill !== 'function') return true;
            const svg = el.ownerSVGElement;
            if (!svg || typeof svg.createSVGPoint !== 'function') return true;
            const pt = svg.createSVGPoint();
            // Client coords → the mark's own user space. `getScreenCTM` carries
            // the viewBox scale and every ancestor transform; without the
            // inverse, every test is against unscaled user units and a scaled
            // figure answers nonsense.
            const ctm = el.getScreenCTM();
            if (!ctm) return true;
            pt.x = (tr.left + tr.right) / 2;
            pt.y = (tr.top + tr.bottom) / 2;
            const local = pt.matrixTransform(ctm.inverse());
            try { return el.isPointInFill(local); } catch { return true; }
          };
          let best = 0;
          let bestText = null;
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (own && !hidden(el)) {
            best = 1;
            bestText = [...el.childNodes]
              .filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim().slice(0, 18);
          }
          for (const t of textNodes) {
            if (t.el === el) continue;
            const f = frac(mr, t.r);
            if (f <= best) continue;
            if (f >= 0.6 && !inShape(t.r)) continue;
            best = f; bestText = (t.el.textContent || '').trim().slice(0, 18);
          }
          if (best >= 0.6) {
            b.withText += 1;
            if (b.samples.length < 3) b.samples.push(bestText);
          }
          }
        }

        // ── keying: which attribute a mark carries its slot on ─────────────
        // A finish is a stylesheet, so its whole reach is decided here. Group
        // by mark CLASS rather than by element: what a rule can select is a
        // class plus an attribute, and a member whose bars carry data-s but
        // not data-cat is invisible to a categorical rule no matter how many
        // of them there are.
        const SLOT_ATTRS = ['data-hue', 'data-mark', 'data-cell', 'data-series', 'data-s'];
        const keying = {};
        for (const el of sec.querySelectorAll(markSel)) {
          const cls = [...el.classList].find((c) => MARK_CLASSES.has(c));
          if (!cls) continue;
          const attrs = SLOT_ATTRS.filter((a) => el.hasAttribute(a));
          const k = attrs.join(',') || 'none';
          ((keying[cls] ||= {})[k] ||= 0);
          keying[cls][k] += 1;
        }

        // ── key: how categories are named ──────────────────────────────────
        const key = [];
        if (has('[class*="chart-key"], .chart-legend, [class*="legend"]')) key.push('legend-rail');
        if (has('.cart-series, .slope-name, [class*="direct-label"]')) key.push('direct-labels');
        if (has('.quadrant-zone-label, .quadrant-title')) key.push('zone-titles');

        // ── interaction handles ────────────────────────────────────────────
        const marks = sec.querySelectorAll('[data-mark]').length;
        const anima = sec.querySelectorAll('[data-anima-role]').length;
        const details = sec.querySelectorAll('template.chart-detail').length;
        const svgs = sec.querySelectorAll('svg').length;

        members.push({
          name,
          occlusion,
          markCount: occMarks,
          type: Object.fromEntries(Object.entries(type).map(([k, v]) => [k, [...v].sort()])),
          fills: [...fills].sort(),
          keying,
          bearing: Object.fromEntries(Object.entries(bearing).map(
            ([k, v]) => [k, { ...v, paint: [...v.paint], encodes: [...v.encodes] }])),
          grid,
          key,
          marks,
          anima,
          details,
          svgs,
        });
      }
      return members;
    }, TEXT_ROLES, DECLARED_CLASSES);
  } finally {
    if (browser) await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ── Report ───────────────────────────────────────────────────────────────
  const label = args.theme ? `${path.basename(args.deck)} · ${args.theme}` : path.basename(args.deck);
  console.log(`\nchart-language census — ${label}  (${report.length} members)\n`);

  // 1. Type register per semantic role. The headline: one role, many faces.
  const roles = [...new Set(report.flatMap((m) => Object.keys(m.type)))].sort();
  console.log('── TYPE — how each member paints each semantic role ' + '─'.repeat(20));
  for (const role of roles) {
    const byFace = new Map();
    for (const m of report) {
      for (const face of m.type[role] || []) {
        const fam = face.split(' ')[0];
        (byFace.get(fam) || byFace.set(fam, []).get(fam)).push(m.name);
      }
    }
    const fams = [...byFace.keys()];
    const flag = fams.length > 1 ? '  ⟵ SPLIT' : '';
    console.log(`\n  ${role.padEnd(11)} ${fams.length} face(s)${flag}`);
    for (const [fam, who] of byFace) {
      console.log(`    ${fam.padEnd(18)} ${[...new Set(who)].sort().join(', ')}`);
    }
  }

  // 2. Fill finish.
  console.log('\n\n── FILL — how a data mark is painted ' + '─'.repeat(34));
  const byFill = new Map();
  for (const m of report) {
    for (const f of m.fills) (byFill.get(f) || byFill.set(f, []).get(f)).push(m.name);
  }
  for (const [f, who] of [...byFill].sort()) {
    console.log(`  ${f.padEnd(24)} ${who.sort().join(', ')}`);
  }

  // 3. Axis furniture + key, per member.
  console.log('\n\n── FURNITURE + KEY + HANDLES, per member ' + '─'.repeat(30));
  console.log(`  ${'member'.padEnd(14)} ${'occlusion'.padEnd(11)} ${'grid'.padEnd(28)} ${'key'.padEnd(24)} mark/anima/detail`);
  for (const m of [...report].sort((a, b) => a.name.localeCompare(b.name))) {
    const handles = `${m.marks}/${m.anima}/${m.details}${m.svgs ? '' : '  (no svg → no motion)'}`;
    const occ = `${m.occlusion || '?'}${m.markCount ? ' (' + m.markCount + ')' : ''}`;
    console.log(`  ${m.name.padEnd(14)} ${occ.padEnd(11)} ${(m.grid.join(' ') || '—').padEnd(28)} ${(m.key.join(' ') || '—').padEnd(24)} ${handles}`);
  }

  // 4. Keying — what a stylesheet can actually reach.
  console.log('\n\n── KEYING — which attribute a mark carries its slot on ' + '─'.repeat(26));
  console.log('  A finish is CSS. Its reach stops at the attribute its selectors name.\n');
  console.log(`  ${'member'.padEnd(14)} ${'mark class'.padEnd(20)}   n   slot attributes`);
  const unreachable = [];
  const noCat = [];
  for (const m of [...report].sort((a, b) => a.name.localeCompare(b.name))) {
    const entries = Object.entries(m.keying || {});
    if (!entries.length) { console.log(`  ${m.name.padEnd(14)} ${'—'.padEnd(20)}   —`); continue; }
    let first = true;
    for (const [cls, byAttr] of entries) {
      for (const [attrs, n] of Object.entries(byAttr)) {
        const cat = attrs.split(',').includes('data-hue');
        if (attrs === 'none') unreachable.push(`${m.name}/${cls}`);
        else if (!cat) noCat.push(`${m.name}/${cls} (${attrs})`);
        console.log(`  ${(first ? m.name : '').padEnd(14)} ${cls.padEnd(20)} ${String(n).padStart(3)}   ${attrs}${cat ? '' : attrs === 'none' ? '   ⟵ NO attribute selector can reach this' : '   ⟵ not data-hue'}`);
        first = false;
      }
    }
  }
  const reach = report.filter((m) => Object.values(m.keying || {}).some((b) => Object.keys(b).some((k) => k.split(',').includes('data-hue'))));
  console.log(`\n  ${reach.length} of ${report.length} members key a mark on data-hue: ${reach.map((m) => m.name).sort().join(', ') || '—'}`);
  console.log(`  ${new Set(noCat.map((x) => x.split('/')[0])).size} members key on something else, ${new Set(unreachable.map((x) => x.split('/')[0])).size} on nothing at all.`);

  // 5. Bearing — does a mark carry text, measured by geometric overlap.
  console.log('\n\n── BEARING — which marks CARRY text, by geometry ' + '─'.repeat(32));
  console.log('  60% of the label\'s own box inside the mark\'s box, max-overlap, and for a');
  console.log('  non-rectangular mark the label\'s center inside the real fill. A mark that');
  console.log('  carries text caps how far a finish may retreat its body; a bare one does not.');
  console.log('  ONE labelled mark is enough to cap the class — the ⟵ flags any n > 0.\n');
  console.log(`  ${'member'.padEnd(14)} ${'mark class'.padEnd(20)} ${'bears'.padEnd(9)} sample labels`);
  for (const m of [...report].sort((a, b) => a.name.localeCompare(b.name))) {
    const entries = Object.entries(m.bearing || {});
    if (!entries.length) { console.log(`  ${m.name.padEnd(14)} ${'—'.padEnd(20)} ${'—'.padEnd(9)}`); continue; }
    let first = true;
    for (const [cls, b] of entries) {
      const ratio = `${b.withText}/${b.n}`;
      const verdict = b.withText > 0 ? '  ⟵ TEXT-BEARING' : '';
      console.log(`  ${(first ? m.name : '').padEnd(14)} ${cls.padEnd(20)} ${ratio.padEnd(9)} ${b.samples.join(' · ')}${verdict}`);
      first = false;
    }
  }

  // 6. --check — hold every manifest declaration to the render.
  //
  // THIS IS THE ARM THAT CAN FAIL ON A WRONG `bears`, and nothing else can.
  // `build:check` reads source: it sees that a declared class is written and
  // that the stamped VALUES are ones the manifest knows, and it is blind to
  // geometry. Bearing is geometry — an SVG rect's label is a SIBLING, so no
  // amount of reading the transform says whether a bar carries a task name.
  //
  // What it does NOT cover, said out loud because a gate that looks broader
  // than it is, is how two numbers got believed last session: it sees only the
  // marks THIS DECK renders on THIS theme. A mark a variant emits and the
  // gallery does not exercise is invisible here, and so is a slot past the
  // deck's category count.
  if (args.check) {
    const problems = [];
    for (const m of report) {
      const declared = DECLARED.get(m.name);
      if (!declared) { problems.push(`${m.name}: renders but declares no kernel.marks`); continue; }
      const byClass = new Map(declared.map((d) => [d.class, d]));
      for (const [cls, b] of Object.entries(m.bearing || {})) {
        const d = byClass.get(cls);
        if (!d) {
          problems.push(
            `${m.name}/${cls}: painted ${b.n}x on the render but declared in no kernel.marks row. ` +
            `A finish cannot be written against a mark nobody declared.`);
          continue;
        }
        // ONE MARK IS ENOUGH, AND THE TEST ONLY RUNS ONE WAY. `bears` is a CAP,
        // so the question is not what most marks do — it is whether any label
        // lands on this class at all. A body level that is safe for eight bars
        // and unsafe for four is unsafe. An earlier revision asked for a 60%
        // majority and called `journey-actor-dot` bare at 4 of 12, which is
        // twelve dots whose initials would then be painted over.
        //
        // And a deck that shows NO label on a class does not refute a `true`:
        // the bucket gallery renders radar with ring ticks over the polygons
        // (3 of 3) and radar's own gallery renders a variant without them
        // (0 of 4). Both are honest renders of the same class. So a deck can
        // PROVE a mark bears text and can never disprove it — which is also the
        // safe asymmetry, because the two errors do not cost the same: a wrong
        // `true` under-reaches a finish, a wrong `false` paints over a label.
        // A MARK WITH NO BODY IS NOT MEASURABLE HERE, and the reason is the hit
        // test itself. `isPointInFill` answers against a path's FILL geometry
        // whether or not the path is filled, so an open stroked path — a state
        // edge, a trend line — reports a label as "inside" a region that has no
        // ink in it at all. `state-edge` failed exactly that way: one transition
        // label sitting in the implicit area under a curve.
        //
        // Skipping it costs nothing, because `bears` is a CAP ON A BODY and
        // `paint: "none"` already tells a finish there is no body to set. The
        // declaration stays honest — a label really does sit on a state edge —
        // it is just not a claim this instrument can hold anyone to, and saying
        // so is the point.
        if (d.paint === 'none') continue;
        if (b.withText > 0 && !d.bears) {
          problems.push(
            `${m.name}/${cls}: declares bears false, renders ${b.withText} of ${b.n} marks ` +
            `carrying text${b.samples.length ? ` (${b.samples.join(', ')})` : ''}. ` +
            `Each label has to keep clearing 4.5:1 against whatever a finish paints under it, ` +
            `so this mark's body is CAPPED — declaring it bare lets a finish set it outright.`);
        }
        for (const [key, vals] of [['paint', b.paint], ['encodes', b.encodes]]) {
          for (const v of vals) {
            if (v !== d[key]) {
              problems.push(
                `${m.name}/${cls}: stamps data-${key}="${v}" on the render, manifest declares ` +
                `${key} "${d[key]}". The attribute is what a finish selects on; the manifest is ` +
                `what decides what the finish may do.`);
            }
          }
        }
      }
    }
    console.log('\n\n── CHECK — manifests against the render ' + '─'.repeat(40));
    if (!problems.length) {
      const n = report.reduce((a, m) => a + Object.keys(m.bearing || {}).length, 0);
      console.log(`  OK — ${n} rendered mark classes across ${report.length} members agree with`);
      console.log('  their kernel.marks declarations (class, paint, encodes, bears).');
      console.log('  Covers only what THIS deck renders on THIS theme — an unexercised variant');
      console.log('  or a slot past the deck\'s category count is not looked at.');
    } else {
      for (const x of problems) console.log('  ✗ ' + x);
      console.log(`\n  ${problems.length} disagreement(s).`);
      process.exitCode = 1;
    }
  }

  console.log('');
  if (args.json) {
    fs.writeFileSync(args.json, JSON.stringify({ deck: args.deck, theme: args.theme, members: report }, null, 2));
    console.log(`json → ${args.json}\n`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
