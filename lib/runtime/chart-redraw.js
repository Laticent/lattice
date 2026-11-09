/**
 * Chart redraw — a chart drawn for one box, redrawn in the browser when its box changes shape.
 *
 * The engine draws each chart once, as an SVG fitted to the box it was given (a 16:9 slide, a portrait
 * slide, a pane), and a later box only scales that drawing: on a phone the fluid view turns a 16:9 bar
 * chart's box tall and 351px wide, and the wide drawing shrinks to fit it, labels at 7px. This module
 * redraws the chart for the box it now has, ON DEMAND: only when the box changes the drawing the
 * kernel would choose (its orientation, a stacked pane's canvas, its aspect), and only in the fluid
 * view, the one host whose boxes change after the render.
 *
 * NOTHING IS ADDED TO THE EXPORT (the owner's call on #3060: no duplicated markup or data). The chart
 * READS ITS SOURCE BACK FROM ITS OWN MARKS: a bar records its label and value on each mark,
 * the key names the series, and each mark's note is the `<template class="chart-detail">` beside it.
 * The drawing code is the engine's own kernel (lib/transformers/chart-frame.js `transformChartSection`),
 * already in the runtime bundle, so a redraw is the same call the engine made with a different box.
 * The chart as exported is kept IN MEMORY (a WeakMap, never in the page) and put back when the box
 * returns to the one it was drawn for, so a rotated-back phone shows the engine's own drawing.
 *
 * Each kind needs a READER that rebuilds its source list from its marks. Only kinds whose marks carry
 * the whole source have one (`READERS`); every other chart keeps its exported drawing, exactly as
 * before. engineering/decisions/2026-11-03-responsive-tables.md §"Charts redraw on demand".
 *
 * HARD RULE #22. What the kernel returns is parsed into a detached `<template>` (the one markup sink
 * here, sanctioned in tools/check-ownership.js `SANCTIONED_RUNTIME_MARKUP_SINKS`). Every value read
 * off the page is a DECODED string (an attribute value, a text node), so each is escaped before it goes
 * back into the source, and a note's own markup is never re-serialized: the exported template NODES
 * are moved into the new drawing. test/unit/runtime/chart-redraw.test.js pins a forged label.
 */

const { transformChartSection } = require('../transformers/chart-frame');
const READERS = require('./chart-readers');
const readBar = READERS.bar;

// ── Targets: the box a chart should be drawn for, now ─────────────────────────────────────────

/** Round a pane canvas so a resize redraws when the drawing would change, not on every pixel. */
const STEP = 20;
/** The narrowest canvas a redraw draws at, in chart units (a full 16:9 chart is 320). */
const MIN_W = 200;
/** Labels whose number legitimately changes with the box: axis ticks (a phone prints fewer). */
const TICKS = /\b(cart-tick|tower-edge)\b/;

/** Every word a drawing prints in its SVG labels, counted; a wrapped label's lines are joined by spaces. */
function printed(root) {
  const words = new Map();
  for (const t of root.querySelectorAll('svg text')) {
    if (TICKS.test(t.getAttribute('class') || '')) continue;
    const spans = t.querySelectorAll('tspan');
    const text = spans.length ? [...spans].map((s) => s.textContent).join(' ') : t.textContent;
    for (const w of text.split(/\s+/)) if (w) words.set(w, (words.get(w) || 0) + 1);
  }
  return words;
}

/** How many printed words of `want` the drawing `got` does not print (a dropped label, a shortened name). */
function lost(want, got) {
  let n = 0;
  for (const [w, c] of want) n += Math.max(0, c - (got.get(w) || 0));
  return n;
}
const snap = (n) => Math.max(STEP, Math.round(n / STEP) * STEP);

/**
 * WHEN a chart redraws: the facts that change the kernel's drawing, and nothing else. The slide's
 * orientation and aspect (the stamps the runtime writes from the slide's box), and for a pane whether it
 * is stacked (base.fluid-view.css: a tall box on a screen at most 40em wide). None of these depends on
 * the chart's own content. The first cut keyed on the chart body's measured height, which follows the
 * SVG just drawn, so each redraw changed the key and drew again: a grouped chart walked its viewBox from
 * 494 to 8814 units and settled with 1px text (the checker's repro).
 */
function keyFor(host, exported) {
  const section = host.closest('section[data-lattice-slide]') || host;
  const orientation = section.getAttribute('data-orientation') || undefined;
  const aspectAttr = section.getAttribute('data-aspect');
  const aspect = aspectAttr ? Math.round(Number(aspectAttr) * 4) / 4 : undefined;
  const stacked = host.tagName === 'LAT-PANE' && !!orientation
    && document.documentElement.getAttribute('data-lattice-view') === 'fluid'
    && typeof matchMedia === 'function' && matchMedia('(max-width: 40em)').matches;
  const t = { section, orientation, aspect, stacked };
  // A WHOLE-SLIDE chart's canvas joins the key: labels keep the slide's type at every width (canvasFor). It
  // follows the slide's width and type, never the chart's own drawing, so a redraw cannot change it. A pane
  // keeps its key: its export canvas is not in the page, and a desktop pane must keep its exported drawing.
  // A box of the SHAPE the export was drawn for (its orientation and aspect) keeps the exported drawing at any
  // size: the slide's type scales with it, so its labels already keep the slide's proportion. A portrait deck
  // at its own size used to redraw anyway (the checker's repro).
  const authored = exported && orientation === exported.orientation && aspect === exported.aspect;
  const canvas = host.tagName === 'LAT-PANE' || authored ? undefined : canvasFor(host, t);
  t.canvas = canvas;
  const cw = canvas ? `${canvas.w}x${canvas.h}` : canvas === null ? 'unlaid' : '';
  return { ...t, key: [orientation || '', aspect || '', stacked ? 'stacked' : '', cw].join('|') };
}

/**
 * Pixels per chart unit for labels at the slide's own type. At the 16:9 export (1280 x 720) a full chart
 * is 320 units across 1152px, 3.6px a unit, beside a 21.38px body text: a 7.5-unit label prints at 1.26x
 * the body. Every redraw keeps that ratio, so a chart's labels follow the slide's text at any width and
 * height (the owner: "the bar labels should be responsive"), instead of the chart's width alone, which put
 * 1024 x 768 labels at the size of the slide's heading.
 */
const UNIT_PER_BODY_PX = 3.6 / 21.376;

/**
 * The slide's body text size in px, WITHOUT touching the page. `--fs-body` computes to a product such as
 * `calc(1.67 * 12.800px * 1)` (its `var()`s already substituted). A first cut measured it with a probe element
 * added and removed on every pass, and the runtime's shared MutationObserver answered each probe with another
 * pass: an endless loop at about 70% of a core on an idle page (the checker's repro). Anything that is not a
 * plain product of numbers and px (a unit the page has not resolved yet) is NaN: the caller waits.
 */
function bodyPx(section) {
  const raw = getComputedStyle(section).getPropertyValue('--fs-body').trim();
  const inner = /^calc\((.*)\)$/.exec(raw);
  const terms = (inner ? inner[1] : raw).split('*').map((t) => t.trim());
  let px = 1;
  let unit = 0;
  for (const t of terms) {
    const m = /^(-?(?:\d+(?:\.\d+)?|\.\d+))(px)?$/.exec(t);
    if (!m) return Number.NaN;
    px *= Number(m[1]);
    if (m[2]) unit += 1;
  }
  return unit === 1 ? px : Number.NaN;
}

/**
 * WHAT a redraw draws at: a canvas in slide chart units, the engine's own formula (lib/engine/index.js
 * `paneView`: a box over the px one unit of a full-slide chart gets, 320×180 landscape, 320×300
 * portrait), measured only when a redraw is due, and never from anything the chart's own drawing sizes.
 * A side-by-side pane's canvas is its box (a size container: content cannot size it). A whole-slide
 * chart in a landscape box takes the engine's path, no canvas, as the export did; in a tall or square box,
 * and a stacked pane, the canvas is the WIDTH in units at the view's shape. The unit includes the slide's type scale (`--canvas-scale`,
 * about 2 on a phone, lib/adaptive/families.js `canvasScaleFor`), so labels print at the slide's size,
 * not at 8px beside 17px text; and the canvas is at least MIN_W units wide, since at the full type size a
 * phone-wide pane is about 140 units and a four-category chart broke "Licen ses" mid-word there.
 */
function canvasFor(host, t) {
  const pane = host.tagName === 'LAT-PANE';
  const view = t.orientation === 'portrait' ? { w: 320, h: 300 } : { w: 320, h: 180 };
  // The slide's TYPE, not the stage's width: px per unit from the body text (UNIT_PER_BODY_PX). A fluid
  // stage's height follows its content, and the chart's own size follows its drawing, so neither may feed
  // the canvas (the first cut keyed on the chart's height and walked a viewBox to 1px text).
  const unit = bodyPx(t.section) * UNIT_PER_BODY_PX;
  const box = pane ? host : host.querySelector(':scope > .cell-stage > .chart-body, :scope > .chart-body');
  if (!(unit > 0) || !box || !(box.clientWidth > 0)) return null;
  const w = box.clientWidth / unit;
  // HEIGHT from the box only where content cannot size it: a side-by-side pane is a size container. A
  // stacked pane starts at its content's height (base.fluid-view.css), so its chart would size its own
  // canvas, as a whole-slide chart would; both take the view's shape from their width instead.
  const h = pane && !t.stacked ? box.clientHeight / unit : w * (view.h / view.w);
  const k = Math.max(1, MIN_W / w);
  // `fluid` marks a canvas only this redraw passes: the kernels' narrow forms (tower, quadrant, risk-matrix,
  // word-cloud) key on it, so a narrow pane in an export never takes them.
  return { w: snap(w * k), h: snap(h * k), fluid: true };
}

// ── The redraw ───────────────────────────────────────────────────────────────────────────────

/** Per chart body: the exported drawing (nodes, in memory only) and the box it was drawn for. */
const original = new WeakMap();
let printingCharts = false;
let svgSeq = 0;

function kindOf(host) {
  return Object.keys(READERS).find((k) => host.classList.contains(k)) || null;
}

/** Name each redrawn SVG for assistive tech, as the engine's post-pass does (lib/core/svg-a11y-names.js). */
function nameSvgs(body) {
  for (const svg of body.querySelectorAll('svg[role="img"]')) {
    if (svg.hasAttribute('aria-labelledby') || svg.hasAttribute('aria-label')) continue;
    svgSeq += 1;
    const title = svg.querySelector(':scope > title');
    const desc = svg.querySelector(':scope > desc');
    if (title) { title.id = `lat-svgr-${svgSeq}-t`; svg.setAttribute('aria-labelledby', title.id); }
    if (desc) { desc.id = `lat-svgr-${svgSeq}-d`; svg.setAttribute('aria-describedby', desc.id); }
  }
}

/**
 * Remember a chart body's exported drawing and the box it was drawn for. Called once per body,
 * BEFORE the fluid view changes any box (lib/runtime/index.js boot), so the key is the authored one.
 */
function snapshot(host) {
  const body = host.querySelector(':scope > .cell-stage > .chart-body, :scope > .chart-body');
  if (!body || original.has(body) || !kindOf(host)) return;
  // The box the export drew for: the slide's stamps as they stand before the fluid view moves anything, and
  // the export's own canvas (an empty canvas part), whatever this pre-fluid layout would measure.
  const { section } = keyFor(host);
  const shape = {
    orientation: section.getAttribute('data-orientation') || undefined,
    aspect: section.getAttribute('data-aspect') ? Math.round(Number(section.getAttribute('data-aspect')) * 4) / 4 : undefined,
  };
  const key = [shape.orientation || '', shape.aspect || '', '', ''].join('|');
  // The box facts the export drew with, raw, for the check in `verified` (keyFor rounds the aspect).
  const orientation = section.getAttribute('data-orientation') || undefined;
  const aspect = section.getAttribute('data-aspect') ? Number(section.getAttribute('data-aspect')) : undefined;
  original.set(body, { nodes: [...body.childNodes], drops: body.getAttribute('data-label-drops'), key, drawn: key, added: [], removed: [], orientation, aspect, shape, checked: new Map(), refused: new Set() });
}

/**
 * A kernel can change its section's class list with the box: on a portrait box roadmap adds `horizons`,
 * and its card styles apply only under `section.roadmap.horizons`. The redraw applies the kernel's change
 * to the host, and only that change: classes another pass sets on the host are left alone.
 */
function setClassChange(host, rec, added, removed) {
  for (const c of rec.added) host.classList.remove(c);
  for (const c of rec.removed) host.classList.add(c);
  for (const c of added) host.classList.add(c);
  for (const c of removed) host.classList.remove(c);
  rec.added = added;
  rec.removed = removed;
}

/** Put the exported drawing back, with the class list it was drawn with. */
function restore(host, body, rec) {
  body.replaceChildren(...rec.nodes);
  if (rec.drops == null) body.removeAttribute('data-label-drops'); else body.setAttribute('data-label-drops', rec.drops);
  setClassChange(host, rec, [], []);
  rec.drawn = rec.key;
}

/** Parse the kernel's output into a detached template and return its chart body. The ONE markup sink here. */
function parseBody(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html; // the kernel's output, from escaped inputs (HARD RULE #22: sanctioned)
  return tpl.content.querySelector('.chart-body');
}

/**
 * Two drawings compared as the export's: render-scoped ids renumbered (two renders mint different ones),
 * the engine post-pass's accessible-name ids dropped (the runtime names a redrawn SVG itself), and each
 * note's content left out (a redraw moves the exported note node in; the kernel only drew a placeholder).
 */
/** Each `<template class="chart-detail">`'s content emptied, by string search (no regex to backtrack on). */
function emptyDetailTemplates(html) {
  const OPEN = '<template class="chart-detail"';
  const CLOSE = '</template>';
  const parts = html.split(OPEN);
  return parts.map((part, i) => {
    if (i === 0) return part;
    const tagEnd = part.indexOf('>');
    const close = tagEnd < 0 ? -1 : part.indexOf(CLOSE, tagEnd);
    return close < 0 ? OPEN + part : OPEN + part.slice(0, tagEnd + 1) + part.slice(close);
  }).join('');
}

function comparable(html) {
  let h = html.replace(/ aria-(labelledby|describedby)="[^"]*"/g, '').replace(/<(title|desc) id="[^"]*">/g, '<$1>');
  h = emptyDetailTemplates(h);
  const ids = [...new Set([...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]))];
  for (const id of [...ids].sort((a, b) => b.length - a.length)) h = h.split(id).join(`ID${ids.indexOf(id)}_`);
  return h;
}

/** The attributes every kind writes its source to (chart-readers/<kind>.js read only these and the marks). */
const SOURCE_ATTRS = [
  'data-x', 'data-y', 'data-x-to', 'data-y-to', 'data-size-value', 'data-size-axis', 'data-range', 'data-raw', 'data-pack',
  'data-axis', 'data-x-axis', 'data-y-axis', 'data-series-name', 'data-dropped', 'data-layer', 'data-layer-size',
  'data-members', 'data-rows', 'data-target', 'data-floor', 'data-bands', 'data-cols', 'data-col-notes',
  'data-row-notes', 'data-cut-cols', 'data-cut-rows', 'data-name', 'data-index', 'data-dir', 'data-group',
  'data-unmatched-names', 'data-lane', 'data-window', 'data-today', 'data-min', 'data-max',
];
const SOURCE_SEL = SOURCE_ATTRS.map((a) => `[${a}]`).join(', ');

/**
 * What a drawing SAYS, box aside: its description, its marks' label=value and the marks its notes hang on,
 * sorted. Null when it says nothing a check can hold (no description and no valued mark: a roadmap), so a
 * pane of that kind keeps its exported drawing rather than pass an empty comparison (the checker's repro).
 */
function said(body) {
  const desc = body.querySelector('desc');
  const marks = [...body.querySelectorAll('[data-value]')].map((m) => `${m.getAttribute('data-label') || ''}=${m.getAttribute('data-value')}`).sort();
  // The source the partial-source kinds record (a word's weight, a band's range, a point's coordinates): a
  // pane's drawing differs from the whole slide's in geometry, but never in these (the checker's fuzz).
  const source = [...body.querySelectorAll(SOURCE_SEL)].map((m) => SOURCE_ATTRS.map((a) => m.getAttribute(a) ?? '').join('|')).sort();
  if (!desc?.textContent.trim() && !marks.length) return null;
  const notes = [...body.querySelectorAll('template.chart-detail[data-mark]')].map((t) => t.getAttribute('data-mark')).sort();
  return `${desc ? desc.textContent : ''}\n${marks.join('\n')}\n${notes.join(',')}\n${source.join('\n')}`;
}

/**
 * CHECK BEFORE TRUST. A reader rebuilds the source from the drawing, so a kernel change (a reworded
 * description, a new modifier) can make it read a list that is not the author's. Before a list is used,
 * it is drawn at the box the export drew for and must give the exported drawing back; otherwise the chart
 * keeps its exported drawing. This is test/unit/runtime/chart-readers.test.js's oracle, run on every deck
 * in the page. A whole-slide chart is compared byte for byte (the export drew it with the section's
 * orientation, and its aspect stamp or none). A pane's export canvas is not in the page, so a pane is
 * compared on what its drawing says: the description and every mark's label and value. Once per chart
 * and class list; the answer is kept on the record.
 */
function verified(rec, list, cls, scratch, pane) {
  if (rec.checked.has(cls)) return rec.checked.get(cls);
  let ok = false;
  const draw = (aspect) => {
    const out = transformChartSection(`<h2>.</h2>${list}`, cls, rec.orientation, undefined, null, aspect);
    return out?.transformed ? parseBody(out.html) : null;
  };
  if (pane) {
    const fresh = draw(undefined);
    const want = said(scratch);
    ok = !!fresh && want !== null && said(fresh) === want;
  } else {
    const want = comparable(scratch.innerHTML);
    for (const aspect of new Set([rec.aspect, undefined])) {
      const fresh = draw(aspect);
      if (fresh && comparable(fresh.innerHTML) === want) { ok = true; break; }
    }
  }
  rec.checked.set(cls, ok);
  return ok;
}

/** Redraw one chart host for its current box, or put its exported drawing back. Returns true on a change. */
function redraw(host) {
  const body = host.querySelector(':scope > .cell-stage > .chart-body, :scope > .chart-body');
  const kind = body && kindOf(host);
  const rec = kind && original.get(body);
  if (!rec) return false;
  if (printingCharts) return false;
  const target = keyFor(host, rec.shape);
  if (target.key === rec.drawn) return false;
  // REFUSE = KEEP THE EXPORTED DRAWING, even when an earlier box had redrawn it: a refusal never leaves
  // another box's drawing on screen.
  const keep = () => {
    rec.refused.add(target.key);
    if (rec.drawn === rec.key) return false;
    restore(host, body, rec);
    return true;
  };
  // A box this chart was refused for: judging again would rerun the kernel on every geometry pass, but the
  // exported drawing must still come back if another box's redraw is showing (the checker's repro).
  if (rec.refused.has(target.key)) return keep();
  if (target.key === rec.key) {
    // Back to the box the engine drew for: its own drawing, not a redraw of it.
    restore(host, body, rec);
    return true;
  }
  // Read from the EXPORTED drawing (kept in memory), not the current one: one source, however many redraws.
  // In an INERT document: a copy made in the live page would load an author's `<img>` again and re-run its
  // handlers on every redraw (the red team's repro: 18 firings after five rotations).
  const inert = document.implementation.createHTMLDocument('');
  const scratch = inert.createElement('div');
  scratch.append(...rec.nodes.map((n) => inert.importNode(n, true)));
  const list = READERS[kind](scratch);
  if (!list) return keep();
  // The classes the export drew with: the live list, less what an earlier redraw changed.
  const exportedCls = [...host.classList].filter((c) => c !== 'chart-frame' && !rec.added.includes(c)).concat(rec.removed);
  const cls = exportedCls.join(' ');
  const pane = host.tagName === 'LAT-PANE';
  if (!verified(rec, list, cls, scratch, pane)) return keep();
  // NOTHING THE EXPORT PRINTED GOES MISSING: every word of every label the exported drawing printed
  // (axis ticks aside) must print in the redraw, the kernel's own rule widened (bar.transform.js
  // `wouldShortenALabel`, "a shortened business-unit name is wrong data"). A narrow canvas drops and
  // shortens labels: a tower's 20% share, a waterfall's "Price", nine heatmap values (the owner's look at
  // the phone renders, and the measure behind it). So a canvas that loses one is widened, in steps, and the
  // labels shrink until they all print; if even the widest loses one, the chart keeps its exported drawing.
  const want = printed(scratch);
  let view = host.tagName === 'LAT-PANE' ? canvasFor(host, target) : target.canvas;
  if (view === null) return false; // not laid out yet: judge again on the next pass
  let out;
  let fresh;
  for (let step = 0; step < 5; step += 1) {
    out = transformChartSection(`<h2>.</h2>${list}`, cls, target.orientation, view, null, target.aspect);
    fresh = out?.transformed ? parseBody(out.html) : null;
    if (!fresh || !view || !lost(want, printed(fresh))) break;
    view = { w: snap(view.w * 1.25), h: snap(view.h * 1.25), fluid: true };
  }
  if (!fresh) return keep();
  if (lost(want, printed(fresh))) return keep();
  const outCls = String(out.cls || cls).trim().split(/\s+/).filter((c) => c && c !== 'chart-frame');
  const added = outCls.filter((c) => !exportedCls.includes(c));
  const removed = exportedCls.filter((c) => !outCls.includes(c));
  // A PANE keeps its exported drawing when the kernel would change its class list: the styles a class
  // change selects (roadmap's `horizons` cards) are scoped to a slide, not a pane, so a pane redrew as
  // unstyled cards (the checker's repro).
  if (pane && (added.length || removed.length)) return keep();
  // Notes: the exported template NODES, moved in by mark, never re-serialized.
  for (const t of fresh.querySelectorAll('template.chart-detail[data-mark]')) {
    const was = scratch.querySelector(`template.chart-detail[data-mark="${t.getAttribute('data-mark')}"]`);
    if (was) t.replaceWith(was);
  }
  body.replaceChildren(...fresh.childNodes);
  const drops = fresh.getAttribute('data-label-drops');
  if (drops == null) body.removeAttribute('data-label-drops'); else body.setAttribute('data-label-drops', drops);
  setClassChange(host, rec, added, removed);
  nameSvgs(body);
  rec.drawn = target.key;
  return true;
}

const HOSTS = 'section.chart-frame[data-lattice-slide], lat-pane.chart-frame';

/** Every host snapshotted, for print: print restores the exported drawings and judges again after. */
const hosts = [];

/** Snapshot every chart a reader can redraw. */
function snapshotCharts(root) {
  for (const host of root.querySelectorAll(HOSTS)) {
    // One chart that cannot be snapshotted must not stop the rest.
    try { snapshot(host); } catch { continue; }
    hosts.push(host);
  }
}

/**
 * PRINT lays the page out at the paper's width, but resizes nothing, so a chart redrawn for a phone
 * would print its tall drawing in a wide box. While printing, every chart shows its exported drawing;
 * after, each is judged again (lib/runtime/index.js wires both to beforeprint / afterprint).
 */
function printCharts(printing) {
  printingCharts = false;
  for (const host of hosts) {
    const body = host.querySelector(':scope > .cell-stage > .chart-body, :scope > .chart-body');
    const rec = body && original.get(body);
    if (!rec) continue;
    if (printing) {
      if (rec.drawn === rec.key) continue;
      restore(host, body, rec);
    } else {
      redraw(host);
    }
  }
  printingCharts = printing;
}

/** Redraw (or restore) every chart in a section whose box changed; returns the number changed. */
function redrawCharts(section) {
  const hosts = section.matches && section.matches(HOSTS) ? [section] : [];
  hosts.push(...section.querySelectorAll('lat-pane.chart-frame'));
  let n = 0;
  for (const host of hosts) {
    try { if (redraw(host)) n += 1; } catch { /* this chart keeps what it shows; the others still redraw */ }
  }
  return n;
}

module.exports = { snapshotCharts, redrawCharts, printCharts, READERS, readBar, keyFor, verified, comparable, bodyPx };
