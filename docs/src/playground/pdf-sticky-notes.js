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
 * Write one slide's comment sticky notes onto the CURRENT page of `pdf`.
 * @param {import('jspdf').jsPDF} pdf the doc, positioned on the target page
 * @param {{title:string, contents:string}[]|undefined} notes this slide's comments
 * @param {number} pageW page width in px (notes hug the right edge)
 */
export function addPageStickyNotes(pdf, notes, pageW) {
	if (!notes || !notes.length) return;
	const x = Math.max(MARGIN, pageW - MARGIN - NOTE);
	for (let i = 0; i < notes.length; i++) {
		const n = notes[i];
		if (!n || !n.contents) continue;
		pdf.createAnnotation({
			type: 'text',
			title: String(n.title || 'Comment'),
			contents: String(n.contents),
			bounds: { x, y: MARGIN + i * (NOTE + GAP), w: NOTE, h: NOTE },
			open: false,
		});
	}
}
