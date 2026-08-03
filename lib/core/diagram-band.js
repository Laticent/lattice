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
 *      (`color-mode: print`, the legacy `class: print`, or the engine `--print`
 *      flag) reaches every slide, including one that pins its own scheme.
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
 * Pure + dependency-free (no fs, no DOM) so it bundles into the browser runtime
 * and is unit-testable as BEHAVIOR rather than as a source-text assertion on the
 * emulator — the distinction that let three of the four #1326 fixes pass a green
 * suite while broken.
 */

const { COLOR_MODE_TOKENS } = require('./color-mode');
const { deckPrintBand, frontMatterBlock } = require('./resolve-color-mode');

/** The color-mode axis as a Set, for whole-token membership tests. */
const COLOR_MODE_TOKEN_SET = new Set(COLOR_MODE_TOKENS);

/** Split a class attribute / `_class:` payload into whole tokens. */
function classTokens(slideClass) {
  return String(slideClass ?? '').split(/\s+/).filter(Boolean);
}

/**
 * Is the DECK's canvas dark?
 *
 * The first-class `color-mode:` key WINS when present (it supersedes the legacy
 * `class:` color axis), so a half-migrated deck (`color-mode: light` plus a
 * leftover `class: dark`) does not render light slides with dark-baked
 * diagrams. Only `dark` bakes dark: light/system/inherited all bake LIGHT,
 * because a static Mermaid SVG cannot follow the receiver's OS or its host
 * container — the static-export default. With no `color-mode:` key, fall back
 * to the legacy `class: … dark` alias, then to a raw `color-scheme: dark`.
 * Case-insensitive, matching colorModeClass + the deck scheme probe.
 *
 * Scoped to the front-matter BLOCK by the same extraction deckPrintBand uses, so
 * the two halves of the band decision listen to exactly the same amount of the
 * deck. Without it, a caller passing a full source got a print half that read
 * front matter only and a dark half that would take `class: dark` written in
 * body prose — the #1326 disagreement, rebuilt inside one module.
 */
function deckDarkBand(frontMatter) {
  const fm = frontMatterBlock(frontMatter);
  const cm = /^\s*color-mode:\s*["']?([A-Za-z]+)\b/im.exec(fm);
  const cmKey = cm ? cm[1].toLowerCase() : '';
  const knownCm =
    cmKey === 'light' || cmKey === 'dark' || cmKey === 'system' || cmKey === 'inherited' || cmKey === 'print';
  if (knownCm) return cmKey === 'dark';
  return (
    /^\s*class:\s*["']?[^"'\n]*\bdark\b/im.test(fm) ||
    /color-scheme\s*:\s*dark/i.test(fm)
  );
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
  // NOTE this is exactly the seam the `data-lattice-slide-bake` marker and the
  // texture pins' `data-lattice-print` guard stand on: deck-wide `print` is on
  // the color axis, so the propagation guard DROPS it from a slide that names
  // its own `_class: dark`. That slide keeps `dark` in CSS and still gets a
  // print-BAKED diagram from here. Pre-existing (#1332 lists it as the onyx-dark
  // + `class: print` + `_class: dark` 1.28:1 case) and deliberately unchanged:
  // this module reproduces today's precedence, it does not re-legislate it.
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
