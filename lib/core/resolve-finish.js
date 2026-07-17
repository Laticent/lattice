/**
 * lib/core/resolve-finish.js
 *
 * The deck front-matter `finish:` register selects the deck's BACKDROP — the
 * palette-blind layer stack painted BEHIND content. It is a Lattice extension
 * (Marpit has no native `finish:`): the three render paths read it and APPEND the
 * mapped CSS class tokens to every `<section>`, exactly like the deck-wide `class:`
 * directive.
 *
 *   finish: none          → (no class)                 no backdrop (the default)
 *   finish: atrium        → `finish finish-atrium`     glow + grid + left rule
 *   finish: halo          → `finish finish-halo`       spotlight + rings + vignette
 *
 * NOTE: a finish is ONLY the backdrop. The deck's rendering MODE (its typographic
 * hand — the boardroom / sketch aesthetic) is a SEPARATE axis, `mode:` (see
 * lib/core/resolve-mode.js). The two compose: `mode: sketch` + `finish: atrium`.
 * Splitting them retired the old conflation where boardroom/sketch lived in this
 * register.
 *
 * Finish presets (the `field` zone) paint a palette-blind STACK of pure-gradient
 * layers behind every section — see lib/base/base.finish.css. The base `finish`
 * class carries the layer compositor; each `finish-<name>` sets the per-role
 * layer custom properties. They carry no url()/mask, so they are export-safe and
 * add no exfil surface.
 *
 * Open registry: add a row to FINISH_REGISTER + the matching base CSS to add a
 * finish — the same way `theme:` is an open set of registered palettes. There
 * is no opaque "default" value: `none` is the named baseline, and omitting
 * the key renders it. An omitted, empty, or UNRECOGNIZED value resolves to NO
 * classes (none); the deck-lint flags an unrecognized value so a typo
 * (`finish: atriumm`) surfaces instead of silently rendering nothing.
 *
 * Pure + dependency-free so it bundles into the browser runtime (esbuild) and
 * is unit-testable in isolation. Shared by lattice-emulator.js,
 * lib/integrations/markdown-it/plugins.js, and lib/runtime/index.js so all three
 * render paths produce identical class lists.
 */

// Register name → the class tokens appended to every section. '' = none
// (the baseline: no backdrop class, just the content over the theme canvas).
const FINISH_REGISTER = Object.freeze({
  none: '',
  // Finish presets — the parametric `field` zone (base.finish.css). Each maps to
  // the `finish` base class (the layer compositor) + its preset variant. Each
  // preset is a STACK of pure-gradient layers; palette-blind, export-safe.
  atrium: 'finish finish-atrium',
  meridian: 'finish finish-meridian',
  strata: 'finish finish-strata',
  halo: 'finish finish-halo',
  ledger: 'finish finish-ledger',
  // The 4 premium presets added in the Finish redesign extension — each leans into
  // a tunable/movable layer + a new layer type (mesh / lattice / pinstripe / frame).
  nimbus: 'finish finish-nimbus',
  loom: 'finish finish-loom',
  savile: 'finish finish-savile',
  gallery: 'finish finish-gallery',
  hanami: 'finish finish-hanami',
});

/** The recognized finish names (for the deck-lint vocabulary + docs). */
const FINISH_NAMES = Object.freeze(Object.keys(FINISH_REGISTER));

/** Extract the raw `finish:` value from a deck source's front matter, or null. */
function readFrontMatterFinish(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const f = m[1].match(/^\s*finish:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/m);
  return f ? f[1].trim() : null;
}

/** True if `value` is a recognized finish register name. */
function isKnownFinish(value) {
  return typeof value === 'string'
    && Object.hasOwn(FINISH_REGISTER, value.trim().toLowerCase());
}

/** Map a finish value to its space-joined class tokens ('' for boardroom/unknown). */
function finishClasses(value) {
  if (typeof value !== 'string') return '';
  const key = value.trim().toLowerCase();
  return Object.hasOwn(FINISH_REGISTER, key) ? FINISH_REGISTER[key] : '';
}

/** Convenience: read the `finish:` value from a full deck source + map it. */
function finishClassesFromSource(md) {
  return finishClasses(readFrontMatterFinish(md) || '');
}

// ── Per-slide finish: a single `finish-<name>` class implies the compositor ──
// The `finish` base class carries the layer compositor (the injected `.backdrop`
// wrapper + `section.finish > .backdrop` rules); each `finish-<name>` only SETS the
// per-role layer custom properties. Deck-wide, the register emits BOTH tokens
// (`finish finish-atrium`). But a slide authored with just `<!-- _class: finish-atrium -->`
// (or a saved `finish-<slug>`) would set the tokens with no compositor to paint them.
// So a per-slide finish variant IMPLIES the bare `finish` class — one class per slide
// applies the finish independently, built-in OR saved. `finish-none` (the per-slide
// opt-out) and the `finish-preview` specimen are NOT variants — they must not activate.
const FINISH_VARIANT_RE = /^finish-(.+)$/;
function isFinishVariantClass(token) {
  const m = FINISH_VARIANT_RE.exec(String(token || ''));
  return !!m && m[1] !== 'none' && m[1] !== 'preview';
}

/** True when a section's class list should carry the finish compositor — either the
 *  bare `finish` class or any `finish-<name>` variant (excluding none/preview). */
function sectionIsFinish(classList) {
  const list = Array.isArray(classList) ? classList : String(classList || '').split(/\s+/);
  return list.includes('finish') || list.some(isFinishVariantClass);
}

/** Ensure the bare `finish` compositor class is present when a `finish-<name>` variant
 *  is — so a per-slide finish class activates the backdrop. Returns the class list
 *  (a new array when `finish` was added; the input, filtered, otherwise). */
function normalizeSectionFinishClasses(classList) {
  const list = (Array.isArray(classList) ? classList : String(classList || '').split(/\s+/)).filter(Boolean);
  if (list.includes('finish')) return list;
  return list.some(isFinishVariantClass) ? [...list, 'finish'] : list;
}

module.exports = {
  FINISH_REGISTER,
  FINISH_NAMES,
  readFrontMatterFinish,
  isKnownFinish,
  finishClasses,
  finishClassesFromSource,
  isFinishVariantClass,
  sectionIsFinish,
  normalizeSectionFinishClasses,
};
