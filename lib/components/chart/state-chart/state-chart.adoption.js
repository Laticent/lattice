/**
 * Does this deck actually need a layout engine?
 *
 * WHY THIS EXISTS. dagre reaches the state chart's pass through `globalThis.__latticeDagre`,
 * and the CLI export installs that global by prepending a 62 KiB IIFE to the bootstrap
 * script (lattice-emulator.js). A machine that is a CHAIN never uses it: Trama's kernel lays
 * a chain out on its reading-order grid, with no dagre at all (the kernel's `wrap`
 * candidate; engineering/decisions/2026-09-27-trama-graph-chart-library.md §4). Most shipped
 * machines are chains, so gating the engine on the component alone shipped it for nothing.
 *
 * ONE PREDICATE, NOT TWO. The question is asked of exactly what the browser will lay out:
 * the figure's model, sanitized and given its markers by the state chart's own adapter
 * (`sanitize`, `kernelModel` in state-chart.layout.js), then Trama's `isChain` on the same
 * kernel the drawing uses. Before v2 this module restated the pass's adoption rule and ran
 * dagre's ranker in Node to agree with it; now there is nothing to agree, because both
 * sides call the same code.
 *
 * WHICH DIRECTION IS SAFE. A false POSITIVE ships an engine that goes unused (about 22 KiB
 * gzipped). A false NEGATIVE draws a branching machine on the grid instead of dagre's
 * layout, with no error. So every unreadable figure answers TRUE.
 *
 * NODE ONLY. Nothing in the browser bundles reaches this file.
 */
const { graphLayoutKernel } = require('@laticent/trama');
const { stateChartAdapter } = require('./state-chart.layout');

/**
 * True when dagre would lay out this machine (a sanitized model, as the adapter reads it):
 * anything that is not a chain, anything with a composite state, and a chain the grid
 * alone cannot draw cleanly.
 */
function machineBranches(model) {
  const A = stateChartAdapter();
  const K = graphLayoutKernel();
  const km = A.kernelModel(model);
  if (!K.isChain(km)) return true;
  // A CHAIN DENSE WITH SKIPS can defeat every grid, and without dagre the kernel has no
  // other candidate: it draws lines through the states. So lay the chain out here, on the
  // grid alone, with sizes estimated from the text (the browser measures the real ones),
  // and ship dagre when the grid has a hard fault. The estimate errs large on purpose: a
  // false positive costs 22 KiB, a false negative a broken picture.
  const sizes = Object.create(null);
  for (const s of km.shapes) {
    sizes[s.id] = s.shape === 'start' ? { w: 14, h: 14, kind: 'start' }
      : s.shape === 'end' ? { w: 20, h: 20, kind: 'end' }
        : { w: 44 + 10 * String(s.name || '').length, h: 44, kind: s.shape || 'box' };
  }
  const labelSizes = Object.create(null);
  km.edges.forEach((e, i) => { if (e.label) labelSizes[i] = { w: 12 + 8 * String(e.label).length, h: 16 }; });
  const geo = K.layout(km, sizes, { wrap: true, labelSizes, stage: { w: 1152, h: 480 } }, null);
  if (!geo) return true;
  const q = geo.quality || {};
  return ['linesThroughShapes', 'linesThroughEnds', 'shapeOverlaps', 'labelsOffLine'].some((k) => (q[k] || 0) > 0);
}

// `escAttr` in the transform escapes exactly these five, so this reverses it. `&amp;` goes
// LAST, or it would re-expand the entities the others just produced.
const unescAttr = (s) => String(s)
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

/**
 * Every drawn figure's model, read back off our OWN emitted markup: the transform
 * (`buildDefault`) is the one producer of the attribute this matches. The `inline` variant
 * carries no model and is never drawn.
 */
function figureModels(html) {
  const out = [];
  const re = /<div class="state-chart-figure"[^>]*\sdata-sc-model="([^"]*)"/g;
  for (let m = re.exec(html); m; m = re.exec(html)) out.push(m[1]);
  return out;
}

/** One figure's attribute value: does it need dagre? */
function figureNeedsDagre(raw) {
  const A = stateChartAdapter();
  let model;
  try { model = A.sanitize(JSON.parse(unescAttr(raw))); } catch (_e) { return true; }
  if (!model?.shapes.length) return true;
  try { return machineBranches(model); } catch (_e) { return true; }
}

/**
 * True when any state chart in this rendered HTML needs dagre, i.e. when the export owes
 * the engine.
 *
 * @param {string|string[]} html  a rendered slide, or the slide array
 */
function htmlNeedsDagre(html) {
  const src = Array.isArray(html) ? html.join('\n') : String(html || '');
  if (!src.includes('state-chart-figure')) return false;
  return figureModels(src).some(figureNeedsDagre);
}

module.exports = { htmlNeedsDagre, figureNeedsDagre, figureModels, machineBranches };
