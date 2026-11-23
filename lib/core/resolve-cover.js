/**
 * lib/core/resolve-cover.js
 *
 * The deck front-matter `cover:` register sets the deck's front and back cover: the `title`
 * slide and the `closing` slide. Two axes, one word each, in any order (`cover: light column`):
 *
 *   SURFACE — what the cover is painted on
 *   cover: inverse   → (no token)    the dark inverse panel, today's look and the default
 *   cover: light     → `cover-light` the deck's light canvas, with light-canvas inks
 *
 *   COMPOSITION — how the heading block sits on that surface (plan step N1)
 *   cover: plain     → (no token)        today's centered block, the default
 *   cover: masthead  → `cover-masthead`  a heavy rule over the title
 *   cover: ledger    → `cover-ledger`    a small-caps title over a double rule
 *   cover: column    → `cover-column`    an accent column at the right edge, clear of the bands
 *   cover: label     → `cover-label`     a gallery wall label: a smaller title low on the left, under a hairline
 *   cover: stage     → `cover-stage`     a stage-size centered title
 *   cover: frame     → `cover-frame`     the title boxed in a keyline
 *   cover: poster    → `cover-poster`    a giant title on the left
 *
 * WHY THE COMPOSITIONS ARE COMPONENT VARIANTS. Three of them (`stage` and `poster` up, `label`
 * down) put the heading in a different type role, and a cross-component modifier may
 * never change a type role's size (engineering/typography.md, "One size across modifiers";
 * `checkTypeSizeModifiers`). A component's own variant may, so each `cover-*` composition is
 * declared in the `title` and `closing` manifests and styled in their own sheets. The register
 * is only the deck-wide way to write them.
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
 * as leaving the key out, so every existing deck renders byte-identical. `plain` is the same on the
 * composition axis (`_class: closing cover-plain` keeps the centered block in a `cover: poster` deck).
 *
 * Built on the axis-register factory (lib/core/register-factory.js), so the composition axis is one
 * more entry in the list below rather than a new resolver.
 * Pure and fs-free; bundles into the browser runtime.
 */

const { makeRegister, presetMergedValue } = require('./register-factory');

const REGISTER = makeRegister('cover', [
  { axis: 'surface', names: ['inverse', 'light'] },
  { axis: 'composition', names: ['plain', 'masthead', 'ledger', 'column', 'label', 'stage', 'frame', 'poster'] },
]);

/** The one class the light surface stamps. Exported so the CSS-side consumers (the HTML player's
 *  scheme pins, lib/export/player-core.mjs) name it from here rather than retyping it. */
const COVER_LIGHT_CLASS = 'cover-light';

/** The two layouts the register reaches. */
const COVER_LAYOUTS = Object.freeze(['title', 'closing']);

/** Each axis's default word stamps nothing deck-wide: on a SLIDE it is the opt-out of the deck's
 *  word (`_class: closing cover-inverse`, `_class: closing cover-plain`). */
const SLIDE_ONLY = new Set(['cover-inverse', 'cover-plain']);

/** The seven composition classes that paint, in register order (`cover-plain` paints nothing, so it
 *  is left out). The `title` and `closing` manifests declare exactly these as variants;
 *  test/unit/core/cover-register.test.js pins the three lists together. */
const COVER_COMPOSITION_CLASSES = Object.freeze(REGISTER.AXES.find((a) => a.axis === 'composition').tokens.filter((t) => !SLIDE_ONLY.has(t)));

/** A deck value → the classes it stamps on a cover slide; each default word is slide-only. */
const coverClasses = (value) => REGISTER.classes(value).filter((c) => !SLIDE_ONLY.has(c));

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
  COVER_COMPOSITION_CLASSES,
  coverClasses,
  // A preset's `cover:` fills each axis the deck leaves empty (register-factory.js `presetMergedValue`).
  // Top-level only, as the register has always read it: an indented `cover:` is someone else's key.
  coverClassesFromFrontMatter: (fm) => {
    const merged = presetMergedValue(fm, REGISTER, { topLevelOnly: true });
    return coverClasses(REGISTER.AXES.map((a) => merged[a.axis]).filter(Boolean).join(' '));
  },
  coverDeckTokens,
};
