/**
 * lib/core/resolve-card-lift.js
 *
 * The deck front-matter `card-lift:` register controls the "Struck" card ELEVATION — the
 * box-shadow lift on card surfaces (cards-grid, kpi tiles, stats, pricing, verdict-grid,
 * …). OPT-IN: a deck is flat unless it sets `card-lift: on`, which stamps `card-lift-on` on every
 * section; a per-slide `_class: card-lift-on` lifts one slide, and `_class: card-lift-off` drops one
 * slide out of a lifted deck. Sibling of finish:/mode:/stamp-shape:/tone:/spectrum: — a thin map
 * from a value to the class token appended to every <section>, overridable per slide. The
 * `card-lift-on` class activates the `--elevation-card` / `--elevation-berth` tokens
 * (base.tokens.css); off → they resolve to `none` / `0`, so there is no shadow AND no
 * berth padding. (`lift` is the author-facing switch; `elevation` is the design concept /
 * token namespace it turns on.)
 *
 *   card-lift: on   → `card-lift-on`   cards lift deck-wide
 *   card-lift: off  → (no token) flat — the default (also the no-config baseline)
 *
 * Pure + dependency-free so it bundles into the browser runtime and is unit-testable in
 * isolation; shared by lattice.js's pipeline, plugins.js, and runtime/index.js
 * so both render paths produce identical class lists.
 * See engineering/decisions/2026-07-12-struck-elevation.md.
 */

const { frontMatterName } = require('./front-matter-key');

const { frontMatterMatch } = require('./front-matter-fence.mjs');
// Recognized values. `off` is the flat default and maps to NO token; only `on` carries
// the `card-lift-on` class.
const CARD_LIFT_NAMES = Object.freeze(['on', 'off']);
/** The per-slide override tokens: `card-lift-on` opts a slide IN, `card-lift-off` opts it OUT. */
const CARD_LIFT_TOKENS = Object.freeze(['card-lift-on', 'card-lift-off']);

const CARD_LIFT_NAME_SET = new Set(CARD_LIFT_NAMES);

/** Extract the raw `card-lift:` value from a deck source's front matter, or null. */
function readFrontMatterCardLift(md) {
  if (!md) return null;
  const m = frontMatterMatch(md);
  if (!m) return null;
  // The shared scalar rule + the SAME bare-name constraint this line used to fold into
  // one pattern. The old `$` anchor made a trailing YAML comment fail the whole
  // match, so an annotated register silently resolved to nothing.
  return frontMatterName(m[1], 'card-lift');
}

/** True if `value` is a recognized lift value. */
function isKnownCardLift(value) {
  return typeof value === 'string' && CARD_LIFT_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a lift value to its deck-wide class token. `on` → `card-lift-on`; `off`, empty, and
 *  unknown → `''` (flat is the default, so no token is stamped). */
function cardLiftClass(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase() === 'on' ? 'card-lift-on' : '';
}

/** Convenience: read `card-lift:` from a full deck source + map it to its class token. */
function cardLiftClassFromSource(md) {
  return cardLiftClass(readFrontMatterCardLift(md) || '');
}

module.exports = {
  CARD_LIFT_NAMES,
  CARD_LIFT_TOKENS,
  readFrontMatterCardLift,
  isKnownCardLift,
  cardLiftClass,
  cardLiftClassFromSource,
};
