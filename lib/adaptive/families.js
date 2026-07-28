/**
 * Adaptive box-families — the SINGLE source of truth for the four structural
 * families a component reflows across (engineering/decisions/2026-06-18-
 * component-adaptive-sizing.md).
 *
 * "Size" splits into two independent problems:
 *   · SCALE     — type/spacing grows with the slide. Continuous, already solved
 *                 by the cqi token system (anchored to the slide via --_sec-1cqi).
 *   · STRUCTURE — 2-col → 1-col, rail stacks, drop-the-tertiary. A *step*, so it
 *                 is bucketed into the four families below and selected by the
 *                 `data-family` stamp this module's `familyFor()` computes.
 *
 * ONE CLASSIFIER, ONE MEASUREMENT (#1218). `familyFor()` runs in JS over the deck
 * geometry, and the engine (lib/engine/slides.js) + the runtime stamp the verdict
 * on the `section` as `data-family`. Component CSS then selects on that stamp:
 *
 *     section.foo:where([data-family="tall"], [data-family="strip"]) > … { … }
 *
 * ATTACH THE FILTER TO THE `section` COMPOUND, never as a leading prefix. The
 * stamp is ON the section and sections are direct children of `<body>`, so
 * `:where([data-family="tall"]) section.foo` is a descendant combinator hunting
 * an ancestor that does not exist — it matches nothing, silently. Lead with the
 * filter ONLY when the subject really is a descendant of the section
 * (`:where([data-family="tall"]) figure.foo .bar`).
 * `test/unit/adaptive/families.test.js` fails the build on the broken form,
 * across engine CSS and the JS/Markdown that documents it.
 *
 * `:where()` contributes ZERO specificity, so bolting the family prefix onto an
 * existing selector cannot flip a cascade winner — the rule keeps exactly the
 * specificity it had inside the old `@container` block.
 *
 * WHY NOT `@container lattice (aspect-ratio …)`, WHICH THIS REPLACED. A container
 * query evaluates the container's CONTENT box; `section` carries asymmetric
 * padding (more vertical than horizontal), so its content box runs proportionally
 * WIDER than the deck. A 1080×1080 deck classifies `square` in JS but its content
 * box measures 1.051 — over the 1.05 boundary — so every `@container … <= 1.05`
 * rule in the library silently did NOT match and the whole square tier was inert
 * on square decks. Two measurements of "the same" box, disagreeing by a
 * thousandth. Calibrating a second set of CSS boundaries around the drift was
 * tried and rejected: the drift is not a clean function of deck aspect (vertical
 * cqi padding resolves against the ICB, which is the EXPORT geometry, and slide
 * chrome moves it — a footer-less title slide measures 1.0435 where a footered
 * one measures 1.069), so the calibration would re-break on any padding change.
 * The stamp removes the second measurement entirely.
 *
 * WHAT IT COST. The container form was *documented* as box-local — a split/grid
 * Cell could name ITSELF `lattice` so a nested component resolved against its
 * cell. Nothing ever did: `container-name: lattice` appeared exactly once in the
 * whole library, on `section` (split-compare explicitly declines to make its
 * option cells size containers). So the box-local reach was an aspiration in the
 * comments, never shipping behavior, and the stamp gives up nothing real. If a
 * nested cell ever needs its own family, it stamps its own `data-family` — same
 * classifier, same attribute, no second mechanism.
 *
 * `test/unit/adaptive/families.test.js` asserts component CSS selects only on the
 * four canonical family names, so the stamp and the selectors can't drift apart.
 */

// The four families, widest-aspect first. `min` is exclusive, `max` inclusive,
// matching the `(aspect-ratio > min) and (aspect-ratio <= max)` CSS form.
const FAMILIES = Object.freeze([
  { name: 'wide',   min: 1.05, max: Infinity, intent: 'horizontal — side-by-side, multi-column' },
  { name: 'square', min: 0.9,  max: 1.05,     intent: 'balanced — 2×2 grids, 2-up' },
  { name: 'tall',   min: 0.5,  max: 0.9,      intent: 'vertical-leaning — 1–2 columns, paired rows' },
  { name: 'strip',  min: 0,    max: 0.5,      intent: 'single-column stream, biggest type, shed tertiary' },
]);

const FAMILY_NAMES = Object.freeze(FAMILIES.map((f) => f.name));

// The DECK-aspect boundaries — what `familyFor()` classifies in JS, from the
// geometry (`lib/engine/css.js orientationFor({width, height})`). There is only
// ONE list: since #1218 the CSS reads the stamped verdict rather than
// re-measuring, so no numeric boundary is ever written into a stylesheet.
const BOUNDARIES = Object.freeze([0.5, 0.9, 1.05]);

/**
 * The selector PREFIX that scopes a rule to a family, e.g.
 *   familySelector('tall') → ':where([data-family="tall"])'
 *   familySelector('wide') → ':where(section:not([data-family]))'
 *
 * `wide` is the ABSENCE of the stamp, not a value: the engine omits the attribute
 * for the default family so the common case adds no markup. `:where()` keeps the
 * prefix at zero specificity, so scoping an existing rule to a family never
 * changes which rule wins.
 *
 * Authoring helper and documentation — component CSS writes the literal form, and
 * `test/unit/adaptive/families.test.js` asserts it only ever names these four.
 */
function familySelector(name) {
  if (!FAMILY_NAMES.includes(name)) throw new Error(`unknown family: ${name}`);
  if (name === 'wide') return ':where(section:not([data-family]))';
  return `:where([data-family="${name}"])`;
}

/** Classify a width/height (or aspect) into a family name — mirrors the CSS. */
function familyFor(aspect) {
  for (const f of FAMILIES) if (aspect > f.min && aspect <= f.max) return f.name;
  return 'strip';
}

/** Map the legacy 2-value `orientation` to the families it covers (derivation). */
const ORIENTATION_TO_FAMILIES = Object.freeze({
  landscape: Object.freeze(['wide', 'square']),
  portrait: Object.freeze(['tall', 'strip']),
});

// The 3-value deck orientation (landscape · square · portrait) each family maps
// to. This is the SINGLE source both the engine's server-side stamp
// (lib/engine/css.js orientationFor) and the runtime (lib/runtime/index.js
// stampOrientation) derive from, so `data-orientation` and `data-family` can
// never disagree (they used to: orientation's square boundary was 0.95, the
// family's is 0.9 — a box at 0.9–0.95 was portrait to the components but square
// to the Frame). See 2026-06-21-reflow-as-form-capability.md §7 (M1).
const FAMILY_TO_ORIENTATION = Object.freeze({
  wide: 'landscape',
  square: 'square',
  tall: 'portrait',
  strip: 'portrait',
});

/** The deck orientation (landscape|square|portrait) a box's aspect maps to,
 *  derived from its family — the one classifier the engine + runtime share. */
function orientationFor(aspect) {
  return FAMILY_TO_ORIENTATION[familyFor(aspect)];
}

module.exports = {
  FAMILIES,
  FAMILY_NAMES,
  BOUNDARIES,
  familySelector,
  familyFor,
  ORIENTATION_TO_FAMILIES,
  FAMILY_TO_ORIENTATION,
  orientationFor,
};
