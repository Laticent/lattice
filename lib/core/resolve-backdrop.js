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
 * Pure + dependency-free so it bundles into the browser runtime; shared by
 * lib/integrations/markdown-it/plugins.js and lib/runtime/index.js so every render path
 * produces the same class list. See engineering/decisions/2026-09-26-backdrop-register.md.
 */

const { topLevelFrontMatterValue } = require('./front-matter-key');

/** Strength steps. `full` restores 1 and discards a finish's baked dim. */
const BACKDROP_STRENGTH_NAMES = Object.freeze(['20', '40', '60', '80', 'full']);
/** The nine spotlight anchors, as `spot-<pos>`. */
const BACKDROP_SPOT_POSITIONS = Object.freeze(['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br']);
/** Mask values. `open` = no mask, discarding a finish's baked clearance or spotlight. */
const BACKDROP_MASK_NAMES = Object.freeze(['clear', 'open', ...BACKDROP_SPOT_POSITIONS.map((p) => `spot-${p}`)]);

/** Every deck-level value, both axes. */
const BACKDROP_NAMES = Object.freeze([...BACKDROP_STRENGTH_NAMES, ...BACKDROP_MASK_NAMES]);

const PREFIX = 'backdrop-';
const BACKDROP_STRENGTH_TOKENS = Object.freeze(BACKDROP_STRENGTH_NAMES.map((n) => PREFIX + n));
const BACKDROP_MASK_TOKENS = Object.freeze(BACKDROP_MASK_NAMES.map((n) => PREFIX + n));
/** The per-slide class vocabulary (both axes). `backdrop-none` is NOT here: it is the
 *  back-compat alias of `finish-none` and belongs to the finish axis. */
const BACKDROP_TOKENS = Object.freeze([...BACKDROP_STRENGTH_TOKENS, ...BACKDROP_MASK_TOKENS]);

const STRENGTH_SET = new Set(BACKDROP_STRENGTH_TOKENS);
const MASK_SET = new Set(BACKDROP_MASK_TOKENS);

/** True for a strength-axis class token (`backdrop-40`). */
function isBackdropStrengthToken(t) { return STRENGTH_SET.has(String(t || '')); }
/** True for a mask-axis class token (`backdrop-clear`, `backdrop-spot-tr`). */
function isBackdropMaskToken(t) { return MASK_SET.has(String(t || '')); }
/** True for any backdrop register class token. */
function isBackdropToken(t) { return isBackdropStrengthToken(t) || isBackdropMaskToken(t); }

/**
 * Parse a deck value into its words, sorted by axis. Unknown words and a second word on an
 * axis already filled are returned in `unknown` / `duplicate` for the linter; the classes
 * carry only the first recognized word per axis.
 */
function parseBackdrop(value) {
  const out = { strength: '', mask: '', unknown: [], duplicate: [] };
  if (typeof value !== 'string') return out;
  for (const raw of value.trim().toLowerCase().split(/[\s,]+/).filter(Boolean)) {
    const word = raw.endsWith('%') ? raw.slice(0, -1) : raw;
    if (BACKDROP_STRENGTH_NAMES.includes(word)) {
      if (out.strength) out.duplicate.push(raw); else out.strength = word;
    } else if (BACKDROP_MASK_NAMES.includes(word)) {
      if (out.mask) out.duplicate.push(raw); else out.mask = word;
    } else {
      out.unknown.push(raw);
    }
  }
  return out;
}

/** Map a deck value to its class tokens (0, 1 or 2 of them). */
function backdropClasses(value) {
  const { strength, mask } = parseBackdrop(value);
  return [strength && PREFIX + strength, mask && PREFIX + mask].filter(Boolean);
}

/**
 * Read the raw `backdrop:` value from a front-matter BODY (no fences), or null. TOP-LEVEL
 * only: `finish-override:` nests a `backdrop:` child of its own, and a loose read would
 * mistake that header for this register.
 */
function readBackdrop(fm) {
  const v = topLevelFrontMatterValue(fm, 'backdrop');
  return v ? v : null;
}

/** Convenience: front-matter body → class tokens. */
function backdropClassesFromFrontMatter(fm) {
  return backdropClasses(readBackdrop(fm) || '');
}

module.exports = {
  BACKDROP_NAMES,
  BACKDROP_STRENGTH_NAMES,
  BACKDROP_MASK_NAMES,
  BACKDROP_SPOT_POSITIONS,
  BACKDROP_TOKENS,
  BACKDROP_STRENGTH_TOKENS,
  BACKDROP_MASK_TOKENS,
  isBackdropToken,
  isBackdropStrengthToken,
  isBackdropMaskToken,
  parseBackdrop,
  backdropClasses,
  readBackdrop,
  backdropClassesFromFrontMatter,
};
