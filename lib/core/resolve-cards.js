/**
 * lib/core/resolve-cards.js
 *
 * The deck front-matter `cards:` register controls where a sparse CARD ROW puts the
 * height it does not need. A row of cards (cards-grid, verdict-grid, …) is a wrapped
 * flex container given the full stage height; by default its wrapped lines STRETCH to
 * share that height, so a card holding one line of text is as tall as the row and
 * carries the difference as empty space inside itself. That is right when the cards are
 * full and wrong when they are sparse, and only the author knows which.
 *
 * So the engine keeps stretching by default and hands the author the other three:
 *
 *   cards: stretch  → (no token)     cards fill their row — the DEFAULT, unchanged
 *   cards: center   → `cards-center` cards shrink to their text, band centered
 *   cards: top      → `cards-top`    cards shrink, band under the headline rule
 *   cards: spread   → `cards-spread` cards shrink, the space shared between the rows
 *
 * A per-slide `_class: cards-center` (or `-top` / `-spread` / `-stretch`) overrides the
 * deck-wide value for one slide, exactly as `_class: lifted`/`flat` does for `lift:`.
 *
 * MECHANISM — a token, not a specificity fight. Each value resolves to a class that sets
 * `--cards-align`, and a card row reads `align-content: var(--cards-align, <its own
 * default>)`. The component keeps its own default in the fallback, so an absent register
 * changes nothing and a per-family default (cards-grid paces its cards down a tall frame
 * rather than centering them) survives untouched. It also means the split-page rules,
 * which override `align-content` outright at higher specificity, still win: a run's pages
 * must look alike whatever the deck asked for.
 *
 * Pure + dependency-free so it bundles into the browser runtime and is unit-testable in
 * isolation; shared by lattice-emulator.js's pipeline, plugins.js, and runtime/index.js
 * so both render paths produce identical class lists.
 * See engineering/decisions/2026-09-01-card-stack-vertical-alignment.md §5.
 */

const { frontMatterName } = require('./front-matter-key');

/** Recognized deck values. `stretch` is the default and maps to NO token. */
const CARDS_NAMES = Object.freeze(['stretch', 'center', 'top', 'spread']);

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

/** Map a cards value to its deck-wide class token. `stretch`, empty and unknown → `''`
 *  (stretching is the default, so no token is stamped and no rule changes). */
function cardsClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  if (v === 'stretch' || !CARDS_NAME_SET.has(v)) return '';
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
