/**
 * lib/core/pagination.js — whether a slide shows its page number, decided in ONE place.
 *
 * The owner's rulings of 2026-10-20: front matter `paginate:` numbers the deck and is on by default; one slide opts
 * out with the `no-pagination` class and back in with `with-pagination`; `silent` drops it with the rest of the
 * chrome; a component opts its slides out in its manifest (`"chrome": { "pagination": false }`, compiled to
 * lib/packages/chrome.generated.js). A `paginate` slide comment is ignored. Read by the engine (lib/engine/slides.js),
 * Export to Marp (lib/core/marp-bundle-scope.js) and the deck lint (lib/authoring/lint-core.js), so the three cannot
 * disagree. The value rule (`paginateOn`) lives in meta-keys.mjs, where the docs editor imports it as ESM.
 */
const { paginateOn } = require('./meta-keys.js');
const { NO_PAGINATION } = require('../packages/chrome.generated.js');

const NO_PAGINATION_SET = new Set(NO_PAGINATION);

/** `classes`: the slide's class tokens. `deckOn`: the deck's setting, already read with `paginateOn`. */
function slidePaginates(classes, deckOn) {
  if (classes.includes('no-pagination')) return false;
  if (classes.includes('with-pagination')) return true;
  if (classes.includes('silent')) return false;
  if (classes.some((c) => NO_PAGINATION_SET.has(c))) return false;
  return deckOn;
}

module.exports = { paginateOn, slidePaginates, NO_PAGINATION };
