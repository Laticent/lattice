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
 *   ctx    — { cls, classTokens, orientation, aspect, paneView, pluginsOff, textScale, metaLines }. `paneView` is set only
 *            for a chart in a pane: its box in slide chart units (cartesian `viewFor`). `orientation` is the deck-wide stamp
 *            ('portrait' | 'square' | undefined for landscape) read off the section's `data-orientation`.
 *            `textScale` is the venue's chart-text factor (lib/transformers/chart-text-venue.js `chartTextScale`, 1 at laptop):
 *            a kind draws on a canvas that many times smaller in user units, its text the same size in them, so its
 *            labels hold their printed size as the venue grows (cartesian `viewFor`, svg-legend `fitKeyToPane`).
 *   return — the rewritten section HTML; `{ html, cls }` when the kind also changes the section's class list
 *            (roadmap selects `horizons` on a portrait deck); null to decline, which leaves the author's list.
 */

const registry = require('./shared/chart-registry.generated');

const { LAYOUTS, FIGURE_CLASSES, KERNELS, PLUGIN } = registry;
const { collectLabelDrops, encodeLabelDrops } = require('./shared/label-drops');
const { chartBoxAspect, BOX_FILL } = require('./shared/chart-box');
// Straight from core (a sanctioned edge, tools/structure.sanctioned.json): the dispatch is in the engine bundle, and
// reaching it through ./shared/cartesian pulled all of cartesian.js out of the lazy chart kernels into startup.
const { trialIds } = require('../../core/render-ids');

/**
 * Draw one section with `kind`, bracketing the label-drop record around the whole drawing: every mechanism that
 * declines to paint a name (`placeLabels`' hide-overlap, the category gap-cull) runs somewhere under this call,
 * so opening the record here catches all of them and any future one without a second wiring point.
 *
 * @returns {{ built: string|{html: string, cls: string}|null, drops: string }} `drops` is the encoded record for
 *   the host's `data-label-drops` attribute, '' when nothing was dropped.
 */
function run(kind, html, ctx) {
  const draw = () => KERNELS[kind].transformSection(html, ctx);
  // THE TEXT LADDER (./shared/chart-roles.js): a whole-slide chart on a 1080-wide page (portrait, square, story,
  // mobile) is read on a phone, so its text roles take the ladder's sizes. The chart draws once in a trial to learn
  // the page px one of its units prints at, then with the roles at that scale, then once more at the scale the
  // roled drawing prints at; the drawing carries the sizes to the stylesheet. Elsewhere it draws as before.
  // THE PHONE PAGE (./shared/chart-phone.js): a whole-slide chart on a 1080-wide page (portrait, square, story,
  // mobile) is read on a phone, so its text roles take the ladder's sizes and a kind on the chart form kernel draws
  // in its own box. That code loads with the kernels (the registry's `PHONE`), so it is read when the call is made.
  if (ctx && !ctx.paneView && ctx.aspect > 0 && ctx.aspect <= 1 && registry.PHONE) {
    const phone = registry.PHONE.drawPhone(kind, html, ctx, draw, { FORM_KINDS: registry.FORM_KINDS, FORM_HERO_KINDS: registry.FORM_HERO_KINDS, trialIds });
    if (phone) return phone;
  }
  const { value: built, drops } = collectLabelDrops(draw);
  return { built, drops: drops.length ? encodeLabelDrops(drops) : '' };
}

/**
 * The width over height of the box a portrait chart is scored in at a slide's `aspect`: the measured chart box
 * (shared/chart-box.js `chartBoxAspect`) with the tall canvas's margin taken off its height (`BOX_FILL`), the room a
 * subtitle takes. The chart frame scores a drawing in it (lib/transformers/chart-frame.js `printsAsLarge`) without
 * reaching into this plugin's folder.
 * @param {number} aspect  the slide's width over height
 */
function boxAspect(aspect) {
  return chartBoxAspect(aspect) / BOX_FILL;
}

module.exports = {
  boxAspect,
  CHART_LAYOUTS: LAYOUTS,
  CHART_PLUGIN: PLUGIN,
  FIGURE_CLASSES,
  KERNELS,
  run,
};
