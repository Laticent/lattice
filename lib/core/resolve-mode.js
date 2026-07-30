/**
 * lib/core/resolve-mode.js
 *
 * The deck front-matter `mode:` register selects the deck's RENDERING MODE —
 * how the content itself is drawn (its typographic hand + box geometry), NOT the
 * backdrop behind it. It is the sibling of `finish:` (lib/core/resolve-finish.js):
 * a `mode:` is the base aesthetic, a `finish:` is the backdrop painted behind it,
 * and the two COMPOSE freely (`mode: sketch` + `finish: atrium` = a hand-drawn deck
 * with an atrium backdrop). Splitting them out of the old single `finish:` register
 * removes the magic where one key did double duty.
 *
 *   mode: boardroom     → (no class)                 the clean default hand (Playfair/Outfit)
 *   mode: sketch        → `sketch`                   full hand-drawn (Caveat/Shantell, wobbly boxes)
 *   mode: sketch-clean  → `sketch sketch-clean-body` hand heads + boxes, clean body
 *
 * Like `finish:`, the three render paths read this key and APPEND the mapped CSS
 * class tokens to every `<section>`. `boardroom` is the named baseline (renders no
 * class); omitting the key renders it. A per-slide `_class: boardroom` opts one slide
 * OUT of a deck-wide mode. The mode CSS lives in lib/base/base.sketch.css and is
 * palette-blind + export-safe (every color is var(--token), no url()/mask beyond the
 * inline wobble SVGs already shipped there).
 *
 * Open registry: add a row to MODE_REGISTER + the matching base CSS to add a base
 * aesthetic (blueprint, typewriter, …) — the same way `theme:` is an open palette set.
 *
 * Pure + dependency-free so it bundles into the browser runtime (esbuild) and is
 * unit-testable in isolation. Shared by lattice-emulator.js,
 * lib/integrations/markdown-it/plugins.js, and lib/runtime/index.js so all three
 * render paths produce identical class lists.
 */

// Register name → the class tokens appended to every section. '' = boardroom
// (the baseline mode: no class, the engine default type + geometry apply).
const MODE_REGISTER = Object.freeze({
  boardroom: '',
  sketch: 'sketch',
  'sketch-clean': 'sketch sketch-clean-body',
});

/** The recognized mode names (for the deck-lint vocabulary + docs). */
const MODE_NAMES = Object.freeze(Object.keys(MODE_REGISTER));

/** The class tokens a `mode:` can stamp — used by the deck-class propagator to
 *  detect a per-slide mode opt-out and to scope the deck-wide-vs-per-slide rule.
 *  (`boardroom` is a marker only — it renders no class but signals "clean here".) */
const MODE_TOKENS = Object.freeze(['sketch', 'sketch-clean-body', 'boardroom']);

/** Extract the raw `mode:` value from a deck source's front matter, or null. */
function readFrontMatterMode(md) {
  if (!md) return null;
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const s = m[1].match(/^[ \t]*mode:[ \t]*["']?([A-Za-z0-9_-]+)["']?[ \t]*$/m);
  return s ? s[1].trim() : null;
}

/** True if `value` is a recognized mode register name. */
function isKnownMode(value) {
  return typeof value === 'string' && Object.hasOwn(MODE_REGISTER, value.trim().toLowerCase());
}

/** Map a mode value to its space-joined class tokens ('' for boardroom/unknown). */
function modeClasses(value) {
  if (typeof value !== 'string') return '';
  const key = value.trim().toLowerCase();
  return Object.hasOwn(MODE_REGISTER, key) ? MODE_REGISTER[key] : '';
}

/** Convenience: read the `mode:` value from a full deck source + map it. */
function modeClassesFromSource(md) {
  return modeClasses(readFrontMatterMode(md) || '');
}

module.exports = {
  MODE_REGISTER,
  MODE_NAMES,
  MODE_TOKENS,
  readFrontMatterMode,
  isKnownMode,
  modeClasses,
  modeClassesFromSource,
};
