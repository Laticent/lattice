/**
 * lib/core/resolve-cards.js
 *
 * The deck front-matter `cards:` register controls where a CARD ROW puts the height it
 * does not need. A row of cards (cards-grid, verdict-grid, …) is a wrapped flex container
 * given the full stage height. Stretching its lines to share that height makes a card
 * holding one line of text as tall as the row, carrying the difference as empty space
 * inside itself — so the DEFAULT is to size the cards to their text and center the band,
 * and the other three compositions are the author's to ask for:
 *
 *   cards: center   → (no token)      cards shrink to their text, band centered — the DEFAULT
 *   cards: stretch  → `cards-stretch` cards fill their row, absorbing the spare height
 *   cards: top      → `cards-top`     cards shrink, band under the headline rule
 *   cards: spread   → `cards-spread`  cards shrink, the space shared between the rows
 *
 * A per-slide `_class: cards-center` (or `-top` / `-spread` / `-stretch`) overrides the
 * deck-wide value for one slide, exactly as `_class: lifted`/`flat` does for `lift:`.
 *
 * MECHANISM — a token, not a specificity fight. Each non-default value resolves to a class
 * that sets `--cards-align`, and a card row reads `align-content: var(--cards-align, <its
 * own default>)`. Keeping the default in each rule's FALLBACK rather than in a `:root`
 * declaration is what lets a per-family default survive: cards-grid at tall/strip is a
 * single column of full-width cards, not a grid, and it paces them down the frame instead
 * of centering them. `cards: center` therefore stamps nothing and resolves to each rule's
 * own fallback — which is why the explicit value and the omitted one are identical rather
 * than subtly different. It also means the split-page rules, which override
 * `align-content` outright at higher specificity, still win: a run's pages must look alike
 * whatever the deck asked for.
 *
 * Pure + dependency-free so it bundles into the browser runtime and is unit-testable in
 * isolation; shared by lattice-emulator.js's pipeline, plugins.js, and runtime/index.js
 * so both render paths produce identical class lists.
 * See engineering/decisions/2026-09-01-card-stack-vertical-alignment.md §5.
 */

const { frontMatterName } = require('./front-matter-key');

/** Recognized deck values. `center` is the default and maps to NO token. */
const CARDS_NAMES = Object.freeze(['center', 'stretch', 'top', 'spread']);

/** The per-slide override tokens — one per value, including the default, so a slide can
 *  opt BACK to stretching inside a deck that set something else. */
const CARDS_TOKENS = Object.freeze(['cards-stretch', 'cards-center', 'cards-top', 'cards-spread']);

const CARDS_NAME_SET = new Set(CARDS_NAMES);

/** Extract the raw `cards:` value from a deck source's front matter, or null. */
function readFrontMatterCards(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  return frontMatterName(m[1], 'cards');
}

/** True if `value` is a recognized cards value. */
function isKnownCards(value) {
  return typeof value === 'string' && CARDS_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a cards value to its deck-wide class token. `center`, empty and unknown → `''`
 *  (centering is the default, so no token is stamped and every rule falls back to its
 *  own value). */
function cardsClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  if (v === 'center' || !CARDS_NAME_SET.has(v)) return '';
  return `cards-${v}`;
}

/** Convenience: read `cards:` from a full deck source + map it to its class token. */
function cardsClassFromSource(md) {
  return cardsClass(readFrontMatterCards(md) || '');
}

module.exports = {
  CARDS_NAMES,
  CARDS_TOKENS,
  readFrontMatterCards,
  isKnownCards,
  cardsClass,
  cardsClassFromSource,
};
