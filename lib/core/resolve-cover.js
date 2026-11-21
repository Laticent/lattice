/**
 * lib/core/resolve-cover.js
 *
 * The deck front-matter `cover:` register sets the SURFACE of the deck's front and back cover:
 * the `title` slide and the `closing` slide. One axis today, one word:
 *
 *   cover: inverse   → (no token)    the dark inverse panel, today's look and the default
 *   cover: light     → `cover-light` the deck's light canvas, with light-canvas inks
 *
 * WHY A REGISTER OF ITS OWN, and not the `light` mood token. `title light` already has a
 * decided, test-pinned meaning: `light` sets a scheme and paints nothing, so a bookend keeps its
 * inverse panel (base.finish.css, the `light is NOT an exclusion` note;
 * test/integration/invariants/finish-canvas-matrix.test.js; the HTML player's
 * `BOOKEND_FORCES_DARK`). Repainting under that word would move every deck that already writes
 * it. `cover-light` is a fresh token nothing else reads, so the old meaning stays put.
 *
 * WHY NOT `bookends:`. That word is the narration feature's (lib/core/resolve-bookends.mjs), and
 * `divider light` is a different layout with its own bright variant. So `cover:` reaches title and
 * closing only; dividers and `topic` keep their own surfaces.
 *
 * SCOPED to the two cover layouts, the way `image-card:` is scoped to `image`
 * (lib/core/resolve-image-card.js): the deck's word rides only a slide whose own class list
 * names `title` or `closing`, and `coverDeckTokens` is the one place that decides it, for both
 * render paths (HARD RULE #1). On any other slide the class would paint nothing, because the CSS
 * keys on `:is(.title, .closing)` too, so this keeps the class lists honest rather than guarding a
 * render.
 *
 * `inverse` stamps `cover-inverse` only on a SLIDE: it is how one cover opts out of a deck-wide
 * `cover: light` (`_class: closing cover-inverse`). A deck `cover: inverse` stamps nothing, the same
 * as leaving the key out, so every existing deck renders byte-identical.
 *
 * Built on the axis-register factory (lib/core/register-factory.js), so a second axis (the cover
 * compositions, plan step N1) is one more entry in the list below rather than a new resolver.
 * Pure and fs-free; bundles into the browser runtime.
 */

const { makeRegister } = require('./register-factory');

const REGISTER = makeRegister('cover', [
  { axis: 'surface', names: ['inverse', 'light'] },
]);

/** The one class the light surface stamps. Exported so the CSS-side consumers (the HTML player's
 *  scheme pins, lib/export/player-core.mjs) name it from here rather than retyping it. */
const COVER_LIGHT_CLASS = 'cover-light';

/** The two layouts the register reaches. */
const COVER_LAYOUTS = Object.freeze(['title', 'closing']);

/** A deck value → the classes it stamps on a cover slide; `cover-inverse` is slide-only. */
const coverClasses = (value) => REGISTER.classes(value).filter((c) => c !== 'cover-inverse');

/**
 * The deck's cover classes one slide takes: none unless the slide is a `title` or `closing`, and
 * none on an axis the slide already fills (`_class: title cover-inverse` keeps its panel in a
 * `cover: light` deck). Both render paths append exactly these.
 */
function coverDeckTokens(cur, deckTokens) {
  if (!deckTokens?.length || !COVER_LAYOUTS.some((l) => cur.includes(l))) return [];
  const own = new Set(cur.map(REGISTER.tokenAxis).filter(Boolean));
  return deckTokens.filter((t) => !own.has(REGISTER.tokenAxis(t)) && !cur.includes(t));
}

module.exports = {
  COVER_REGISTER: REGISTER,
  COVER_NAMES: REGISTER.NAMES,
  COVER_TOKENS: REGISTER.TOKENS,
  COVER_LIGHT_CLASS,
  COVER_LAYOUTS,
  coverClasses,
  coverClassesFromFrontMatter: (fm) => coverClasses(REGISTER.read(fm) || ''),
  coverDeckTokens,
};
