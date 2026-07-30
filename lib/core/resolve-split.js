/**
 * lib/core/resolve-split.js
 *
 * The deck front-matter `split:` key selects how the body is divided into
 * slides. It is a Lattice extension (Marpit splits only on the `---` thematic
 * break, or on h1..hN when its native `headingDivider:` integer is set). Two
 * modes, deliberately binary:
 *
 *   split: rule       → split ONLY on a top-level `---` (Marp-compatible).
 *                       Opt back into the classic separator-only behaviour.
 *   split: headings   → the house "sticky rule": the first `#` opens the lead
 *                       slide and every subsequent h1/h2 opens a new slide.
 *                       THE DEFAULT (since the 2026-06 flip) — a deck divides on
 *                       its outline with no separators to forget.
 *                       Lead content BEFORE a heading (an eyebrow tag, a kicker)
 *                       attaches to that heading's slide — the split fires only
 *                       before the *second* heading in a slide — so the eyebrow
 *                       never orphans. `---` is ALSO honoured (hybrid), so an
 *                       author can still force a break where two slides would
 *                       share a heading or a slide carries no heading at all.
 *
 * Why this is NOT marp-core's native `headingDivider`: that splits before
 * EVERY qualifying heading, which orphans the eyebrow/kicker block Lattice
 * decks put above their titles (~40% of the corpus). The eyebrow-aware rule
 * here is implemented as a shared markdown-it `hr`-injection ruler (see
 * lib/integrations/markdown-it/plugins.js `headingSplit`) so the emulator and the
 * marp-cli export stay byte-identical (HARD RULE #1). Both modes are
 * slide-count-invariant on every committed deck (see the regression in
 * test/unit/parsing/heading-split.test.js).
 *
 * Pure + dependency-free so it bundles into the browser runtime (esbuild) and
 * is unit-testable in isolation, mirroring lib/core/resolve-finish.js.
 */

// The recognized split modes. `headings` is the default; omitting the key — or
// giving an unrecognized value — resolves to it. `rule` is the explicit opt-out
// back to the Marp-compatible separator-only behaviour.
const SPLIT_MODES = Object.freeze(['rule', 'headings']);

/** The recognized split names (for the deck-lint vocabulary + docs). */
const SPLIT_NAMES = SPLIT_MODES;

/** The default mode when `split:` is absent or unrecognized. */
const DEFAULT_SPLIT = 'headings';

/** Extract the raw `split:` value from a deck source's front matter, or null. */
function readFrontMatterSplit(md) {
  if (typeof md !== 'string' || !md.length) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^[ \t]*split:[ \t]*["']?([A-Za-z0-9_-]+)["']?[ \t]*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized split mode name. */
function isKnownSplit(value) {
  return typeof value === 'string'
    && SPLIT_MODES.includes(value.trim().toLowerCase());
}

/**
 * Resolve a deck source's split mode → 'rule' | 'headings'. An absent, empty,
 * or unrecognized value resolves to the default ('headings'); the deck-lint
 * surfaces a typo so it doesn't silently fall back. An optional `override`
 * (e.g. an env/CLI flag) wins when supplied.
 */
function resolveSplitMode(md, override) {
  const pick = (v) => (isKnownSplit(v) ? v.trim().toLowerCase() : null);
  return pick(override) || pick(readFrontMatterSplit(md)) || DEFAULT_SPLIT;
}

module.exports = {
  SPLIT_MODES,
  SPLIT_NAMES,
  DEFAULT_SPLIT,
  readFrontMatterSplit,
  isKnownSplit,
  resolveSplitMode,
};
