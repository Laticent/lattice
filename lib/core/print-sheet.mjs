// Print-sheet geometry — the ONE source of truth for how a deck maps onto paper
// (HARD RULE #1). Pure, dependency-free ESM so BOTH sides can consume it:
//   - the browser (docs/src/playground/deck-preview.js re-exports these for the Studio
//     Print drawer preview + the rasterize→assemble PDF path), and
//   - the Node CLI (lattice-emulator.js `require`s it for `--paper` vector PDF export).
// Everything here is math + string building: no DOM, no jsPDF, no fs.
//
// Paper decision, safe margin, fit-on-sheet, N-up grid, notes-handout bands, and the
// vector `@page` print CSS all live here so the surfaces can never disagree on which
// sheet a deck prints on or where a slide lands.

// Paper sheets in CSS px at 96dpi, PORTRAIT (w×h). Landscape swaps them.
export const PRINT_SHEETS = {
	letter: [816, 1056], // 8.5×11in
	legal: [816, 1344], // 8.5×14in
	a4: [794, 1123], // 210×297mm
};

// 9mm safe margin in px @96dpi (≈34px) — also dodges the ~3-5mm unprintable edge
// every physical printer clips. Shared by the vector print CSS and the print PDF.
export const PRINT_SAFE_PX = Math.round(9 * (96 / 25.4));

// Resolve the print SHEET (paper + orientation + px dimensions) for a deck's box.
// `opts` (all optional): { paper:'auto'|'letter'|'legal'|'a4', orientation:'auto'
// |'landscape'|'portrait' }. Auto picks the least-wasteful sheet + orientation for
// the deck's aspect; explicit values override. ONE source of truth for the paper
// decision — the Drawing Board's vector print CSS, the Studio's print-to-PDF, and the
// CLI `--paper` export all call this, so no two surfaces disagree on the sheet.
export function resolvePrintSheet(gw, gh, opts) {
	const o = opts || {};
	const aspect = gw / gh;
	// Paper: auto → least-wasteful sheet for the aspect (16:9→Legal, 4:3/other→Letter).
	const paper = ['letter', 'legal', 'a4'].includes(o.paper) ? o.paper : aspect >= 1.55 ? 'legal' : 'letter';
	// Orientation: auto → landscape only once the deck is meaningfully wider than square
	// (aspect ≥ 1.15), else portrait. The 1.15 threshold — NOT `gw >= gh` — preserves the
	// original three-way ladder: a near-square deck (1.0 ≤ aspect < 1.15) prints letter
	// PORTRAIT, matching the pre-existing Drawing Board vector print exactly (a bare
	// `gw >= gh` would silently flip those to landscape). Explicit orientation overrides.
	const orientation = o.orientation === 'landscape' || o.orientation === 'portrait' ? o.orientation : aspect >= 1.15 ? 'landscape' : 'portrait';
	const [pw, ph] = PRINT_SHEETS[paper];
	const [pageW, pageH] = orientation === 'landscape' ? [ph, pw] : [pw, ph];
	return { paper, orientation, pageW, pageH };
}

// Fit + center a slide box onto a sheet (all px @96dpi), holding the 9mm safe margin.
// Returns the placement rect for the slide image on the page. `fit:'actual'` prints
// at 1:1 (may exceed the printable box → clip); default scales to fit, never upscaled.
export function fitSlideOnSheet(gw, gh, pageW, pageH, fit) {
	const availW = pageW - 2 * PRINT_SAFE_PX;
	const availH = pageH - 2 * PRINT_SAFE_PX;
	const scale = fit === 'actual' ? 1 : Math.min(Math.min(availW / gw, availH / gh), 1);
	const w = gw * scale;
	const h = gh * scale;
	return { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

// N-up grid arrangement — the cols×rows (cols·rows ≥ nup) that fits the biggest slide
// for this sheet + slide aspect. 1→1×1; 2→ the better of 2×1 / 1×2 (so wide 16:9 slides
// stack instead of squeezing side-by-side); 4→2×2.
export function nUpGrid(nup, pageW, pageH, gw, gh) {
	if (!(nup > 1)) return { cols: 1, rows: 1 };
	if (nup === 2) {
		const scaleFor = (cols, rows) => Math.min(pageW / cols / gw, pageH / rows / gh);
		return scaleFor(2, 1) >= scaleFor(1, 2) ? { cols: 2, rows: 1 } : { cols: 1, rows: 2 };
	}
	return { cols: 2, rows: 2 };
}

// Speaker-notes handout regions for ONE sheet (all px @96dpi): the slide fit + centered in
// the TOP band (~55% of the printable height), its speaker notes in the band below, both
// inside the 9mm safe margin. Shared by the Print drawer preview (slide iframe + a notes
// box) and the PDF assembler (slide image + jsPDF-drawn note text).
export function handoutRegions(gw, gh, pageW, pageH, fit) {
	const SAFE = PRINT_SAFE_PX;
	const availW = pageW - 2 * SAFE;
	const availH = pageH - 2 * SAFE;
	const gap = Math.round(SAFE / 2);
	const slideBandH = Math.round(availH * 0.55);
	const scale = fit === 'actual' ? 1 : Math.min(Math.min(availW / gw, slideBandH / gh), 1);
	const w = gw * scale;
	const h = gh * scale;
	const slide = { x: SAFE + (availW - w) / 2, y: SAFE + (slideBandH - h) / 2, w, h };
	const notesY = SAFE + slideBandH + gap;
	const notes = { x: SAFE, y: notesY, w: availW, h: availH - slideBandH - gap };
	return { slide, notes };
}

// Placement rects for the `nup` slides on ONE sheet (all px @96dpi): an outer 9mm safe
// margin around the whole sheet, a smaller gutter between cells, each slide fit + centered
// in its cell. `nup=1` collapses to exactly `fitSlideOnSheet` (one full-page cell). The
// assembler places image i at cells[i % nup]; the drawer preview positions an iframe per
// cell. `fit:'actual'` prints each cell 1:1 (may clip).
export function nUpCells(gw, gh, pageW, pageH, nup, fit) {
	const n = [1, 2, 4].includes(nup) ? nup : 1;
	const { cols, rows } = nUpGrid(n, pageW, pageH, gw, gh);
	const SAFE = PRINT_SAFE_PX;
	const gutter = n > 1 ? Math.round(SAFE / 2) : 0;
	const cellW = (pageW - 2 * SAFE - (cols - 1) * gutter) / cols;
	const cellH = (pageH - 2 * SAFE - (rows - 1) * gutter) / rows;
	const cells = [];
	for (let i = 0; i < n; i++) {
		const c = i % cols;
		const r = Math.floor(i / cols);
		const cx = SAFE + c * (cellW + gutter);
		const cy = SAFE + r * (cellH + gutter);
		const scale = fit === 'actual' ? 1 : Math.min(Math.min(cellW / gw, cellH / gh), 1);
		const w = gw * scale;
		const h = gh * scale;
		cells.push({ x: cx + (cellW - w) / 2, y: cy + (cellH - h) / 2, w, h });
	}
	return cells;
}

// Vector print CSS for a ⌘P / `page.pdf` surface (the Drawing Board browser print AND the
// CLI `--paper` vector export). `opts`: { paper, orientation, fit:'page'|'actual' }; auto
// by default. Emits a paper `@page` (the MediaBox the printer honors) plus a `zoom` that
// scales each fixed slide box to the printable area — `zoom`, not `transform`, so
// pagination + centering see the fitted size. Never crops; a slide narrower than the sheet
// letterboxes evenly. Hold a 9mm safe margin (dodging the unprintable edge). Emit this
// AFTER the engine CSS so its `@page` size wins the later-wins-per-descriptor merge.
export function buildPrintCss(gw, gh, opts) {
	const o = opts || {};
	const SAFE = PRINT_SAFE_PX; // 9mm ≈ 34px, per printable edge
	const { paper, orientation, pageW, pageH } = resolvePrintSheet(gw, gh, o);
	const size = `${paper} ${orientation}`;
	// GUARD: shave 2px off the printable box before fitting. At an exact fit (e.g. a
	// 9:16 slide whose scaled height equals the page), sub-pixel rounding can nudge the
	// box a hair over the page and spill every slide onto a second sheet — the guard +
	// floor keep the scaled box strictly inside, so it's always one slide per page.
	const k = Math.min((pageW - 2 * SAFE - 2) / gw, (pageH - 2 * SAFE - 2) / gh);
	// fit:'actual' → 1:1 (native size, may clip); default → scale to fit, floored, never upscaled.
	const zoom = o.fit === 'actual' ? 1 : Math.floor(Math.min(k, 1) * 10000) / 10000;
	return (
		`@page{size:${size};margin:9mm;}` +
		'@media print{html,body{padding:0;margin:0;background:#fff;}' +
		// Flex column centers each slide horizontally (align-items) without a margin,
		// so a slide narrower than the sheet letterboxes evenly instead of hugging the
		// left edge. Vertical slack rides at the bottom (design doc: fit-to-width, top).
		'.lattice{visibility:visible!important;height:auto!important;overflow:visible!important;' +
		'display:flex!important;flex-direction:column!important;align-items:center!important;}' +
		// `margin:0!important` is load-bearing: the FIT agent (__latticeFit) sets an
		// INLINE marginBottom on every section for the on-screen inter-slide gap, and an
		// inline style beats a non-!important rule — so without this reset that gap leaks
		// into print (flex items honor margins) and can push a slide onto a blank second
		// sheet. `transform:none` likewise clears the preview's fit transform; `zoom` is
		// what actually scales the slide to the page here.
		'.lattice>section{content-visibility:visible!important;transform:none!important;margin:0!important;' +
		`zoom:${zoom};box-shadow:none!important;border-radius:0!important;outline:none!important;` +
		'break-after:page;break-inside:avoid;}' +
		'.lattice>section:last-child{break-after:auto;}}'
	);
}
