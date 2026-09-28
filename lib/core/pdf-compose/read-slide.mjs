/**
 * lib/core/pdf-compose/read-slide.mjs — the READER of the shared PDF writer.
 *
 * Runs INSIDE a page: the CLI's Chrome and the Studio's own browser run this same
 * file. It reads one laid-out slide into a DRAWING LIST — what the PDF will draw as
 * real text and real vector shapes — and marks everything else to stay in the
 * slide's photo. It never draws, and it never guesses: a thing it cannot place
 * exactly (rotated text, a text shadow, a gradient-filled glyph) is left to the photo,
 * where it still looks right. See engineering/decisions/2026-09-27-studio-export-one-engine.md §4 C.
 *
 * Coordinates are CSS px relative to the slide's top-left corner. SVG items carry
 * their own 2-D matrix (user space -> slide px) so a rotated axis label or a scaled
 * chart is placed exactly.
 */

/**
 * Computed style through the element's OWN window: the Studio runs this module in its
 * parent page against a capture frame's document, where the global would be the wrong realm.
 */
const gcs = (el, pseudo) => el.ownerDocument.defaultView.getComputedStyle(el, pseudo);

/** Attribute marking an element whose own text the PDF draws (so the photo hides it). */
export const DRAWN_TEXT = 'data-pc-text';
/** Attribute marking an SVG element the PDF draws (so the photo drops it). */
export const DRAWN_SHAPE = 'data-pc-shape';

const SVG_SHAPES = 'path, line, rect, circle, ellipse, polyline, polygon';
const SVG_NOT_RENDERED = 'defs, clipPath, mask, pattern, symbol, marker, linearGradient, radialGradient';

/**
 * Any CSS color (rgb, color(srgb …), oklab, color-mix …) to sRGB bytes + alpha.
 * The browser paints it into one pixel and we read it back, so no color syntax is
 * parsed here — the engine owns color, not this file.
 */
function makeColorReader(doc) {
	const cvs = doc.createElement('canvas');
	cvs.width = cvs.height = 1;
	const cx = cvs.getContext('2d', { willReadFrequently: true });
	const cache = new Map();
	return (c) => {
		if (!c || c === 'none' || c === 'transparent' || c.startsWith('url(')) return null;
		if (cache.has(c)) return cache.get(c);
		cx.clearRect(0, 0, 1, 1);
		// Not a dead store: a canvas IGNORES a color string it cannot parse and keeps the last
		// fillStyle, so without this reset one unparseable value inherits the previous color.
		cx.fillStyle = '#000';
		cx.fillStyle = c;
		cx.fillRect(0, 0, 1, 1);
		const d = cx.getImageData(0, 0, 1, 1).data;
		const out = d[3] ? [d[0], d[1], d[2], d[3] / 255] : null;
		cache.set(c, out);
		return out;
	};
}

const parseMatrix = (t) => {
	if (!t || t === 'none') return [1, 0, 0, 1, 0, 0];
	const m = t.match(/matrix\(([^)]+)\)/);
	if (m) return m[1].split(',').map(Number);
	return null; // matrix3d and anything else: not a plain 2-D transform
};

/**
 * Walk from `el` up to the slide: the product of opacities, the uniform scale the
 * text is drawn at, and whether a rotation / skew / 3-D transform stands in the way
 * (then the text stays in the photo: an axis-aligned rect cannot place it).
 */
function ancestry(el, section) {
	let opacity = 1, scale = 1, plain = true;
	for (let e = el; e && e !== section.parentElement; e = e.parentElement) {
		const cs = gcs(e);
		opacity *= Number(cs.opacity);
		// An SVG element's transform is already in its screen CTM, which SVG items use.
		if (e.namespaceURI === 'http://www.w3.org/2000/svg') continue;
		const m = parseMatrix(cs.transform);
		if (!m || Math.abs(m[1]) > 1e-6 || Math.abs(m[2]) > 1e-6 || Math.abs(m[0] - m[3]) > 1e-6) plain = false;
		else scale *= m[0];
		const z = Number(cs.zoom);
		if (z && z !== 1) scale *= z;
	}
	return { opacity, scale, plain };
}

/** Fraction of `q` left visible by clipping ancestors (overflow, clip, clip-path). */
function visibleFraction(el, q, section) {
	let l = q.left, t = q.top, r = q.right, b = q.bottom;
	for (let e = el; e && e !== section; e = e.parentElement) {
		const cs = gcs(e);
		if (cs.clipPath !== 'none' || cs.clip !== 'auto' || cs.overflow !== 'visible') {
			const z = e.getBoundingClientRect();
			let zl = z.left, zt = z.top, zr = z.right, zb = z.bottom;
			// `clip: rect(top, right, bottom, left)` — the visually-hidden idiom (KaTeX's
			// screen-reader MathML is clipped to 1px) — is relative to the element's box.
			const m = cs.clip.match(/rect\(([^)]+)\)/);
			if (m) {
				const [ct, cr, cb, cl] = m[1].split(/[\s,]+/).map((v) => (v === 'auto' ? null : parseFloat(v)));
				zl = z.left + (cl ?? 0); zt = z.top + (ct ?? 0); zr = cr == null ? zr : z.left + cr; zb = cb == null ? zb : z.top + cb;
			}
			l = Math.max(l, zl); t = Math.max(t, zt); r = Math.min(r, zr); b = Math.min(b, zb);
		}
	}
	if (r <= l || b <= t) return 0;
	return ((r - l) * (b - t)) / Math.max(1e-6, q.width * q.height);
}

function transformCase(t, tt) {
	if (tt === 'uppercase') return t.toUpperCase();
	if (tt === 'lowercase') return t.toLowerCase();
	if (tt === 'capitalize') return t.replace(/^(\P{L}*)(\p{L})/u, (_, a, b) => a + b.toUpperCase());
	return t;
}

const family = (cs) => cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
const features = (cs) => {
	const f = {};
	if (/tabular-nums/.test(cs.fontVariantNumeric)) f.tnum = true;
	if (/lining-nums/.test(cs.fontVariantNumeric)) f.lnum = true;
	if (/oldstyle-nums/.test(cs.fontVariantNumeric)) f.onum = true;
	for (const m of (cs.fontFeatureSettings || '').matchAll(/"(\w{4})"\s*(on|off|\d+)?/g)) f[m[1]] = m[2] !== 'off' && m[2] !== '0';
	return f;
};

/**
 * Why a text element cannot be drawn as plain text — a reason string, or '' when it can.
 * Everything named here stays in the photo, untouched.
 */
function textRefusal(cs, el) {
	if (cs.textShadow !== 'none') return 'text-shadow';
	// A truncated line's "…" is painted with the text's fill: hidden with it, and never drawn.
	if (el && cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth) return 'ellipsis';
	if (/text/.test(cs.backgroundClip) || /text/.test(cs.webkitBackgroundClip || '')) return 'background-clip:text';
	if (parseFloat(cs.webkitTextStrokeWidth) > 0) return 'text-stroke';
	if (cs.fontVariantCaps && cs.fontVariantCaps !== 'normal') return 'font-variant-caps';
	if (cs.writingMode && !cs.writingMode.startsWith('horizontal')) return 'writing-mode';
	if (cs.mixBlendMode !== 'normal') return 'blend-mode';
	return '';
}

const ROLE = { H1: 'H1', H2: 'H2', H3: 'H3', H4: 'H4', H5: 'H5', H6: 'H6', P: 'P', LI: 'LI', TH: 'TH', TD: 'TD',
	BLOCKQUOTE: 'BlockQuote', FIGCAPTION: 'Caption', CAPTION: 'Caption', PRE: 'Code', CODE: 'Code' };

/**
 * The block a run of text belongs to — its nearest ancestor that is not inline — and that
 * block's structure role. The PDF's tag tree groups words by it, so a screen reader reads
 * a heading as a heading and a paragraph as one paragraph, as Chrome's tagged PDF does.
 */
function blockOf(el, section) {
	let e = el;
	while (e && e !== section && /^(inline|contents)/.test(gcs(e).display) && e.parentElement) e = e.parentElement;
	return { block: e, role: ROLE[e.tagName] || 'P' };
}

/**
 * Where Chrome puts the baseline inside a text run's box, for one font at one size —
 * MEASURED, not derived: Blink rounds ascent and descent its own way, and deriving them from
 * the font's tables put a 48px title 2px high (measured 2026-09-27). A probe span in the
 * same font, holding a zero-size baseline-aligned marker, gives the offset from the run's
 * top to its baseline; cached per font and size.
 */
function makeBaselineProbe(doc, host) {
	const cache = new Map();
	return (cs, scale) => {
		const key = `${cs.fontFamily}|${cs.fontSize}|${cs.fontWeight}|${cs.fontStyle}|${cs.fontStretch}|${cs.fontVariationSettings}`;
		if (cache.has(key)) return cache.get(key) * scale;
		const span = doc.createElement('span');
		span.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:nowrap;line-height:normal;visibility:hidden';
		for (const p of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariationSettings', 'fontKerning', 'fontFeatureSettings']) span.style[p] = cs[p];
		span.textContent = 'Hx';
		const mark = doc.createElement('i');
		mark.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
		span.appendChild(mark);
		host.appendChild(span);
		const r = doc.createRange();
		r.selectNodeContents(span.firstChild);
		const off = mark.getBoundingClientRect().top - r.getBoundingClientRect().top;
		span.remove();
		cache.set(key, off);
		return off * scale;
	};
}

/** Split a Range's text into per-line pieces when it wraps (a hyphenated or long word). */
function linePieces(node, start, end) {
	const out = [];
	const r = node.ownerDocument.createRange();
	let cur = null;
	for (let i = start; i < end; i++) {
		r.setStart(node, i); r.setEnd(node, i + 1);
		const q = r.getBoundingClientRect();
		if (!q.width && !q.height) continue;
		if (cur && Math.abs(q.top - cur.top) < 1) { cur.end = i + 1; cur.right = Math.max(cur.right, q.right); continue; }
		cur = { start: i, end: i + 1, top: q.top, left: q.left, right: q.right, bottom: q.bottom, height: q.height };
		out.push(cur);
	}
	return out;
}

/**
 * Read one slide.
 * @param {Element} section the laid-out slide (`section[data-lattice-slide]`)
 * @returns {{ w:number, h:number, words:object[], shapes:object[], links:object[], stats:object }}
 *   Every word and shape keeps a live `el` reference for the orchestrator; it is
 *   dropped before anything crosses a process boundary.
 */
export function readSlide(section) {
	// Every paint-over check hit-tests with elementsFromPoint, which skips `pointer-events:
	// none` — exactly how scrims and overlays are written. For the read, an element that
	// PAINTS A BOX hit-tests whatever its pointer-events. Only those: an empty full-slide SVG
	// (sketch mode's rough-ink layer) would otherwise 'cover' every word under it and push
	// them out of the text layer (the third checker pass, 2026-09-27).
	const undo = [];
	for (const el of [section, ...section.querySelectorAll('*')]) {
		if (el.closest('svg')) continue;
		const cs = gcs(el);
		if (cs.pointerEvents !== 'none' || !paintsBox(cs)) continue;
		undo.push([el, el.style.getPropertyValue('pointer-events'), el.style.getPropertyPriority('pointer-events')]);
		el.style.setProperty('pointer-events', 'auto', 'important');
	}
	try {
		return readSlideInner(section);
	} finally {
		for (const [el, v, pr] of undo) { if (v) el.style.setProperty('pointer-events', v, pr); else el.style.removeProperty('pointer-events'); }
	}
}

function readSlideInner(section) {
	const doc = section.ownerDocument;
	// Bring the slide to the viewport's top-left: `elementsFromPoint` (the paint-over check
	// for images) sees only what is on screen, and the CLI stacks its slides vertically.
	const win = doc.defaultView;
	const r0 = section.getBoundingClientRect();
	if (r0.top || r0.left) win.scrollTo(win.scrollX + r0.left, win.scrollY + r0.top);
	const box = section.getBoundingClientRect();
	const ox = box.left, oy = box.top;
	const color = makeColorReader(doc);
	const baselineOf = makeBaselineProbe(doc, doc.body); // off the slide: nothing observing it reacts
	const words = [], shapes = [], links = [];
	const stats = { clippedWords: 0, refusedText: {}, refusedShapes: {}, refusedImages: {} };
	const sids = new Map();
	const sidOf = (block) => { if (!sids.has(block)) sids.set(block, sids.size); return sids.get(block); };
	const refuse = (bag, why) => { stats[bag][why] = (stats[bag][why] || 0) + 1; };

	// ── HTML text: one run per word, placed at the box the browser measured ──────────
	const walker = doc.createTreeWalker(section, 4 /* NodeFilter.SHOW_TEXT */);
	for (let n = walker.nextNode(); n; n = walker.nextNode()) {
		const el = n.parentElement;
		if (!el || !n.textContent.trim()) continue;
		// HTML inside an SVG <foreignObject> (Mermaid's node labels) is laid out in the SVG's
		// user space: the SVG's own scale applies on top of the CSS one.
		let svgScale = 1, svgPlain = true;
		if (el.closest('svg')) {
			const fo = el.closest('foreignObject');
			if (!fo) continue; // SVG <text> is read below, under its own matrix
			const M = fo.getScreenCTM();
			if (!M || Math.abs(M.b) > 1e-6 || Math.abs(M.c) > 1e-6 || Math.abs(M.a - M.d) > 1e-6) svgPlain = false;
			else svgScale = M.a;
		}
		const cs = gcs(el);
		if (cs.visibility !== 'visible' || cs.display === 'none') continue;
		// text-overflow sits on the BLOCK that clips (the text may be in an inline child of it).
		let why = textRefusal(cs, el);
		for (let e = el.parentElement; !why && e && e !== section; e = e.parentElement) if (gcs(e).textOverflow === 'ellipsis' && e.scrollWidth > e.clientWidth) why = 'ellipsis';
		const anc = ancestry(el, section);
		if (why || !anc.plain || !svgPlain) { refuse('refusedText', why || 'transform'); continue; }
		anc.scale *= svgScale;
		const fill = color(cs.webkitTextFillColor || cs.color);
		if (!fill) continue; // transparent text: nothing to draw, nothing to hide
		const blk = blockOf(el, section);
		const base = {
			el, sid: sidOf(blk.block), role: blk.role, fam: family(cs), wt: Number(cs.fontWeight), it: cs.fontStyle !== 'normal',
			size: parseFloat(cs.fontSize) * anc.scale,
			ls: (cs.letterSpacing === 'normal' ? 0 : parseFloat(cs.letterSpacing)) * anc.scale,
			feat: features(cs), color: fill, op: anc.opacity,
		};
		const re = /\S+/g;
		const txt = n.textContent;
		for (let m = re.exec(txt); m; m = re.exec(txt)) {
			const pieces = linePieces(n, m.index, m.index + m[0].length);
			pieces.forEach((p, i) => {
				const q = { left: p.left, top: p.top, right: p.right, bottom: p.bottom, width: p.right - p.left, height: p.bottom - p.top };
				if (visibleFraction(el, q, section) < 0.5) { stats.clippedWords++; return; }
				// `joinNext`: a word the browser broke across lines continues in the next piece,
				// so the text layer must not put a space inside it.
				// `capitalize` touches a word's FIRST letter only, not the start of each line piece.
				words.push({ ...base, t: transformCase(txt.slice(p.start, p.end), i === 0 || cs.textTransform !== 'capitalize' ? cs.textTransform : 'none'), x: q.left - ox, top: q.top - oy, w: q.width, h: q.height, base: q.top - oy + baselineOf(cs, anc.scale), joinNext: i < pieces.length - 1 });
			});
		}
	}

	const overlays = makeOverlayModel(section, doc);
	// Text something paints OVER (a redaction bar, a scrim, a stacked card) stays in the
	// photo, under it: drawn on top it would show — and copy — what the slide hides.
	const covered = new Set();
	for (const w of words) {
		if (covered.has(w.el)) continue;
		if (textCovered(w.el, ox + w.x + w.w / 2, oy + w.top + w.h / 2, doc) || overlays.pseudoOver(w.el, inkBand(ox + w.x, oy + w.top, w.w, w.h))) covered.add(w.el);
	}
	if (covered.size) {
		for (let i = words.length - 1; i >= 0; i--) if (covered.has(words[i].el)) { words.splice(i, 1); refuse('refusedText', 'covered'); }
	}

	// ── SVG: shapes and text, each under its own matrix ────────────────────────────────
	// Outermost <svg> only: a nested one's shapes are already its ancestor's descendants, and
	// reading them again drew each twice (a 50% fill came out opaque).
	for (const svg of section.querySelectorAll('svg')) {
		if (svg.parentElement?.closest('svg')) continue;
		// One check for the whole SVG first: nothing painted over it means no shape needs one
		// (a 3,000-shape chart costs 16 hit tests, not 48,000).
		const svgClear = !overlays.covers(svg.getBoundingClientRect(), svg);
		for (const el of svg.querySelectorAll(`${SVG_SHAPES}, text`)) {
			if (el.closest(SVG_NOT_RENDERED)) continue;
			const cs = gcs(el);
			if (cs.display === 'none' || cs.visibility !== 'visible') continue;
			// Clip paths are drawn (as PDF clipping paths); masks and filters are not.
			let masked = '';
			for (let e = el; e && e !== svg.parentElement; e = e.parentElement) {
				const c = gcs(e);
				if (c.mask && c.mask !== 'none') masked = 'mask';
				else if (c.filter !== 'none') masked = 'filter';
			}
			let clips = masked ? null : readClips(el, svg, ox, oy);
			if (clips === false) masked = 'clip-path';
			// The browser also clips to every <svg> viewport on the way up (inline SVG is
			// `overflow: hidden` by default) and to every overflow-clipping HTML ancestor.
			// KaTeX draws a square root's bar 400em wide and relies on both to crop it: without
			// them the bar ran to the edge of the page (the checker's pass, 2026-09-27).
			if (clips) clips = [...clips, ...svgViewportClips(el, svg, ox, oy), ...htmlClips(svg, section, ox, oy)];
			const M = el.getScreenCTM();
			if (!M) continue;
			// Drawn over the photo, a shape would bury anything the photo paints ABOVE it: a card
			// laid over a diagram, a scrim over a chart. Then it stays in the photo, where the
			// browser already stacked it (the thin-line sweep, 2026-09-27).
			if (!masked && !svgClear && overlays.covers(el.getBoundingClientRect(), svg)) masked = 'covered';
			const mat = [M.a, M.b, M.c, M.d, M.e - ox, M.f - oy];
			const op = ancestry(el, section).opacity;
			if (el.tagName.toLowerCase() === 'text') {
				if (masked) { refuse('refusedText', `svg-${masked}`); continue; }
				const fill = color(cs.fill);
				const n = el.getNumberOfChars();
				if (!fill || !n || !el.textContent.trim()) continue;
				// One run per stretch of characters on a common baseline (tspans can restart x/y).
				const text = el.textContent;
				let run = null;
				const flush = () => { if (run?.t.trim()) words.push({ ...run, t: transformCase(run.t, cs.textTransform) }); run = null; };
				for (let i = 0; i < n; i++) {
					const p = el.getStartPositionOfChar(i), ex = el.getExtentOfChar(i);
					const ch = text[i];
					if (run && Math.abs(p.y - run.py) < 0.01 && Math.abs(ex.x - run.end) < Math.max(1, ex.width * 0.6)) {
						run.t += ch; run.end = ex.x + ex.width; run.w = run.end - run.px; continue;
					}
					flush();
					run = { el, sid: sidOf(svg), role: 'Figure', svg: true, mat, clips, t: ch, px: ex.x, py: p.y, etop: ex.y, eh: ex.height, end: ex.x + ex.width, w: ex.width,
						fam: family(cs), wt: Number(cs.fontWeight), it: cs.fontStyle !== 'normal', size: parseFloat(cs.fontSize),
						ls: 0, feat: features(cs), color: fill, op: op * Number(cs.fillOpacity) };
				}
				flush();
				continue;
			}
			// Arrowheads (marker-start/mid/end) are drawn by the browser from the path; the writer
			// does not draw markers, so a marked path stays in the photo whole, markers and all.
			if (!masked && [cs.markerStart, cs.markerMid, cs.markerEnd].some((m) => m && m !== 'none')) masked = 'marker';
			if (masked) { refuse('refusedShapes', masked); continue; }
			const d = shapePath(el);
			if (!d) continue;
			// `non-scaling-stroke` holds the width in SCREEN px; the writer strokes in user space.
			const sw = (parseFloat(cs.strokeWidth) || 0) / (cs.vectorEffect === 'non-scaling-stroke' ? Math.sqrt(Math.abs(mat[0] * mat[3] - mat[1] * mat[2])) || 1 : 1);
			const fillPaint = readPaint(el, cs.fill, color);
			const strokePaint = sw ? readPaint(el, cs.stroke, color) : null;
			if (fillPaint?.refuse || strokePaint?.refuse || strokePaint?.grad) { refuse('refusedShapes', fillPaint?.refuse || strokePaint?.refuse || 'gradient-stroke'); continue; }
			const fill = fillPaint?.solid || null, stroke = strokePaint?.solid || null;
			const grad = fillPaint?.grad || null;
			if (!fill && !grad && !stroke) continue;
			shapes.push({ el, d, mat, clips, fill, grad, fop: op * Number(cs.fillOpacity), stroke, sop: op * Number(cs.strokeOpacity), sw,
				cap: cs.strokeLinecap, join: cs.strokeLinejoin, dash: cs.strokeDasharray, rule: cs.fillRule });
		}
	}

	// ── Raster images: <img> and single-layer CSS backgrounds, at their own resolution ──
	const images = [];
	const sidOfImg = (el) => sidOf(el);
	for (const el of section.querySelectorAll('*')) {
		if (el.closest('svg')) continue;
		const cs = gcs(el);
		if (cs.display === 'none' || cs.visibility !== 'visible') continue;
		const isImg = el.tagName === 'IMG';
		const bgUrl = !isImg && /^url\(/.test(cs.backgroundImage) ? cs.backgroundImage : '';
		if (!isImg && !bgUrl) continue;
		const why = placementRefusal(el, cs, isImg, section);
		if (why) { refuse('refusedImages', why); stats.needsSharpPhoto = true; continue; }
		const place = isImg ? imgPlacement(el, cs) : bgPlacement(el, cs);
		if (!place) { refuse('refusedImages', isImg ? 'img-geometry' : 'bg-geometry'); stats.needsSharpPhoto = true; continue; }
		// Drawn over the photo, the image would cover anything the photo paints ABOVE it (a
		// scrim over a background, a badge over a picture). Then it stays in the photo, and
		// the photo is taken sharper instead.
		if (paintedAbove(el, isImg, place, doc)) { refuse('refusedImages', 'covered'); stats.needsSharpPhoto = true; continue; }
		const anc = ancestry(el, section);
		images.push({
			el, kind: isImg ? 'img' : 'bg', url: place.url,
			x: place.x - ox, y: place.y - oy, w: place.w, h: place.h,
			clips: [roundedClip(el, cs, ox, oy), ...htmlClips(el, section, ox, oy)].filter(Boolean),
			op: anc.opacity, sid: isImg ? sidOfImg(el) : -1, alt: isImg ? el.getAttribute('alt') || '' : '',
		});
	}

	// ── HTML borders: the hard, thin lines a stretched photo blurs ─────────────────────
	// A card's border or a heading's rule is one of the few HARD edges left in the photo, and
	// the one a big screen shows: at 4K a 1x photo smears a 1px border across 5px. Solid
	// borders are drawn as vectors instead — straight sides as rectangles, an even rounded
	// border as a ring — and hidden in the photo (hideDrawn: border-color transparent). Fills
	// stay in the photo on purpose: a fill drawn on top would bury whatever the photo still
	// carries inside the box. Anything not drawable exactly stays in the photo, as before.
	for (const el of section.querySelectorAll('*')) {
		if (el.closest('svg')) continue;
		const cs = gcs(el);
		if (cs.display === 'none' || cs.visibility !== 'visible') continue;
		const sides = ['Top', 'Right', 'Bottom', 'Left'].map((k) => ({ k, w: parseFloat(cs[`border${k}Width`]) || 0, style: cs[`border${k}Style`], c: color(cs[`border${k}Color`]) }))
			.map((s) => ({ ...s, on: s.w > 0 && s.style !== 'none' && s.style !== 'hidden' && !!s.c }));
		if (!sides.some((s) => s.on)) continue;
		const why = borderRefusal(el, cs, sides, section);
		if (why) { refuse('refusedShapes', `border-${why}`); continue; }
		const anc = ancestry(el, section);
		// Inside a see-through group the browser blends the border over the BACKDROP; drawn
		// over the photo it would blend over the element's own fill, which the photo keeps.
		if (anc.opacity < 0.999) { refuse('refusedShapes', 'border-opacity'); continue; }
		// An inline box that wraps has a border piece per line, not one box around them all.
		if (el.getClientRects().length > 1) { refuse('refusedShapes', 'border-wrapped'); continue; }
		const r = el.getBoundingClientRect();
		if (!r.width || !r.height) continue;
		if (borderCovered(el, r, sides, anc.scale, doc)) { refuse('refusedShapes', 'border-covered'); continue; }
		const x = r.left - ox, y = r.top - oy, w = r.width, h = r.height;
		const [t, rt, b, l] = sides.map((s) => (s.on ? s.w * anc.scale : 0));
		const radii = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((k) => px(cs[`border${k}Radius`]) * anc.scale);
		let d;
		if (radii.some(Boolean)) {
			// borderRefusal guarantees four equal sides here: a ring, outer box minus inner box.
			if (w <= 2 * t || h <= 2 * t) { refuse('refusedShapes', 'border-radius'); continue; }
			// CSS scales every radius down together when adjacent ones overflow the box, and the
			// inner curve is that CLAMPED radius minus the border width.
			const k = Math.min(1, w / Math.max(1e-6, radii[0] + radii[1]), w / Math.max(1e-6, radii[3] + radii[2]), h / Math.max(1e-6, radii[0] + radii[3]), h / Math.max(1e-6, radii[1] + radii[2]));
			const outer = radii.map((v) => v * k);
			d = roundedRectPath(x, y, w, h, outer) + roundedRectPath(x + t, y + t, w - 2 * t, h - 2 * t, outer.map((v) => Math.max(0, v - t)));
		} else {
			// Non-overlapping rectangles, so a translucent border does not double at the corners.
			const rect = (rx, ry, rw, rh) => (rw > 0 && rh > 0 ? `M${rx} ${ry}H${rx + rw}V${ry + rh}H${rx}Z` : '');
			d = rect(x, y, w, t) + rect(x, y + h - b, w, b) + rect(x, y + t, l, h - t - b) + rect(x + w - rt, y + t, rt, h - t - b);
		}
		const c = sides.find((s) => s.on).c;
		shapes.push({ el, border: true, d, mat: [1, 0, 0, 1, 0, 0], clips: htmlClips(el, section, ox, oy), fill: c, grad: null, fop: anc.opacity,
			stroke: null, sop: 0, sw: 0, rule: radii.some(Boolean) ? 'evenodd' : 'nonzero' });
	}

	// ── Links: page.pdf() keeps them clickable, so the writer must too ─────────────────
	const allSlides = [...doc.querySelectorAll('section[data-lattice-slide]')];
	for (const a of section.querySelectorAll('a[href]')) {
		const raw = a.getAttribute('href') || '';
		let link = null;
		if (raw.startsWith('#')) {
			// A jump inside the deck: to the slide that holds the target.
			let target = null;
			try { target = doc.getElementById(decodeURIComponent(raw.slice(1))); } catch {}
			const page = target ? allSlides.indexOf(target.closest('section[data-lattice-slide]') || target) : -1;
			if (page >= 0) link = { dest: page };
		} else if (/^(https?:|mailto:)/i.test(a.href)) link = { href: a.href };
		if (!link) continue;
		for (const q of a.getClientRects()) if (q.width && q.height) links.push({ ...link, x: q.left - ox, y: q.top - oy, w: q.width, h: q.height });
	}

	return { w: box.width, h: box.height, words, shapes, images, links, stats };
}

const matOf = (m) => [m.a, m.b, m.c, m.d, m.e, m.f];
const mul = (A, B) => [
	A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
	A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
	A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5],
];
const localTransform = (el) => {
	const t = el.transform?.baseVal?.consolidate();
	return t ? matOf(t.matrix) : [1, 0, 0, 1, 0, 0];
};
const refTarget = (el, v) => {
	const id = (v.match(/url\(\s*["']?#([^"')]+)["']?\s*\)/) || [])[1];
	return id ? el.ownerDocument.getElementById(id) : null;
};

/**
 * Every clip path that applies to `el` (its own and its ancestors' within the SVG), each
 * as path data plus the matrix from its space to slide px. `[]` when nothing clips it,
 * `false` when a clip is something this writer cannot reproduce (then the photo keeps it).
 */
/** The viewport of every <svg> from `el` up to `svg` that clips its overflow, as rectangles. */
function svgViewportClips(el, svg, ox, oy) {
	const out = [];
	for (let e = el.parentElement; e && e !== svg.parentElement; e = e.parentElement) {
		if (e.tagName.toLowerCase() !== 'svg') continue;
		const cs = gcs(e);
		if (cs.overflow === 'visible' || cs.overflow === 'auto') continue;
		const outer = !(e.parentElement instanceof e.ownerDocument.defaultView.SVGElement);
		if (outer) {
			// The outermost <svg> is a CSS box: its viewport is the CONTENT box.
			const r = e.getBoundingClientRect();
			const [t, rt, b, l] = ['Top', 'Right', 'Bottom', 'Left'].map((k) => px(cs[`border${k}Width`]) + px(cs[`padding${k}`]));
			out.push([{ d: `M${r.left + l - ox} ${r.top + t - oy}H${r.right - rt - ox}V${r.bottom - b - oy}H${r.left + l - ox}Z`, mat: [1, 0, 0, 1, 0, 0] }]);
		} else {
			// A nested <svg> clips to its x/y/width/height in its PARENT's user space; its
			// bounding box is the content's extent, not the viewport.
			const M = e.parentElement.getScreenCTM?.();
			if (!M) continue;
			const v = (a) => e[a]?.baseVal?.value || 0;
			const w = e.width?.baseVal?.value, h = e.height?.baseVal?.value;
			if (!w || !h) continue;
			out.push([{ d: `M${v('x')} ${v('y')}h${w}v${h}h${-w}Z`, mat: [M.a, M.b, M.c, M.d, M.e - ox, M.f - oy] }]);
		}
	}
	return out;
}

function readClips(el, svg, ox, oy) {
	const out = [];
	for (let e = el; e && e !== svg.parentElement; e = e.parentElement) {
		const v = gcs(e).clipPath;
		if (!v || v === 'none') continue;
		const cp = refTarget(e, v);
		if (!cp || cp.tagName.toLowerCase() !== 'clippath') return false; // basic shapes, geometry boxes
		const M = e.getScreenCTM();
		if (!M) return false;
		let base = mul([M.a, M.b, M.c, M.d, M.e - ox, M.f - oy], localTransform(cp));
		if (cp.clipPathUnits?.baseVal === 2) { // objectBoundingBox
			const b = e.getBBox();
			base = mul(base, [b.width, 0, 0, b.height, b.x, b.y]);
		}
		const parts = [];
		for (const c of cp.children) {
			const tag = c.tagName.toLowerCase();
			if (tag === 'use' || tag === 'text' || gcs(c).clipPath !== 'none') return false;
			const d = shapePath(c);
			if (d) parts.push({ d, mat: mul(base, localTransform(c)) });
		}
		if (!parts.length) return false;
		// One clipping path is one matrix: a union whose parts sit in different spaces would
		// need its points transformed here, and nothing in the engine emits one.
		if (parts.some((q) => q.mat.some((v, i) => Math.abs(v - parts[0].mat[i]) > 1e-6))) return false;
		out.push(parts); // the union of `parts`, intersected with every other entry
	}
	return out;
}

const lengthIn = (len, bbox) => {
	const v = len.baseVal;
	if (v.unitType === 2 /* PERCENTAGE */) return v.valueInSpecifiedUnits / 100;
	return bbox ? v.valueInSpecifiedUnits : v.value;
};

/**
 * An SVG paint (`fill` / `stroke` computed value): `{ solid }`, `{ grad }`, `null` for
 * none, or `{ refuse }` for a paint the writer cannot draw exactly (patterns, stops whose
 * alpha varies, `spreadMethod` other than pad).
 */
function readPaint(el, v, color) {
	if (!v || v === 'none') return null;
	if (!v.startsWith('url(')) { const c = color(v); return c ? { solid: c } : null; }
	const g = refTarget(el, v);
	if (!g) { const fb = v.replace(/^url\([^)]*\)\s*/, ''); const c = fb && color(fb); return c ? { solid: c } : null; }
	const kind = g.tagName.toLowerCase();
	if (kind !== 'lineargradient' && kind !== 'radialgradient') return { refuse: 'pattern' };
	// Stops may come from an `href`-ed gradient.
	let stopsFrom = g;
	for (let i = 0; i < 8 && !stopsFrom.querySelector('stop'); i++) {
		const href = stopsFrom.href?.baseVal;
		const next = href && el.ownerDocument.getElementById(href.replace(/^#/, ''));
		if (!next) break;
		stopsFrom = next;
	}
	const stops = [...stopsFrom.querySelectorAll('stop')].map((st) => {
		const cs = gcs(st);
		const c = color(cs.stopColor) || [0, 0, 0, 0];
		return { o: Math.min(1, Math.max(0, st.offset.baseVal)), c: [c[0], c[1], c[2]], a: c[3] * Number(cs.stopOpacity) };
	});
	if (!stops.length) return null;
	for (let i = 1; i < stops.length; i++) stops[i].o = Math.max(stops[i].o, stops[i - 1].o);
	if (stops.some((s) => Math.abs(s.a - stops[0].a) > 0.004)) return { refuse: 'gradient-alpha' };
	if (g.spreadMethod && g.spreadMethod.baseVal > 1) return { refuse: 'gradient-spread' };
	const bboxUnits = g.gradientUnits.baseVal === 2;
	let space = localTransform(g); // gradientTransform
	if (bboxUnits) { const b = el.getBBox(); space = mul([b.width, 0, 0, b.height, b.x, b.y], space); }
	const L = (name) => lengthIn(g[name], bboxUnits);
	const coords = kind === 'lineargradient'
		? [L('x1'), L('y1'), L('x2'), L('y2')]
		// An absent fx/fy means "at the centre"; the DOM reports its 50% default instead.
		: [g.hasAttribute('fx') ? L('fx') : L('cx'), g.hasAttribute('fy') ? L('fy') : L('cy'), 0, L('cx'), L('cy'), L('r')];
	return { grad: { type: kind === 'lineargradient' ? 'linear' : 'radial', coords, space, stops, alpha: stops[0].a } };
}

/** Why a raster placement stays in the photo — a reason, or '' when the writer draws it. */
function placementRefusal(el, cs, isImg, section) {
	if (!ancestry(el, section).plain) return 'transform';
	if (cs.filter !== 'none') return 'filter';
	if (cs.mixBlendMode !== 'normal') return 'blend-mode';
	if (cs.maskImage && cs.maskImage !== 'none') return 'mask';
	if (cs.webkitMaskImage && cs.webkitMaskImage !== 'none') return 'mask';
	if (cs.clipPath !== 'none') return 'clip-path';
	if (isImg) return el.complete && el.naturalWidth ? '' : 'not-loaded';
	// One url() layer, not repeated: a gradient layer or a tile is the photo's job.
	if (/,/.test(cs.backgroundImage.replace(/url\("[^"]*"\)/g, 'U'))) return 'bg-layers';
	// A repeat never shows under `cover` (the one tile already covers the area).
	if (!/^no-repeat/.test(cs.backgroundRepeat) && cs.backgroundSize.trim() !== 'cover') return 'bg-repeat';
	if (cs.backgroundAttachment === 'fixed') return 'bg-fixed';
	return '';
}

/** Why an element's border cannot be drawn exactly as vectors ('' when it can). */
function borderRefusal(el, cs, sides, section) {
	if (!ancestry(el, section).plain) return 'transform';
	if (cs.filter !== 'none' || cs.backdropFilter !== 'none') return 'filter';
	if (cs.mixBlendMode !== 'normal') return 'blend-mode';
	if ((cs.maskImage && cs.maskImage !== 'none') || (cs.webkitMaskImage && cs.webkitMaskImage !== 'none')) return 'mask';
	if (cs.clipPath !== 'none') return 'clip-path';
	if (cs.borderImageSource && cs.borderImageSource !== 'none') return 'image';
	// A ::before/::after with a border may inherit this element's border color, and a pseudo-
	// element cannot be given an inline style to keep it when the border goes transparent.
	for (const pseudo of ['::before', '::after']) {
		const ps = gcs(el, pseudo);
		if (ps.content && ps.content !== 'none' && ps.content !== 'normal' && ['Top', 'Right', 'Bottom', 'Left'].some((k) => parseFloat(ps[`border${k}Width`]) > 0)) return 'pseudo';
	}
	// An outline paints over the border band (a negative offset, or a wide one) and is not drawn.
	if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) return 'outline';
	// Collapsed table borders are shared between cells: each cell's box reaches only the middle
	// of the line, so drawing each cell's width inward doubles every inner edge.
	const table = el.closest('table');
	if (table && gcs(table).borderCollapse === 'collapse') return 'collapsed-table';
	const on = sides.filter((s) => s.on);
	if (on.some((s) => s.style !== 'solid')) return 'style'; // dashed, dotted, double, groove…: the photo's job
	// One color: where two colors meet CSS mitres the corner diagonally.
	if (on.some((s) => s.c.join() !== on[0].c.join())) return 'mixed-color';
	const radius = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((k) => cs[`border${k}Radius`]);
	if (radius.some((v) => v.includes('%') || /\s/.test(v.trim()))) return 'radius'; // elliptical or relative
	if (radius.some((v) => parseFloat(v) > 0) && (on.length !== 4 || on.some((s) => s.w !== on[0].w))) return 'radius';
	return '';
}

/**
 * Does anything paint over this element's border? Sampled at three points down the middle
 * of each drawn side: an image, a box, a pseudo-element or undrawn text there would be buried
 * under a vector border drawn over the photo.
 */
function borderCovered(el, r, sides, scale, doc) {
	for (const pseudo of ['::before', '::after']) {
		const ps = gcs(el, pseudo);
		if (ps.content && ps.content !== 'none' && ps.content !== 'normal' && ps.position !== 'static' && paintsBox(ps)) return true;
	}
	for (let a = el.parentElement; a && a !== doc.body; a = a.parentElement) {
		for (const pseudo of ['::after', '::before']) {
			const ps = gcs(a, pseudo);
			if (!ps.content || ps.content === 'none' || ps.content === 'normal') continue;
			if (pseudo === '::before' && ps.position === 'static') continue;
			if (paintsBox(ps)) return true;
		}
		if (a.matches('section[data-lattice-slide]')) break;
	}
	const pts = [];
	const [t, rt, b, l] = sides.map((s) => (s.on ? s.w * scale : 0));
	for (const f of [0.25, 0.5, 0.75]) {
		if (t) pts.push([r.left + f * r.width, r.top + t / 2]);
		if (b) pts.push([r.left + f * r.width, r.bottom - b / 2]);
		if (l) pts.push([r.left + l / 2, r.top + f * r.height]);
		if (rt) pts.push([r.right - rt / 2, r.top + f * r.height]);
	}
	for (const [x, y] of pts) {
		for (const hit of doc.elementsFromPoint(x, y)) {
			if (hit === el) break; // everything after this is beneath the border
			if (paints(hit)) return true;
			if ([...hit.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return true; // text over the line
		}
	}
	return false;
}

/**
 * What paints OVER things on this slide, for the SVG and text checks:
 * - `covers(rect, svg)`: does anything outside `svg` paint over `rect`? A 4x4 hit-test grid,
 *   PLUS the centre of every overlap with a positioned box that paints (a badge smaller than a
 *   grid cell slipped between the samples), PLUS any ancestor pseudo-element overlay.
 * - `pseudoOver(el, rect)`: does an ancestor's absolutely positioned ::after (or ::before)
 *   that paints overlap `rect`? A hit test returns the pseudo-element's HOST, which is an
 *   ancestor, so neither check ever saw a scrim or redaction bar drawn this way.
 *   A pseudo that is provably stacked BELOW the text is not over it: the host is its own
 *   stacking context, and the child on the text's path takes a `z-index` (it is positioned, or
 *   a flex or grid item) above the pseudo's. A split panel's clear layer is drawn that way —
 *   band 0 under the panel's text at band 1 — and was refused as a cover, which took every word
 *   on the panel out of the vector text layer and into the photo. Anything short of that proof
 *   keeps the conservative answer.
 */
function makeOverlayModel(section, doc) {
	const inter = (a, b) => ({ left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) });
	const hits = (a, b) => { const i = inter(a, b); return i.right > i.left && i.bottom > i.top; };
	let positioned = null;
	const boxes = () => positioned || (positioned = [...section.querySelectorAll('*')].filter((e) => {
		if (e.closest('svg')) return false;
		const cs = gcs(e);
		return cs.position !== 'static' && cs.display !== 'none' && (paints(e) || [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()));
	}).map((e) => ({ e, r: e.getBoundingClientRect() })));
	const pseudoCache = new Map();
	const pseudoRects = (a) => {
		if (pseudoCache.has(a)) return pseudoCache.get(a);
		const out = [];
		for (const pseudo of ['::before', '::after']) {
			const ps = gcs(a, pseudo);
			if (!ps.content || ps.content === 'none' || ps.content === 'normal') continue;
			if (ps.position !== 'absolute' && ps.position !== 'fixed') continue; // in flow: beside, not over
			// It must paint a FILL. A frame drawn only as a border or inset shadow (state-chart's
			// node ring, inset 2.7px over the whole card) paints its edges, not the text inside.
			if (!paintsFill(ps)) continue;
			out.push({ r: pseudoRect(a, ps), z: ps.zIndex });
		}
		pseudoCache.set(a, out);
		return out;
	};
	// Is the host's pseudo (at `pz`) stacked below `child`, the host's child on the text's path?
	const stackedBelow = (host, pz, child) => {
		if (pz === 'auto' || child === host) return false;
		const hs = gcs(host);
		if (hs.isolation !== 'isolate' && hs.zIndex === 'auto') return false; // not its own stacking context
		const cs = gcs(child);
		// A `display: contents` child makes no box, so its z-index does nothing and its own
		// children paint at `auto`, under the pseudo (found by the #2457 checker).
		if (cs.display === 'contents' || cs.display === 'none') return false;
		const takesZ = cs.position !== 'static' || /^(inline-)?(flex|grid)$/.test(hs.display);
		return takesZ && cs.zIndex !== 'auto' && Number(cs.zIndex) > Number(pz);
	};
	const pseudoOver = (el, rect) => {
		for (let c = el, a = el.parentElement; a && a !== section; c = a, a = a.parentElement) {
			if (pseudoRects(a).some((q) => hits(q.r, rect) && !stackedBelow(a, q.z, c))) return true;
		}
		return false;
	};
	const sample = (x, y, svg) => {
		for (const hit of doc.elementsFromPoint(x, y)) {
			if (hit === svg || svg.contains(hit) || hit.contains(svg)) return false;
			if (paints(hit) || [...hit.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return true;
		}
		return false;
	};
	const covers = (r, svg) => {
		if (!r.width && !r.height) return false;
		if (pseudoOver(svg, r)) return true;
		for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (sample(r.left + ((i + 0.5) / 4) * r.width, r.top + ((j + 0.5) / 4) * r.height, svg)) return true;
		for (const { e, r: b } of boxes()) {
			if (e.contains(svg) || svg.contains(e) || !hits(b, r)) continue;
			const i = inter(b, r);
			if (sample((i.left + i.right) / 2, (i.top + i.bottom) / 2, svg)) return true;
		}
		return false;
	};
	return { covers, pseudoOver };
}

/**
 * The middle half of a word's line box: where its glyphs are. A line box reaches past its
 * ink (leading), and a connector hung just below a card overlapped the label's box without
 * touching a glyph (authority-chain: six labels wrongly left in the photo). A bar that hides
 * text covers its middle.
 */
const inkBand = (x, y, w, h) => ({ left: x, right: x + w, top: y + h * 0.25, bottom: y + h * 0.75 });

/** The screen rect of an absolutely positioned pseudo-element of `host`. */
function pseudoRect(host, ps) {
	// Its containing block: the nearest positioned (or transformed) box, from the host up.
	let cb = host;
	while (cb.parentElement && gcs(cb).position === 'static' && !establishesFixedCb(gcs(cb))) cb = cb.parentElement;
	const cs = gcs(cb), r = cb.getBoundingClientRect();
	const pb = { left: r.left + px(cs.borderLeftWidth), top: r.top + px(cs.borderTopWidth), right: r.right - px(cs.borderRightWidth), bottom: r.bottom - px(cs.borderBottomWidth) };
	const num = (v) => (v === 'auto' || v === '' ? null : parseFloat(v));
	const [L, R, T, B, W, H] = [ps.left, ps.right, ps.top, ps.bottom, ps.width, ps.height].map(num);
	// Unknown geometry: assume it spans its containing block (refusing is the safe side).
	const x0 = L != null ? pb.left + L : R != null && W != null ? pb.right - R - W : pb.left;
	const x1 = W != null ? x0 + W : R != null ? pb.right - R : pb.right;
	const y0 = T != null ? pb.top + T : B != null && H != null ? pb.bottom - B - H : pb.top;
	const y1 = H != null ? y0 + H : B != null ? pb.bottom - B : pb.bottom;
	return { left: x0, top: y0, right: x1, bottom: y1 };
}

/** Does any element paint on top of this image? Sampled on a 5x5 grid of its visible box. */
function paintedAbove(el, isImg, place, doc) {
	const r = el.getBoundingClientRect();
	const x0 = Math.max(r.left, place.x), y0 = Math.max(r.top, place.y);
	const x1 = Math.min(r.right, place.x + place.w), y1 = Math.min(r.bottom, place.y + place.h);
	if (x1 <= x0 || y1 <= y0) return false;
	// An ancestor's ::after (and a positioned ::before) paints over its descendants — a
	// scrim over a hero image is exactly that — and no hit test returns a pseudo-element.
	for (let a = el.parentElement; a && a !== doc.body; a = a.parentElement) {
		for (const pseudo of ['::after', '::before']) {
			const ps = gcs(a, pseudo);
			if (!ps.content || ps.content === 'none' || ps.content === 'normal') continue;
			if (pseudo === '::before' && ps.position === 'static') continue;
			if (paintsBox(ps)) return true;
		}
		if (a.matches('section[data-lattice-slide]')) break;
	}
	const seen = new Set();
	for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
		const px0 = x0 + ((i + 0.5) / 5) * (x1 - x0), py0 = y0 + ((j + 0.5) / 5) * (y1 - y0);
		for (const hit of doc.elementsFromPoint(px0, py0)) {
			if (hit === el) break; // everything after this is beneath it
			if (seen.has(hit)) continue;
			seen.add(hit);
			if (!isImg && el.contains(hit) && !paints(hit)) continue;
			if (paints(hit)) return true;
		}
	}
	return false;
}

/** Does anything that paints sit above `el`'s text at (x, y)? */
function textCovered(el, x, y, doc) {
	for (const hit of doc.elementsFromPoint(x, y)) {
		if (hit === el || hit.contains(el)) return false; // reached the text's own box: nothing above
		if (el.contains(hit)) continue; // an inline child of the text's own element
		// An <svg>'s box is not its ink, and its shapes are drawn as vectors: KaTeX's root sign
		// is an SVG whose box spans the formula under it, which it does not cover.
		if (hit.tagName.toLowerCase() === 'svg') continue;
		if (paints(hit)) return true;
	}
	return false;
}

/** Whether a computed style paints across its box (not only at its edges): a fill or an image. */
function paintsFill(cs) {
	if (cs.visibility !== 'visible' || Number(cs.opacity) === 0) return false;
	const bg = cs.backgroundColor;
	return (bg && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/.test(bg)) || cs.backgroundImage !== 'none' || (cs.backdropFilter && cs.backdropFilter !== 'none');
}

/** Whether a computed style paints a box of its own: a fill, an image, a border, a shadow. */
function paintsBox(cs) {
	if (cs.visibility !== 'visible' || Number(cs.opacity) === 0) return false;
	const bg = cs.backgroundColor;
	if (bg && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)|transparent/.test(bg)) return true;
	if (cs.backgroundImage !== 'none') return true;
	if (cs.boxShadow !== 'none' || cs.backdropFilter !== 'none') return true;
	for (const side of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(cs[`border${side}Width`]) > 0 && cs[`border${side}Style`] !== 'none') return true;
	return parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none';
}

/**
 * Whether an element puts anything into the PHOTO above an image: its own box, a pseudo-
 * element, or text the writer will not draw (a text shadow, a transform) — which stays in
 * the photo, and a native image drawn over the photo would bury it.
 */
function paints(el) {
	if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return false; // SVG geometry is drawn as vectors
	const cs = gcs(el);
	if (paintsBox(cs)) return true;
	for (const pseudo of ['::before', '::after']) {
		const ps = gcs(el, pseudo);
		if (ps.content && ps.content !== 'none' && ps.content !== 'normal' && (paintsBox(ps) || !/^["']{2}$/.test(ps.content))) return true;
	}
	const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
	if (ownText && (textRefusal(cs, el) || !ancestry(el, el.closest('section') || el.ownerDocument.body).plain)) return true;
	return el.tagName === 'IMG' || el.tagName === 'VIDEO' || el.tagName === 'CANVAS' || el.tagName.toLowerCase() === 'svg';
}

const urlOf = (v) => (v.match(/url\(\s*"([^"]*)"\s*\)/) || v.match(/url\(\s*'?([^')]*)'?\s*\)/) || [])[1] || '';
const px = (v) => parseFloat(v) || 0;

/** Where an <img> draws: its content box, then object-fit / object-position. */
function imgPlacement(el, cs) {
	const r = el.getBoundingClientRect();
	const bx = r.left + px(cs.borderLeftWidth) + px(cs.paddingLeft), by = r.top + px(cs.borderTopWidth) + px(cs.paddingTop);
	const bw = r.width - px(cs.borderLeftWidth) - px(cs.borderRightWidth) - px(cs.paddingLeft) - px(cs.paddingRight);
	const bh = r.height - px(cs.borderTopWidth) - px(cs.borderBottomWidth) - px(cs.paddingTop) - px(cs.paddingBottom);
	const nw = el.naturalWidth, nh = el.naturalHeight;
	if (!(bw > 0 && bh > 0 && nw && nh)) return null;
	let w = bw, h = bh;
	const fit = cs.objectFit;
	if (fit === 'contain' || fit === 'cover' || fit === 'scale-down' || fit === 'none') {
		const k = fit === 'none' ? 1 : fit === 'cover' ? Math.max(bw / nw, bh / nh) : Math.min(bw / nw, bh / nh);
		const kk = fit === 'scale-down' ? Math.min(1, k) : k;
		w = nw * kk; h = nh * kk;
	}
	const [px0, py0] = positionIn(cs.objectPosition, bw - w, bh - h);
	return { url: el.currentSrc || el.src, x: bx + px0, y: by + py0, w, h };
}

/** Where a single-layer, non-repeating CSS background image draws (origin: padding box). */
function bgPlacement(el, cs) {
	const url = urlOf(cs.backgroundImage);
	if (!url) return null;
	const r = el.getBoundingClientRect();
	const origin = cs.backgroundOrigin;
	const inset = (side) => (origin === 'border-box' ? 0 : px(cs[`border${side}Width`]) + (origin === 'content-box' ? px(cs[`padding${side}`]) : 0));
	const ax = r.left + inset('Left'), ay = r.top + inset('Top');
	const aw = r.width - inset('Left') - inset('Right'), ah = r.height - inset('Top') - inset('Bottom');
	const nat = naturalSizeOf(url, el.ownerDocument);
	if (!nat || !(aw > 0 && ah > 0)) return null;
	let w, h;
	const size = cs.backgroundSize.trim();
	if (size === 'cover' || size === 'contain') {
		const k = size === 'cover' ? Math.max(aw / nat.w, ah / nat.h) : Math.min(aw / nat.w, ah / nat.h);
		w = nat.w * k; h = nat.h * k;
	} else {
		const [sw, sh = 'auto'] = size.split(/\s+/);
		const len = (v, of) => (v.endsWith('%') ? (parseFloat(v) / 100) * of : parseFloat(v));
		w = sw === 'auto' ? null : len(sw, aw);
		h = sh === 'auto' ? null : len(sh, ah);
		if (w == null && h == null) { w = nat.w; h = nat.h; } else if (w == null) w = (h * nat.w) / nat.h; else if (h == null) h = (w * nat.h) / nat.w;
	}
	const [px0, py0] = positionIn(`${cs.backgroundPositionX} ${cs.backgroundPositionY}`, aw - w, ah - h);
	return { url, x: ax + px0, y: ay + py0, w, h };
}

/** A computed position pair ("50% 0px", "right 10px bottom 0") inside `free` px of slack. */
function positionIn(v, freeX, freeY) {
	const parts = v.trim().split(/\s+/);
	const one = (tok, free) => {
		if (!tok) return free / 2;
		if (tok.endsWith('%')) return (parseFloat(tok) / 100) * free;
		if (tok.includes('calc')) return free / 2;
		return parseFloat(tok) || 0;
	};
	if (parts.length === 2) return [one(parts[0], freeX), one(parts[1], freeY)];
	return [one(parts[0], freeX), one(parts[1] || '50%', freeY)];
}

const naturalCache = new Map();
/** A background image's natural size, from the browser's own decoded copy. */
function naturalSizeOf(url, doc) {
	if (naturalCache.has(url)) return naturalCache.get(url);
	const im = new doc.defaultView.Image();
	im.src = url;
	const out = im.complete && im.naturalWidth ? { w: im.naturalWidth, h: im.naturalHeight } : null;
	if (out) naturalCache.set(url, out); // a miss is not cached: the image may still be loading
	return out;
}

/** The element's own rounded border-box as a clip, when it is rounded. */
function roundedClip(el, cs, ox, oy) {
	const radii = ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((k) => px(cs[`border${k}Radius`]));
	if (!radii.some(Boolean)) return null;
	const r = el.getBoundingClientRect();
	return [{ d: roundedRectPath(r.left - ox, r.top - oy, r.width, r.height, radii), mat: [1, 0, 0, 1, 0, 0] }];
}

/** Every overflow-clipping ancestor between `el` and the slide, as rectangle clips. */
function htmlClips(el, section, ox, oy) {
	const out = [];
	// Follow the CONTAINING-BLOCK chain, not the DOM chain: an absolutely positioned box
	// escapes every overflow clip between it and its positioned ancestor (and a fixed one,
	// every clip below a transformed ancestor). Clipping it to those drew it away entirely.
	const escapes = (pos, cs) => (pos === 'absolute' ? cs.position === 'static' && !establishesFixedCb(cs)
		: pos === 'fixed' ? !establishesFixedCb(cs) : false);
	let pos = gcs(el).position;
	for (let e = el.parentElement; e && e !== section; e = e.parentElement) {
		const cs = gcs(e);
		if (escapes(pos, cs)) continue;
		pos = cs.position;
		// Each axis clips on its own (`overflow-x: clip` leaves y alone); `contain: paint` and
		// `clip` clip both.
		const all = cs.clip !== 'auto' || /paint|strict|content/.test(cs.contain || '');
		const cx = all || cs.overflowX !== 'visible', cy = all || cs.overflowY !== 'visible';
		if (!cx && !cy) continue;
		// Overflow clips at the PADDING box: inside the border, with the radii shrunk to match.
		const r = e.getBoundingClientRect();
		const [bt, br, bb, bl] = ['Top', 'Right', 'Bottom', 'Left'].map((k) => px(cs[`border${k}Width`]));
		const BIG = 1e5;
		const x = cx ? r.left + bl - ox : -BIG, w = cx ? r.width - bl - br : 2 * BIG;
		const y = cy ? r.top + bt - oy : -BIG, h = cy ? r.height - bt - bb : 2 * BIG;
		const radii = cx && cy ? ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft'].map((k, i) => Math.max(0, px(cs[`border${k}Radius`]) - [Math.max(bt, bl), Math.max(bt, br), Math.max(bb, br), Math.max(bb, bl)][i])) : [0, 0, 0, 0];
		out.push([{ d: roundedRectPath(x, y, w, h, radii), mat: [1, 0, 0, 1, 0, 0] }]);
	}
	return out;
}

/** Whether a box is the containing block for fixed (and absolute) descendants besides position. */
const establishesFixedCb = (cs) => cs.transform !== 'none' || cs.filter !== 'none' || cs.perspective !== 'none'
	|| /paint|layout|strict|content/.test(cs.contain || '') || /transform|filter|perspective/.test(cs.willChange || '');

function roundedRectPath(x, y, w, h, [tl, tr, br, bl]) {
	const k = Math.min(1, w / Math.max(1e-6, tl + tr), w / Math.max(1e-6, bl + br), h / Math.max(1e-6, tl + bl), h / Math.max(1e-6, tr + br));
	[tl, tr, br, bl] = [tl * k, tr * k, br * k, bl * k];
	return `M${x + tl} ${y}H${x + w - tr}${tr ? `A${tr} ${tr} 0 0 1 ${x + w} ${y + tr}` : ''}V${y + h - br}${br ? `A${br} ${br} 0 0 1 ${x + w - br} ${y + h}` : ''}H${x + bl}${bl ? `A${bl} ${bl} 0 0 1 ${x} ${y + h - bl}` : ''}V${y + tl}${tl ? `A${tl} ${tl} 0 0 1 ${x + tl} ${y}` : ''}Z`;
}

/** An SVG geometry element as path data in its own user space. */
function shapePath(el) {
	const tag = el.tagName.toLowerCase();
	const g = (a) => (el[a]?.baseVal && 'value' in el[a].baseVal ? el[a].baseVal.value : Number(el.getAttribute(a) || 0));
	if (tag === 'path') return el.getAttribute('d') || '';
	if (tag === 'line') return `M${g('x1')} ${g('y1')}L${g('x2')} ${g('y2')}`;
	if (tag === 'rect') {
		const x = g('x'), y = g('y'), w = g('width'), h = g('height');
		if (!w || !h) return '';
		let rx = g('rx'), ry = g('ry');
		if (!el.hasAttribute('rx') && el.hasAttribute('ry')) rx = ry;
		if (!el.hasAttribute('ry') && el.hasAttribute('rx')) ry = rx;
		const cs = gcs(el);
		if (!rx && cs.rx !== 'auto') rx = parseFloat(cs.rx) || 0;
		if (!ry && cs.ry !== 'auto') ry = parseFloat(cs.ry) || rx;
		rx = Math.min(rx, w / 2); ry = Math.min(ry || rx, h / 2);
		if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
		return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
	}
	if (tag === 'circle' || tag === 'ellipse') {
		const cx = g('cx'), cy = g('cy');
		const rx = tag === 'circle' ? g('r') : g('rx'), ry = tag === 'circle' ? g('r') : g('ry');
		if (!rx || !ry) return '';
		return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
	}
	const pts = (el.getAttribute('points') || '').trim().split(/[\s,]+/).filter(Boolean).map(Number);
	let d = '';
	for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? 'L' : 'M'}${pts[i]} ${pts[i + 1]}`;
	return d && tag === 'polygon' ? `${d}Z` : d;
}

/** Stylesheets whose rules the page cannot read (cross-origin): the host may supply them. */
export function blockedSheetHrefs(doc) {
	const out = [];
	for (const sheet of doc.styleSheets) {
		try { void sheet.cssRules; } catch { if (sheet.href) out.push(sheet.href); }
	}
	return out;
}

/** The deck's @font-face rules: family, weight (or range), style, and source URL. */
export function readFontFaces(doc, blockedSheets = {}) {
	const out = [];
	for (const sheet of doc.styleSheets) {
		let rules;
		try {
			rules = sheet.cssRules;
		} catch {
			// A cross-origin sheet (a file:// stylesheet in the CLI's file:// page) hides its
			// rules; the host may hand over its @font-face rules as text.
			const text = blockedSheets[sheet.href];
			if (!text) continue;
			const parsed = new doc.defaultView.CSSStyleSheet();
			try { parsed.replaceSync(text); } catch { continue; }
			rules = parsed.cssRules;
		}
		const base = sheet.href;
		for (const r of rules) {
			if (r.type !== 5) continue; // CSSRule.FONT_FACE_RULE
			const src = r.style.getPropertyValue('src');
			const raw = (src.match(/url\(\s*"?([^")]+)"?\s*\)/) || [])[1];
			if (!raw) continue;
			// Relative to the STYLESHEET that declares it (KaTeX's fonts sit beside katex.css).
			let url = raw;
			try { url = new URL(raw, base || doc.baseURI).href; } catch {}
			out.push({
				fam: r.style.getPropertyValue('font-family').replace(/["']/g, '').trim(),
				wt: (r.style.getPropertyValue('font-weight') || '400').replace('normal', '400').replace('bold', '700'),
				st: r.style.getPropertyValue('font-style') || 'normal',
				url,
			});
		}
	}
	return out;
}

/**
 * Hide what the PDF will draw, so the photo carries only the rest; returns `restore`.
 * Text is hidden by fill color (layout never moves); SVG shapes are removed from
 * rendering, because not every camera honors `visibility` on a cloned SVG.
 * Pseudo-element text (page numbers, bullets) is never drawn yet, so it is kept visible.
 */
export function hideDrawn(doc, slides) {
	const undo = [];
	const set = (el, prop, val) => { undo.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]); el.style.setProperty(prop, val, 'important'); };
	const textEls = new Set(), shapeEls = new Set();
	for (const s of slides) {
		for (const w of s.words) if (!w.svg) textEls.add(w.el); else shapeEls.add(w.el);
		for (const sh of s.shapes) if (!sh.border) shapeEls.add(sh.el);
	}
	// A drawn border keeps its width (nothing moves) and goes transparent in the photo.
	// A child whose border color INHERITS (or is currentColor of an inherited color) would go
	// transparent with it, so every undrawn bordered descendant keeps the color it had.
	const borderEls = new Set(slides.flatMap((s) => s.shapes.filter((sh) => sh.border).map((sh) => sh.el)));
	const keep = [];
	for (const el of borderEls) for (const c of el.querySelectorAll('*')) {
		if (borderEls.has(c) || c.closest('svg')) continue;
		const cs = gcs(c);
		const sides = ['top', 'right', 'bottom', 'left'].filter((k) => parseFloat(cs.getPropertyValue(`border-${k}-width`)) > 0);
		for (const k of sides) keep.push([c, `border-${k}-color`, cs.getPropertyValue(`border-${k}-color`)]);
	}
	for (const el of borderEls) set(el, 'border-color', 'transparent');
	for (const [c, prop, v] of keep) set(c, prop, v);
	for (const el of textEls) { el.setAttribute(DRAWN_TEXT, ''); set(el, '-webkit-text-fill-color', 'transparent'); }
	for (const el of shapeEls) { el.setAttribute(DRAWN_SHAPE, ''); set(el, 'display', 'none'); }
	// Images: an <img> keeps its box (visibility), a background drops only its image layer.
	for (const s of slides) for (const im of s.images || []) set(im.el, im.kind === 'img' ? 'visibility' : 'background-image', im.kind === 'img' ? 'hidden' : 'none');
	// Children that are NOT drawn must keep their own color: re-assert it where inheritance
	// from a hidden parent would otherwise blank them.
	for (const el of textEls) for (const c of el.querySelectorAll('*')) if (!c.hasAttribute(DRAWN_TEXT) && !c.closest('svg')) set(c, '-webkit-text-fill-color', 'currentcolor');
	const style = doc.createElement('style');
	style.textContent = `[${DRAWN_TEXT}]::before,[${DRAWN_TEXT}]::after,[${DRAWN_TEXT}]::marker{-webkit-text-fill-color:currentcolor!important}`;
	doc.head.appendChild(style);
	return () => {
		style.remove();
		for (const [el, prop, v, pr] of undo.reverse()) { if (v) el.style.setProperty(prop, v, pr); else el.style.removeProperty(prop); }
		for (const el of textEls) el.removeAttribute(DRAWN_TEXT);
		for (const el of shapeEls) el.removeAttribute(DRAWN_SHAPE);
	};
}
