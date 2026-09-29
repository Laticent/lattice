/**
 * lib/core/pdf-compose/compose.mjs — the ONE export spine for "option 1" PDFs.
 *
 * Both hosts call `composeDeckPdf` inside a page that holds the laid-out deck: the CLI
 * injects it into its Chrome (dist/lattice-pdf-compose.min.js), and the Studio imports
 * it. The host supplies only what differs by environment — the camera, and how to get
 * the HarfBuzz WebAssembly and font bytes. Everything that decides what the PDF looks
 * like lives here, once.
 *
 *   read (words, shapes, links)  ->  fonts (subset + pin weight; refuse what a font cannot draw)
 *   ->  hide what will be drawn  ->  photograph each slide  ->  restore  ->  write
 *
 * See engineering/decisions/2026-09-27-studio-export-one-engine.md.
 */
import fontkit from '@pdf-lib/fontkit';
import { createFontSubsetter } from './font-subset.mjs';
import { blockedSheetHrefs, hideDrawn, readFontFaces, readSlide } from './read-slide.mjs';
import { matrixIsDrawable, pathIsDrawable, writeDeckPdf } from './write-pdf.mjs';

export { PT_PER_PX } from './write-pdf.mjs';

const weightRange = (f) => {
	const [a, b] = String(f.wt).trim().split(/\s+/).map(Number);
	return [a, Number.isFinite(b) ? b : a];
};

/** The @font-face the browser would use for (family, weight, italic) — or null. */
export function pickFace(faces, fam, wt, it) {
	const same = faces.filter((f) => f.fam.toLowerCase() === fam.toLowerCase());
	if (!same.length) return null;
	const styled = same.filter((f) => (f.st !== 'normal') === it);
	const pool = styled.length ? styled : same;
	const inRange = pool.find((f) => { const [a, b] = weightRange(f); return wt >= a && wt <= b; });
	if (inRange) return inRange;
	// CSS font matching: nearest weight, ties toward the heavier face for weights > 500.
	return [...pool].sort((x, y) => {
		const dx = Math.abs(weightRange(x)[0] - wt), dy = Math.abs(weightRange(y)[0] - wt);
		return dx - dy || (wt > 500 ? weightRange(y)[0] - weightRange(x)[0] : weightRange(x)[0] - weightRange(y)[0]);
	})[0];
}

/**
 * @param {Element[]} sections the laid-out slides, in page order
 * @param {object} host
 * @param {(section: Element, opts: {scale: number, type: 'png'|'jpeg'}) => Promise<{bytes: Uint8Array, type: 'jpeg'|'png'}>} host.camera
 *   the photo in the encoding asked for: PNG first, and JPEG too when the PNG is not flat (`pngIsFlat`)
 *   `scale` is device pixels per CSS px: 1, or 2 on a slide whose photo keeps a raster image
 * @param {BufferSource} host.harfbuzzWasm harfbuzzjs `hb-subset.wasm`
 * @param {(url: string) => Promise<Uint8Array>} [host.fetchBytes] font bytes (data: URLs are decoded here)
 * @param {(url: string) => Promise<Uint8Array>} [host.fetchAsset] image bytes for a non-data URL (the CLI reads
 *   file:// from disk; default: fetch)
 * @param {(section: Element, fn: () => object) => object|Promise<object>} [host.withSlide] prepares a slide
 *   for measuring and restores it after
 * @param {(href: string) => Promise<string>} [host.readFontFaceRules] the @font-face rules of a stylesheet the
 *   page cannot read, as CSS text
 * @param {number} [host.photoScale] device px per CSS px for the background photo (default 1; a slide
 *   that keeps text or an image in its photo always gets at least 2)
 * @param {Date} [host.date] the file's creation/modification date (the CLI pins it for reproducibility)
 * @param {(done: number, total: number, phase: string) => void} [host.onProgress]
 * @returns {Promise<{ bytes: Uint8Array, report: object }>}
 */
export async function composeDeckPdf(sections, host) {
	const t0 = Date.now();
	const progress = host.onProgress || (() => {});
	const doc = sections[0].ownerDocument;
	// An ABORT handle in the page: a host that gives up (the CLI's watchdog) calls it before it
	// falls back, so the slides are restored — never printed with their text hidden — and the
	// compose still in flight stops at its next step.
	const win = doc.defaultView;
	let aborted = false, restore = null;
	win.__latticePdfAbort = () => { aborted = true; if (restore) { restore(); restore = null; } };
	const check = () => { if (aborted) throw new Error('PDF compose aborted'); };
	// Stylesheets the page cannot read (the CLI's file:// KaTeX sheet): the host may return
	// their @font-face rules as text.
	const blocked = {};
	if (host.readFontFaceRules) for (const href of blockedSheetHrefs(doc)) { try { blocked[href] = await host.readFontFaceRules(href); } catch {} }
	const faces = readFontFaces(doc, blocked);
	// `withSlide` lets a host prepare each slide for measuring (the Studio forces its lazy
	// slides visible and puts them on their export face); the CLI's slides need nothing.
	const withSlide = host.withSlide || ((_s, fn) => fn());
	const slides = [];
	for (const s of sections) slides.push(await withSlide(s, () => readSlide(s)));
	// A path the PDF writer cannot turn into finite numbers would break the page's content
	// stream, and a viewer then stops drawing the REST of the page (a KaTeX delimiter blanked a
	// whole slide). Such a shape, or one clipped by such a path, stays in the photo instead.
	for (const s of slides) {
		s.shapes = s.shapes.filter((sh) => {
			const ok = pathIsDrawable(sh.d) && matrixIsDrawable(sh.mat) && (sh.clips || []).every((c) => c.every((p) => pathIsDrawable(p.d) && matrixIsDrawable(p.mat)));
			if (!ok) s.stats.refusedShapes['bad-path'] = (s.stats.refusedShapes['bad-path'] || 0) + 1;
			return ok;
		});
		// The same for SVG text: its matrix (and every clip's) is inverted when it is drawn, and a
		// collapsed one (`scale(0)` above it) would write NaN just the same.
		s.words = s.words.filter((w) => {
			const ok = (!w.mat || matrixIsDrawable(w.mat)) && (w.clips || []).every((c) => c.every((p) => pathIsDrawable(p.d) && matrixIsDrawable(p.mat)));
			if (!ok) s.stats.refusedText['bad-matrix'] = (s.stats.refusedText['bad-matrix'] || 0) + 1;
			return ok;
		});
	}
	const report = { slides: slides.length, words: 0, shapes: 0, images: 0, links: 0, refusedText: {}, refusedShapes: {}, refusedImages: {}, clippedWords: 0, fonts: 0 };
	for (const s of slides) {
		report.clippedWords += s.stats.clippedWords;
		for (const bag of ['refusedText', 'refusedShapes', 'refusedImages']) for (const [k, v] of Object.entries(s.stats[bag])) report[bag][k] = (report[bag][k] || 0) + v;
	}
	progress(0, slides.length, 'fonts');

	// ── Fonts: one static subset per (face, weight, features) the words need ───────────
	const plan = new Map();
	const refuseEl = new Set();
	for (const s of slides) {
		for (const w of s.words) {
			const face = pickFace(faces, w.fam, w.wt, w.it);
			if (!face) { refuseEl.add(w.el); continue; }
			const feat = Object.keys(w.feat).length ? w.feat : undefined;
			w.fontKey = `${faces.indexOf(face)}|${w.wt}|${feat ? JSON.stringify(feat) : ''}`;
			// Italic text in a face with no italic cut gets Chrome's synthetic slant — decided
			// PER WORD: upright and italic words share this one font.
			w.synthItalic = w.it && face.st === 'normal';
			const p = plan.get(w.fontKey) || { face, wt: w.wt, feat, text: new Set(' ') };
			for (const ch of w.t) p.text.add(ch);
			plan.set(w.fontKey, p);
		}
	}
	const subset = await createFontSubsetter(host.harfbuzzWasm);
	const bytesOf = new Map();
	// data: URLs decode here; anything else goes to the host (the CLI reads file:// fonts from disk).
	const fetchBytes = (url) => (url.startsWith('data:') || !host.fetchBytes ? defaultFetchBytes(url) : host.fetchBytes(url));
	const fonts = new Map();
	const covers = new Map();
	for (const [key, p] of plan) {
		try {
			if (!bytesOf.has(p.face.url)) bytesOf.set(p.face.url, await fetchBytes(p.face.url));
			// Chrome clamps a requested weight to the face's declared range (JetBrains Mono 600
			// is declared 600 but its file runs 400-800): pin the weight Chrome actually drew.
			const [lo, hi] = weightRange(p.face);
			const wght = Math.min(hi, Math.max(lo, p.wt));
			const feats = Object.entries(p.feat || {}).filter(([, on]) => on).map(([k]) => k);
			const ttf = await subset(bytesOf.get(p.face.url), [...p.text].join(''), { wght }, feats);
			const fk = fontkit.create(ttf);
			covers.set(key, (ch) => /\s/.test(ch) || fk.hasGlyphForCodePoint(ch.codePointAt(0)));
			fonts.set(key, { ttf, feat: p.feat });
		} catch {
			covers.set(key, () => false); // unreadable font: its words stay in the photo
		}
	}
	// A word the font cannot draw (a glyph the browser took from a fallback font) sends
	// its whole element to the photo, so a line is never half text, half picture.
	for (const s of slides) for (const w of s.words) if (!w.fontKey || ![...w.t].every(covers.get(w.fontKey))) refuseEl.add(w.el);
	for (const s of slides) {
		const before = s.words.length;
		s.words = s.words.filter((w) => !refuseEl.has(w.el));
		const dropped = before - s.words.length;
		if (dropped) { report.refusedText.font = (report.refusedText.font || 0) + dropped; s.fontRefused = dropped; }
		// Text left in the photo (a system font, a text shadow …) is read at 2x, so it stays crisp.
		if (dropped || Object.keys(s.stats.refusedText).length) s.stats.needsSharpPhoto = true;
	}
	const usedKeys = new Set(slides.flatMap((s) => s.words.map((w) => w.fontKey)));
	for (const k of [...fonts.keys()]) if (!usedKeys.has(k)) fonts.delete(k);
	report.fonts = fonts.size;

	// ── Images: the original bytes when they are PNG or JPEG (the formats a PDF embeds
	// as they are); any other format stays in the photo ─────────────────────────────────
	const assets = new Map();
	const fetchAsset = host.fetchAsset || fetchBytes;
	for (const s of slides) {
		const keep = [];
		for (const im of s.images) {
			if (!assets.has(im.url)) {
				let got = null;
				try { const bytes = im.url.startsWith('data:') ? await defaultFetchBytes(im.url) : await fetchAsset(im.url); got = { bytes, type: sniffImage(bytes) }; } catch {}
				assets.set(im.url, got);
			}
			const a = assets.get(im.url);
			if (a?.type) keep.push(im);
			else {
				report.refusedImages[a ? 'format' : 'unreadable'] = (report.refusedImages[a ? 'format' : 'unreadable'] || 0) + 1;
				s.stats.needsSharpPhoto = true; // it stays in the photo, so the photo is taken sharper
			}
		}
		s.images = keep;
	}

	// ── Photos: everything the PDF does not draw ────────────────────────────────────────
	check();
	restore = hideDrawn(doc, slides);
	try {
		// Test hook: fail with the drawn content hidden, so a test can prove the host's fallback
		// restores the page (the checker's watchdog repro printed a blank deck).
		if (host.failAfterHide) throw new Error('test: failure after hideDrawn');
		for (let i = 0; i < sections.length; i++) {
			check();
			progress(i, slides.length, 'photo');
			// A slide that keeps text or a raster image in its photo gets a sharper photo. The
			// photo's long edge is capped at 2560 px: a 4K slide's background at 1x would be
			// 3840 px of mostly flat color, and at 2x 7680 (the checker measured a 116-slide 4K
			// gallery at 2.3x Chrome's size).
			//
			// The cap still downsamples a 4K slide, and that softens a 1 px rule on it (a dark
			// slide's top keyline reads rgb(128,69,82) as PNG against the screen's rgb(181,95,116)).
			// Photographing 4K at its own 3840 px fixed it but cost ~21 s on the 116-slide 4K
			// gallery, which CI renders many times; the owner chose the cap (2026-09-29). The
			// exact-4K fix is followups.d/2503-p3-pdf-photo-exact-4k.md.
			const base = host.photoScale || 1;
			const cap = 2560 / Math.max(slides[i].w, slides[i].h);
			const scale = Math.min(cap, slides[i].stats.needsSharpPhoto ? Math.max(2, base) : base);
			// PNG first. A flat slide (most of them) stops there: one screenshot, exact color. A busy
			// one (a photograph, a finish's grain) is also taken as JPEG, and the smaller is kept.
			// A DOWNSAMPLED photo (a 4K slide under the cap) is JPEG only: the downsample already
			// softens a 1 px rule (rgb(128,69,82) as PNG, rgb(110,79,84) as JPEG, the screen's
			// rgb(181,95,116)), and PNG there cost the 116-slide 4K gallery ~13 s a render, which
			// CI's invariant suites pay many times over.
			const first = await host.camera(sections[i], { scale, type: scale < 1 ? 'jpeg' : 'png' });
			const shot = first.type === 'png' && !pngIsFlat(first.bytes)
				? smallestPhoto([first, await host.camera(sections[i], { scale, type: 'jpeg' })])
				: smallestPhoto(first);
			slides[i].photo = shot.bytes;
			slides[i].photoType = shot.type;
		}
	} finally {
		// Restore here — except under the test hook, which leaves the slides hidden on purpose
		// so the host's abort path is what must restore them.
		if (restore && !host.failAfterHide) {
			restore();
			restore = null;
		}
	}
	check();
	const tRead = Date.now();
	// Which slides keep something in their photo, and why — so an author can find it.
	report.photoContent = slides.flatMap((sl, i) => {
		const why = {};
		for (const bag of ['refusedText', 'refusedShapes', 'refusedImages']) for (const [k, v] of Object.entries(sl.stats[bag])) why[k] = (why[k] || 0) + v;
		if (sl.fontRefused) why.font = (why.font || 0) + sl.fontRefused;
		return Object.keys(why).length ? [{ slide: i + 1, why }] : [];
	});

	// ── Write ───────────────────────────────────────────────────────────────────────────
	progress(slides.length, slides.length, 'write');
	for (const s of slides) {
		for (const w of s.words) delete w.el;
		for (const sh of s.shapes) delete sh.el;
		for (const im of s.images) delete im.el;
		report.words += s.words.length; report.shapes += s.shapes.length; report.images += s.images.length; report.links += s.links.length;
	}
	const meta = { title: doc.title || '', lang: doc.documentElement.getAttribute('lang') || '', date: host.date };
	const { bytes, drift } = await writeDeckPdf({ slides, fonts, meta, assets });
	delete win.__latticePdfAbort;
	drift.sort((a, b) => a - b);
	const q = (p) => (drift.length ? Math.round(drift[Math.min(drift.length - 1, Math.floor(drift.length * p))] * 100) / 100 : 0);
	Object.assign(report, { driftPx: { p50: q(0.5), p95: q(0.95), max: q(1) }, readPhotoMs: tRead - t0, writeMs: Date.now() - tRead });
	return { bytes, report };
}

/** 'png' | 'jpeg' by magic number, or '' — the two formats a PDF embeds without re-encoding. */
function sniffImage(b) {
	if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
	if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
	return '';
}

async function defaultFetchBytes(url) {
	if (url.startsWith('data:')) {
		const comma = url.indexOf(',');
		const meta = url.slice(5, comma);
		const body = url.slice(comma + 1);
		if (/;base64/i.test(meta)) {
			const bin = atob(body);
			const out = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
			return out;
		}
		return new TextEncoder().encode(decodeURIComponent(body));
	}
	const r = await fetch(url);
	if (!r.ok) throw new Error(`font fetch ${r.status}`);
	return new Uint8Array(await r.arrayBuffer());
}

/**
 * The photo a slide is written with: the smallest of the encodings taken.
 *
 * JPEG halves the color resolution (4:2:0) at every quality, so a
 * 1 px colored rule on a dark field lost its color and bled into the row under it (rgb(0,146,216)
 * written as rgb(42,132,176)). PNG keeps it exact, and on a flat slide background it is also the
 * smaller file; on a photograph it can be twice the size, and there JPEG stays. A single shot
 * (a plain `{ bytes, type }`) is taken as it is.
 * @param {{bytes: Uint8Array, type: 'jpeg'|'png'} | Array<{bytes: Uint8Array, type: 'jpeg'|'png'}>} shot
 * @returns {{bytes: Uint8Array, type: 'jpeg'|'png'}}
 */
/**
 * PNG bytes per pixel at or under which a slide photo counts as flat and is kept without taking
 * a JPEG too. Measured over 78 slides (flat, gradient, finish-grain, photograph; 1280 to 3840 px):
 * every slide where PNG was the smaller file sat at or under 0.041, and at 0.025 JPEG would have
 * been smaller on 1 of the 59 slides kept, a flat one. Above it the JPEG is taken and compared.
 */
export const FLAT_PNG_BYTES_PER_PX = 0.025;

/** Whether PNG bytes are a flat photo: small for their pixel count (width and height from IHDR). */
export function pngIsFlat(bytes) {
	if (bytes.length < 24) return false;
	const u32 = (o) => ((bytes[o] << 24) | (bytes[o + 1] << 16) | (bytes[o + 2] << 8) | bytes[o + 3]) >>> 0;
	return bytes.length <= u32(16) * u32(20) * FLAT_PNG_BYTES_PER_PX;
}

export function smallestPhoto(shot) {
	const all = Array.isArray(shot) ? shot : [shot];
	return all.reduce((a, b) => (b.bytes.length < a.bytes.length ? b : a));
}

/**
 * The default camera: html-to-image on the slide as it stands (the host puts the
 * slide in its EXPORT face first — `.lattice-exporting`). The host passes the library
 * in, so this module never bundles it for a page that already has it.
 */
export function makeHtmlToImageCamera({ toCanvas }, { quality = 0.92, fontEmbedCSS } = {}) {
	return canvasCamera((section, scale) => toCanvas(section, { pixelRatio: scale, fontEmbedCSS, cacheBust: false }), quality);
}

/**
 * A camera over a canvas capture, for a host whose raster is a canvas (html-to-image). The
 * writer asks for PNG and then, on a busy slide, JPEG of the SAME slide: the capture is kept for
 * that second ask, so a slide is captured once and only encoded twice.
 * @param {(section: Element, scale: number) => Promise<HTMLCanvasElement>} capture
 */
export function canvasCamera(capture, quality = 0.92) {
	let last = null;
	return async (section, { scale = 1, type = 'png' } = {}) => {
		const canvas = last && last.section === section && last.scale === scale ? last.canvas : await capture(section, scale);
		last = { section, scale, canvas };
		const url = type === 'jpeg' ? canvas.toDataURL('image/jpeg', quality) : canvas.toDataURL('image/png');
		const bin = atob(url.slice(url.indexOf(',') + 1));
		const bytes = new Uint8Array(bin.length);
		for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
		return { bytes, type: type === 'jpeg' ? 'jpeg' : 'png' };
	};
}
