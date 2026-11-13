/**
 * component-chrome.js — a component's own default for a chrome band, as the band's switch.
 *
 * A manifest's `chrome` field (lib/components/manifest.schema.json) says which bands a component's
 * slides drop by default. The rule that sets each answer is one sentence: a band stays on a slide
 * unless the slide already does that band's job (engineering/decisions/2026-11-08-anchor-chrome.md).
 * The title names the deck, so it drops the running header; the footer is the deck's standing note
 * (a "Confidential", a copyright), which no slide does for it, so no component drops it.
 *
 * The page number has its own reader (lib/core/pagination.js), because the engine counts it. Every
 * other band is answered HERE by stamping the band's existing switch, `no-<band>`, on the slide, so
 * the stylesheets and every reader see one mechanism. The author keeps the last word: a slide that
 * carries `with-<band>` is left alone, and switchSettle (lib/integrations/markdown-it/plugins.js)
 * runs after this, as the runtime's settle does, so the precedence stays `with-X` > `no-X`.
 *
 * Pure and fs-free; shared by plugins.js (`componentSpectrum`'s pass) and runtime/index.js (HARD
 * RULE #1).
 */

const { NO_HEADER } = require('../packages/chrome.generated.js');

const OFF = Object.freeze({ header: new Set(NO_HEADER) });

/**
 * The slide's class list with its component's chrome defaults stamped as `no-<band>`, or the same
 * array when there is nothing to add (the common case).
 */
function applyComponentChrome(cur) {
  // ANY token of the slide, exactly as lib/core/pagination.js reads `NO_PAGINATION`, so the page number
  // and the header can never disagree about which component a slide is (`image title` drops both).
  let next = cur;
  for (const [band, set] of Object.entries(OFF)) {
    if (!cur.some((c) => set.has(c))) continue;
    if (next.includes(`with-${band}`) || next.includes(`no-${band}`)) continue;
    next = [...next, `no-${band}`];
  }
  return next;
}

module.exports = { applyComponentChrome };
