/**
 * legend-html.js — a legend's `key` layout in the legend's OWN classes: the free-standing
 * `@legend{[…], key}` (lib/core/legend-key.js has the shared emitter and says why the two are split).
 * Design: engineering/decisions/2026-10-19-universal-legend.md § 6. The mark slot draws the mark
 * (legend-mark.js) and the text slot may carry a plate; lib/plugins/legend/legend.styles.css paints
 * both. No component draws this layout yet (Wave 0 has no caller); its tests pin the markup.
 */

const { keyHtml, colorAttr, esc } = require('./legend-key.js');
const { markHtml } = require('./legend-mark.js');

const OWN_CLASSES = Object.freeze({ list: 'legend legend--key', item: 'legend-label' });

/**
 * The text slot as HTML: bare by default, or on a plate. The plate is the pill's own markup, so the
 * pill's stylesheet draws it and a plate cannot drift from a pill (§ 4 rule 2).
 */
function textHtml(entry) {
  // Beside a mark the color is the MARK's, and the words stay body ink: a key reads its swatches,
  // not a row of colored words. A bare colored label has no mark to carry it, so its words do.
  if (!entry.plate) return `<span class="legend-text"${entry.mark ? '' : colorAttr(entry.color)}>${esc(entry.text)}</span>`;
  const size = entry.size ? ` data-size="${esc(entry.size)}"` : '';
  return `<span class="legend-text lat-pill" data-shape="${esc(entry.plate)}"${colorAttr(entry.color)}${size}>${esc(entry.text)}</span>`;
}

/** A whole legend in the `key` layout, in the legend's own classes. */
function legendHtml(legend, { ariaLabel = 'Key' } = {}) {
  return keyHtml(legend?.entries, {
    classes: OWN_CLASSES, ariaLabel, mark: (e) => markHtml(e.mark, { color: e.color }), text: textHtml,
  });
}

module.exports = { legendHtml, textHtml };
