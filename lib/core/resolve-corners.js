/**
 * lib/core/resolve-corners.js
 *
 * The CORNERS register — whether a slide's own surface is square or rounded.
 *
 * WHY THIS EXISTS. Nothing in the engine had an opinion about the slide's corner.
 * `section` carried no `border-radius` at all, so every exported artifact was square
 * by accident rather than by decision — and every CONSUMER that shows a slide invented
 * its own corner instead: the Studio's live preview clipped at a fixed `rounded-xl`
 * (12px), the slide-picker tiles and overview thumbnails at another `rounded-xl`, the
 * Fabricate specimens at `rounded-lg`. Six call sites, two values, none of them
 * theme-aware and none of them proportional to the slide.
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
 * `finish:` / `mode:` / `stamp:` / `spectrum:` (lib/core/resolve-spectrum.js is the
 * closest sibling: a small on/off axis with a no-token baseline). The engine CSS then
 * resolves the token to a length:
 *
 *     corners: square   → (no token)         --slide-radius: 0        the default
 *     corners: rounded  → corners-rounded    --slide-radius: var(--slide-radius-rounded)
 *
 * WHY SQUARE IS THE DEFAULT. It is the only value that changes nothing. Every deck in
 * every corpus renders and exports today exactly as it did — the token resolves to the
 * `0` that was previously the initial value — so this register is opt-in rather than a
 * silent rewrite of every existing PDF. `rounded` is one line of front matter away.
 *
 * WHY A CLASS TOKEN AND NOT A BARE THEME VALUE. A theme supplies the VALUE (how round
 * "rounded" is for this palette, via `--slide-radius-rounded`) — that is the theme
 * layer's job under 2026-08-09-color-theme-ownership.md. But WHICH of square or rounded
 * a deck wants is the DECK's call, the same axis `theme:` and `color-mode:` already sit
 * on, and the class-token register is how a deck-wide choice reaches every section
 * including ones carrying their own `_class:`. Per-slide `_class: corners-rounded` /
 * `corners-square` overrides the deck, like every other register in this family.
 *
 * Pure + dependency-free so it bundles into the browser runtime and is unit-testable in
 * isolation; shared by plugins.js and runtime/index.js so both render paths produce
 * identical class lists (HARD RULE #1).
 */

const { frontMatterName } = require('./front-matter-key');

/** Recognized `corners:` values. `square` is the baseline and maps to NO token. */
const CORNERS_NAMES = Object.freeze(['square', 'rounded']);

/**
 * The per-slide override tokens. `corners-square` carries an EXPLICIT token even though
 * square is the deck-wide default: a slide inside a `corners: rounded` deck needs a way
 * to opt back out, and "no token" cannot express that once the deck has stamped one.
 */
const CORNERS_TOKENS = Object.freeze(['corners-rounded', 'corners-square']);

const CORNERS_NAME_SET = new Set(CORNERS_NAMES);
const CORNERS_TOKEN_SET = new Set(CORNERS_TOKENS);

/** Extract the raw `corners:` value from a deck source's front matter, or null. */
function readFrontMatterCorners(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  // The shared scalar rule, never a private pattern — a `$`-anchored regex here is how
  // an annotated `corners: rounded  # for the web` silently resolves to nothing on one
  // render path and correctly on another. See resolve-finish.js.
  return frontMatterName(m[1], 'corners');
}

/** True if `value` is a recognized `corners:` value. */
function isKnownCorners(value) {
  return typeof value === 'string' && CORNERS_NAME_SET.has(value.trim().toLowerCase());
}

/**
 * Map a `corners:` value to its deck-wide class token. `square` (the default), empty,
 * and unknown all map to `''` — only `rounded` stamps a token deck-wide, so a deck that
 * says nothing is byte-identical to one written before this register existed.
 */
function cornersClass(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase() === 'rounded' ? 'corners-rounded' : '';
}

/** Convenience: read `corners:` from a full deck source + map it to its class token. */
function cornersClassFromSource(md) {
  return cornersClass(readFrontMatterCorners(md) || '');
}

/**
 * True if a class token is a corners override token. Used by both render paths to
 * detect a per-slide override, so a slide's own `corners-square` evicts the deck's
 * `corners-rounded` rather than landing beside it (the two rules share specificity, so
 * side-by-side would resolve by CSS source order rather than by author intent).
 */
function isCornersToken(token) {
  return CORNERS_TOKEN_SET.has(token);
}

module.exports = {
  CORNERS_NAMES,
  CORNERS_TOKENS,
  readFrontMatterCorners,
  isKnownCorners,
  cornersClass,
  cornersClassFromSource,
  isCornersToken,
};
