// ── CAPTURE ONE RENDERED PREVIEW FRAME AS AN IMAGE ─────────────────────────────────
//
// The one browser mechanism that rasterizes arbitrary DOM: serialize the frame's document
// into an SVG `<foreignObject>`, draw that SVG to a canvas, encode WebP. Lazy-imported by the
// preview pool (it is never on a first paint). See poster-cache.ts for why posters exist.
//
// FOUR THINGS THAT MAKE IT FAITHFUL, each found by comparing captures against the live tile
// on Chromium and WebKit (.scratch harness; mean per-channel difference 2–9 of 255 after):
//
//  1. The CSS goes in a CDATA section. Inside a foreignObject the document is XHTML, and the
//     engine sheet carries literal `<` characters that are fine in HTML's RAWTEXT `<style>`
//     and a parse error in XML — the whole SVG silently fails to decode.
//  2. Fonts are INLINED. An SVG drawn as an image may not fetch anything, so a face loaded by
//     URL falls back to a system font. Only the faces this document actually LOADED are
//     embedded (fetched once per URL, then cached), appended after the original rules so the
//     identical descriptors resolve to the data-URI copy.
//  3. The SVG is drawn at the slide's own size (1280×720 for 16:9) and scaled on the CANVAS. Scaling it with
//     a viewBox renders the foreignObject unscaled on WebKit (engineering/gotchas/
//     studio-playground.md records the same breakage on iOS).
//  4. A `data:` URL, not a `blob:` one — Chromium taints the canvas for a blob-URL SVG
//     carrying a foreignObject, and `toBlob` then throws.
//
// WHAT IT REFUSES, returning null so the tile simply stays live: any `<img>`, `<video>`,
// `<canvas>`, `<iframe>`, `<object>` or `<embed>` (its pixels are not in the markup, or it
// would need a fetch the image context forbids), a `url()` background on any element that is
// not a data URL, a loaded font face whose source cannot be embedded, and any failure to
// decode or encode. A poster that is wrong is worse than a live tile, so every doubt is a no.
//
// HARD RULE #22. The markup and CSS serialized here are the frame's own, already sanitized on
// the way in. The result is an SVG decoded as an IMAGE, which runs no script and fetches
// nothing, and then a raster. A `]]>` in author CSS is split so it cannot end the CDATA early.

import { hasPoster, putPoster } from '@/lib/poster-cache';
import { sanitizeStyleText } from '../../../lib/core/sanitize-style-text.mjs';

const MEDIA = 'img,video,canvas,iframe,object,embed';

const fontData = new Map<string, Promise<string | null>>();
const sheetText = new Map<string, string>();

function bytesToBase64(bytes: Uint8Array): string {
	let bin = '';
	for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 0x8000)));
	return btoa(bin);
}

function fontDataUri(url: string): Promise<string | null> {
	let p = fontData.get(url);
	if (!p) {
		p = fetch(url)
			.then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
			.then((buf) => `data:font/woff2;base64,${bytesToBase64(new Uint8Array(buf))}`)
			.catch(() => {
				fontData.delete(url); // let a later capture retry
				return null;
			});
		fontData.set(url, p);
	}
	return p;
}

const attrs = (el: Element) =>
	[...el.attributes].map((a) => ` ${a.name}="${a.value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}"`).join('');

/** A sheet's text. The engine sheet (~2.3 MB) arrives as a `blob:` link shared by every frame,
 *  so its text is read once per URL rather than once per capture. */
function textOf(sheet: CSSStyleSheet): string {
	const href = sheet.href;
	if (href) {
		const hit = sheetText.get(href);
		if (hit !== undefined) return hit;
	}
	let css = '';
	for (const r of sheet.cssRules) css += `${r.cssText}\n`;
	if (href) sheetText.set(href, css);
	return css;
}

/** The loaded faces' `@font-face` rules, each rewritten to a data URI. Null when a loaded face
 *  cannot be embedded — a poster in a fallback font is exactly the wrong answer. */
async function embeddedFaces(doc: Document): Promise<string | null> {
	const loaded = new Set<string>();
	for (const f of doc.fonts) if (f.status === 'loaded') loaded.add(`${f.family.replace(/["']/g, '')}|${f.weight}|${f.style}`);
	if (!loaded.size) return '';
	const out: string[] = [];
	const walk = async (rules: CSSRuleList, base: string): Promise<void> => {
		for (const r of rules) {
			// By TYPE, not `instanceof`: the rule belongs to the frame's realm, not this one.
			if (r.type === 5 /* CSSRule.FONT_FACE_RULE */) {
				const st = (r as CSSFontFaceRule).style;
				const fam = st.getPropertyValue('font-family').replace(/["']/g, '').trim();
				const key = `${fam}|${st.getPropertyValue('font-weight') || '400'}|${st.getPropertyValue('font-style') || 'normal'}`;
				if (!loaded.has(key)) continue;
				const m = st.getPropertyValue('src').match(/url\(\s*["']?([^"')]+)["']?\s*\)/);
				if (!m) continue;
				const url = new URL(m[1], base).href;
				const uri = url.startsWith('data:') ? url : await fontDataUri(url);
				if (!uri) return;
				out.push(r.cssText.replace(m[0], `url(${uri})`));
				loaded.delete(key);
			} else if ('cssRules' in r && (r as CSSGroupingRule).cssRules) {
				await walk((r as CSSGroupingRule).cssRules, base);
			}
		}
	};
	for (const sheet of doc.styleSheets) await walk(sheet.cssRules, sheet.href || doc.baseURI);
	return loaded.size ? null : out.join('\n');
}

/** Does anything in the slide need a subresource the image context will not fetch? */
function needsFetch(root: Element): boolean {
	for (const el of root.querySelectorAll(MEDIA)) {
		const src = el.getAttribute('src') || el.getAttribute('data') || '';
		if (el.tagName !== 'CANVAS' && src.startsWith('data:')) continue;
		return true;
	}
	const view = root.ownerDocument.defaultView;
	if (!view) return true;
	for (const el of [root, ...root.querySelectorAll('*')]) {
		const bg = view.getComputedStyle(el).backgroundImage;
		if (bg && bg !== 'none' && /url\(\s*["']?(?!data:)/.test(bg)) return true;
	}
	return false;
}

/**
 * Capture `frame`'s rendered slide as a WebP `width` px wide, at the slide's own aspect. Resolves null whenever the
 * result could not be trusted to look like the live tile.
 */
export async function captureSlidePoster(frame: HTMLIFrameElement, width: number): Promise<Blob | null> {
	try {
		const doc = frame.contentDocument;
		// Exactly ONE slide. A document holding several would capture whichever sits at the
		// top-left, which need not be the tile's.
		const sections = doc?.querySelectorAll<HTMLElement>('article.lattice > section');
		if (!doc || !sections || sections.length !== 1 || needsFetch(doc.body)) return null;
		const SLIDE_W = sections[0].offsetWidth;
		const SLIDE_H = sections[0].offsetHeight;
		if (!SLIDE_W || !SLIDE_H) return null;
		const faces = await embeddedFaces(doc);
		if (faces === null) return null;
		let css = '';
		for (const sheet of doc.styleSheets) css += textOf(sheet as CSSStyleSheet);
		// The shared style sanitizer first (HARD RULE #22 — a CSS re-wrap owes the call itself), then
		// the CDATA split.
		css = sanitizeStyleText(`${css}\n${faces}`).split(']]>').join(']]]]><![CDATA[>');
		const ser = new XMLSerializer();
		let body = '';
		for (const c of doc.body.children) if (c.tagName !== 'SCRIPT') body += ser.serializeToString(c);
		const svg =
			`<svg xmlns="http://www.w3.org/2000/svg" width="${SLIDE_W}" height="${SLIDE_H}">` +
			`<foreignObject x="0" y="0" width="${SLIDE_W}" height="${SLIDE_H}">` +
			`<html xmlns="http://www.w3.org/1999/xhtml"${attrs(doc.documentElement)}><head><style><![CDATA[${css}]]></style></head>` +
			`<body${attrs(doc.body)}>${body}</body></html></foreignObject></svg>`;
		const img = new Image();
		const loaded = await new Promise<boolean>((res) => {
			img.onload = () => res(true);
			img.onerror = () => res(false);
			img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
		});
		if (!loaded) return null;
		const height = Math.round((width * SLIDE_H) / SLIDE_W);
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const g = canvas.getContext('2d');
		if (!g) return null;
		g.imageSmoothingEnabled = true;
		g.imageSmoothingQuality = 'high';
		g.drawImage(img, 0, 0, width, height);
		const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', 0.9));
		// A browser without a WebP encoder hands back PNG, which is still a faithful image.
		return blob && blob.size > 0 ? blob : null;
	} catch {
		return null;
	}
}

// ── THE CAPTURE QUEUE ──────────────────────────────────────────────────────────────
//
// After a slot renders a tile, the tile's poster is captured from that slot's live document so
// the NEXT time the tile mounts — the next open of this surface — it shows the image and asks
// for no frame. ONE AT A TIME, with a gap, because a capture is ~100 ms of main thread on
// Chromium and ~200 ms on WebKit (measured) and a burst of nine would be felt in the gesture that
// opened the surface. Diagram (mermaid) tiles are skipped: their SVG settles late and asynchronously,
// so there is no moment at which the live document is known to be finished.
const CAPTURE_SETTLE_MS = 400;
const CAPTURE_GAP_MS = 120;
const captureJobs: { key: string; run: () => Promise<void> }[] = [];
const capturing = new Set<string>();
let captureBusy = false;

function pumpCaptures() {
	if (captureBusy) return;
	const job = captureJobs.shift();
	if (!job) return;
	captureBusy = true;
	job
		.run()
		.catch(() => {})
		.finally(() => {
			capturing.delete(job.key);
			captureBusy = false;
			window.setTimeout(pumpCaptures, CAPTURE_GAP_MS);
		});
}

/** Queue a capture of `frameHost`'s live iframe for `key`, if it is still showing `key` when its
 *  turn comes. `stillShows` is asked AFTER the settle, so a slot re-pointed in the meantime never
 *  files its new slide under the old tile's key. */
export function queueCapture(key: string, width: number, frameHost: HTMLElement, stillShows: () => boolean) {
	if (typeof window === 'undefined' || hasPoster(key) || capturing.has(key)) return;
	capturing.add(key);
	captureJobs.push({
		key,
		run: async () => {
			await new Promise((r) => window.setTimeout(r, CAPTURE_SETTLE_MS));
			const frame = frameHost.querySelector<HTMLIFrameElement>('iframe.live');
			const fonts = frame?.contentDocument?.fonts;
			if (fonts) await fonts.ready;
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			if (!frame || !frameHost.isConnected || !stillShows() || hasPoster(key)) return;
			const blob = await captureSlidePoster(frame, width);
			if (blob && stillShows()) putPoster(key, blob);
		},
	});
	pumpCaptures();
}
