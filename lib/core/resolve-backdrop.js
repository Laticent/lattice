/**
 * lib/core/resolve-backdrop.js
 *
 * The deck front-matter `backdrop:` register RESTRAINS whatever finish the deck wears — any
 * built-in preset or any fabricated one — without touching the finish itself. Two axes, each
 * one token, written together on one line:
 *
 *   backdrop: 40          → `backdrop-40`                 the finish at 40% strength
 *   backdrop: clear       → `backdrop-clear`              clean canvas behind the content
 *   backdrop: 60 spot-tr  → `backdrop-60 backdrop-spot-tr` dimmed, shown only top-right
 *
 * The per-slide vocabulary is the same tokens WITH the prefix (`_class: backdrop-20`), and a
 * slide's token on one axis evicts the deck's token on THAT axis only — so a slide can keep
 * the deck's strength and change only its mask.
 *
 * Three tiers, most specific wins: slide class → this register → the finish's own baked
 * `--fin-backdrop-*` (Fabricate). The classes set a separate `--backdrop-opacity` / `--backdrop-scrim` namespace that the
 * compositor reads FIRST (lib/base/base.finish.css), so there is no specificity contest with
 * a fabricated finish's `section.finish.finish-<slug>` rule.
 *
 * Why steps and anchors rather than any number: a class cannot carry a free value without an
 * inline style, and an inline style built from author text is a sanitizer surface (HARD RULE
 * #22). An exact value still bakes into a finish in Fabricate.
 *
 * NOT a way to remove the finish: `finish-none` is the off switch. Every token here is inert
 * on a slide with no finish. And NOT the retired MAP form (`backdrop:` with indented
 * children), which the linter still flags as `retired-backdrop-key`.
 *
 * Built on the axis-register factory (lib/core/register-factory.js), so it bundles into the browser runtime; shared by
 * lib/integrations/markdown-it/plugins.js and lib/runtime/index.js so every render path
 * produces the same class list. See engineering/decisions/2026-09-26-backdrop-register.md.
 */

const { makeRegister } = require('./register-factory');

/** Strength steps. `full` restores 1 and discards a finish's baked dim. */
const BACKDROP_STRENGTH_NAMES = Object.freeze(['20', '40', '60', '80', 'full']);
/** The nine window anchors, as the spot mask's suffix. */
const BACKDROP_SPOT_POSITIONS = Object.freeze(['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br']);
/** Masks: clean canvas behind content, no mask at all, or a window at one anchor. */
const BACKDROP_MASK_NAMES = Object.freeze(['clear', 'open', ...BACKDROP_SPOT_POSITIONS.map((p) => `spot-${p}`)]);

// The parse, the classes and the reader are the axis-register factory's: `backdrop-<word>` is
// its `<key>-<word>` shape exactly. Only the `%` an author may write after a strength is ours.
const REGISTER = makeRegister('backdrop', [
  { axis: 'strength', names: BACKDROP_STRENGTH_NAMES },
  { axis: 'mask', names: BACKDROP_MASK_NAMES },
]);
const [STRENGTH, MASK] = REGISTER.AXES;
// Only a `%` that ENDS a word, as the linter reads it (`40%`), never one inside a word (`4%0`).
const noPercent = (value) => (typeof value === 'string' ? value.replace(/%(?=[\s,\]]|$)/g, '') : value);

/**
 * Parse a deck value into its words, sorted by axis. Unknown words and a second word on an
 * axis already filled are returned in `unknown` / `duplicate` for the linter; the classes
 * carry only the first recognized word per axis.
 */
const parseBackdrop = (value) => REGISTER.parse(noPercent(value));
/** Map a deck value to its class tokens (0, 1 or 2 of them). */
const backdropClasses = (value) => REGISTER.classes(noPercent(value));

module.exports = {
  /** Every deck-level value, both axes, and the per-slide class vocabulary. */
  BACKDROP_NAMES: REGISTER.NAMES,
  BACKDROP_STRENGTH_NAMES,
  BACKDROP_MASK_NAMES,
  BACKDROP_SPOT_POSITIONS,
  BACKDROP_TOKENS: REGISTER.TOKENS,
  BACKDROP_STRENGTH_TOKENS: STRENGTH.tokens,
  BACKDROP_MASK_TOKENS: MASK.tokens,
  isBackdropToken: REGISTER.isToken,
  isBackdropStrengthToken: (t) => STRENGTH.set.has(String(t || '')),
  isBackdropMaskToken: (t) => MASK.set.has(String(t || '')),
  parseBackdrop,
  backdropClasses,
  /**
   * Read the raw `backdrop:` value from a front-matter BODY (no fences), or null. TOP-LEVEL
   * only: `finish-override:` nests a `backdrop:` child of its own, and a loose read would
   * mistake that header for this register.
   */
  readBackdrop: REGISTER.read,
  /** Convenience: front-matter body → class tokens. */
  backdropClassesFromFrontMatter: (fm) => backdropClasses(REGISTER.read(fm) || ''),
};
