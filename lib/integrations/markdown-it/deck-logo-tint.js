/**
 * lib/integrations/markdown-it/deck-logo-tint.js — the per-slide logo tint filter and the inline style
 * that points a slide's mark at it. Shared by the engine (plugins.js) and the runtime; a module of its
 * own so the runtime does not bundle all of plugins.js to get it (docs/route-budget.json `engineJsGz`).
 */

const deckLogoTintId = (index) => `deck-logo-tint-${index}`;

/** The zero-size `<svg>` holding a slide's tint filter: flood with the slide's `--logo-tint`
 *  (set by its `logo-<color>` class, which this svg inherits as `color`), keep only the mark's
 *  own alpha. Absolute, so it adds no flow or grid item. */
function deckLogoTintSvg(index) {
  return `<svg class="deck-logo-tint" width="0" height="0" aria-hidden="true" focusable="false"><filter id="${deckLogoTintId(index)}" color-interpolation-filters="sRGB"><feFlood flood-color="currentColor"/><feComposite in2="SourceAlpha" operator="in"/></filter></svg>`;
}

/** The inline style that points a tinted slide's mark at its own filter. Inline, so it beats the
 *  dark-canvas flip the canvas rules set on the same custom properties. */
const deckLogoTintVars = (index) => `--deck-logo-filter:url(#${deckLogoTintId(index)});--deck-logo-opacity:1;`;

module.exports = { deckLogoTintId, deckLogoTintSvg, deckLogoTintVars };
