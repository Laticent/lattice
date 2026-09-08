/**
 * resolve-guards — the `guards:` deck front-matter register.
 *
 *   guards: loose    the baseline. Overflow clips and rings, exactly as before.
 *   guards: strict   TRIM is allowed to cut text that does not fit (guards-trim.js).
 *
 * `loose` is the default and maps to NO class, so a deck that says nothing renders
 * byte-identically to one written before this register existed.
 *
 * ── WHY A DECK REGISTER, AND THE RULING IT OVERRIDES ────────────────────────
 *
 * `2026-07-30-overflow-marker-register.md` moved `overflow-marker:` OUT of front
 * matter, on the argument that overflow presentation is a property of the RENDER
 * TARGET rather than of the deck. `guards:` deliberately takes the opposite view
 * for this key, and the owner ruled on it (2026-09-07): whether the tail of a
 * sentence may be cut is a fact about the CONTENT — only the author knows whether
 * a tail is elaboration or the point — and not about the screen it lands on.
 *
 * That override is not free, and the thing it owes is recorded rather than waved
 * through. The 07-30 note's second argument was that a re-export cannot inherit a
 * setting safely: `lib/core/marp-bundle.js` bakes front matter into the bundle, so
 * a key set once for one meeting becomes a permanent property of every deck
 * derived from it. That argument applies HARDER here, because this key removes
 * text rather than changing a marker. See the design note's open problem 9 — it is
 * open, not answered.
 */

const { frontMatterName } = require('./front-matter-key');

/** Recognized `guards:` values. `loose` is the baseline and maps to NO token. */
const GUARDS_NAMES = Object.freeze(['loose', 'strict']);

/**
 * Per-slide override tokens. `guards-loose` carries an explicit token even though
 * loose is the default: a slide inside a `guards: strict` deck needs a way to opt
 * back out, and "no token" cannot express that once the deck has stamped one.
 */
const GUARDS_TOKENS = Object.freeze(['guards-strict', 'guards-loose']);

const GUARDS_NAME_SET = new Set(GUARDS_NAMES);
const GUARDS_TOKEN_SET = new Set(GUARDS_TOKENS);

/** Extract the raw `guards:` value from a deck source's front matter, or null. */
function readFrontMatterGuards(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  // The shared scalar rule, never a private pattern — a `$`-anchored regex here is
  // how an annotated `guards: strict  # for the board pack` silently resolves to
  // nothing on one render path and correctly on another. See resolve-finish.js.
  return frontMatterName(m[1], 'guards');
}

/** True if `value` is a recognized `guards:` value. */
function isKnownGuards(value) {
  return typeof value === 'string' && GUARDS_NAME_SET.has(value.trim().toLowerCase());
}

/**
 * Map a `guards:` value to its deck-wide class token. `loose` (the default), empty
 * and unknown all map to `''`. An unknown value resolving to the baseline is why
 * `lint:deck` flags it (`unknown-guards`) — silently shipping the baseline is the
 * failure mode `unknown-finish` exists for.
 */
function guardsClass(value) {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase() === 'strict' ? 'guards-strict' : '';
}

/** Convenience: read `guards:` from a full deck source + map it to its class token. */
function guardsClassFromSource(md) {
  return guardsClass(readFrontMatterGuards(md) || '');
}

/** True if a class token is a guards override token. */
function isGuardsToken(token) {
  return GUARDS_TOKEN_SET.has(token);
}

/**
 * Is TRIM enabled for a slide carrying `classes`? The per-slide token wins over
 * the deck token, which is why both paths must evict rather than append (the two
 * rules share specificity, so side-by-side would resolve by CSS source order
 * rather than by author intent).
 */
function guardsEnabled(classes) {
  const list = Array.isArray(classes) ? classes : String(classes || '').split(/\s+/);
  if (list.includes('guards-loose')) return false;
  return list.includes('guards-strict');
}

module.exports = {
  GUARDS_NAMES,
  GUARDS_TOKENS,
  readFrontMatterGuards,
  isKnownGuards,
  guardsClass,
  guardsClassFromSource,
  isGuardsToken,
  guardsEnabled,
};
