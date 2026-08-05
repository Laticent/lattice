/**
 * lib/core/diagram-band.js
 *
 * THE single answer to "which band does this slide's diagram render in?" —
 * `light` | `dark` | `print`.
 *
 * A Mermaid SVG BAKES its colors at render time: `themeVariables` are resolved
 * to literal hex before the shape ever reaches the page, so a later CSS restyle
 * cannot recolor a node label. The CSS underneath it (the chip, the texture, the
 * canvas) is live and per-section. Ink and chip are therefore two halves of one
 * decision, and they only agree if both halves ask the same question the same
 * way. #1326 shipped four defects in a row — 2.7:1, then 1.28:1, then 17.14:1 →
 * 1.55:1 — every one of them ink and chip disagreeing about which band the slide
 * was in, every one green through CI. #1340 was the fifth. They are one bug: the
 * band was resolved ad hoc, by regex over raw markdown, in each render path
 * separately. This module is the contract that replaces those regexes (#1332
 * step 1, HARD RULE #1).
 *
 * THE RULE, in order of precedence:
 *
 *   1. PRINT WINS. A print render is ink-on-white paper; it is not a color
 *      scheme, so nothing about light/dark can outrank it. Deck-wide print
 *      (`color-mode: print`, the engine `--print` flag — which writes that key —
 *      or the legacy `class: print` on a deck with no `color-mode:` at all) reaches
 *      every slide, including one that pins its own scheme.
 *   2. A slide that NAMES A COLOR-MODE TOKEN owns its scheme. `_class: light` on
 *      a dark deck renders light — which is why the deck value cannot simply be
 *      OR-ed in.
 *   3. Otherwise the slide INHERITS the deck.
 *
 * Rule 3 is #1340. The emulator used to spell rule 2 as "did this slide name
 * ANY `_class:` at all?", so `_class: diagram` — which says nothing about
 * scheme, and is how essentially every component is selected — silently forced
 * light on a `color-mode: dark` deck. The section really was `.dark` (the
 * deck-class propagation kernel merged it in correctly); only the bake
 * disagreed, so dark decks rendered light-mode label ink on dark-arm chips.
 *
 * "Names a color-mode token" is TOKEN MEMBERSHIP in COLOR_MODE_TOKENS, matching
 * the propagation guard that produces the class in the first place
 * (`slideHasOwnColorMode` in lib/integrations/markdown-it/plugins.js and its
 * runtime mirror). Membership, not a `\b`-anchored regex: `\bprint\b` also
 * matches inside `print-safe`, and the guard those two lines have to agree with
 * compares whole tokens.
 *
 * Pure + dependency-free (no fs, no DOM), so it is unit-testable as BEHAVIOR
 * rather than as a source-text assertion on the emulator — the distinction that
 * let three of the four #1326 fixes pass a green suite while broken.
 *
 * ONE CALLER, and that is worth saying out loud given the name. The PDF path calls
 * it; the preview does not, because it reads tokens through
 * `getComputedStyle(section)` and CSS inheritance hands it the band implicitly. That
 * asymmetry IS the port the shared kernel is built around
 * (lib/core/render-diagrams.js): a `scope` is whatever a path needs to read a token
 * for one slide, and the two paths genuinely differ there and nowhere else.
 *
 * Both paths now resolve at the same GRANULARITY — per slide. The preview used to
 * configure Mermaid once per document from the first `<section>`, which is what made
 * a reconciliation marker necessary; #1332 steps 3–4 closed that and deleted the
 * marker.
 */

const { COLOR_MODE_TOKENS } = require('./color-mode');
const {
  deckPrintBand, frontMatterBody, deckColorModeToken, classTokens,
} = require('./resolve-color-mode');
const { frontMatterValue } = require('./front-matter-key');

/** The color-mode axis as a Set, for whole-token membership tests. */
const COLOR_MODE_TOKEN_SET = new Set(COLOR_MODE_TOKENS);

/**
 * Is the DECK's canvas dark?
 *
 * READ THE SAME WAY THE PROPAGATION KERNEL READS IT, deliberately and exactly.
 * `deckClassPropagate` (lib/integrations/markdown-it/plugins.js) decides what
 * class the `<section>` actually gets: `color-mode:` through an ANCHORED
 * key/value read plus `colorModeClass`, otherwise the `class:` value split into
 * WHOLE TOKENS. If this half asks a looser question, ink and chip disagree —
 * the entire bug class this module exists to close.
 *
 * The looser question is not hypothetical; it is what was here first, inherited
 * from the emulator. Three real decks where the two answers came apart:
 *
 *   color-mode: dark # deck-wide pin   an unanchored read takes `dark` from a
 *                                      line the anchored one rejects
 *   class: dark-mode                   `\bdark\b` matches inside a hyphenated
 *                                      token that is not `dark`
 *   style: | … color-scheme: dark …    a raw sniff over the whole front matter,
 *                                      firing on CSS meant for one component
 *
 * Each rendered a LIGHT section carrying a DARK-baked diagram. They were latent
 * before — the deck half was only consulted for a slide naming no `_class:` at
 * all — and #1340's fix routes every slide through here, so closing them belongs
 * in the same change that widened their reach.
 *
 * The raw `color-scheme: dark` sniff is GONE rather than tightened. Nothing
 * derives a section class from it, so there is no reading both halves can share;
 * a deck flipping `color-scheme` from a `style:` block is outside what the
 * propagation kernel models, and guessing at it is what produced the mismatch.
 *
 * `color-mode:` WINS when present, so a half-migrated deck (`color-mode: light`
 * plus a leftover `class: dark`) does not render light slides with dark-baked
 * diagrams. Only `dark` bakes dark: light/system/inherited all bake LIGHT,
 * because a static Mermaid SVG cannot follow the receiver's OS or its host
 * container — the static-export default.
 *
 * Read with the shared linear-time `frontMatterValue`, so it costs what every
 * other front-matter read in the engine costs rather than the polynomial
 * `^[ \t]*key:[ \t]*(.*?)[ \t]*$` idiom lib/core/front-matter-key.js retired.
 */
function deckDarkBand(frontMatter) {
  const fm = frontMatterBody(frontMatter);
  if (!fm) return false;
  const colorModeToken = deckColorModeToken(fm);
  if (colorModeToken) return colorModeToken === 'dark';
  return classTokens(frontMatterValue(fm, 'class')).includes('dark');
}

/**
 * Resolve the band one slide's diagram is baked for.
 *
 * @param {object}  input
 * @param {string}  input.frontMatter  The deck's raw front-matter block (the
 *   `---` … `---` slice, delimiters included). The full deck source also works —
 *   the print predicate re-extracts the block either way.
 * @param {string}  input.slideClass   The slide's own class tokens: its
 *   `<!-- _class: … -->` payload on the source side, or the resolved
 *   `section.className` on the DOM side. Empty when the slide names none.
 * @param {boolean} [input.flagPrint]  The engine `--print` / `--image-mode print`
 *   flag, for a caller that has the flag but not the merged front matter.
 * @returns {'light'|'dark'|'print'}
 */
function resolveDiagramBand({ frontMatter = '', slideClass = '', flagPrint = false } = {}) {
  const tokens = classTokens(slideClass);
  // Rule 1 — print wins, and reaches a slide that pins its own scheme.
  //
  // THIS IS THE SEAM the retired `data-lattice-slide-bake` marker stood on, and it is
  // closed now. Deck-wide `print` used to be droppable by the propagation guard, so a
  // slide naming its own `_class: dark` kept `dark`, LOST `print`, and still got a
  // print-BAKED diagram from here — CSS and bake disagreeing, which is what a marker
  // had to paper over (#1332 lists it as the onyx-dark + `class: print` + `_class: dark`
  // case). `slidePinEvictsDeckToken` (lib/core/color-mode.js) makes print
  // non-droppable, so the section really carries `print`, the texture pins' `:not(.print)`
  // really is sufficient, and rule 1 below and the CSS now say the same thing.
  if (deckPrintBand(frontMatter, flagPrint) || tokens.includes('print')) return 'print';
  // Rule 2 — a slide naming any color-mode token owns its scheme.
  // Rule 3 — otherwise inherit the deck. (#1340: `_class: diagram` names no
  // color-mode token, so it inherits, rather than forcing light.)
  const slideNamesScheme = tokens.some((t) => COLOR_MODE_TOKEN_SET.has(t));
  const dark = slideNamesScheme ? tokens.includes('dark') : deckDarkBand(frontMatter);
  return dark ? 'dark' : 'light';
}

module.exports = {
  resolveDiagramBand,
  deckDarkBand,
  // Re-exported so a caller needs ONE import for the band question and there is
  // still only one spelling of the print test (#1332 step 1: "do not leave two
  // spellings"). The definition stays in resolve-color-mode.js, next to the
  // `color-mode:` register it reads.
  deckPrintBand,
};
