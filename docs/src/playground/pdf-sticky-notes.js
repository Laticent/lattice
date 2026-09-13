// PDF sticky notes — the shared placement + write for review-comment annotations,
// used by BOTH PDF lanes (the off-thread worker AND the main-thread fallback) so
// an exported deck's comments look identical whichever lane built it.
//
// A comment becomes a PDF `Text` annotation: a note icon a reader clicks to read
// the body, the standard "sticky note" every PDF viewer knows. Notes for one slide
// stack down the top-right corner so several on a slide don't fully overlap. The
// page is landscape px (the deck geometry), origin top-left — jsPDF flips y for the
// PDF coordinate space itself.

const NOTE = 22; // icon box (px)
const GAP = 6; // vertical gap between stacked notes
const MARGIN = 14; // inset from the page's top / right edge

/**
 * Where one slide's notes sit on the page — the placement both writers share.
 * Coordinates are page px with a TOP-LEFT origin (the deck's own geometry); each
 * backend converts to whatever its PDF writer wants.
 *
 * Notes stack down the top-right corner, and WRAP into a further column once the
 * page runs out: at 28 px a step, a 720 px page holds 25, and the 26th used to land
 * below the page edge — a rect outside the MediaBox, which a reader may drop or draw
 * off-canvas. Passing `pageH` turns that into another column; omitting it keeps the
 * single-column behavior for a caller that does not know the height.
 * @param {{title:string, contents:string}[]|undefined} notes
 * @param {number} pageW page width in px
 * @param {number} [pageH] page height in px — enables wrapping
 * @returns {{title:string, contents:string, x:number, y:number, w:number, h:number}[]}
 */
export function stickyNotePlacements(notes, pageW, pageH) {
	if (!notes?.length) return [];
	const step = NOTE + GAP;
	const perColumn = pageH ? Math.max(1, Math.floor((pageH - 2 * MARGIN + GAP) / step)) : Number.POSITIVE_INFINITY;
	const out = [];
	for (let i = 0; i < notes.length; i++) {
		const n = notes[i];
		if (!n?.contents) continue;
		const column = Math.floor(out.length / perColumn);
		const row = out.length % perColumn;
		const x = Math.max(MARGIN, pageW - MARGIN - NOTE - column * step);
		out.push({ title: String(n.title || 'Comment'), contents: String(n.contents), x, y: MARGIN + row * step, w: NOTE, h: NOTE });
	}
	return out;
}

/**
 * Write one slide's comment sticky notes onto the CURRENT page of `pdf`.
 * Typed structurally on the one method used, so both a real jsPDF and a test
 * stand-in satisfy it.
 * @param {{ createAnnotation: (a: object) => void }} pdf the doc, on the target page
 * @param {{title:string, contents:string}[]|undefined} notes this slide's comments
 * @param {number} pageW page width in px (notes hug the right edge)
 * @param {number} [pageH] page height in px — lets a long thread wrap on-page
 */
export function addPageStickyNotes(pdf, notes, pageW, pageH) {
	for (const note of stickyNotePlacements(notes, pageW, pageH)) {
		pdf.createAnnotation({
			type: 'text',
			title: note.title,
			contents: note.contents,
			bounds: { x: note.x, y: note.y, w: note.w, h: note.h },
			open: false,
		});
	}
}
