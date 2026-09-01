/**
 * The adjudicated decorative-exemption ledger, shared by every rendered-DOM contrast gate.
 *
 * WHY IT LIVES IN ITS OWN FILE. Three callers measure rendered text runs and must agree about
 * which sub-threshold runs are NOT defects: `slide-contrast.test.js` (three surfaces, one
 * palette family), `palette-sweep.test.js` (one surface, all 32 palettes), and
 * `tools/palette-native.js` (the nightly referee, which renders all 32 for real). The
 * adjudication is the same in each — a 440px watermark letter is decorative on `mustard`
 * for exactly the reason it is decorative on `indaco` — so the PREDICATES live here once
 * rather than being copied and drifting (HARD RULE #15).
 *
 * WHAT IS SHARED AND WHAT IS NOT. The `match` predicate and its justification are shared.
 * The `counts` map is NOT: it is keyed by `slide-contrast`'s own SURFACES, and it stays
 * meaningful only there. A caller with different surfaces owes its own pin in its own terms —
 * `palette-sweep.test.js` pins a per-palette count instead. Sharing the matcher without
 * sharing the pin is deliberate: one adjudication, independently falsifiable ledgers.
 *
 * It sits in `tools/` rather than `test/` because `tools/palette-native.js` reads it too,
 * and a tool reaching up into the test tree is the wrong direction. The ADJUDICATION —
 * "this 440px watermark letter is decoration, not copy" — is a fact about what the engine
 * renders, not about how any one gate is wired.
 */

/**
 * SANCTIONED_CONTRAST_EXEMPTIONS — runs that report below threshold and are NOT defects.
 *
 * The bar is absolute: **no contrast change could ever satisfy this run.** Decorative by
 * contract, or unmeasurable by this tool. Anything fixable belongs in the backlog below,
 * or in a fix.
 *
 * WHY COUNTS AND NOT JUST MATCHERS. An adversarial review found the hole: the first cut
 * of `raster-backdrop` matched any non-`none` `background-image`, which is 13.5% of all
 * runs (this engine draws RULES with two-stop gradients), and an injected 1.11:1
 * regression on `glossary th` was absorbed with the gate green. The matcher is now narrow
 * (`url()` only, 0.4% of runs) — but breadth is the wrong thing to rely on twice. A count
 * cannot widen by accident, and pinning the TAG as well as the surface catches a
 * cross-tag swap.
 *
 * Deliberately NOT here, because they were fixed instead of excused: the four `split-*`
 * running headers at 1.00:1 (a paint-order bug in the prober), the three `journey` stage
 * labels at 1.87:1 (#1702), and the `journey` mood legend, whose worst pair sat 0.07 above
 * the 3:1 floor and now clears it by 2.
 */
const SANCTIONED_CONTRAST_EXEMPTIONS = [
  {
    id: 'decorative-oversized-glyph',
    why: [
      'Two ornaments, one shape: the 440px section letter on `split-panel watermark`',
      '(painted with `--on-dark-watermark`, white at 12% alpha by contract) and the 660px',
      'opening quotation mark on `split-panel pullquote`. Both are single glyphs set far',
      'above reading size, sitting behind or beside the content as typographic texture —',
      'incidental decoration, which WCAG 1.4.3 exempts from the ratio. Neither can be',
      'brought to 3:1 and remain what it is: at any alpha that passes, the wash stops',
      'reading as a wash and competes with the copy in front of it. NOT routed through the',
      "tool's `exemptInks` tier, which matches on the RESOLVED composited color — these",
      'composite over whatever rail they sit on, so that set cannot recognize them.',
      'The pullquote mark was invisible to this gate until the prober stopped dropping',
      'pseudo content that has no ASCII alphanumerics.',
    ].join(' '),
    // `fs` is RAW CANVAS PIXELS, and every gated surface is `size: 4k`, where 200px is
    // ~66pt. Adding a surface at another canvas size would need this floor expressed
    // relative to that canvas — nothing normalizes sizes any more, by design (see PROBE).
    match: (r) => r.fs >= 200 && r.text.trim().length <= 2
      && ((/(^|\s)watermark(\s|$)/.test(r.cls) && r.tag === 'div')
        || (/(^|\s)pullquote(\s|$)/.test(r.cls) && r.tag.endsWith('::before'))),
    counts: {
      'gallery @ indaco': { div: 2, 'div::before': 1 },
      'gallery @ indaco-dark': { div: 2, 'div::before': 1 },
      'gallery-jargon @ indaco': { div: 2 },
      // The spectrum deck writes no oversized decorative glyph.
      'seq-ramp @ indaco': {},
    },
  },
  {
    id: 'decorative-section-numeral',
    why: [
      "The `numbered` bookend stamp — the running section index on `divider` / `closing`,",
      'set at --fs-h1 (192 raw canvas px on the 4k gated surfaces) and inked with',
      '`--on-dark-watermark` at 0.85 on the dark bookend canvas. Same ornament family as',
      'the entry above and adjudicated for the same reason: a numeral set three times',
      'reading size, sitting on the ATMOSPHERE plane behind the words by declaration',
      '(`z-index: var(--z-atmosphere)`, base.modifiers.css), is incidental decoration —',
      'WCAG 1.4.3 exempts it from the ratio. It duplicates no information: the section it',
      'counts is named in the heading beside it, and nothing in the deck is reachable only',
      'through the numeral. Bringing it to 4.5:1 is not a tune, it is a different element —',
      'a corner chrome mark competing with the section headline it sits behind, which is',
      'the design this repo already rejected for the watermark ghost.',
      'IT IS NEW TO THIS GATE AND NOT NEW TO THE ENGINE. The stamp rode `section::after`,',
      'which the browser-path pack strips and `silent` nulls, so it drew nothing on the',
      'surfaces this gate renders and the gate never saw it. Moving the carrier to the',
      'heading pseudo fixed the modifier and, in doing so, showed this gate a run that had',
      'been declared all along — found by the fix, not caused by it.',
    ].join(' '),
    // Deliberately NOT keyed on font size: it is the SAME `--fs-h1` an ordinary heading
    // takes, so a size floor here would either miss the stamp or start absorbing real
    // headings. Keyed on the mechanism instead — the modifier, the carrier, and the
    // counter token — none of which another element can acquire by accident.
    match: (r) => /(^|\s)numbered(\s|$)/.test(r.cls)
      && /(^|\s)(divider|closing)(\s|$)/.test(r.cls)
      && /^h[12]::after$/.test(r.tag)
      && /^counter\(lat-(divider|divider-light|closing),/.test(r.text),
    counts: {
      'gallery @ indaco': { 'h2::after': 2 },
      'gallery @ indaco-dark': { 'h2::after': 2 },
      'gallery-jargon @ indaco': { 'h2::after': 2 },
      // The spectrum deck carries no numbered bookend.
      'seq-ramp @ indaco': {},
    },
  },
  {
    id: 'raster-backdrop',
    why: [
      'Text over a photograph on the `image` layouts. Every backdrop in the prober is read',
      'off `backgroundColor`, and the picture (`div.lattice-bg`, a `url()` background-image)',
      'plus its `div.image-scrim` gradient are both transparent to that read — so the climb',
      'sails past them onto the section canvas and reports white-on-white. The number is not',
      'a pessimistic measurement, it is a measurement of the wrong surface; the render is',
      'white display type on a dark photo and is legible. Flagged structurally by the prober',
      'as `imgBackdrop` (which counts `url()` paint ONLY), so this matches the MECHANISM',
      'rather than a slide. Making it a real measurement needs per-pixel sampling of the',
      'decoded image behind each glyph, which the prober does not do.',
    ].join(' '),
    match: (r) => r.imgBackdrop === true,
    counts: {
      'gallery @ indaco': { h2: 1, p: 1 },
      'gallery @ indaco-dark': {},
      'gallery-jargon @ indaco': {},
      // No raster backdrop on the spectrum deck either.
      'seq-ramp @ indaco': {},
    },
  },
];

module.exports = { SANCTIONED_CONTRAST_EXEMPTIONS };
