/**
 * component-spectrum.js — a component's own answer to "do I carry a spectrum?".
 *
 * A manifest's `spectrum` field (lib/components/manifest.schema.json) says whether the component
 * has a spectrum bar, and in which style. It never says how the bar is drawn: border or overlay
 * is the engine's call from the layout's shape (lib/core/bleed-frames.js).
 *
 *   absent / true → the default; the deck's registers and the slide's own classes apply.
 *   false         → no spectrum. The slide gets `spectrum-off` + `spectrum-edge-off`, and any
 *                   spectrum class the author set is dropped, so no placement can draw a bar
 *                   the component does not have (and so none can move its content).
 *   a style name  → the component pins that style; an author's style class is replaced.
 *                   The placement (`spectrum-edge-*`) stays the author's, and `spectrum-off`
 *                   (the white-label switch) always wins over a pin.
 *
 * Only spectrum tokens are ever removed, never a component name, so the runtime (which must
 * not delete a slide's own component by value, deck-class-register.js) can run the same pass.
 * Pure and fs-free; shared by plugins.js and runtime/index.js (HARD RULE #1).
 */

const CATALOG = require('./spectrum-catalog.generated.js');
const { isComponentToken } = require('./resolve-component');
const { isSpectrumStyleToken, isSpectrumEdgeToken, spectrumClass } = require('./resolve-spectrum');

/**
 * Return the slide's class list with its component's spectrum answer applied, or the same
 * array when the component has none (the common case, which costs one lookup per class).
 */
function applyComponentSpectrum(cur, catalog = CATALOG) {
  let answer;
  // The slide's component is its FIRST component token: `list bullet` is a list slide, though `bullet` is also
  // a component name. A variant word that happens to be another component's name must not answer for it.
  const component = cur.find((c) => isComponentToken(c));
  if (component !== undefined && Object.hasOwn(catalog, component)) answer = catalog[component];
  if (answer === undefined) return cur;
  // A pin never overrides the white-label switch: a slide already carrying `spectrum-off` (the deck's `spectrum:
  // off`, or the author's) stays off, so a pinned component cannot re-brand a de-branded deck.
  if (answer !== false && cur.includes('spectrum-off')) return cur;
  const forced = answer === false ? ['spectrum-off', 'spectrum-edge-off'] : [spectrumClass(answer)].filter(Boolean);
  const keep = cur.filter((c) => !isSpectrumStyleToken(c) && !(answer === false && isSpectrumEdgeToken(c)));
  const next = [...keep, ...forced.filter((t) => !keep.includes(t))];
  return next.length === cur.length && next.every((t, i) => t === cur[i]) ? cur : next;
}

module.exports = { applyComponentSpectrum };
