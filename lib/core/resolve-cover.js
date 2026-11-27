/**
 * lib/core/resolve-cover.js
 *
 * The deck front-matter `cover-layout:` register sets how the deck's front and back cover (the
 * `title` slide and the `closing` slide) are composed. One axis, one word:
 *
 *   cover-layout: plain     → (no token)        a centered block, the default
 *   cover-layout: masthead  → `cover-masthead`  a heavy rule over the title
 *   cover-layout: ledger    → `cover-ledger`    a small-caps title over a double rule
 *   cover-layout: column    → `cover-column`    an accent column at the right edge, clear of the bands
 *   cover-layout: label     → `cover-label`     a gallery wall label: a smaller title low on the left, under a hairline
 *   cover-layout: stage     → `cover-stage`     a stage-size centered title
 *   cover-layout: frame     → `cover-frame`     the title boxed in a keyline
 *   cover-layout: poster    → `cover-poster`    a giant title on the left
 *
 * COMPOSITION ONLY, SINCE 2026-11-23. The key was `cover:` and carried a second axis, the SURFACE
 * (`inverse` for the dark panel, `light` for the canvas). That was a second way to set a slide's
 * color mode, and it lost to the slide's own: `cover: light` plus `title dark` stayed light. Covers
 * now follow the deck's `color-mode:` and the slide's `light` / `dark` like every slide, painting the
 * canvas in light and the theme's brand panel in dark (base.modifiers.css, "THE BOOKENDS FOLLOW THE
 * COLOR MODE"). So the surface axis is gone, and the key says what is left: the layout
 * (plain-English rule 1, the thing then the attribute). `cover:`, `cover-light` and `cover-inverse`
 * are lint errors with a --fix (lib/authoring/lint-core.js `retired-cover-key`).
 * engineering/decisions/2026-11-23-cover-layout.md.
 *
 * The per-slide class names stay `cover-<word>`: they are component variants of `title` and
 * `closing`, and value words wait for the later sweep (2026-11-21-plain-english-key-renames.md Q8).
 *
 * WHY THE COMPOSITIONS ARE COMPONENT VARIANTS. Three of them (`stage` and `poster` up, `label`
 * down) put the heading in a different type role, and a cross-component modifier may never change
 * a type role's size (engineering/typography.md, "One size across modifiers";
 * `checkTypeSizeModifiers`). A component's own variant may, so each `cover-*` composition is
 * declared in the `title` and `closing` manifests and styled in their own sheets. The register is
 * only the deck-wide way to write them.
 *
 * SCOPED to the two cover layouts, the way `image-card:` is scoped to `image`: the deck's word rides
 * only a slide whose own class list names `title` or `closing`, and `coverDeckTokens` is the one
 * place that decides it, for both render paths (HARD RULE #1).
 *
 * `plain` stamps `cover-plain` only on a SLIDE: it is how one cover opts out of a deck-wide
 * composition (`_class: closing cover-plain` keeps the centered block in a `cover-layout: poster`
 * deck). A deck `cover-layout: plain` stamps nothing, the same as leaving the key out.
 *
 * Pure and fs-free; bundles into the browser runtime.
 */

const { makeRegister } = require('./register-factory');

const REGISTER = makeRegister('cover-layout', [
  { axis: 'composition', names: ['plain', 'masthead', 'ledger', 'column', 'label', 'stage', 'frame', 'poster'], prefix: 'cover-' },
]);

/** The two layouts the register reaches. */
const COVER_LAYOUTS = Object.freeze(['title', 'closing']);

/** The default word stamps nothing deck-wide: on a SLIDE it is the opt-out of the deck's word. */
const SLIDE_ONLY = new Set(['cover-plain']);

/** The seven composition classes that paint, in register order (`cover-plain` paints nothing, so it
 *  is left out). The `title` and `closing` manifests declare exactly these as variants;
 *  test/unit/core/cover-register.test.js pins the three lists together. */
const COVER_COMPOSITION_CLASSES = Object.freeze(REGISTER.AXES[0].tokens.filter((t) => !SLIDE_ONLY.has(t)));

/** A deck value → the classes it stamps on a cover slide; the default word is slide-only. */
const coverClasses = (value) => REGISTER.classes(value).filter((c) => !SLIDE_ONLY.has(c));

/**
 * The deck's cover classes one slide takes: none unless the slide is a `title` or `closing`, and
 * none when the slide already names a composition (`_class: title cover-plain` keeps its block in a
 * `cover-layout: poster` deck). Both render paths append exactly these.
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
  COVER_LAYOUTS,
  COVER_COMPOSITION_CLASSES,
  coverClasses,
  coverClassesFromFrontMatter: (fm) => coverClasses(REGISTER.read(fm) || ''),
  coverDeckTokens,
};
