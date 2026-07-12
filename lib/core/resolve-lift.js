/**
 * lib/core/resolve-lift.js
 *
 * The deck front-matter `lift:` register controls the "Struck" card ELEVATION — the
 * box-shadow lift on card surfaces (cards-grid, kpi tiles, stats, pricing, verdict-grid,
 * …). OPT-IN: a deck is flat unless it sets `lift: on`, which stamps `lifted` on every
 * section; a per-slide `_class: lifted` lifts one slide, and `_class: flat` drops one
 * slide out of a lifted deck. Sibling of finish:/mode:/stamp:/tone:/spectrum: — a thin map
 * from a value to the class token appended to every <section>, overridable per slide. The
 * `lifted` class activates the `--elevation-card` / `--elevation-berth` tokens
 * (base.tokens.css); off → they resolve to `none` / `0`, so there is no shadow AND no
 * berth padding. (`lift` is the author-facing switch; `elevation` is the design concept /
 * token namespace it turns on.)
 *
 *   lift: on   → `lifted`   cards lift deck-wide
 *   lift: off  → (no token) flat — the default (also the no-config baseline)
 *
 * Pure + dependency-free so it bundles into the browser runtime and is unit-testable in
 * isolation; shared by lattice-emulator.js's pipeline, plugins.js, and runtime/index.js
 * so all three render paths produce identical class lists.
 * See engineering/decisions/2026-07-12-struck-elevation.md.
 */

// Recognized values. `off` is the flat default and maps to NO token; only `on` carries
// the `lifted` class.
const LIFT_NAMES = Object.freeze(['on', 'off']);
/** The per-slide override tokens: `lifted` opts a slide IN, `flat` opts it OUT. */
const LIFT_TOKENS = Object.freeze(['lifted', 'flat']);

const LIFT_NAME_SET = new Set(LIFT_NAMES);

/** Extract the raw `lift:` value from a deck source's front matter, or null. */
function readFrontMatterLift(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^\s*lift:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized lift value. */
function isKnownLift(value) {
  return typeof value === 'string' && LIFT_NAME_SET.has(value.trim().toLowerCase());
}

/** Map a lift value to its deck-wide class token. `on` → `lifted`; `off`, empty, and
 *  unknown → `''` (flat is the default, so no token is stamped). */
function liftClass(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase() === 'on' ? 'lifted' : '';
}

/** Convenience: read `lift:` from a full deck source + map it to its class token. */
function liftClassFromSource(md) {
  return liftClass(readFrontMatterLift(md) || '');
}

module.exports = {
  LIFT_NAMES,
  LIFT_TOKENS,
  readFrontMatterLift,
  isKnownLift,
  liftClass,
  liftClassFromSource,
};
