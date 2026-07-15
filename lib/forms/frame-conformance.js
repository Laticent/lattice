/**
 * frame-conformance — the pure kernel of the frame-conformance gate
 * (engineering/decisions/2026-07-15-model-driven-frame-render.md §2).
 *
 * The invariant: a component that OPTS IN with `conformance: "strict"` in its
 * manifest must render a cell tree that EQUALS its declared model — every
 * declared frame Cell materialized in the DOM, nothing that should live in a
 * Cell left loose as a bare `<section>` child. The gate renders each opted-in
 * component under the Form default and fails on drift; this file is the pure,
 * fs-free, browser-free CHECK the gate runs on the rendered slide HTML, so the
 * same logic is shared by every caller (HARD RULE #1) and is unit-testable
 * against fixtures without a render.
 *
 * WHY a gate and not a runtime manifest interpreter: the trio's core cut. The
 * model stays the source of truth and a violating component FAILS THE BUILD
 * (caught, not merely discouraged) without a new render engine. See §2 of the
 * decision doc.
 *
 * OPT-IN, ONE COMPONENT AT A TIME. Today ZERO components are `strict` — the gate
 * is dormant by construction (the enumeration is empty → green). The first real
 * subject is `diagram` (PR 1), which is where the render-side wiring
 * (component→frame resolution) is proven against an actual migrated component;
 * a global flip would be red until all 56 conform (a monster branch, HARD RULE
 * #17/#18). The PURE CHECK below is landed and fixture-verified now so the gate's
 * logic is not itself unverified when the first flag flips.
 *
 * The measuring machinery is a PROTECTED surface (§5): materializing a Cell for
 * a component changes what the overflow probe (CLIP_CELL_SELECTOR) sees, so a
 * migration flips `conformance:strict` only AFTER it has proven the probe verdict
 * and autosplit's page decisions are unchanged. That proof is the migration's job,
 * NOT this gate's — this gate only asserts the declared cell tree materialized.
 */

/**
 * Single source of truth: a frame Cell id → the DOM class the render emits for
 * it under the Form default. The masthead kernel builds `.cell-stage` /
 * `.cell-masthead` / `.cell-footer` as the structural bands; the sub-region
 * slots (lede, bay) and docked tiles carry their id as the class. A Cell absent
 * from this map has NO materialized DOM element of its own (e.g. `overlay` ships
 * `css:false` and appears only when a review annotation docks into it) and is
 * therefore not asserted structurally — see `materializingCells`.
 *
 * Kept deliberately SMALL: an entry is added the first time a `strict`
 * component's frame declares that Cell, so the map only ever covers Cells a real
 * migration has exercised (never a speculative full list). A strict component
 * whose frame declares a Cell NOT covered here fails the gate loudly with
 * "no DOM-class mapping" rather than silently passing — forcing the entry to be
 * added, with intent, in the PR that needs it.
 */
const CELL_DOM_CLASS = Object.freeze({
  stage: 'cell-stage',
  masthead: 'cell-masthead',
  footer: 'cell-footer',
});

/**
 * Cells that have no materialized DOM element of their own and so are exempt
 * from the structural "did it materialize?" assertion. `overlay` is `css:false`
 * (it exists only when a review annotation Tile docks into it), so a frame that
 * merely DECLARES it does not owe a DOM node.
 */
const NON_MATERIALIZING_CELLS = new Set(['overlay']);

/**
 * The Cells a frame must MATERIALIZE in the DOM: its declared `cells`, minus the
 * ones it `suppresses`, minus the non-materializing set. Pure over two manifest
 * arrays; the caller resolves which frame a component renders under.
 *
 * @param {{cells?: string[], suppresses?: string[]}} frameManifest
 * @returns {string[]}
 */
function materializingCells(frameManifest) {
  const declared = Array.isArray(frameManifest?.cells) ? frameManifest.cells : [];
  const suppressed = new Set(Array.isArray(frameManifest?.suppresses) ? frameManifest.suppresses : []);
  return declared.filter((c) => !suppressed.has(c) && !NON_MATERIALIZING_CELLS.has(c));
}

/**
 * Does a slide's rendered HTML contain an element carrying `cls` as one of its
 * classes? Matches `class="cell-stage"` and `class="foo cell-stage bar"` alike,
 * without a DOM parser (the gate runs on the engine's HTML string).
 *
 * @param {string} html
 * @param {string} cls
 * @returns {boolean}
 */
function hasClass(html, cls) {
  // Escape any regex metachar in the injected class name (today's cell ids are
  // kebab-case, but a future map value must not be able to corrupt the pattern).
  const c = cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // `(?<![-\w])` before `class="` refuses to match inside a longer attribute
  // name (`data-class`, `data-cell-class`) — only a real `class` attribute
  // counts. The token match then requires `cls` as a whole whitespace-delimited
  // class: class="cls", class="a cls", class="cls b", or class="a cls b" — never
  // a substring (cell-stage-inner, not-cell-stage).
  const re = new RegExp(`(?<![-\\w])class="(?:[^"]*\\s)?${c}(?:\\s[^"]*)?"`);
  return re.test(html);
}

/**
 * The pure conformance check. Returns an array of human-readable violation
 * strings — EMPTY means the rendered slide conforms to the declared model.
 *
 * PR 0 scope: the STRUCTURAL invariant — every materializing Cell the frame
 * declares is present in the rendered slide. The richer slot-hoisting assertion
 * ("every present slot sits INSIDE its Cell, nothing loose") lands with the
 * first real subject (diagram, PR 1), where it can be validated against an
 * actual migrated render rather than a synthetic fixture.
 *
 * @param {object}   args
 * @param {string}   args.component      component name (for messages)
 * @param {string[]} args.expectedCells  the frame's materializing cells (see materializingCells)
 * @param {string}   args.slideHtml      the Form-ON rendered slide HTML
 * @param {Record<string,string>} [args.cellClassOf]  cell id → DOM class (defaults to CELL_DOM_CLASS)
 * @returns {string[]} violations, [] if conforming
 */
function conformanceViolations({ component, expectedCells, slideHtml, cellClassOf = CELL_DOM_CLASS }) {
  const violations = [];
  for (const cell of expectedCells) {
    // Own-property lookup only — a cell id colliding with a prototype key
    // (`constructor`, `hasOwnProperty`) must not read a truthy function as a class.
    const cls = Object.hasOwn(cellClassOf, cell) ? cellClassOf[cell] : undefined;
    if (!cls) {
      violations.push(
        `${component}: frame declares Cell "${cell}" but frame-conformance has no DOM-class mapping for it — ` +
          'add an entry to CELL_DOM_CLASS (lib/forms/frame-conformance.js) in the PR that migrates a component using it.',
      );
      continue;
    }
    if (!hasClass(slideHtml, cls)) {
      violations.push(
        `${component}: declared Cell "${cell}" (.${cls}) is NOT materialized in the rendered slide — ` +
          'the model declares it but the render did not build it (a model violation, §2).',
      );
    }
  }
  return violations;
}

module.exports = {
  CELL_DOM_CLASS,
  NON_MATERIALIZING_CELLS,
  materializingCells,
  hasClass,
  conformanceViolations,
};
