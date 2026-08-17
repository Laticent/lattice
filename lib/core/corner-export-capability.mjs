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
 * PPTX is the one worth spelling out, because it looks capable and is not: the slide
 * image is a PNG and can hold alpha, but neither exporter writes a `<p:bg>`, so the
 * corner shows the theme background of whoever opens the file. That makes the corner
 * color a property of the reader's software. Baking white would at least be
 * predictable; both are wrong, so PPTX squares.
 *
 * The HTML/player case is deliberately ROUNDED even though a bare file on a white
 * browser canvas looks the same as the PDF: nothing is flattened into bytes there, so a
 * host that paints a backdrop gets a real card. In Lattice's own `--player` viewer the
 * backdrop is the deck's own `--bg`, which makes the corner invisible — a no-op, not a
 * defect, and left alone deliberately.
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
