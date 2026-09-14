// Reading a slide's words out of the capture frame, so the exported PDF can carry
// them (`pdf-text-layer.js` writes them; this half finds them).
//
// WHERE THIS RUNS. On the main thread, inside the capture fixups, against the same
// laid-out DOM `html-to-image` is about to clone — which is the only moment the
// measurement is true. Before the fixups, the slide may still be behind the
// preview's lazy-render gates (`content-visibility`, `visibility:hidden`) and
// every rect reads zero; after them the frame is gone.
//
// WHAT A RUN IS. One WORD, with the box the browser gave it. Splitting at
// whitespace rather than shipping whole lines is what keeps the text layer aligned
// with the picture: each word is placed at its own measured x, so a reader's
// selection lands on the word under the cursor, and an extractor infers the spaces
// from the gaps (this is what OCR output does, and poppler, Acrobat and pdf.js all
// read it). A line-at-a-time run would have to trust the font's own advance
// widths, which are Helvetica's here and not the deck's.
//
// COORDINATES ARE NORMALIZED to the slide box — x/w as fractions of its width,
// y (the BASELINE, from the top) and s (the font size) as fractions of its height.
// The frame's FIT agent scales the deck with a CSS transform, so raw client rects
// are in scaled pixels; dividing by the section's own scale removes it, and
// normalizing means neither this module nor the worker has to know the page is
// 960x720 points or that the capture ran at 2x.
//
// WHAT IS DELIBERATELY NOT EXTRACTED:
//   - anything not VISIBLE — `display:none`, `visibility:hidden` (which is how the
//     capture frame hides an unrendered Mermaid fence), `opacity:0`;
//   - SCREEN-READER-ONLY text — the 1px `overflow:hidden` clip (`.cell-sr-label`
//     names a matrix cell's state for anything reading DOM text). It is not copy a
//     human can see on the slide, so lifting it into the page's text would make the
//     extraction disagree with the picture;
//   - `<script>` / `<style>` content, which is not copy at all.
// `aria-hidden` is NOT a reason to skip: charts mark a VISIBLE label aria-hidden
// when its accessible name lives elsewhere (journey's actor dots, for one), and
// that label is on the slide in ink.

/** Elements whose text is never slide copy. Matched on `localName` so SVG's own
 *  lowercase `<style>` is caught alongside HTML's. */
const SKIP_ELEMENTS = new Set(['script', 'style', 'noscript', 'template', 'title', 'head']);

/** Where the baseline sits inside a text rect, as a fraction of its height.
 *  A Range's rect is the font box (ascent + descent), so ~0.8 down is the
 *  baseline for every face we ship. It only has to be close: the glyphs are
 *  invisible, so this sets where a selection highlight sits, not where ink lands. */
const BASELINE_RATIO = 0.8;

/** Apply the element's `text-transform`, so the run says what the slide SHOWS.
 *  An eyebrow is written lowercase in Markdown and set in capitals by the theme;
 *  without this the PDF's text layer would disagree with its own picture. */
export function applyTextTransform(text, transform) {
	if (transform === 'uppercase') return text.toUpperCase();
	if (transform === 'lowercase') return text.toLowerCase();
	if (transform === 'capitalize') return text.replace(/(^|\s)(\S)/g, (_m, lead, ch) => lead + ch.toUpperCase());
	return text;
}

/** Split a text node's value into words, each with its offsets in the ORIGINAL
 *  string — the offsets have to survive `text-transform`, which can change length
 *  (`'ß'.toUpperCase()` is two characters), so the range is taken from the raw text
 *  and only the run's own string is transformed. */
export function splitWords(value) {
	const out = [];
	const re = /\S+/g;
	let m = re.exec(value);
	while (m) {
		out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
		m = re.exec(value);
	}
	return out;
}

/** The screen-reader clip: a 1px `overflow:hidden` box, or the `inset(50%)` clip. */
function isScreenReaderOnly(cs) {
	if (String(cs.clipPath || '').replace(/\s/g, '') === 'inset(50%)') return true;
	if (cs.overflow !== 'hidden') return false;
	const w = Number.parseFloat(cs.width);
	const h = Number.parseFloat(cs.height);
	return Number.isFinite(w) && Number.isFinite(h) && w <= 2 && h <= 2;
}

/** Does this element clip what overflows it?
 *  An EMPTY value counts as `visible`: a real browser always resolves this property,
 *  but a document with no layout engine resolves nothing, and reading `''` as "clips"
 *  would silently drop every word on the slide. */
function clips(cs) {
	const set = (v) => !!v && v !== 'visible';
	return set(cs.overflow) || set(cs.overflowX) || set(cs.overflowY);
}

/** The intersection of two client rects, or null when they do not meet. */
function intersect(a, b) {
	if (!a) return b;
	if (!b) return a;
	const left = Math.max(a.left, b.left);
	const top = Math.max(a.top, b.top);
	const right = Math.min(a.right, b.right);
	const bottom = Math.min(a.bottom, b.bottom);
	return right > left && bottom > top ? { left, top, right, bottom } : null;
}

/**
 * The element's font size in the SAME units as the rects we measure.
 *
 * For HTML that is what `getComputedStyle` already gives. For SVG it is NOT: inside a
 * `viewBox` the computed `font-size` is in the viewBox's USER UNITS while every client
 * rect is post-viewBox CSS px. Every chart the engine draws is a scaled viewBox, so
 * reading the two as one unit gave every chart label a font a QUARTER the size of its
 * own ink — measured on a real export: an 8-unit label whose rendered box is 36 px.
 * The element's screen CTM is the missing factor. It also carries the capture frame's
 * FIT scale, which the caller divides out of every other measurement, so it is divided
 * out of this one too.
 */
function measuredFontSize(el, cs, frameScale) {
	const size = Number.parseFloat(cs.fontSize) || 0;
	if (!(size > 0) || typeof el.getScreenCTM !== 'function') return size;
	const m = el.getScreenCTM();
	if (!m) return size;
	return (size * Math.hypot(m.a, m.b)) / (frameScale || 1);
}

/**
 * Every word on one rendered slide, normalized to its box.
 *
 * @param {Element} section the slide, laid out, with the capture fixups applied
 * @returns {Array<{t:string,x:number,y:number,w:number,s:number}>}
 */
export function collectSlideTextRuns(section) {
	const doc = section?.ownerDocument;
	const win = doc?.defaultView;
	if (!win || typeof win.getComputedStyle !== 'function') return [];
	const boxW = section.offsetWidth || 0;
	const boxH = section.offsetHeight || 0;
	if (!(boxW > 0 && boxH > 0)) return [];
	const frame = section.getBoundingClientRect();
	// The FIT agent scales the deck with a CSS transform; client rects are in that
	// scaled space and the box is not. One divisor undoes it for every measurement.
	const scale = frame.width > 0 ? frame.width / boxW : 1;
	const runs = [];
	const range = doc.createRange();

	const visit = (el, clip) => {
		const cs = win.getComputedStyle(el);
		if (cs.display === 'none' || Number.parseFloat(cs.opacity) === 0) return;
		if (isScreenReaderOnly(cs)) return;
		// `visibility` INHERITS and is OVERRIDABLE, so a hidden parent can hold a visible
		// child that a human sees. Pruning the subtree would lose it; this skips only this
		// element's own text and keeps walking.
		const shown = cs.visibility === 'visible';
		// An element that clips decides what is actually on the page beneath it. Without
		// this, text scrolled or ellipsized out of a box was written into the layer at its
		// UNCLIPPED position — a marquee over blank paper picking up words that are not
		// there, which is the same defect the screen-reader-only skip exists to prevent.
		const inner = clips(cs) ? intersect(clip, el.getBoundingClientRect()) : clip;
		if (clips(cs) && !inner) return;
		const transform = cs.textTransform;
		const fontSize = measuredFontSize(el, cs, scale);
		for (let child = el.firstChild; child; child = child.nextSibling) {
			if (child.nodeType === 1) {
				if (!SKIP_ELEMENTS.has(String(child.localName || '').toLowerCase())) visit(child, inner);
			} else if (child.nodeType === 3 && shown && /\S/.test(child.nodeValue || '')) {
				emit(child, transform, fontSize, inner);
			}
		}
	};

	const emit = (node, transform, fontSize, clip) => {
		for (const word of splitWords(node.nodeValue || '')) {
			range.setStart(node, word.start);
			range.setEnd(node, word.end);
			// The FIRST fragment, not the union. A word that soft-wraps mid-word (a long
			// compound in a narrow column) has a rect per line, and their union is a box two
			// lines tall whose baseline sits between them — placing the whole word nowhere.
			// The first fragment is where the word starts, which is where a reader looks.
			const rects = typeof range.getClientRects === 'function' ? range.getClientRects() : null;
			const r = rects && rects.length > 1 ? rects[0] : range.getBoundingClientRect();
			if (!(r.width > 0 && r.height > 0)) continue;
			if (clip && !intersect(clip, r)) continue;
			const x = (r.left - frame.left) / scale;
			const top = (r.top - frame.top) / scale;
			const w = r.width / scale;
			const h = r.height / scale;
			// A Range's rect IS the font box (ascent + descent, ~1.2em for the faces we
			// ship), so it can stand in when the computed font size cannot be read. That
			// is a fallback, not the path: dropping the word because one style lookup came
			// back empty would lose the copy, and the size only sets how tall an INVISIBLE
			// glyph is — where the selection box sits, never where ink lands.
			const size = fontSize > 0 ? fontSize : h / 1.2;
			if (!(size > 0)) continue;
			// Off the slide entirely (an overflow-clipped column, a decorative element
			// parked outside the box) — it is not on the page, so it is not in its text.
			if (x + w <= 0 || x >= boxW || top + h <= 0 || top >= boxH) continue;
			runs.push({
				t: applyTextTransform(word.text, transform),
				x: x / boxW,
				y: (top + h * BASELINE_RATIO) / boxH,
				w: w / boxW,
				s: size / boxH,
			});
		}
	};

	// The section itself is the outermost clip: a deck paints to its own edge.
	visit(section, null);
	range.detach?.();
	return runs;
}
