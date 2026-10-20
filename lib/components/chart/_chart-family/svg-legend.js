/**
 * svg-legend.js — the shared metrics, spine and pane fit behind the chart family's SVG-native
 * key. The key itself is drawn by the legend's SVG emitter, `keySvg` in ./legend-svg-key.js (universal
 * legend Wave 2, engineering/decisions/2026-10-19-universal-legend.md § 10 and § 17); this module
 * keeps what the key shares with the rest of the family: the font ratio and spine metrics below,
 * the spine, the label wrap and `fitKeyToPane`.
 *
 * Why a shared module (not three copies): the whole point of going SVG-native is
 * that diagram + spine + key live in ONE viewBox and scale as one unit. For the
 * four charts to read as ONE FAMILY (identical key size, swatch, divider, row
 * rhythm) they must emit the SAME geometry — so it lives here once and each
 * kernel calls it. It is the SVG successor to the pure-CSS 70/30 rail that
 * chart-family.css (now chart-family.styles.css) used to key on the figure/legend classes.
 *
 * Pure JS — no DOM, no font metrics — so it runs identically on both render
 * paths (HARD RULE 1): the emulator build and the vscode-preview runtime both
 * bundle this module from the same source.
 *
 * THE FAMILY RULE — font size is a RATIO of the diagram height, never a constant.
 * Each chart's diagram has its own viewBox height (pie 200, radar 300, quadrant
 * 320, map varies). When a figure is sized to fit the body, its viewBox HEIGHT
 * maps to the body height, so a taller viewBox scales DOWN more. A constant key
 * font in user units would therefore render PHYSICALLY SMALLER on radar than on
 * pie. Pinning the font to a fixed fraction of the diagram height
 * (`FS = 0.045 · height`, i.e. pie's tuned FS=9 at height 200) makes the key the
 * same physical size on all four. Every other metric (gaps, swatch, rail width)
 * is then a ratio of that font, so the rail proportion is constant too.
 *
 * See engineering/decisions/2026-06-13-svg-native-legend.md (§2, §4a, §3).
 */

// ── Family constants ────────────────────────────────────────────────────────
// FS is a fraction of the diagram viewBox height (the family rule above); every
// other metric is a ratio of FS. The anchors are the piechart spike's tuned
// values (FS=9 at height 200), so the family inherits the look the pie shipped.
const { nextRenderSeq, renderIdPrefix } = require('../../../core/render-ids');

const FS_OF_HEIGHT = 9 / 200;     // 0.045 — legend font as a fraction of height
const GAP_R = 32 / 9;             // divider gap, each side of the spine / FS
const SPINE_H_R = 0.78;           // spine height / viewH
const SPINE_W_R = 1.6 / 9;        // spine width / FS (pie spineW 1.6 at FS 9)

// Shared unique-id counter for the spine gradient — unique per chart instance so
// two keyed charts on one slide don't collide (the SVG duplicate-id trap). Both
// render paths bundle this module and process charts in the same order, so the
// ids match for the parity tier. Sibling: PIE_GRAD_SEQ, below.

/**
 * THE SPINE — the accent rule that separates a diagram from its key.
 *
 * SVG mirror of the retired CSS `--chart-spine`: an accent fade transparent at
 * both ends so it melts into the canvas (a rule, not a hard divider). SVG fill
 * cannot take a CSS gradient var, hence inline stops.
 *
 * Three callers, one geometry: the landscape key (vertical, beside the diagram),
 * the portrait key (the same rule rotated 90°, between diagram and key), and
 * word-cloud's size key (vertical, like landscape). `axis` picks which way the
 * gradient runs; `x`/`y` are the rule's CENTER, `length` its long edge.
 *
 * Extracted when word-cloud's key converted to SVG — a third inline copy of the
 * same five gradient stops is how a family stops looking like one family.
 */
function buildSpine({ axis = 'vertical', x, y, length, thickness }) {
  const id = `${renderIdPrefix()}chart-spine-${nextRenderSeq('chart-spine')}`;
  const vertical = axis === 'vertical';
  const [x2, y2] = vertical ? [0, 1] : [1, 0];
  const defs =
    `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">` +
      `<stop offset="0%" style="stop-color:transparent"/>` +
      `<stop offset="14%" style="stop-color:color-mix(in oklab, var(--accent) 32%, transparent)"/>` +
      `<stop offset="50%" style="stop-color:color-mix(in oklab, var(--accent) 60%, transparent)"/>` +
      `<stop offset="86%" style="stop-color:color-mix(in oklab, var(--accent) 32%, transparent)"/>` +
      `<stop offset="100%" style="stop-color:transparent"/></linearGradient>`;
  const w = vertical ? thickness : length;
  const h = vertical ? length : thickness;
  const rect =
    `<rect x="${(x - w / 2).toFixed(2)}" y="${(y - h / 2).toFixed(2)}" ` +
      `width="${w.toFixed(2)}" height="${h.toFixed(2)}" rx="${(thickness / 2).toFixed(2)}" ` +
      `fill="url(#${id})"/>`;
  return { defs, rect };
}

function xmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Strip any HTML tags BEFORE wrapping/escaping, so a label counts by its visible
// length and can never be cut mid-tag nor break the SVG. (Mirror of
// the old chart-family.js svgText — kept local so this module is self-contained.)
function stripTags(s) {
  return String(s == null ? '' : s).replace(/<[^>]*>/g, '');
}

// Word-wrap a legend label to a character budget — FULLY, never clipping and
// never ellipsizing (the original HTML key's "labels wrap, no clip — if users go
// crazy" guarantee). The SVG-native key keeps the promise because more lines just
// grow the unit HEIGHT (which scales the whole unit down), never overflow. A
// single over-long token hard-breaks across lines (matching CSS overflow-wrap).
// See engineering/decisions/2026-06-13-svg-native-legend.md §4(a).
function wrapLabelToLines(label, maxChars) {
  const words = String(label).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let cur = '';
  const flush = () => { if (cur) { lines.push(cur); cur = ''; } };
  for (let word of words) {
    while (word.length > maxChars) {
      flush();
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    const trial = cur ? `${cur} ${word}` : word;
    if (trial.length <= maxChars) cur = trial;
    else { flush(); cur = word; }
  }
  flush();
  return lines.length ? lines : [''];
}

// The key's text in a PANE should print at the size a full-slide keyed chart prints it — the
// diagram is what gives. `paneView` is the pane in cartesian chart units (cartesian.js
// `viewFor`), where a full slide's category label is 7.5 units; a full-slide key's 9 units at
// its own (slightly smaller) scale print at ~8 of them, so that is the target.
const PANE_KEY_TEXT = 8;

/**
 * Build a keyed chart's legend for a PANE: the key beside or below the diagram, with its type
 * scaled up toward slide size when that really makes the printed text larger. `build(orientation,
 * fontScale)` is the kernel's own `keySvg` call. Without a `paneView` (every ordinary
 * slide) it is exactly that call at `fontScale` 1, in the deck's own orientation.
 *
 * Every candidate is scored by what PRINTS once the unit is fitted into the pane: the key's
 * text and the diagram, both in pane units. A bigger `fontScale` also makes the key wider, so
 * where the pane's width binds, the printed text stays the same size while the diagram shrinks;
 * the fixed-point pass alone would climb to its cap there. So the pick is: the largest printed
 * text among candidates that keep at least 75% of the unscaled diagram, and within 5% of that
 * text, the largest diagram. The unscaled key in the deck's own orientation is always a
 * candidate, so a pane never prints smaller text AND a smaller diagram than it did before.
 *
 * A chart whose DIAGRAM carries text too (radar's rim labels) passes `labelText`, and its
 * `build` then reads `fontScale` as the scale of that text, keeping the key at least as large:
 * the score is the smaller of the two printed sizes, and `ceiling` stops it at the size the
 * chart prints on a slide. The pie, map and quadrant pass neither and are scored as before.
 *
 * @param {Function} build   `(orientation, fontScale) => unit`, the unit's `viewW`/`viewH` fitted.
 * @param {object}   o
 * @param {number}   [o.labelText] the diagram's smallest text at `fontScale` 1, in unit coordinates.
 * @param {number}   [o.ceiling]   the most a candidate's printed text scores, in pane units.
 * @returns {{ key: object, orientation: string|undefined, fontScale: number }}
 */
function fitKeyToPane(build, {
  orientation, paneView, diagramHeight, orientations = [undefined, 'portrait'], labelText, ceiling,
} = {}) {
  if (!paneView) return { key: build(orientation, 1), orientation, fontScale: 1 };
  const fit = (key) => Math.min(paneView.w / key.viewW, paneView.h / key.viewH);
  // The unit's smallest text per unit of `fontScale`, in its own units. A chart whose diagram
  // carries text of its own (radar's rim labels) passes it as `labelText`, and `build` scales
  // that text with the key: the score is then whichever of the two prints smaller, so the pick
  // cannot grow the key by shrinking the labels the chart is read by. `ceiling` caps what a
  // larger type scores (the size the chart prints on a slide): past it, larger type only costs
  // diagram. Both absent: the key alone, uncapped, as the pie, map and quadrant use it.
  const textPerScale = Math.min(FS_OF_HEIGHT * diagramHeight, labelText ?? Infinity);
  const target = ceiling ?? PANE_KEY_TEXT;
  const score = (key, o, m) => {
    const s = fit(key);
    const text = textPerScale * m * s;
    return { key, orientation: o, fontScale: m, text: ceiling == null ? text : Math.min(text, ceiling), diagram: diagramHeight * s };
  };
  const base = score(build(orientation, 1), orientation, 1);
  const cands = [base];
  for (const o of orientations) {
    // A fixed ladder of type sizes as well as the fixed-point steps below: the steps can jump
    // straight past the sizes that keep the diagram above its floor (measured: a 35% pie pane
    // went from 1 to 2.2 and dropped every size in between, so the tiny unscaled key won).
    for (const m of [1.25, 1.5, 1.75, 2, 2.5]) cands.push(score(build(o, m), o, m));
    let m = 1;
    let key = build(o, m);
    cands.push(score(key, o, m));
    // The pane's scale depends on the unit's size, which depends on the key's type: a few
    // passes converge (each moves m by the ratio still missing). Every step is a candidate.
    for (let pass = 0; pass < 4; pass++) {
      const next = Math.min(3, Math.max(1, target / (textPerScale * fit(key))));
      if (Math.abs(next - m) < 0.02) break;
      m = next;
      key = build(o, m);
      cands.push(score(key, o, m));
    }
  }
  const kept = cands.filter((c) => c.diagram >= base.diagram * 0.75);
  const bestText = Math.max(...kept.map((c) => c.text));
  const best = kept.filter((c) => c.text >= bestText * 0.95).reduce((a, c) => (c.diagram > a.diagram ? c : a));
  return { key: best.key, orientation: best.orientation, fontScale: best.fontScale };
}

module.exports = {
  fitKeyToPane, buildSpine, wrapLabelToLines, stripTags, xmlEsc,
  FS_OF_HEIGHT, GAP_R, SPINE_W_R, SPINE_H_R,
};
