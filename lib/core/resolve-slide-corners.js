/**
 * lib/core/resolve-slide-corners.js
 *
 * The CORNERS register — whether a slide's own surface is square or rounded.
 *
 * WHY THIS EXISTS. Nothing in the engine had an opinion about the slide's corner.
 * `section` carried no `border-radius` at all, so every exported artifact was square
 * by accident rather than by decision — and every CONSUMER that shows a slide invented
 * its own corner instead: the Studio's live preview clipped at a fixed `rounded-xl`
 * (12px), the slide-picker tiles and overview thumbnails at another `rounded-xl`, the
 * Fabricate specimens at `rounded-lg`. Six call sites, two values, none of them
 * theme-aware and none of them proportional to the slide. (The consumer half is now one
 * kernel, lib/core/slide-frame.mjs: no host draws a corner, and the frame traces this one.)
 *
 * Two things follow from that, and both are what #1649 reported:
 *
 *   1. The corner belonged to the CONSUMER'S palette, not the deck's. Preview a
 *      mustard deck inside an indaco Studio and the rounded corner you see is
 *      indaco's card clipped over the top of it — a foreign frame, most visible
 *      exactly when the two themes disagree.
 *   2. The preview LIED about the artifact. A deck that exports with square corners
 *      previewed rounded, so the Studio was never showing the deck you would ship.
 *
 * THE SHAPE. Corners join the family of deck-wide registers that map a front-matter
 * value to a class token appended to every `<section>` — the same shape as
 * `finish:` / `mode:` / `stamp-shape:` / `spectrum:` (lib/core/resolve-spectrum.js is the
 * closest sibling: a small on/off axis with a no-token baseline). The engine CSS then
 * resolves the token to a length:
 *
 *     slide-corners: square   → (no token)         --slide-radius: 0        the default
 *     slide-corners: rounded  → slide-corners-rounded    --slide-radius: calc(1.5 * --_sec-1cqi)
 *
 * WHY SQUARE IS THE DEFAULT. It is the only value that changes nothing. Every deck in
 * every corpus renders and exports today exactly as it did — the token resolves to the
 * `0` that was previously the initial value — so this register is opt-in rather than a
 * silent rewrite of every existing PDF. `rounded` is one line of front matter away.
 *
 * WHY A CLASS TOKEN AND NOT A THEME VALUE. Which of square or rounded a deck wants is
 * the DECK's call — the same axis `theme:` and `color-mode:` already sit on — and a
 * class-token register is how a deck-wide choice reaches every section, including ones
 * carrying their own `_class:`. Per-slide `_class: slide-corners-rounded` / `slide-corners-square`
 * overrides the deck, like every other register in this family.
 *
 * There is no theme-facing radius token to pair with it. An earlier cut shipped one, on
 * the reasoning that the engine owns names and a theme owns values
 * (2026-08-09-color-theme-ownership.md) — but that charter is about COLOR. A corner has
 * no per-palette answer a designer would want to vary, no theme in the tree set it, and
 * a theme that ever wants its own corner is CSS: it redeclares `--slide-radius` under
 * `section.slide-corners-rounded`. One value, in one place (base.modifiers.css).
 *
 * Pure + dependency-free so it bundles into the browser runtime and is unit-testable in
 * isolation; shared by plugins.js and runtime/index.js so both render paths produce
 * identical class lists (HARD RULE #1).
 */

const { frontMatterName } = require('./front-matter-key');

const { frontMatterMatch } = require('./front-matter-fence.mjs');
/** Recognized `slide-corners:` values. `square` is the baseline and maps to NO token. */
const SLIDE_CORNERS_NAMES = Object.freeze(['square', 'rounded']);

/**
 * The per-slide override tokens. `slide-corners-square` carries an EXPLICIT token even though
 * square is the deck-wide default: a slide inside a `slide-corners: rounded` deck needs a way
 * to opt back out, and "no token" cannot express that once the deck has stamped one.
 */
const SLIDE_CORNERS_TOKENS = Object.freeze(['slide-corners-rounded', 'slide-corners-square']);

const SLIDE_CORNERS_NAME_SET = new Set(SLIDE_CORNERS_NAMES);
const SLIDE_CORNERS_TOKEN_SET = new Set(SLIDE_CORNERS_TOKENS);

/** Extract the raw `slide-corners:` value from a deck source's front matter, or null. */
function readFrontMatterSlideCorners(md) {
  if (!md) return null;
  const m = frontMatterMatch(md);
  if (!m) return null;
  // The shared scalar rule, never a private pattern — a `$`-anchored regex here is how
  // an annotated `slide-corners: rounded  # for the web` silently resolves to nothing on one
  // render path and correctly on another. See resolve-finish.js.
  return frontMatterName(m[1], 'slide-corners');
}

/** True if `value` is a recognized `slide-corners:` value. */
function isKnownSlideCorners(value) {
  return typeof value === 'string' && SLIDE_CORNERS_NAME_SET.has(value.trim().toLowerCase());
}

/**
 * Map a `slide-corners:` value to its deck-wide class token. `square` (the default), empty,
 * and unknown all map to `''` — only `rounded` stamps a token deck-wide, so a deck that
 * says nothing is byte-identical to one written before this register existed.
 */
function slideCornersClass(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase() === 'rounded' ? 'slide-corners-rounded' : '';
}

/** Convenience: read `slide-corners:` from a full deck source + map it to its class token. */
function slideCornersClassFromSource(md) {
  return slideCornersClass(readFrontMatterSlideCorners(md) || '');
}

/**
 * True if a class token is a corners override token. Used by both render paths to
 * detect a per-slide override, so a slide's own `slide-corners-square` evicts the deck's
 * `slide-corners-rounded` rather than landing beside it (the two rules share specificity, so
 * side-by-side would resolve by CSS source order rather than by author intent).
 */
function isSlideCornersToken(token) {
  return SLIDE_CORNERS_TOKEN_SET.has(token);
}

module.exports = {
  SLIDE_CORNERS_NAMES,
  SLIDE_CORNERS_TOKENS,
  readFrontMatterSlideCorners,
  isKnownSlideCorners,
  slideCornersClass,
  slideCornersClassFromSource,
  isSlideCornersToken,
};
