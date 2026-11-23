/**
 * lib/core/resolve-spectrum.js
 *
 * The three SPECTRUM keys. Each value is one word per axis, in any order
 * (engineering/decisions/2026-11-21-spectrum-keys.md):
 *
 *   spectrum: solid left band         the stripe on the slide edge
 *   card-spectrum: solid left band    the stripe on each card
 *   trim-spectrum: mono               the accent on tables, timelines and `---` rules
 *
 *   spectrum:       style  rainbow | solid | duo | mono | off   → with-spectrum, spectrum-<style>, no-spectrum
 *                   edge   top | left | right | bottom          → spectrum-<edge>
 *                   weight regular | hairline | band            → spectrum-<weight>
 *   card-spectrum:  style  off | rainbow | solid | duo | mono   → no-card-spectrum, with-card-spectrum, card-spectrum-<style>
 *                   edge   left | top | right | bottom          → card-spectrum-<edge>
 *                   weight regular | hairline | band            → card-spectrum-<weight>
 *   trim-spectrum:  style  quiet | rainbow | solid | duo | mono → trim-spectrum-<style>
 *
 * NO KEY FOLLOWS ANOTHER. Each key has its own default (the slide edge rainbow, the cards off, the trim
 * quiet), and each style word names its own fill. The old `match` (cards copying the slide edge) and
 * `full` (trim copying it) are gone (the owner, 2026-11-22). A `card-spectrum:` line that names an edge
 * or a weight but no style turns the stripe on in rainbow (`card-spectrum: top band`), since a deck
 * that places a stripe it left off would otherwise get nothing.
 *
 * The first word on each axis is its default. A deck value that is a default stamps nothing; on a
 * SLIDE the default's class is the restore token that returns one slide to the default inside a deck
 * that set something else (`_class: spectrum-top` in a `spectrum: left` deck). An off is `no-X` and the
 * way back on is `with-X` (the switch rule, lib/core/switches.mjs), never `X-off` / `X-on`.
 *
 * A slide's own word on one axis evicts the deck's word on THAT axis only (`spectrumTokenAxis`), so
 * `_class: spectrum-left` moves the stripe and keeps the deck's style and weight.
 *
 * PRESETS, PER AXIS. A preset may set any of the three keys. The deck's own value wins per AXIS, not per
 * key: `preset: brand` (`spectrum: solid`) plus `spectrum: left` reads `solid left`. Before the keys
 * merged, the edge was its own key and a deck that moved the stripe kept the preset's style; reading the
 * merged key whole would have silently dropped it. The Studio mirrors this in deck-preset.ts.
 *
 * The old keys (`spectrum-edge:`, `spectrum-card:`, `spectrum-card-edge:`, `spectrum-trim:`), the old
 * values (`spectrum: on`, `auto`) and the old classes are removed, not aliased: nothing here reads them.
 * Lint reports each and fixes it in place (lib/authoring/spectrum-retired.mjs).
 *
 * Built on the axis-register factory (lib/core/register-factory.js). Pure and fs-free; bundles into the
 * browser runtime, and both render paths call it (HARD RULE #1).
 */

const { makeRegister, presetMergedValue } = require('./register-factory');

const SPECTRUM_REGISTER = makeRegister('spectrum', [
  { axis: 'style', names: ['rainbow', 'solid', 'duo', 'mono', 'off'], classes: ['with-spectrum', 'spectrum-solid', 'spectrum-duo', 'spectrum-mono', 'no-spectrum'] },
  { axis: 'edge', names: ['top', 'left', 'right', 'bottom'] },
  { axis: 'weight', names: ['regular', 'hairline', 'band'] },
]);

const CARD_SPECTRUM_REGISTER = makeRegister('card-spectrum', [
  {
    axis: 'style',
    names: ['off', 'rainbow', 'solid', 'duo', 'mono'],
    classes: ['no-card-spectrum', 'with-card-spectrum', 'card-spectrum-solid', 'card-spectrum-duo', 'card-spectrum-mono'],
  },
  { axis: 'edge', names: ['left', 'top', 'right', 'bottom'] },
  { axis: 'weight', names: ['regular', 'hairline', 'band'] },
]);

const TRIM_SPECTRUM_REGISTER = makeRegister('trim-spectrum', [
  { axis: 'style', names: ['quiet', 'rainbow', 'solid', 'duo', 'mono'] },
]);

const REGISTERS = Object.freeze([SPECTRUM_REGISTER, CARD_SPECTRUM_REGISTER, TRIM_SPECTRUM_REGISTER]);

/** Every class the three keys can stamp, restore tokens included. */
const SPECTRUM_KEY_TOKENS = Object.freeze(REGISTERS.flatMap((r) => r.TOKENS));

/** Each axis's default class: slide-only (a deck value that is the default stamps nothing). */
const DEFAULT_TOKENS = new Set(REGISTERS.flatMap((r) => r.AXES.map((a) => a.tokens[0])));

/**
 * A key's value with the preset filled in per axis: the deck's own word on an axis wins, and an axis the
 * deck left empty takes the preset's word. Words in axis order; '' when neither says anything.
 */
function mergedValue(fm, register) {
  const merged = presetMergedValue(fm, register);
  if (register === CARD_SPECTRUM_REGISTER && !merged.style && (merged.edge || merged.weight)) merged.style = 'rainbow';
  return register.AXES.map((a) => merged[a.axis]).filter(Boolean).join(' ');
}

/** A deck value → the classes it stamps deck-wide (defaults stamp nothing). */
function deckClasses(register, value) {
  return register.classes(value || '').filter((t) => !DEFAULT_TOKENS.has(t));
}

/** The deck-wide classes of all three keys, from a front-matter BODY (no fences), in key order. */
function spectrumDeckTokens(fm) {
  return REGISTERS.flatMap((r) => deckClasses(r, mergedValue(fm, r)));
}

/** The key and axis a class belongs to (`spectrum-left` → `spectrum:edge`), or '' for any other class. */
function spectrumTokenAxis(token) {
  for (const r of REGISTERS) {
    const axis = r.tokenAxis(token);
    if (axis) return `${r.key}:${axis}`;
  }
  return '';
}

/** True when `token` is a `spectrum:` STYLE class (`with-spectrum` … `no-spectrum`). */
const isSpectrumStyleToken = (token) => SPECTRUM_REGISTER.tokenAxis(token) === 'style';

/** The class a `spectrum:` STYLE word stamps on a slide (`solid` → `spectrum-solid`), or '' for the default or an unknown word. */
function spectrumStyleClass(word) {
  const axis = SPECTRUM_REGISTER.AXES[0];
  const i = axis.names.indexOf(String(word || '').trim().toLowerCase());
  return i > 0 ? axis.tokens[i] : '';
}

/** The axes of each key, as `{ axis: words }`, for the linter and the Studio. */
const axesOf = (register) => Object.freeze(Object.fromEntries(register.AXES.map((a) => [a.axis, a.names])));

module.exports = {
  SPECTRUM_REGISTER,
  CARD_SPECTRUM_REGISTER,
  TRIM_SPECTRUM_REGISTER,
  SPECTRUM_NAMES: SPECTRUM_REGISTER.NAMES,
  CARD_SPECTRUM_NAMES: CARD_SPECTRUM_REGISTER.NAMES,
  TRIM_SPECTRUM_NAMES: TRIM_SPECTRUM_REGISTER.NAMES,
  SPECTRUM_AXES: axesOf(SPECTRUM_REGISTER),
  CARD_SPECTRUM_AXES: axesOf(CARD_SPECTRUM_REGISTER),
  TRIM_SPECTRUM_AXES: axesOf(TRIM_SPECTRUM_REGISTER),
  SPECTRUM_KEY_TOKENS,
  mergedSpectrumValue: (fm, key) => mergedValue(fm, REGISTERS.find((r) => r.key === key)),
  spectrumDeckTokens,
  spectrumTokenAxis,
  isSpectrumStyleToken,
  spectrumStyleClass,
};
