/**
 * lib/core/export-canvas.js — which canvas an export renders on, decided once for the CLI and the Studio.
 *
 * A deck that says `size: 4k` lays out on 3840 x 2160. The design is resolution-independent (type and
 * spacing are width-relative), so a 4K deck is the same slides on four times the pixels, and the pixels are
 * what make the files big. Measured on a 52-slide deck of 21 photos, the same deck as HD vs 4K:
 *
 *   PDF   5.95 MB vs  9.41 MB   (1.6x)     PPTX  13.7 MB vs 27.5 MB   (2.0x)
 *
 * so the export canvas defaults to HD for the formats that carry rasters (PDF, PowerPoint, LibreOffice) and the
 * author opts into 4K, seeing the cost. `--size NAME` (CLI) and the export panel's Resolution (Studio) are the
 * choice; the deck's own `size:` is never rewritten on disk. The player, the plain HTML and the image set are
 * not touched here: the player's size does not follow its canvas, and the image set has its own size presets.
 *
 * A LEAF: no `require`, pure. The rewrite itself is `withSize` (lib/engine/sizes.js).
 */

/** The formats whose file size follows the canvas. */
const RASTER_FORMATS = Object.freeze(['pdf', 'pptx', 'odp']);

/** Measured 4K-over-HD file size, per format (one 52-slide photo deck, 2026-10-25; the panel and the CLI say "typically"). */
const FOUR_K_FACTOR = Object.freeze({ pdf: 1.6, pptx: 2, odp: 2 });

const is4k = (name) => String(name ?? '').trim().toLowerCase() === '4k';

/**
 * @param {{ deckSize?: string, requested?: string, format: string }} p
 *   `deckSize` is the deck's own `size:`; `requested` is what the author chose at export time (`--size`, or the panel).
 * @returns {{ size: string|null, loweredFrom4k: boolean }}  `size` is the canvas to render on, or null to keep the deck's own.
 */
function exportCanvas({ deckSize, requested, format }) {
  const asked = String(requested ?? '').trim();
  if (asked) return { size: asked, loweredFrom4k: false };
  if (RASTER_FORMATS.includes(format) && is4k(deckSize)) return { size: 'hd', loweredFrom4k: true };
  return { size: null, loweredFrom4k: false };
}

module.exports = { RASTER_FORMATS, FOUR_K_FACTOR, is4k, exportCanvas };
