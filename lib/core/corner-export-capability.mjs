/**
 * lib/core/corner-export-capability.mjs
 *
 * WHICH EXPORT TARGETS CAN HOLD A ROUNDED CORNER.
 *
 * A rounded corner is a HOLE: the slide stops painting there and whatever sits behind
 * shows through. That only reads as a corner when the artifact can actually carry
 * "nothing" — an alpha channel, or a live document whose host paints the backdrop.
 * Everywhere else the hole is filled by something we do not control, and the result is
 * not a rounded slide but a slide with four pale notches punched out of it.
 *
 * So the corner is a CAPABILITY of the target, not a preference of the deck, and a
 * target that cannot hold it renders SQUARE rather than rounding-then-flattening.
 * Measured per format on a real `corners: rounded` deck, corner pixel at (0,0):
 *
 *   png    · alpha channel                   → carries a true hole            ROUNDED
 *   webp   · alpha channel                   → carries a true hole            ROUNDED
 *   html   · live document, host paints      → the backdrop is the host's     ROUNDED
 *   screen · the live app surface            → same                           ROUNDED
 *   jpeg   · NO alpha channel in the format  → hole fills with white          SQUARE
 *   pdf    · a page is paper                 → hole fills with paper-white    SQUARE
 *   pptx   · image sits on the RECIPIENT's   → hole fills with whatever their
 *            slide background (no <p:bg>)      template uses — unpredictable  SQUARE
 *
 * PPTX is the one worth spelling out, because it looks capable and is not — AND because
 * its row is the one entry here that is a FIXABLE GAP rather than a property of the
 * format. The slide image is a PNG and can hold alpha, but neither exporter writes a
 * `<p:bg>`, so the corner shows the theme background of whoever opens the file, making
 * the corner color a property of the reader's software. Baking white would at least be
 * predictable; both are wrong, so PPTX squares *for now*.
 *
 * Write a `<p:bg>` carrying the deck's own canvas and the corner becomes a real corner on
 * a Lattice-colored ground — strictly better than square. That is **#1713**, and it is
 * the reason this row must not be read the way the `jpeg` row is read: `jpeg` squares
 * because the format has no alpha channel and never will; `pptx` squares because we have
 * not done the work yet. Do not let the table flatten that difference.
 *
 * The HTML/player case is deliberately ROUNDED even though a bare file on a white
 * browser canvas looks the same as the PDF: nothing is flattened into bytes there, so a
 * host that paints a backdrop gets a real card. In Lattice's own `--player` viewer the
 * engine draws the slide's 1px edge inside its corner (base.modifiers.css, "The slide's EDGE";
 * the player states its scale through lib/core/slide-frame.mjs), so the corner reads even on
 * the deck's own `--bg`. (It used to be invisible there,
 * and the player's own 12px frame then drew a corner of its own over every deck — square
 * ones included.)
 *
 * THIS TABLE IS NOT THE ONLY MECHANISM, AND A ROW EDIT HERE IS NOT THE WHOLE CHANGE.
 * Two things enforce the rule, and they must be kept in agreement:
 *
 *   1. THIS TABLE, consulted by both exporters, which EVICT the `corners-rounded` token
 *      before they capture (`lattice-emulator.js` in-page; `withCaptureFixups` in
 *      docs/src/components/studio/export/deck-export.js).
 *   2. `@media print { section.corners-rounded { … } }` in lib/base/base.modifiers.css —
 *      for the paths that never capture at all, where the document stays LIVE to the
 *      printer (the Studio's Print button, a human printing the .html sidecar or the
 *      --player viewer). No token eviction can reach those.
 *
 * (`lib/core/print-sheet.mjs` used to emit a third, `border-radius:0!important`, which was
 * only ever stripping the Playground frame's own 6px. The frame no longer rounds the slide
 * (lib/core/slide-frame.mjs), so that reset is gone; print now switches the frame's filter
 * off instead.)
 *
 * They agree today. The disagreement is one row edit away: flip `pdf` to capable and (1)
 * stops evicting while (2) keeps squaring — kernel says ROUNDED, artifact is SQUARE, the
 * suite stays green, and the reason lives in a CSS file. If you change a row here, grep
 * `corners-rounded` across lib/base and docs/src before you believe the table.
 *
 * WHY THIS IS ITS OWN FILE, next to `resolve-corners.js` rather than inside it. The
 * register answers "what did the deck ask for" and runs on both RENDER paths; this
 * answers "what can the artifact hold" and runs only at EXPORT. Keeping them apart is
 * also what lets this one be `.mjs`: the Studio bundles it natively (rollup cannot take
 * named imports from the CJS register), while the emulator `require()`s it the same way
 * it already requires `print-sheet.mjs`.
 *
 * Record + the full measurement matrix, both exporters:
 * engineering/decisions/2026-08-17-corner-export-capability.md
 */

/** Export targets whose artifact can carry a rounded corner. */
export const CORNER_CAPABLE_TARGETS = Object.freeze(['png', 'webp', 'html', 'screen']);

/** Export targets that must flatten, so the corner is evicted before the capture. */
export const CORNER_FLAT_TARGETS = Object.freeze(['jpeg', 'pdf', 'pptx']);

const CORNER_CAPABLE_SET = new Set(CORNER_CAPABLE_TARGETS);
const CORNER_FLAT_SET = new Set(CORNER_FLAT_TARGETS);

/**
 * True if a rounded corner survives into `target`'s artifact.
 *
 * UNKNOWN TARGETS SQUARE. A target nobody has classified is one nobody has measured,
 * and the two failure directions are not symmetric: squaring an alpha-capable format
 * loses a corner the deck asked for, while rounding a flat one ships the pale-notch
 * artifact this whole rule exists to prevent. So the default is the safe direction, and
 * a new format opts IN by joining the list above with its measurement.
 *
 * @param {string} target  'png' | 'webp' | 'jpeg' | 'pdf' | 'pptx' | 'html' | 'screen'
 */
export function cornerSurvivesExport(target) {
  const t = typeof target === 'string' ? target.trim().toLowerCase() : '';
  return CORNER_CAPABLE_SET.has(t);
}

/**
 * True if `target` is a KNOWN target that must flatten. Distinguishes "measured flat"
 * from "never classified" — use `cornerSurvivesExport` to make the actual decision,
 * since that is the one that treats an unknown target safely.
 */
export function isFlatExportTarget(target) {
  const t = typeof target === 'string' ? target.trim().toLowerCase() : '';
  return CORNER_FLAT_SET.has(t);
}
