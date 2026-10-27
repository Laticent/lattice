// A SLIDE CAPTURE THAT WAITS FOR ITS PICTURES — the slide camera's draw, plus the wait WebKit needs.
//
// The camera draws a slide by serializing it into an SVG `<foreignObject>`, loading that SVG as an
// `<img>`, and calling `drawImage` once (html-to-image, which this replaced, did the same). Every picture on the slide rides inside the SVG as a base64
// `data:` URL. Chromium and Firefox decode those nested pictures before the SVG's `load` fires. WebKit
// does not, for any picture over about 100,000 pixels: it starts decoding on the FIRST `drawImage` and
// finishes some time later, and no event, no `img.decode()` and no wait before that first draw tells you
// when. So the one draw html-to-image makes came out with the text and NO pictures, and the export
// shipped it (followups.d/2640). Measured in Playwright's WebKit: a 640x360 PNG is
// blank on the first draw and present on the second; a 12-megapixel JPEG stays blank for about 400 ms
// of redraws; waiting 1 s BEFORE the first draw changes nothing; a 300x300 picture draws the first time.
//
// What WebKit does keep is the decode: once a picture has been drawn at its natural size inside one SVG
// image, the same `data:` URL inside another SVG draws at once. So on an engine that decodes late,
// `settleSlideDraw` WARMS each large picture first, alone: one small SVG per picture, drawn at the
// picture's natural size into a 1x1 canvas (clipped, so no large scratch canvas), redrawn until a pixel
// of the picture comes back opaque (a pixel found opaque in the picture itself first, by a strip scan, so a
// sparse line drawing is tested where it has ink). Alone, "arrived" is a plain question with no layout in it: nothing
// overlaps it, covers it or fades it, so a logo inside a photo's box, an `opacity` on an ancestor or a
// `data:` SVG logo cannot fool it (an earlier draft compared picture BOXES on the slide and was fooled by
// all three). Then it draws the slide once, and checks each picture is STILL decoded (its probe pixel is
// opaque on the first draw, with no wait); a picture the cache dropped in the meantime is warmed again
// and the slide redrawn. A picture that never arrives inside SETTLE_DEADLINE_MS goes into the failure
// log, so the toast says the export could not draw every image rather than shipping a hole in silence.
// A scaled-down warm draw does NOT fill the cache (measured), which is why the warm draw is natural size.
//
// The ENGINE is detected, not sniffed from the user agent: `needsDecodePriming` draws an SVG holding a
// 512px PNG once and reads a pixel back. The PNG carries one random pixel, so the probe can never hit
// the decode cache. On Chromium and Firefox the pixel is there, and `settleSlideDraw` is one plain draw.

/** How long one slide may spend waiting for WebKit to decode its pictures before it ships anyway. */
export const SETTLE_DEADLINE_MS = 5000;
/** The pause between redraws. A timer, not `requestAnimationFrame`: a background tab never paints. */
const SETTLE_POLL_MS = 20;
/** At or under this many pixels WebKit decodes in time for the first draw (300x300 does, 360x360 does not). */
const SYNC_DECODE_PIXELS = 250 * 250;
/** The detection probe's edge: well over the size WebKit decodes late. */
const PROBE_PX = 512;
/** How many tries the slide draw gets when the cache drops a picture between the warm and the draw. */
const DRAW_ROUNDS = 3;
/** Rows per read when scanning a picture for an opaque pixel: a strip, never the whole picture. */
const SCAN_ROWS = 64;
/**
 * Every base64 `data:` URL in an SVG data URL, matched in its ENCODED form so a multi-megabyte slide is
 * never decoded whole. `encodeURIComponent` leaves letters, digits and `. _ -` alone and writes
 * `+ / = ;` and a space as `%2B %2F %3D %3B %20`; the closing quote is `%22` (or `%26quot%3B` inside a
 * style), which neither class admits. The media type is matched loosely on purpose: html-to-image copies
 * a server's `Content-Type` verbatim, so a picture can arrive as `image/jpeg;charset=binary`,
 * `binary/octet-stream` or with no type at all, and every one of those is a picture WebKit decodes late.
 * Fonts are dropped by `embeddedPictures`; anything else that is not a picture fails to load and is
 * skipped. A utf-8 `data:` SVG (a theme mask, `logo: lattice`) is not base64 and is vector, which WebKit
 * draws the first time.
 */
const EMBEDDED_BASE64 = /data%3A(?:[a-z0-9._-]|%2F|%2B|%3D|%20|%3B(?!base64%2C))*%3Bbase64%2C(?:[a-z0-9]|%2B|%2F|%3D)+/gi;
/** A font's media type, which `embeddedPictures` leaves out: the slide's faces ride in the same SVG. */
const FONT_TYPE = /^data:(?:font\/|application\/(?:x-)?font|application\/vnd\.ms-fontobject|[^;,]*woff)/i;

/** `EMBEDDED_BASE64` for the SVG as plain text: no encoding pass over a multi-megabyte slide to find its pictures. */
const PLAIN_BASE64 = /data:[a-z0-9._+/ %=;-]*?;base64,[a-z0-9+/=]+/gi;

/** The distinct base64 pictures inside an SVG's text, fonts left out. */
export function embeddedPicturesOfSvg(svg) {
	return [...new Set(svg.match(PLAIN_BASE64) || [])].filter((u) => !FONT_TYPE.test(u));
}

let primingProbe;

/** Load an image the way html-to-image's own `createImage` does: load, decode, one frame. */
function loadImage(url) {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			img.decode().then(
				() => requestAnimationFrame(() => resolve(img)),
				() => resolve(img),
			);
		};
		img.onerror = reject;
		img.crossOrigin = 'anonymous';
		img.decoding = 'async';
		img.src = url;
	});
}

/** An SVG data URL holding one HTML fragment, as html-to-image builds its own. */
function svgUrlOf(html, w, h) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject x="0" y="0" width="100%" height="100%">${html}</foreignObject></svg>`;
	return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Does this engine draw an SVG's nested pictures only after the first draw? Asked once per page.
 * Any failure answers "no", which is html-to-image's own behavior — never worse than before.
 */
export function needsDecodePriming() {
	if (!primingProbe) {
		primingProbe = (async () => {
			try {
				const n = PROBE_PX;
				const dot = document.createElement('canvas');
				dot.width = n;
				dot.height = n;
				const g = dot.getContext('2d');
				g.fillStyle = 'rgb(0,255,0)';
				g.fillRect(0, 0, n, n);
				g.fillStyle = `rgb(${Math.floor(Math.random() * 256)},0,${Math.floor(Math.random() * 256)})`;
				g.fillRect(0, 0, 1, 1);
				const png = dot.toDataURL('image/png');
				const img = await loadImage(svgUrlOf(`<img xmlns="http://www.w3.org/1999/xhtml" src="${png}" style="display:block;width:${n}px;height:${n}px"/>`, n, n));
				return !opaqueAt(img, n, n, [n >> 1, n >> 1]);
			} catch (_e) {
				return false;
			}
		})();
	}
	return primingProbe;
}

/** The distinct base64 pictures inside an SVG data URL, decoded to plain `data:` URLs, fonts left out. */
export function embeddedPictures(svgUrl) {
	return [...new Set(svgUrl.match(EMBEDDED_BASE64) || [])].map((m) => decodeURIComponent(m)).filter((u) => !FONT_TYPE.test(u));
}

/**
 * The first opaque pixel of a decoded picture, read in strips of SCAN_ROWS rows at natural size, or null
 * when every pixel is transparent. This is the main document's own decode, which WebKit does finish, so
 * the answer is exact: a thin rule or a signature is tested where it has ink, not at fixed points.
 */
function firstOpaquePixel(probe, w, h) {
	const strip = document.createElement('canvas');
	strip.width = w;
	strip.height = Math.min(h, SCAN_ROWS);
	const ctx = strip.getContext('2d', { willReadFrequently: true });
	for (let y = 0; y < h; y += strip.height) {
		ctx.clearRect(0, 0, strip.width, strip.height);
		ctx.drawImage(probe, 0, -y, w, h);
		const rows = Math.min(strip.height, h - y);
		const data = ctx.getImageData(0, 0, w, rows).data;
		for (let i = 3; i < data.length; i += 4) {
			if (data[i] > 0) {
				const px = (i - 3) / 4;
				return [px % w, y + Math.floor(px / w)];
			}
		}
	}
	return null;
}

let pixel;

/** Draw `img` at its natural size w x h, clipped to one pixel at `point`, and say whether it is opaque. */
function opaqueAt(img, w, h, [x, y]) {
	if (!pixel) {
		const c = document.createElement('canvas');
		c.width = 1;
		c.height = 1;
		pixel = c.getContext('2d', { willReadFrequently: true });
	}
	pixel.clearRect(0, 0, 1, 1);
	pixel.drawImage(img, -x, -y, w, h);
	return pixel.getImageData(0, 0, 1, 1).data[3] > 0;
}

/**
 * The wait itself, with every browser call injected so it can be tested without one.
 *
 * `pictures` are `{ check() }`, where `check()` redraws that picture alone and answers whether it has
 * arrived. `drawSlide()` draws the slide. Each round warms every picture not yet known to have arrived,
 * draws the slide, then checks every picture once more with no wait: one the cache dropped is re-warmed
 * next round. Returns the last slide drawn and the indexes of the pictures that never arrived.
 */
export async function settle({ pictures, drawSlide, deadlineMs = SETTLE_DEADLINE_MS, pollMs = SETTLE_POLL_MS, rounds = DRAW_ROUNDS, now = () => performance.now(), wait = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
	if (!pictures.length) return { canvas: drawSlide(), stuck: [] };
	const start = now();
	let pending = pictures.map((_p, i) => i);
	for (let round = 0; ; round++) {
		for (const i of pending) {
			while (!pictures[i].check() && now() - start < deadlineMs) await wait(pollMs);
		}
		const canvas = drawSlide();
		pending = pictures.map((_p, i) => i).filter((i) => !pictures[i].check());
		if (!pending.length || round + 1 >= rounds || now() - start >= deadlineMs) return { canvas, stuck: pending };
	}
}

/**
 * One embedded picture, ready to be checked alone, or null when there is nothing to wait for: WebKit
 * draws it in time anyway (small), it has no opaque pixel to draw, or it is not a picture at all. Any
 * failure is null too, which is html-to-image's own single draw — never worse than before.
 */
async function solo(url) {
	try {
		const probe = await new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => img.decode().then(() => resolve(img), () => resolve(img));
			img.onerror = reject;
			img.src = url;
		});
		const w = probe.naturalWidth;
		const h = probe.naturalHeight;
		if (!(w > 0 && h > 0) || w * h <= SYNC_DECODE_PIXELS) return null;
		const point = firstOpaquePixel(probe, w, h);
		if (!point) return null;
		const img = await loadImage(svgUrlOf(`<img xmlns="http://www.w3.org/1999/xhtml" src="${url}" style="display:block;width:${w}px;height:${h}px"/>`, w, h));
		return { check: () => opaqueAt(img, w, h, point) };
	} catch (_e) {
		return null;
	}
}

/**
 * The slide camera's draw, which on a priming engine waits for the slide's pictures.
 *
 * `svg` is the slide's SVG text, as the camera (lib/core/slide-camera.mjs) built it, with every picture inlined as a base64
 * `data:` URL; `drawSlide()` draws it into a new canvas. On Chromium and Firefox this is one `drawSlide()`.
 * `log` is the export's image-failure log (`createImageFailureLog`).
 *
 * @param {string} svg
 * @param {() => HTMLCanvasElement} drawSlide
 * @param {{ count: number }} [log]
 */
export async function settleSlideDraw(svg, drawSlide, log) {
	if (!(await needsDecodePriming())) return drawSlide();
	// One at a time, not `Promise.all`: each prepare decodes a picture in full (48 MB for 12 megapixels),
	// and a slide of photos must not hold every one at once on a phone.
	const pictures = [];
	for (const url of embeddedPicturesOfSvg(svg)) {
		const picture = await solo(url);
		if (picture) pictures.push(picture);
	}
	const { canvas, stuck } = await settle({ pictures, drawSlide });
	// Unnamed: the SVG holds the picture's bytes, not the path the author wrote, so the toast says only
	// that not every image made it (`missingImageReason`), which is true.
	if (stuck.length && log) log.count += 1;
	return canvas;
}
