/**
 * lib/core/math-stage-migration.js
 *
 * TEMPORARY SCAFFOLDING. Delete this file, and both of its call sites, in the
 * final commit of the math de-sovereignization. If you are reading it on `main`,
 * that deletion was missed and this is the bug.
 *
 * WHY IT HAS TO EXIST AT ALL. Sovereignty is per-LAYOUT, not per-variant: a math
 * section's chrome exemption is decided by the bare `math` token in
 * `FORM_TOGGLE_SKIP` (`lib/integrations/markdown-it/plugins.js`), which is derived
 * from `lib/forms/frame/math/`. So removing math from that set flips ALL EIGHT
 * VARIANTS AT ONCE — bare/feature, derivation, theorem, compare, canvas, matrix,
 * decompose, stats — and there is no smaller switch. That is exactly the change
 * this migration is not allowed to make in one step:
 *
 *   · The wrap turns the section from a GRID into a flex column
 *     (`section.form:has(> .cell-stage)`, lib/forms/cell/stage/stage.css), and math
 *     places its body with 18 `grid-row` declarations that all go inert at once.
 *   · `math.compare` is a MULTICOLUMN container whose `> h2` spans the columns with
 *     `column-span: all`; wrapping the body puts the whole column flow inside one
 *     block child and lifts the spanner out of the multicol.
 *   · `.cell-stage` is `overflow: clip`, and KaTeX — unlike the Mermaid SVG that
 *     made `diagram`'s migration safe — does not scale when squeezed. It clips. So
 *     each variant's fit behavior has to be re-proved, not assumed.
 *
 * Flipping all eight together would mean one commit that rewrites eight layouts and
 * can only be reviewed as a whole. This module makes the flip PER VARIANT, so each
 * one lands, gets its own rendered evidence, and is reviewed before the next starts.
 *
 * HOW IT WORKS. `MIGRATED` is the set of math variants that have moved. A math
 * section whose variant is in it stops being treated as sovereign: it takes the
 * `form` class and wraps its body into `.cell-stage` like any strict canvas. Every
 * other math slide keeps today's behavior EXACTLY, byte for byte. When the set holds
 * all eight, the real change lands — `lib/forms/frame/math/` is deleted, the
 * component manifest declares `stage: "canvas"` + `conformance: "strict"`, and this
 * file goes with them.
 *
 * ONE SOURCE OF TRUTH (HARD RULE #1): both consumers — the class-toggle in
 * `plugins.js` and the wrap decision in `masthead.transform.js` — import this
 * predicate. A second copy of the set would let the two disagree, which is a section
 * that takes the `form` class and then does not wrap: chrome cells built around a
 * body that never moved into them.
 */

/** Every variant token `math` accepts, from `lib/components/math/math/math.manifest.json`. */
const MATH_VARIANTS = Object.freeze([
  'feature', 'derivation', 'theorem', 'compare', 'canvas', 'matrix', 'stats', 'decompose',
]);

/**
 * The variants that have moved to the Form frame. Grows by one per commit; when it
 * holds all eight, this whole file is deleted in the same commit that removes the
 * sovereign frame.
 *
 * `feature` covers the BARE `math` slide too — `math.docs.md` states they are the
 * same layout ("the bare layout defaults to it"), and the stylesheet backs that up:
 * the bare selector is a `:where(:not(.derivation)…)` chain listing every other
 * variant, so a section with no variant token and one with `feature` resolve to the
 * same rules.
 */
/**
 * Variants that legitimately need NO `[data-family]` reflow, with the reason. Stated
 * explicitly because the migration DELETES each variant's sovereign arm as it lands,
 * so "this variant has no family rules" stops being observable from the stylesheet —
 * absence would look identical to a reflow someone forgot to carry across, which is
 * precisely the regression this migration already shipped once.
 *
 * Reason: `stats` is already single-column, so a tall box needs nothing collapsed. `canvas` places its body with `grid-template-areas` on the
 * SECTION.
 *
 * `derivation` AND `theorem` were on this list and came off it, which is the more useful lesson than
 * either entry: "already single-column" answers the wrong question. A family reflow is
 * not only for collapsing columns — it is for anything that has to give when the box
 * changes shape. Derivation has one column and still needed one, because the Form
 * masthead is an in-flow band where the sovereign arm's title was absolutely
 * positioned, and at portrait that band is 271px. Measure the migrated variant at
 * every size before writing an entry here.
 *
 * THE ORIGINAL WORDING OF THIS NOTE WAS STALE AND IT MISLED THE COMPARE MIGRATION.
 * It said compare and canvas "stay landscape by design" because their properties sit
 * on an element "a container query cannot reach" — copied from a stylesheet comment
 * whose very next sentence records that #1218 lifted that constraint, and which sat
 * directly above a working `section.math.compare[data-orientation="portrait"]
 * { column-count: 1 }` rule. Compare's reflow was never impossible; it was keyed on
 * the deck-wide orientation stamp instead of a container query. The compare commit
 * claimed to have "unlocked a capability the sovereign frame could not have", and
 * that claim was false. What migration actually buys is per-SLIDE keying and the
 * three-column case, which had lost a specificity race.
 *
 * Recorded because the same mistake is available for `canvas`: check what its
 * sovereign arm already does before claiming the migration enables anything.
 */
const NO_FAMILY_REFLOW = Object.freeze({
  stats: 'already single-column — vertical estimate/interval scaffold',
  canvas: '`grid-template-areas` is a section-element property a container query cannot reach',
});

const MIGRATED = new Set(['feature', 'compare', 'derivation', 'theorem']);

/**
 * Which math variant is this class string? `null` when it is not a math section.
 * A bare `math` (no variant token) resolves to `'feature'`, per the note above.
 *
 * `decompose` is checked BEFORE `matrix`, and only WITH it. Two rules, and the
 * second was wrong on the first cut.
 *
 * Before: it is authored `math matrix decompose`, a compound of `matrix`, so a
 * first-match scan over the token list would call it `matrix` and migrate it a
 * commit early.
 *
 * ONLY WITH IT: `decompose` requires `matrix` to be present, because that is what
 * the STYLESHEET does. The bare-math selector
 * `:where(:not(.derivation):not(.theorem):not(.compare):not(.canvas):not(.matrix):not(.stats))`
 * does not exclude `.decompose`, so a lone `math decompose` — an authoring error,
 * since the docs give the class as `math matrix decompose` — falls through to the
 * FEATURE layout. Resolving it to `decompose` here made the lever disagree with the
 * CSS: the slide rendered the feature layout while the lever held it on the
 * sovereign frame, so one deck showed two slides with the same layout on two
 * different frames, one with a masthead and one without. Found by a red team.
 *
 * The rule is not "what did the author mean" but "what does the stylesheet do",
 * because the lever's whole job is to agree with it.
 *
 * @param {string} cls  a section's full class attribute
 * @returns {string|null}
 */
function mathVariantOf(cls) {
  const tokens = String(cls || '').trim().split(/\s+/).filter(Boolean);
  if (!tokens.includes('math')) return null;
  if (tokens.includes('decompose') && tokens.includes('matrix')) return 'decompose';
  const found = MATH_VARIANTS.find((v) => v !== 'decompose' && tokens.includes(v));
  return found || 'feature';
}

/**
 * Has this section's math variant moved to the Form frame? False for every
 * non-math section, so both call sites can ask unconditionally.
 *
 * @param {string} cls  a section's full class attribute
 * @returns {boolean}
 */
function mathSectionMigrated(cls) {
  const variant = mathVariantOf(cls);
  return variant !== null && MIGRATED.has(variant);
}

module.exports = { MATH_VARIANTS, MIGRATED, NO_FAMILY_REFLOW, mathVariantOf, mathSectionMigrated };
