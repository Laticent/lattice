/**
 * resolve-fit — the `fit:` deck front-matter register.
 *
 * ONE setting for everything the engine may do to make a slide fit
 * (engineering/decisions/2026-09-25-fit-policy.md, owner ruling 2026-09-25):
 *
 *   fit: report   the engine changes nothing — it only flags. No SPLIT, no TRIM. The
 *                 "if things go south" switch, and an exact-reproduction mode.
 *   fit: heal     the DEFAULT. The move that loses no content: SPLIT (auto-split.js).
 *                 (STEP, the font-scale step-down, was retired on 2026-09-27: a venue
 *                 is a fixed size.) Maps to NO class, so a deck that says nothing
 *                 renders byte-identically to one written before this register existed.
 *   fit: trim     also TRIM (guards-trim.js), the move that cuts words.
 *
 * The register was first spelled `guards: loose|strict`, with the per-slide classes
 * `guards-loose` / `guards-strict`. The plain-English renames removed that spelling
 * (engineering/decisions/2026-11-21-plain-english-key-renames.md, D2): the engine reads
 * only `fit:` and `fit-*`, and `lint:deck --fix` rewrites the old ones (`key-renamed`,
 * and `unknown-class` for the two classes).
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
 * setting safely: `lib/export/marp-bundle.js` bakes front matter into the bundle, so
 * a key set once for one meeting becomes a permanent property of every deck
 * derived from it. That argument applies HARDER here, because this key removes
 * text rather than changing a marker. See the design note's open problem 9 — it is
 * open, not answered.
 */

const { frontMatterName } = require('./front-matter-key');

const { frontMatterMatch } = require('./front-matter-fence.mjs');

/** Recognized `fit:` values. `heal` is the default and maps to NO token. */
const FIT_NAMES = Object.freeze(['report', 'heal', 'trim']);

/**
 * Per-slide override tokens. `fit-heal` carries an explicit token even though heal is
 * the default: a slide inside a `fit: trim` or `fit: report` deck needs a way to opt
 * back to the default, and "no token" cannot express that once the deck has stamped one.
 */
const FIT_TOKENS = Object.freeze(['fit-report', 'fit-heal', 'fit-trim']);

const FIT_NAME_SET = new Set(FIT_NAMES);
const FIT_TOKEN_SET = new Set(FIT_TOKENS);

/** Extract the raw `fit:` value from a deck source's front matter, or null. */
function readFrontMatterFit(md) {
  if (!md) return null;
  const m = frontMatterMatch(md);
  if (!m) return null;
  // The shared scalar rule, never a private pattern — a `$`-anchored regex here is
  // how an annotated `fit: trim  # for the board pack` silently resolves to nothing
  // on one render path and correctly on another. See resolve-finish.js.
  return frontMatterName(m[1], 'fit');
}

/** True if `value` is a recognized `fit:` value. */
function isKnownFit(value) {
  return typeof value === 'string' && FIT_NAME_SET.has(value.trim().toLowerCase());
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
 * calls (plugins.js, lib/runtime), so the key resolves identically everywhere.
 */
function fitClassFromFrontMatter(fmBody) {
  return fitClass(frontMatterName(fmBody || '', 'fit') || '');
}

/** True if a class token is one of this register's per-slide override tokens. */
function isFitToken(token) {
  return FIT_TOKEN_SET.has(token);
}

/**
 * The fit level for a slide carrying `classes`: 'report' | 'heal' | 'trim', the
 * default `heal` when it carries none. Closure-free for the same reason `trimEnabled`
 * is — its source is injected into the export.
 */
function fitLevel(classes) {
  const list = Array.isArray(classes) ? classes : String(classes || '').split(/\s+/);
  if (list.includes('fit-report')) return 'report';
  if (list.includes('fit-trim')) return 'trim';
  return 'heal';
}

/**
 * Is TRIM enabled for a slide carrying `classes`? The per-slide token wins over
 * the deck token, which is why both paths must evict rather than append (the two
 * rules share specificity, so side-by-side would resolve by CSS source order
 * rather than by author intent).
 */
/*
 * Closure-free on purpose: `TRIM_ENABLED_SRC` below is `.toString()`-injected whole
 * into `page.evaluate`, the same contract `overflow-probe.js` and `guards-trim.js` use.
 * It may not reference anything from this module's scope — which is why the tokens
 * are written out rather than read from `FIT_TOKENS`.
 */
function trimEnabled(classes) {
  // TRIM runs only at `trim`. Inlined rather than calling `fitLevel`, because this
  // function's source is injected on its own (TRIM_ENABLED_SRC) and may not reference
  // anything outside itself. The order matches `fitLevel` exactly — a unit test pins the
  // two against each other over every token combination.
  const list = Array.isArray(classes) ? classes : String(classes || '').split(/\s+/);
  if (list.includes('fit-report')) return false;
  return list.includes('fit-trim');
}

module.exports = {
  FIT_NAMES,
  FIT_TOKENS,
  readFrontMatterFit,
  isKnownFit,
  fitClass,
  fitClassFromFrontMatter,
  isFitToken,
  fitLevel,
  trimEnabled,
  // Function source for verbatim injection into browser-string contexts — keeps
  // "is this slide trimmable?" single-sourced across both render paths (HARD RULE #1).
  TRIM_ENABLED_SRC: trimEnabled.toString(),
};
