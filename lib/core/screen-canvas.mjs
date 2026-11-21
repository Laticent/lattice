/**
 * lib/core/screen-canvas.mjs
 *
 * THE SCREEN CANVAS: which canvas a slide is laid out on for a SCREEN, from the pixels that screen
 * shows. One rule (HARD RULE #1) for the live surfaces that draw a 4K deck on a phone: the Studio's
 * single-slide frames, which are its preview, Present and thumbnails (docs/src/playground/single-slide-render.ts),
 * and the exported player's script (lib/export/player-core.mjs, which carries this function's text). NOT yet: the
 * Playground filmstrip (playground-engine.ts, deck-preview.js), the Stage audience window (studio-stage.ts), the
 * plain HTML export, and the player's no-JS floor (what iOS Quick Look shows); each still lays a 4K deck out at 4K.
 * Exports that produce pixels (PDF, PowerPoint, images) never ask it; lib/core/export-canvas.js
 * decides theirs.
 *
 * WHY. A live slide is laid out at its canvas (3840x2160 for `size: 4k`) and shrunk to the screen
 * with `transform: scale()`. WebKit sizes every compositing layer inside that frame by the frame's
 * own box times the screen's density squared, not by its size on screen: one layer in a 4K frame at
 * 3x density measured about 1,150 MB against about 145 MB in an HD frame (Linux WPE WebKit, 393 CSS
 * px wide, 2026-11-20). An iPhone presenting a 4K deck with Guide and captions on reloaded the tab
 * (owner, 2026-11-20). Sharpness does not follow the canvas: text, vectors and icons are drawn at
 * the screen's density whatever the box (an HD layout drawn at 3x matched native 4K at 3840 px, the
 * same day), and photos are already loaded for the width on screen. So the canvas only has to be as
 * big as the pixels the screen actually shows.
 *
 * THE RULE. A 4K deck is laid out on its 4K canvas only where the slide is shown more than
 * `FOUR_K_FROM` device pixels wide: a 4K display presenting full screen, a large high-density laptop
 * screen. Everywhere smaller (a phone, an iPad, the editor's preview, a thumbnail) it is laid out on
 * HD, the same 16:9. It reads the screen's own geometry, never a guess about memory, so it cannot be
 * wrong about a device: iOS Safari exposes no memory signal at all.
 *
 * WHAT IS NOT YET TRUE: HD and 4K are not pixel-identical. About 1,500 rules, accents and textures
 * are fixed px lengths, so on HD they draw up to 3x heavier relative to the slide, and a few card
 * texts rewrap. Making them slide-relative is its own change (followups.d/3304-p1-slide-relative-lines.md).
 *
 * A LEAF: no imports, pure.
 */

/**
 * A deck source's `size:` value, read from its leading front matter: TOP-LEVEL and LAST, as the engine reads it
 * (#2050, #3050 D1). '' when unset. The Studio's `sizeFromSource` (docs/src/components/studio/slide-size.ts) is this,
 * and the instant shell's seed script mirrors it by hand (docs/src/pages/studio.astro).
 * @param {string} source
 * @returns {string}
 */
export function deckSizeOf(source) {
	const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(source ?? ''));
	if (!fm) return '';
	// `/m`, so `$` is end-of-LINE: `size:` sits anywhere in the block, not only last. The value is the rest of the line,
	// trimmed in script: a lazy capture followed by `[ \t]*$` was polynomial on a long run of tabs (regex census), and
	// this runs on every live render.
	const m = [...fm[1].matchAll(/^size[ \t]*:([^\r\n]*)$/gm)].pop();
	return m ? m[1].trim().replace(/^['"]|['"]$/g, '').trim() : '';
}

/** Device pixels across the slide above which a 4K deck keeps its 4K canvas (twice HD's width). */
export const FOUR_K_FROM = 2560;

/**
 * The canvas to lay a deck out on for this screen, or `null` to keep the deck's own.
 * SELF-CONTAINED on purpose: the exported player carries this function's own text (`screenCanvas.toString()`, as it
 * carries `fitScale`), so it may not reach anything outside its body. 2560 is FOUR_K_FROM, pinned by the unit test.
 * @param {string|null|undefined} deckSize  the deck's `size:` value
 * @param {number} cssWidth  the slide's width on screen, in CSS px (0 or less when not yet laid out)
 * @param {number} dpr  the screen's device pixel ratio
 * @returns {'hd'|null}
 */
export function screenCanvas(deckSize, cssWidth, dpr) {
	if (String(deckSize == null ? '' : deckSize).trim().toLowerCase() !== '4k') return null;
	var w = Number(cssWidth);
	var d = Number(dpr) > 0 ? Number(dpr) : 1;
	// Not laid out yet: no width to measure. HD, the safe side: a 4K screen re-lays out on its first fit.
	if (!(w > 0)) return 'hd';
	return w * d > 2560 ? null : 'hd';
}
