/**
 * lib/core/resolve-color-mode.js
 *
 * The deck front-matter `color-mode:` register — the FIRST-CLASS way to author a
 * deck's color mode (see engineering/decisions/2026-07-11-color-mode-frontmatter.md).
 * Four values, one intent each; every render + authoring surface honors them:
 *
 *   color-mode: light      → `color-light`      PIN light  (document fidelity)
 *   color-mode: dark       → `dark`             PIN dark   (document fidelity)
 *   color-mode: system     → `color-system`     follow the receiver's OS (prefers-color-scheme)
 *   color-mode: inherited  → `color-inherited`  adopt the host container's mode (site/Studio
 *                                                toggle when embedded; the OS when standalone)
 *
 * The light value maps to `color-light` (NOT the bare `light`) on purpose: `section.<x>.light`
 * is a pre-existing LAYOUT component (the bright centered `divider.light` "subtopic" variant),
 * so stamping `light` deck-wide would silently re-layout every divider. `color-light` is a
 * collision-free color-scheme-only token (like `color-system`/`color-inherited`). `dark` has
 * no such component collision, so it reuses the existing `section.dark` (which also carries the
 * dark-canvas background treatment). The per-slide `_class: light` still uses the bare `light`.
 *
 * Like `mode:`/`finish:`, both render paths read this key and APPEND the mapped
 * class token to every `<section>`; the CSS lives in lib/base/base.modifiers.css
 * (`section.dark`/`section.light` already; `section.color-system` = `color-scheme:light dark`;
 * `section.color-inherited` = `color-scheme:inherit`, which the section takes from the deck
 * root each surface controls). Unset renders the theme's own default — no token.
 *
 * `color-mode:` SUPERSEDES the legacy `class: dark`/`class: light` color axis, which stays a
 * DEPRECATED alias (existing decks keep working; the linter nudges toward this key). A per-slide
 * `<!-- _class: dark|light -->` is unchanged — it stays the per-slide override (front matter is
 * deck-wide by definition, so there is no per-slide `color-mode:`).
 *
 * Pure + dependency-free so it bundles into the browser runtime (esbuild) and is
 * unit-testable in isolation. Shared by lattice-emulator.js,
 * lib/integrations/markdown-it/plugins.js, and lib/runtime/index.js so all three
 * render paths produce identical class lists (HARD RULE #1).
 */

// Register value → the class token appended to every section. '' = no token (unset renders the
// theme default; there is no register row for "unset" — an absent/unknown key maps to '').
const COLOR_MODE_REGISTER = Object.freeze({
  light: 'color-light',
  dark: 'dark',
  system: 'color-system',
  inherited: 'color-inherited',
  // PRINT is a fifth, medium-not-scheme value: it renders the whole deck in the
  // B&W-safe ink-on-white print band (section.print; base.modifiers.css), for
  // paper handouts. Mutually exclusive with the scheme values (a printed deck is
  // ink, not light/dark) — that exclusivity rides COLOR_MODE_TOKENS for free. It
  // maps to the bare `print` class (no component collision), and is the authoring
  // sibling of the engine `--print` export flag.
  print: 'print',
});

/** The recognized color-mode names (for the deck-lint vocabulary + docs + UI pickers). */
const COLOR_MODE_NAMES = Object.freeze(Object.keys(COLOR_MODE_REGISTER));

/** Extract the raw `color-mode:` value from a deck source's front matter, or null. */
function readFrontMatterColorMode(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^[ \t]*color-mode:[ \t]*["']?([A-Za-z0-9_-]+)["']?[ \t]*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized color-mode register name. */
function isKnownColorMode(value) {
  return typeof value === 'string' && Object.hasOwn(COLOR_MODE_REGISTER, value.trim().toLowerCase());
}

/** Map a color-mode value to its class token ('' for unset/unknown). */
function colorModeClass(value) {
  if (typeof value !== 'string') return '';
  const key = value.trim().toLowerCase();
  return Object.hasOwn(COLOR_MODE_REGISTER, key) ? COLOR_MODE_REGISTER[key] : '';
}

/** Convenience: read the `color-mode:` value from a full deck source + map it. */
function colorModeClassFromSource(md) {
  return colorModeClass(readFrontMatterColorMode(md) || '');
}

/**
 * Is this render in the B&W PRINT band?
 *
 * THE single predicate for that question, and it must stay single. The emulator
 * BAKES a Mermaid diagram's label ink for the band it is rendering, while CSS
 * paints the chip underneath — two halves of one decision. They were briefly
 * derived from two different conditions (the texture guard from the CLI flag, the
 * bake from a wider test that also honors front-matter `class: print` /
 * `color-mode: print`), and a deck authoring those keys baked print ink with the
 * guard never firing: dark ink on a pinned dark chip at 1.28:1. Both halves now
 * call this.
 *
 * Lives in the shared kernel (HARD RULE #1) rather than in the emulator so it is
 * unit-testable as BEHAVIOR. Its previous home made the only available assertion a
 * source-text `assert.match` on the emulator file, which cannot fail for a semantic
 * error — renaming the stamped attribute or stubbing the predicate to `false` both
 * left the guard dead with the gate fully green.
 *
 * `--print` and `--image-mode print` need no term here: `withPrintClass` merges
 * `class: print` into the front matter before this ever sees the source. `flagPrint`
 * stays as a belt-and-braces term for a caller that has the flag but not the merge.
 */
function deckPrintBand(md, flagPrint = false) {
  if (flagPrint) return true;
  const fmMatch = String(md ?? '').match(/^---\r?\n[\s\S]*?\r?\n---/);
  if (!fmMatch) return false;
  const fm = fmMatch[0];
  // NOTE: read the RAW `color-mode:` value, not readFrontMatterColorMode() — that
  // maps the four-value register (light/dark/system/inherited) and returns nothing
  // for `print`, because print is a third canvas band rather than a color-scheme.
  // Routing through it silently dropped this case when the predicate was extracted.
  const cm = (/^[ \t]*color-mode:[ \t]*["']?([A-Za-z]+)\b/im.exec(fm) || [])[1] || '';
  if (cm.toLowerCase() === 'print') return true;
  // `\bprint\b` on the class LINE only — `class: printable` must not match, and the
  // value must not run past its own newline into the next key.
  return /^[ \t]*class:[ \t]*["']?[^"'\n]*\bprint\b/im.test(fm);
}

/**
 * The attribute marking a slide whose diagram ink is baked PER SLIDE.
 *
 * One constant, imported by the stamper and asserted by the gate, so renaming it
 * cannot silently unhook the themes that gate on it. (A re-typed literal in a test
 * is how the previous guard survived a rename with the suite green.)
 */
const SLIDE_BAKE_ATTR = 'data-lattice-slide-bake';

/**
 * Stamp `SLIDE_BAKE_ATTR` on every section, unless this render bakes deck-wide.
 *
 * Pure string transform so it is unit-testable without a browser — the previous
 * stamp lived inline in the emulator, and deleting it outright, dropping its `/g`,
 * or renaming its attribute each left the render broken with the gate fully green.
 */
function stampSlideBake(slidesHtml, isDeckWideBake) {
  if (isDeckWideBake) return slidesHtml;
  return String(slidesHtml).replace(/<section\b/g, `<section ${SLIDE_BAKE_ATTR}`);
}

module.exports = {
  COLOR_MODE_REGISTER,
  COLOR_MODE_NAMES,
  readFrontMatterColorMode,
  isKnownColorMode,
  colorModeClass,
  colorModeClassFromSource,
  deckPrintBand,
  SLIDE_BAKE_ATTR,
  stampSlideBake,
};
