/**
 * lib/authoring/spectrum-retired.mjs — the spectrum spellings retired on 2026-11-21, and their replacements
 * (engineering/decisions/2026-11-21-spectrum-keys.md §4).
 *
 * A hard rename, the owner's call: the engine reads only the new names (lib/core/resolve-spectrum.js), and lint
 * reports each old one as an error with a fix that rewrites it. A module of its own, like switches-retired.mjs,
 * because only lint reads it: the engine and runtime boot bundles do not carry it (docs/route-budget.json).
 */

const EDGES = ['top', 'left', 'right', 'bottom'];
const STYLES = ['rainbow', 'solid', 'duo', 'mono'];

/** Old class → new class. */
export const RETIRED_SPECTRUM_CLASSES = Object.freeze(Object.fromEntries([
  ...EDGES.map((e) => [`spectrum-edge-${e}`, `spectrum-${e}`]),
  ['no-spectrum-edge', 'no-spectrum'], ['with-spectrum-edge', 'with-spectrum'],
  ['no-spectrum-card', 'no-card-spectrum'], ['with-spectrum-card', 'with-card-spectrum'],
  ...STYLES.map((s) => [`spectrum-card-${s}`, `card-spectrum-${s}`]),
  ...EDGES.map((e) => [`spectrum-card-edge-${e}`, `card-spectrum-${e}`]),
  ['no-spectrum-trim', 'trim-spectrum-quiet'], ['spectrum-trim-restrained', 'trim-spectrum-restrained'], ['with-spectrum-trim', 'trim-spectrum-full'],
]));

/** The new class for a retired one, or null. */
export function retiredSpectrumClass(token) {
  return Object.hasOwn(RETIRED_SPECTRUM_CLASSES, token) ? RETIRED_SPECTRUM_CLASSES[token] : null;
}

/**
 * Old front-matter key → where its words go now: the new key and, per old word, `[axis, new word]`. A word that
 * maps to the axis default carries `null`: it said nothing, so nothing is written for it.
 */
export const RETIRED_SPECTRUM_KEYS = Object.freeze({
  'spectrum-edge': { to: 'spectrum', words: { top: null, left: ['edge', 'left'], right: ['edge', 'right'], bottom: ['edge', 'bottom'], off: ['style', 'off'] } },
  'spectrum-card': { to: 'card-spectrum', words: { off: null, auto: ['style', 'match'], rainbow: ['style', 'rainbow'], solid: ['style', 'solid'], duo: ['style', 'duo'], mono: ['style', 'mono'] } },
  'spectrum-card-edge': { to: 'card-spectrum', words: { left: null, top: ['edge', 'top'], right: ['edge', 'right'], bottom: ['edge', 'bottom'] } },
  'spectrum-trim': { to: 'trim-spectrum', words: { off: null, restrained: ['tier', 'restrained'], on: ['tier', 'full'] } },
});

/** Old words on a key that survives, and their replacements. */
export const RETIRED_SPECTRUM_VALUES = Object.freeze({ spectrum: Object.freeze({ on: 'rainbow' }) });
