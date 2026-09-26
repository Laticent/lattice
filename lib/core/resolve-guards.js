/**
 * resolve-guards — the `fit:` deck front-matter register (formerly `guards:`).
 *
 * ONE setting for everything the engine may do to make a slide fit
 * (engineering/decisions/2026-09-25-fit-policy.md, owner ruling 2026-09-25):
 *
 *   fit: report   the engine changes nothing — it only flags. No SPLIT, no STEP, no
 *                 TRIM. The "if things go south" switch, and an exact-reproduction mode.
 *   fit: heal     the DEFAULT. Moves that lose no content: SPLIT (auto-split.js) and
 *                 STEP (scale-fit.js). Maps to NO class, so a deck that says nothing
 *                 renders byte-identically to one written before this register existed.
 *   fit: trim     also TRIM (guards-trim.js), the move that cuts words.
 *
 * `guards:` is the register's OLD spelling and still works for one release:
 * `guards: loose` means `heal` and `guards: strict` means `trim`. When both keys are
 * present, `fit:` wins. `lint:deck` names the new spelling (`guards-renamed`).
 *
 * The file keeps its name and its `guards*` exports so the TRIM plumbing that already
 * reads them is untouched; "may TRIM run here?" is still `guardsEnabled`.
 *
 * ── WHY A DECK REGISTER, AND THE RULING IT OVERRIDES ────────────────────────
 *
 * `2026-07-30-overflow-marker-register.md` moved `overflow-marker:` OUT of front
 * matter, on the argument that overflow presentation is a property of the RENDER
 * TARGET rather than of the deck. `guards:` deliberately took the opposite view
 * for this key, and the owner ruled on it (2026-09-07): whether the tail of a
 * sentence may be cut is a fact about the CONTENT — only the author knows whether
 * a tail is elaboration or the point — and not about the screen it lands on.
 * `fit:` inherits that ruling. It also partly reverses the retirement of
 * `autosplit:` (2026-07-29): `report` switches off every move at once, for one stated
 * reason, which is not the per-move toggle that ruling retired. See the fit-policy note.
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

/** Recognized `guards:` values — the register's old spelling. */
const GUARDS_NAMES = Object.freeze(['loose', 'strict']);

/** Recognized `fit:` values. `heal` is the default and maps to NO token. */
const FIT_NAMES = Object.freeze(['report', 'heal', 'trim']);

/**
 * Per-slide override tokens, new spelling first. `fit-heal` (and the old
 * `guards-loose`) carries an explicit token even though heal is the default: a slide
 * inside a `fit: trim` or `fit: report` deck needs a way to opt back to the default,
 * and "no token" cannot express that once the deck has stamped one.
 */
const FIT_TOKENS = Object.freeze(['fit-report', 'fit-heal', 'fit-trim']);
const GUARDS_TOKENS = Object.freeze(['fit-report', 'fit-heal', 'fit-trim', 'guards-strict', 'guards-loose']);

const GUARDS_NAME_SET = new Set(GUARDS_NAMES);
const FIT_NAME_SET = new Set(FIT_NAMES);
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

/** Extract the raw `fit:` value from a deck source's front matter, or null. */
function readFrontMatterFit(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  return frontMatterName(m[1], 'fit');
}

/** True if `value` is a recognized `guards:` value. */
function isKnownGuards(value) {
  return typeof value === 'string' && GUARDS_NAME_SET.has(value.trim().toLowerCase());
}

/** True if `value` is a recognized `fit:` value. */
function isKnownFit(value) {
  return typeof value === 'string' && FIT_NAME_SET.has(value.trim().toLowerCase());
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

/** Map a `fit:` value to its deck-wide class token. `heal` (the default), empty and
 * unknown all map to `''`; `lint:deck` flags an unknown one (`unknown-fit`). */
function fitClass(value) {
  if (typeof value !== 'string') return '';
  const v = value.trim().toLowerCase();
  return v === 'report' ? 'fit-report' : v === 'trim' ? 'fit-trim' : '';
}

/**
 * The deck-wide token for a front-matter BODY — the one entry point every render path
 * calls (plugins.js, lib/runtime), so the two keys resolve identically everywhere.
 * `fit:` wins when both are present; `guards:` is the old spelling.
 */
function fitClassFromFrontMatter(fmBody) {
  const fit = frontMatterName(fmBody || '', 'fit');
  if (fit) return fitClass(fit);
  return guardsClass(frontMatterName(fmBody || '', 'guards') || '');
}

/** Convenience: read `guards:` from a full deck source + map it to its class token. */
function guardsClassFromSource(md) {
  return guardsClass(readFrontMatterGuards(md) || '');
}

/** True if a class token is one of this register's override tokens (either spelling). */
function isGuardsToken(token) {
  return GUARDS_TOKEN_SET.has(token);
}

/**
 * The fit level for a slide carrying `classes`: 'report' | 'heal' | 'trim'. The new
 * spelling wins over the old; with neither, the default `heal`. Closure-free for the
 * same reason `guardsEnabled` is — its source is injected into the export.
 */
function fitLevel(classes) {
  const list = Array.isArray(classes) ? classes : String(classes || '').split(/\s+/);
  if (list.includes('fit-report')) return 'report';
  if (list.includes('fit-trim')) return 'trim';
  if (list.includes('fit-heal')) return 'heal';
  if (list.includes('guards-loose')) return 'heal';
  if (list.includes('guards-strict')) return 'trim';
  return 'heal';
}

/**
 * Is TRIM enabled for a slide carrying `classes`? The per-slide token wins over
 * the deck token, which is why both paths must evict rather than append (the two
 * rules share specificity, so side-by-side would resolve by CSS source order
 * rather than by author intent).
 */
/*
 * Closure-free on purpose: `GUARDS_ENABLED_SRC` below is `.toString()`-injected whole
 * into `page.evaluate`, the same contract `overflow-probe.js` and `guards-trim.js` use.
 * It may not reference anything from this module's scope — which is why the two tokens
 * are written out rather than read from `GUARDS_TOKENS`.
 */
function guardsEnabled(classes) {
  // TRIM runs only at `trim`. Inlined rather than calling `fitLevel`, because this
  // function's source is injected on its own (GUARDS_ENABLED_SRC) and may not reference
  // anything outside itself. The order matches `fitLevel` exactly — a unit test pins the
  // two against each other over every token combination.
  const list = Array.isArray(classes) ? classes : String(classes || '').split(/\s+/);
  if (list.includes('fit-report')) return false;
  if (list.includes('fit-trim')) return true;
  if (list.includes('fit-heal')) return false;
  if (list.includes('guards-loose')) return false;
  return list.includes('guards-strict');
}

module.exports = {
  GUARDS_NAMES,
  GUARDS_TOKENS,
  FIT_NAMES,
  FIT_TOKENS,
  readFrontMatterGuards,
  readFrontMatterFit,
  isKnownGuards,
  isKnownFit,
  guardsClass,
  fitClass,
  fitClassFromFrontMatter,
  guardsClassFromSource,
  isGuardsToken,
  fitLevel,
  guardsEnabled,
  // Function source for verbatim injection into browser-string contexts — keeps
  // "is this slide trimmable?" single-sourced across both render paths (HARD RULE #1).
  GUARDS_ENABLED_SRC: guardsEnabled.toString(),
};
