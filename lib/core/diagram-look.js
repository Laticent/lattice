/**
 * lib/core/diagram-look.js
 *
 * THE single answer to "which LOOK does this slide's diagram render in?" —
 * `handDrawn` | `classic`.
 *
 * The sibling of `resolveDiagramBand` (lib/core/diagram-band.js), and it exists
 * for the same reason: a Mermaid SVG BAKES its geometry at render time. Mermaid's
 * `look: 'handDrawn'` swaps the whole node renderer — `g.node > rect` becomes
 * `g.rough-node > g.basic.label-container > path` (rough.js) — so this is not a
 * restyle a later CSS rule can apply or undo. It has to be decided BEFORE mmdc
 * runs, from the same inputs the band question already reads, or the two answers
 * drift the way band and chip did five times over (#1326, #1340).
 *
 * WHY IT EXISTS: `mode: sketch` gives the deck a hand-drawn hand — hand type,
 * wobbled boxes, drawn rules — and it used to stop dead at the edge of a diagram
 * SVG, so a sketch deck showed a hand-drawn slide wrapped around a crisply
 * machine-drawn flowchart. Mermaid ships the matching look natively (11.14
 * bundles rough.js), so the finish now carries into the diagram.
 *
 * THE RULE, in order of precedence:
 *
 *   1. TEXTURE WINS. A palette that routes its categories through the TEXTURE
 *      channel (`--cat-N-texture`) renders `classic`, always — even on a deck
 *      that asks for sketch. This is not a taste call, it is the redundant-
 *      encoding contract (M1, engineering/textures.md): on `a11y-*`, `onyx` and
 *      `concrete`, the per-category PATTERN is how a color-blind or monochrome
 *      reader tells one node from another, and it cannot survive the hand look.
 *      A rough node has no fill — its "fill" is a bundle of STROKED hachure
 *      lines — and a pattern paint-server sampled through a stroke reads as
 *      speckle, not a tile (the same reason mermaid.css keeps sankey ribbons on
 *      a flat color). Measured on a11y-deuteranopia: four distinct tiles
 *      collapse to four grays 5% apart. Style never overwrites data.
 *   2. A slide that NAMES A MODE TOKEN owns its look. `_class: boardroom` on a
 *      sketch deck renders classic; `_class: sketch` on a plain deck renders
 *      hand-drawn. Mirrors band rule 2 — the deck value cannot simply be OR-ed
 *      in, or a per-slide opt-out would be unreachable.
 *   3. Otherwise the slide INHERITS the deck (`mode:` first, then a legacy
 *      deck-wide `class: sketch`).
 *
 * Rule 2 keys on TOKEN MEMBERSHIP in MODE_TOKENS, not "did this slide name any
 * `_class:` at all" — the exact distinction #1340 had to fix in the band, where
 * `_class: diagram` (which says nothing about mode) silently forced an answer.
 *
 * Pure + dependency-light so every render path can share it: the emulator's
 * mermaid pre-pass and the runtime's live preview must agree, or a deck's
 * diagrams change shape between the Playground and the exported PDF.
 */

const { frontMatterValue, frontMatterName } = require('./front-matter-key');
// Same two readers `resolveDiagramBand` uses, from the same module — the band and
// the look must read a deck's front matter identically or they can disagree about
// which slide they are answering for.
const { frontMatterBody, classTokens } = require('./resolve-color-mode');
const { MODE_REGISTER } = require('./resolve-mode');

/**
 * TWO VOCABULARIES, kept apart on purpose.
 *
 * `mode:` takes a REGISTER NAME (`sketch`, `sketch-clean`, `boardroom`); a slide's
 * `_class:` carries CLASS TOKENS (`sketch`, `sketch-clean-body`). They overlap on
 * the word "sketch" and diverge everywhere else, so one Set serving both would be a
 * latent bug the moment a register name stops matching its own class token.
 */

// Register names whose class string turns the hand on. DERIVED from MODE_REGISTER
// rather than listed, so adding a register (`sketch-loose`, …) cannot leave this
// behind — the failure mode would be silent, and asymmetric between render paths.
const MODE_WANTS_HAND = Object.freeze(new Set(
  Object.entries(MODE_REGISTER)
    .filter(([, classes]) => String(classes).split(/\s+/).includes('sketch'))
    .map(([name]) => name),
));

/**
 * Class tokens that decide a look, and which way each one decides it.
 *
 * `sketch` ONLY — deliberately not `sketch-clean-body`. That token is a MODIFIER on
 * the finish, not a signal for it: `base.sketch.css` keys every rule on
 * `section.sketch`, and `MODE_REGISTER` never emits `sketch-clean-body` without
 * `sketch` beside it. Listing it here meant a hand-written `class: sketch-clean-body`
 * baked hand-drawn diagrams onto a deck with no hand-drawn anything else — the CSS
 * and the diagram disagreeing about whether the finish was even on.
 */
const HAND_TOKENS = Object.freeze(new Set(['sketch']));
const CLASSIC_TOKENS = Object.freeze(new Set(['boardroom']));

/**
 * Does the DECK ask for the hand look?
 *
 * `mode:` is the canonical register and wins when present. A deck-wide
 * `class: sketch` is the legacy spelling (it predates the mode/finish split and
 * is still what most decks in the repo say), so it is read as a fallback — the
 * same shape as `deckDarkBand`, which prefers `color-mode:` and falls back to
 * `class: dark`.
 */
function deckWantsHandDrawn(frontMatter) {
  // Read the BODY first, then the key out of it — NOT `readFrontMatterMode`, which
  // re-extracts the fence itself with a pattern requiring a newline AFTER the closing
  // `---`. The emulator hands us `source.match(/^---\r?\n[\s\S]*?\r?\n---/)[0]`, a
  // slice that ENDS at the `---`, so that reader returned null for every deck and
  // `mode: sketch` silently never reached a diagram. It went unnoticed because the
  // legacy `class:` fallback below still worked, and every fixture used that
  // spelling. `frontMatterBody` accepts the slice with or without the trailing
  // newline, and is the same reader `deckDarkBand` uses on the same input.
  const fm = frontMatterBody(frontMatter);
  if (!fm) return false;
  const mode = frontMatterName(fm, 'mode');
  // A named `mode:` is the WHOLE answer — a deck that says `mode: boardroom` and
  // still carries a leftover `class: sketch` renders clean, matching how
  // `deckDarkBand` lets `color-mode:` supersede a legacy `class:`.
  if (mode) return MODE_WANTS_HAND.has(String(mode).trim().toLowerCase());
  return classTokens(frontMatterValue(fm, 'class')).some((t) => HAND_TOKENS.has(t));
}

/**
 * Resolve the look one slide's diagram is baked with.
 *
 * @param {object}  input
 * @param {string}  input.frontMatter  The deck's raw front-matter block (or the
 *   full deck source — the readers re-extract the block either way).
 * @param {string}  input.slideClass   The slide's own class tokens: its
 *   `<!-- _class: … -->` payload on the source side, or the resolved
 *   `section.className` on the DOM side. Empty when the slide names none.
 * @param {boolean} [input.paletteUsesTexture]  True when the resolved palette
 *   defines `--cat-N-texture` — i.e. it carries categories by PATTERN, not hue.
 *   The caller supplies it because only the caller has the resolved palette
 *   (the emulator follows `@import`, so an `a11y-*` variant inherits it from
 *   `a11y-base`); this module stays free of a theme allowlist that would rot.
 * @param {'light'|'dark'|'print'} [input.band]  The slide's resolved band, from
 *   `resolveDiagramBand`. Only `print` changes the answer — see rule 1.
 * @returns {'handDrawn'|'classic'}
 */
function resolveDiagramLook({
  frontMatter = '', slideClass = '', paletteUsesTexture = false, band = '',
} = {}) {
  // Rule 1 — the redundant-encoding channel outranks the finish, on every slide,
  // including one that pins `_class: sketch` itself.
  //
  // THE PRINT BAND IS A TEXTURE BAND FOR EVERY THEME, not just the texture
  // palettes: `lib/base/base.print-textures.css` points `--cat-N-texture` at the
  // literal a11y set under `section.print`, which is how print stays B&W-safe past
  // a handful of categories. So `paletteUsesTexture` alone is NOT the whole
  // question — it reads the theme file, which for carta/indaco/… says nothing about
  // print. Without this clause a `mode: sketch` deck exported with `--print` got
  // hachured nodes with no texture channel, on paper, in monochrome: precisely the
  // reader this rule exists to protect, and the one case where hue cannot help.
  // It also split the two render paths, because the preview reads computed style
  // and DOES see `section.print` — geometry disagreeing across paths is the exact
  // failure this module was written to prevent.
  if (band === 'print') return 'classic';
  if (paletteUsesTexture) return 'classic';

  const tokens = classTokens(slideClass);
  // Rule 2 — a slide naming any mode token owns its look.
  if (tokens.some((t) => CLASSIC_TOKENS.has(t))) return 'classic';
  if (tokens.some((t) => HAND_TOKENS.has(t))) return 'handDrawn';

  // Rule 3 — otherwise inherit the deck.
  return deckWantsHandDrawn(frontMatter) ? 'handDrawn' : 'classic';
}

/** True when a resolved palette routes its categories through the texture channel. */
function paletteUsesTextureChannel(css) {
  return /--cat-\d+-texture\s*:/.test(String(css || ''));
}

module.exports = {
  resolveDiagramLook,
  paletteUsesTextureChannel,
  deckWantsHandDrawn,
};
