/**
 * lib/core/resolve-cards.js
 *
 * WHERE A CARD ROW PUTS THE HEIGHT IT DOES NOT NEED.
 *
 * A row of cards (cards-grid, verdict-grid, …) is a wrapped flex container given the whole
 * stage. Stretching its lines to share that height makes a card holding one line of text as
 * tall as the row, carrying the difference as empty space inside itself. Which composition
 * is right depends on the component AND on the slide's shape, so nobody guesses:
 *
 *   · the COMPONENT declares its own default in its manifest (`cards`), baked into
 *     cards-catalog.generated.js because the runtime bundle cannot fs-load manifests;
 *   · the AUTHOR overrides it deck-wide with `cards:` front matter, or on one slide with
 *     `_class: cards-*`;
 *   · this kernel resolves the two, and the engine stamps the answer as `data-cards`.
 *
 * WHO WINS, in order:
 *
 *   1. a per-slide `_class: cards-*`   — one slide, named by the author
 *   2. the deck's `cards:` front matter — the whole deck, named by the author
 *   3. the manifest: `withCoda`, then `byFamily[family]`, then `default`
 *
 * OMITTING `cards:` IS NOT THE SAME AS WRITING `cards: center`. Omission means "the
 * component decides", and a component may decide differently per shape — cards-grid paces
 * its cards down a tall frame rather than centering them, because there it is a single
 * column of full-width cards and not a grid. Writing a value means "I want this one,
 * everywhere". That is why all four values stamp a token and none of them is a silent
 * default: a default that stamped nothing could not be told apart from silence, and the
 * author's wish would lose wherever the component's default differed.
 *
 * A component that declares NOTHING is not governed: `resolveCardsAlign` returns null, the
 * engine stamps no `data-cards`, and that component's stylesheet keeps doing whatever it
 * does today. Opting one in is a manifest field, not a CSS edit — which is the point.
 *
 * THE CSS SIDE is one declaration per container: `align-content: var(--cards-align)`, with
 * `--cards-align` set by the `[data-cards]` rules in base.tokens.css. No component encodes
 * its own default in CSS, and the split-page rules still override outright at higher
 * specificity, so a run's pages look alike whatever the deck asked for.
 *
 * Pure + dependency-free apart from the generated catalog, so it bundles into the browser
 * runtime and is unit-testable in isolation; shared by lattice-emulator.js's pipeline,
 * plugins.js and runtime/index.js so every surface resolves identically.
 * See engineering/decisions/2026-09-01-card-stack-vertical-alignment.md §10.
 */

const { frontMatterName } = require('./front-matter-key');
const CARDS_CATALOG = require('./cards-catalog.generated.js');

/** The author-facing values. There is no "default" among them — the default is the
 *  component's, and it lives in the manifest. */
const CARDS_NAMES = Object.freeze(['center', 'stretch', 'top', 'spread']);

/** The class token each value carries, deck-wide and per slide. */
const CARDS_TOKENS = Object.freeze(['cards-center', 'cards-stretch', 'cards-top', 'cards-spread']);

/** What each value means in CSS — the one place the mapping lives on the JS side. */
const CARDS_CSS = Object.freeze({
  center: 'center',
  stretch: 'stretch',
  top: 'flex-start',
  spread: 'space-evenly',
});

const CARDS_NAME_SET = new Set(CARDS_NAMES);
const CARDS_TOKEN_SET = new Set(CARDS_TOKENS);

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

/** Map a cards value to its class token. Unknown / empty → `''` (nothing is stamped, so
 *  the component's own declaration stands and deck-lint flags the typo). */
function cardsClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  return CARDS_NAME_SET.has(v) ? `cards-${v}` : '';
}

/** Convenience: read `cards:` from a full deck source + map it to its class token. */
function cardsClassFromSource(md) {
  return cardsClass(readFrontMatterCards(md) || '');
}

/** The component among `classes` that declares a card composition, or null. */
function governedComponent(classes) {
  if (!Array.isArray(classes)) return null;
  for (const c of classes) if (CARDS_CATALOG[c]) return c;
  return null;
}

/** What a COMPONENT declares, before any author override — `withCoda` beats
 *  `byFamily[family]`, which beats `default`. Null when it declares nothing. */
function componentCardsAlign(component, { family, hasCoda } = {}) {
  const entry = CARDS_CATALOG[component];
  if (!entry) return null;
  if (hasCoda && entry.withCoda) return entry.withCoda;
  if (family && entry.byFamily?.[family]) return entry.byFamily[family];
  return entry.default || null;
}

/**
 * The one resolver both render paths call. `classes` is the section's FINAL class list —
 * the component name plus whatever `cards-*` token the author's deck or slide contributed,
 * which by then is already the winner of slide-over-deck. Returns the author-facing name to
 * stamp as `data-cards`, or null to stamp nothing (an ungoverned component).
 *
 * `family` is the section's `data-family`; absent means the wide family, which is how the
 * engine stamps it. `hasCoda` says whether the slide ends in a key-insight / below-note
 * panel — a DOM fact the caller supplies, since only the caller can see the built cell.
 */
function resolveCardsAlign({ classes, family, hasCoda } = {}) {
  const component = governedComponent(classes);
  if (!component) return null;
  const own = classes.find((c) => CARDS_TOKEN_SET.has(c));
  if (own) return own.slice('cards-'.length);
  return componentCardsAlign(component, { family: family || 'wide', hasCoda });
}

module.exports = {
  CARDS_NAMES,
  CARDS_TOKENS,
  CARDS_CSS,
  readFrontMatterCards,
  isKnownCards,
  cardsClass,
  cardsClassFromSource,
  governedComponent,
  componentCardsAlign,
  resolveCardsAlign,
};
