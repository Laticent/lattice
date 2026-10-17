import { sanitizeStyleText } from '../../../../../lib/core/sanitize-style-text.mjs';
import { handoutRegions, nUpCells } from '../../../playground/deck-preview.js';

// The PRINT twin of `assembleSheetPdf` (deck-export.js): the same sheets, the same cells, the
// same notes band, as an HTML document the Print deck panel prints through its hidden print
// frame. Why it exists: Print for 2-up, 4-up and the notes handout used to build the PDF and
// open it in a new tab to print from the viewer. The desktop app opens no new windows, so
// that fell back to SAVING the PDF, and Print did what Download does (the owner's Windows
// run, 2026-10-05: "don't astonish users on desktop"). Printing this document opens the
// print dialog on every host: the website, WebView2 and WebKitGTK.
//
// The slide images are the ones the PDF uses (rasterizeDeckImages, data URLs), placed by the
// same shared geometry (nUpCells / handoutRegions), so the printed page and the downloaded
// PDF agree. Units are CSS px at 96 per inch, which is what the sheet sizes are in.
//
// NO UNTRUSTED CSS: the stylesheet below is fixed text plus the sheet's numbers, and still
// goes through sanitizeStyleText, so the document holds no `</style>` whatever reaches it. The one author input, a slide's
// speaker notes, goes in as escaped TEXT (HARD RULE #22: untrusted content reaches a document
// only through a sanitizer, and plain-text escaping is the strictest one).

const esc = (s) =>
	String(s)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');

const box = (r) => `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px`;

/**
 * @param {string[]} images  slide images (data URLs), in deck order
 * @param {{ w: number, h: number }} geom  the slide's native size
 * @param {{ pageW: number, pageH: number, fit?: string }} sheet  the paper, in CSS px
 * @param {{ nup?: number, handout?: boolean, notes?: (string | null)[], title?: string }} [opts]
 * @returns {string} a complete HTML document, one printed page per sheet
 */
export function buildSheetPrintHtml(images, geom, sheet, opts = {}) {
	const handout = !!opts.handout;
	const nup = handout ? 1 : [1, 2, 4].includes(opts.nup) ? opts.nup : 1;
	const boxW = geom?.w || 1280;
	const boxH = geom?.h || 720;
	const { pageW, pageH } = sheet;
	const fit = sheet.fit || 'page';
	const cells = nUpCells(boxW, boxH, pageW, pageH, nup, fit);
	const regions = handout ? handoutRegions(boxW, boxH, pageW, pageH, fit) : null;
	const notes = Array.isArray(opts.notes) ? opts.notes : [];
	const pages = handout ? images.length : Math.ceil(images.length / nup) || 1;

	const sheets = [];
	for (let p = 0; p < pages; p++) {
		const parts = [];
		if (handout && regions) {
			if (images[p]) parts.push(`<img src="${esc(images[p])}" alt="" style="${box(regions.slide)}">`);
			const text = String(notes[p] || '').trim();
			parts.push(
				`<div class="notes" style="${box(regions.notes)}">${text ? esc(text) : '<span class="none">No notes for this slide.</span>'}</div>`,
			);
		} else {
			for (let k = 0; k < nup; k++) {
				const idx = p * nup + k;
				if (idx >= images.length) break;
				parts.push(`<img src="${esc(images[idx])}" alt="" style="${box(cells[k])}">`);
			}
		}
		sheets.push(`<section class="sheet">${parts.join('')}</section>`);
	}

	// The notes band matches drawHandoutNotes: 15px text at 1.4 line height, a light rule on
	// top, a light italic placeholder when a slide has no notes, clipped to the band. jsPDF puts
	// the first BASELINE 19px under the rule; a 21px CSS line box puts the baseline about 15px
	// below its top, so the padding is 4px, not 19.
	const css = `@page{size:${pageW}px ${pageH}px;margin:0}
html,body{margin:0;padding:0;background:rgb(255,255,255)}
.sheet{position:relative;width:${pageW}px;height:${pageH}px;overflow:hidden;break-after:page;page-break-after:always;background:rgb(255,255,255)}
.sheet:last-child{break-after:auto;page-break-after:auto}
.sheet img{position:absolute;display:block;object-fit:contain}
.notes{position:absolute;box-sizing:border-box;border-top:1px solid rgb(210,210,210);padding-top:4px;font:15px/1.4 Helvetica,Arial,sans-serif;color:rgb(40,40,40);white-space:pre-wrap;overflow:hidden}
.notes .none{color:rgb(170,170,170);font-style:italic}
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}`;

	return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title || 'Lattice deck')}</title><style>${sanitizeStyleText(css)}</style></head><body>${sheets.join('')}</body></html>`;
}
