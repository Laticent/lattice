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

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

/** A label as the author wrote it: an SVG `<text>` splits a wrapped label into `<tspan>` lines. */
function textOf(el) {
  const spans = el.querySelectorAll('tspan');
  const parts = spans.length ? [...spans].map((t) => t.textContent) : [el.textContent];
  return parts.map((p) => p.trim()).filter(Boolean).join(' ');
}

// ── Readers: a kind's source list, rebuilt from its rendered marks ─────────────────────────────

/**
 * BAR. Each `rect[data-mark]` carries its category (its label attribute), its value as written
 * (its value attribute) and, grouped, its series as `data-hue` (1-based, in key order). A one-series chart
 * is a flat list; a grouped one nests each category's series, named by the key. A category's note is
 * restored as a placeholder and swapped for the exported template node after the draw.
 */
function readBar(body) {
  // Read through `dataset`: this module only READS a mark's identity, never writes one (the mark-identity
  // census in tools/check-ownership.js lists the writers).
  const marks = [...body.querySelectorAll('rect[data-mark]')].filter((m) => m.dataset.value !== undefined);
  if (!marks.length) return null;
  const hues = [...new Set(marks.map((m) => m.dataset.hue || '1'))];
  const groups = new Map();
  for (const m of marks) {
    const i = m.dataset.mark;
    if (!groups.has(i)) groups.set(i, { label: m.dataset.label || '', values: new Map() });
    groups.get(i).values.set(m.dataset.hue || '1', m.dataset.value || '');
  }
  const note = (i) => (body.querySelector(`template.chart-detail[data-mark="${i}"]`) ? '<ul><li>.</li></ul>' : '');
  // One series when every category has one mark. NOT one hue: a diverging chart paints by sign
  // (hue 1 up, hue 2 down), and reading that as two series sent it hunting for a key it does not have.
  if ([...groups.values()].every((g) => g.values.size === 1)) {
    const items = [...groups].map(([i, g]) => `<li>${esc(g.label)} <code>${esc(g.values.values().next().value)}</code>${note(i)}</li>`);
    return `<ul>${items.join('')}</ul>`;
  }
  const names = [...body.querySelectorAll('text.chart-key-label')].map(textOf);
  if (names.length < hues.length) return null; // a series we cannot name: keep the exported drawing
  const order = hues.map(Number).sort((a, b) => a - b).map(String);
  const items = [...groups].map(([, g]) => {
    const series = order
      .filter((h) => g.values.has(h))
      .map((h) => `<li>${esc(names[Number(h) - 1])} <code>${esc(g.values.get(h))}</code></li>`);
    return `<li>${esc(g.label)}<ul>${series.join('')}</ul></li>`;
  });
  return `<ul>${items.join('')}</ul>`;
}

const READERS = { bar: readBar };

// ── Targets: the box a chart should be drawn for, now ─────────────────────────────────────────

/** Round a pane canvas so a resize redraws when the drawing would change, not on every pixel. */
const STEP = 20;
/** The narrowest canvas a redraw draws at, in chart units (a full 16:9 chart is 320). */
const MIN_W = 200;
/** A label the kernel shortened: an ellipsis inside an SVG text run. */
const ELLIPSIS = />[^<]*\u2026[^<]*</;
const snap = (n) => Math.max(STEP, Math.round(n / STEP) * STEP);

/**
 * The drawing inputs for a chart host right now: the slide's orientation and aspect, and for a pane
 * its canvas in slide chart units, the engine's own formula (lib/engine/index.js `paneView`: the pane's
 * box over the px one unit of a full-slide chart gets, 320×180 landscape, 320×300 portrait).
 */
function targetFor(host) {
  const section = host.closest('section[data-lattice-slide]') || host;
  const orientation = section.getAttribute('data-orientation') || undefined;
  const aspectAttr = section.getAttribute('data-aspect');
  const aspect = aspectAttr ? Math.round(Number(aspectAttr) * 4) / 4 : undefined;
  // The canvas: a pane's box, or a whole-slide chart's own body, in slide chart units. The engine
  // passes a canvas only for a pane; a redraw passes one for both, so a whole-slide chart's labels
  // follow the slide's type scale too (the orientation alone drew them at 10px on a phone).
  let paneView;
  const box = host.tagName === 'LAT-PANE' ? host : host.querySelector(':scope > .cell-stage > .chart-body, :scope > .chart-body');
  if (box) {
    const stage = section.querySelector(':scope > .cell-stage') || section;
    const view = orientation === 'portrait' ? { w: 320, h: 300 } : { w: 320, h: 180 };
    // The slide's TYPE scale too: a tall box sets its type larger (`--canvas-scale`, about 2 on a phone,
    // lib/adaptive/families.js `canvasScaleFor`), and a pane's labels print at the slide's size, so the
    // canvas is that much smaller in chart units. Without it the redrawn labels were 8px beside 17px text.
    const scale = Number.parseFloat(getComputedStyle(section).getPropertyValue('--canvas-scale')) || 1;
    const unit = Math.min(stage.clientWidth / view.w, stage.clientHeight / view.h) * scale;
    if (!(unit > 0)) return null;
    // At least MIN_W units across: at the slide's full type size a phone-wide pane is about 140 units,
    // and a four-category bar chart broke its labels mid-word there ("Licen ses"). Below the floor the
    // canvas grows to MIN_W and keeps the box's shape, so the labels shrink just enough to fit.
    const k = Math.max(1, MIN_W / (box.clientWidth / unit));
    paneView = { w: snap((box.clientWidth / unit) * k), h: snap((box.clientHeight / unit) * k) };
  }
  return { orientation, aspect, paneView, key: [orientation || '', aspect || '', paneView ? `${paneView.w}x${paneView.h}` : ''].join('|') };
}

// ── The redraw ───────────────────────────────────────────────────────────────────────────────

/** Per chart body: the exported drawing (nodes, in memory only) and the box it was drawn for. */
const original = new WeakMap();
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
  const target = targetFor(host);
  if (!target) return;
  original.set(body, { nodes: [...body.childNodes], drops: body.getAttribute('data-label-drops'), key: target.key, drawn: target.key });
}

/** Redraw one chart host for its current box, or put its exported drawing back. Returns true on a change. */
function redraw(host) {
  const body = host.querySelector(':scope > .cell-stage > .chart-body, :scope > .chart-body');
  const kind = body && kindOf(host);
  const rec = kind && original.get(body);
  if (!rec) return false;
  const target = targetFor(host);
  if (!target || target.key === rec.drawn) return false;
  if (target.key === rec.key) {
    // Back to the box the engine drew for: its own drawing, not a redraw of it.
    body.replaceChildren(...rec.nodes);
    if (rec.drops == null) body.removeAttribute('data-label-drops'); else body.setAttribute('data-label-drops', rec.drops);
    rec.drawn = target.key;
    return true;
  }
  // Read from the EXPORTED drawing (kept in memory), not the current one: one source, however many redraws.
  const scratch = document.createElement('div');
  scratch.append(...rec.nodes.map((n) => n.cloneNode(true)));
  const list = READERS[kind](scratch);
  if (!list) return false;
  const cls = [...host.classList].filter((c) => c !== 'chart-frame').join(' ');
  // NEVER LOSE A NAME the exported drawing printed in full: the kernel's own rule (bar.transform.js
  // `wouldShortenALabel`, "a shortened business-unit name is wrong data"). A canvas narrow enough to
  // shorten one is widened, in steps, so the labels shrink until the names fit.
  const shortened = (html) => ELLIPSIS.test(html);
  const exportedShort = shortened(scratch.innerHTML);
  let view = target.paneView;
  let out;
  for (let step = 0; step < 4; step += 1) {
    out = transformChartSection(`<h2>.</h2>${list}`, cls, target.orientation, view, null, target.aspect);
    if (!out || !out.transformed || !view || exportedShort || !shortened(out.html)) break;
    view = { w: snap(view.w * 1.25), h: snap(view.h * 1.25) };
  }
  if (!out || !out.transformed) return false;
  const tpl = document.createElement('template');
  tpl.innerHTML = out.html; // the kernel's output, from escaped inputs (HARD RULE #22: sanctioned)
  const fresh = tpl.content.querySelector('.chart-body');
  if (!fresh) return false;
  // Notes: the exported template NODES, moved in by mark, never re-serialized.
  for (const t of fresh.querySelectorAll('template.chart-detail[data-mark]')) {
    const was = scratch.querySelector(`template.chart-detail[data-mark="${t.getAttribute('data-mark')}"]`);
    if (was) t.replaceWith(was);
  }
  body.replaceChildren(...fresh.childNodes);
  const drops = fresh.getAttribute('data-label-drops');
  if (drops == null) body.removeAttribute('data-label-drops'); else body.setAttribute('data-label-drops', drops);
  nameSvgs(body);
  rec.drawn = target.key;
  return true;
}

const HOSTS = 'section.chart-frame[data-lattice-slide], lat-pane.chart-frame';

/** Snapshot every chart a reader can redraw. */
function snapshotCharts(root) {
  for (const host of root.querySelectorAll(HOSTS)) snapshot(host);
}

/** Redraw (or restore) every chart in a section whose box changed; returns the number changed. */
function redrawCharts(section) {
  const hosts = section.matches && section.matches(HOSTS) ? [section] : [];
  hosts.push(...section.querySelectorAll('lat-pane.chart-frame'));
  let n = 0;
  for (const host of hosts) if (redraw(host)) n += 1;
  return n;
}

module.exports = { snapshotCharts, redrawCharts, READERS, readBar, targetFor };
