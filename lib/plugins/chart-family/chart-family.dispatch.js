/**
 * The chart family's dispatch role: the table of chart kinds the host draws with, and the label-drop record a
 * kind's drawing writes.
 *
 * WHAT IS HERE, AND WHAT IS NOT. The host (lib/transformers/chart-frame.js) owns everything common to every chart:
 * the section walk, the record bridging, the chart-frame wrap (eyebrow, h2, subtitle, body, caption), the
 * idempotence guard and the kinds a render could not draw yet. This file holds only what is the plugin's own:
 * which kinds exist (each kind's manifest declares its `kernel` block, `tools/build-chart-registry.js` freezes
 * them into ./shared/chart-registry.generated.js) and the label-drop channel, the plugin's record of every label
 * its drawing declined to paint (./shared/label-drops.js). See
 * engineering/decisions/2026-11-02-slide-facts-for-kinds.md §4, §5.
 *
 * THE KIND CONTRACT:
 *
 *   transformSection(html, ctx) -> html | { html, cls } | null
 *
 *   html   — the section's inner HTML. The kind splices its figure in and returns the whole section.
 *   ctx    — { cls, classTokens, orientation, aspect, paneView, pluginsOff, textScale }. `paneView` is set only for a
 *            chart in a pane: its box in slide chart units (cartesian `viewFor`). `orientation` is the deck-wide stamp
 *            ('portrait' | 'square' | undefined for landscape) read off the section's `data-orientation`.
 *            `textScale` is the venue's chart-text factor (lib/transformers/chart-text-venue.js `chartTextScale`, 1 at laptop):
 *            a kind draws on a canvas that many times smaller in user units, its text the same size in them, so its
 *            labels hold their printed size as the venue grows (cartesian `viewFor`, svg-legend `fitKeyToPane`).
 *   return — the rewritten section HTML; `{ html, cls }` when the kind also changes the section's class list
 *            (roadmap selects `horizons` on a portrait deck); null to decline, which leaves the author's list.
 */

const { LAYOUTS, FIGURE_CLASSES, KERNELS, PLUGIN } = require('./shared/chart-registry.generated');
const { collectLabelDrops, encodeLabelDrops } = require('./shared/label-drops');

/**
 * Draw one section with `kind`, bracketing the label-drop record around the whole drawing: every mechanism that
 * declines to paint a name (`placeLabels`' hide-overlap, the category gap-cull) runs somewhere under this call,
 * so opening the record here catches all of them and any future one without a second wiring point.
 *
 * @returns {{ built: string|{html: string, cls: string}|null, drops: string }} `drops` is the encoded record for
 *   the host's `data-label-drops` attribute, '' when nothing was dropped.
 */
const { tallCanvasH } = require('./shared/chart-box');

function run(kind, html, ctx) {
  const { value: built, drops } = collectLabelDrops(() => KERNELS[kind].transformSection(html, ctx));
  return { built, drops: drops.length ? encodeLabelDrops(drops) : '' };
}

/**
 * The height over width of the tall portrait canvas at a slide's `aspect` (shared/chart-box.js `tallCanvasH`), so the
 * chart frame can tell whether a drawing kept that shape (lib/transformers/chart-frame.js `keepsTallShape`) without
 * reaching into this plugin's folder.
 * @param {number} aspect  the slide's width over height
 */
function tallShape(aspect) {
  return tallCanvasH(1000, aspect, 0) / 1000;
}

module.exports = {
  tallShape,
  CHART_LAYOUTS: LAYOUTS,
  CHART_PLUGIN: PLUGIN,
  FIGURE_CLASSES,
  KERNELS,
  run,
};
