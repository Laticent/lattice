/**
 * Slide pictures: PNG or JPEG. A slide is photographed once and stored whole, and the right
 * encoding depends on what is in it. A flat slide (text, cards, a gradient) is small as PNG
 * and crisp; a photograph is lossless-PNG poison (2 to 6 MB per 2560 × 1440 slide, where a
 * q92 JPEG is a tenth of that). The writers take either and name the part by what it is.
 *
 * Measured on a 35-slide deck of mostly photographs (2026-10-21): 76.6 MB as PNG, 15.1 MB
 * choosing per slide, and every one of the 35 slides was smaller as JPEG.
 */

/** JPEG quality for a photographic slide, 0 to 1 (canvas) or 1 to 100 (a headless browser's screenshot). */
export const PICTURE_JPEG_QUALITY = 0.92;
/** A PNG at or under this many bytes is a flat slide: keep it, lossless, with no JPEG tried. */
export const PICTURE_FLAT_BYTES = 600 * 1024;
/** A JPEG must be under this share of its PNG to win; a marginal saving is not worth a lossy picture. */
export const PICTURE_JPEG_SHARE = 0.7;

/**
 * A continuous-tone slide's JPEG at or over this many bytes is kept without ever shooting the PNG.
 * Below it the slide is nearly flat after all (a sky, a faint wash) and the PNG is worth comparing.
 * Measured: the smallest JPEG of a photo or finish-wash slide in a 35-slide deck was 158 KB.
 */
export const PICTURE_TONE_JPEG_BYTES = 100 * 1024;

/** The media type of PNG or JPEG bytes, from the file signature. Anything else is called PNG, as before. */
export function imageMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' {
	return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png';
}

/** The file extension for `imageMime`. */
export function imageExt(bytes: Uint8Array): 'png' | 'jpg' {
	return imageMime(bytes) === 'image/jpeg' ? 'jpg' : 'png';
}

/** Whether a PNG of `pngBytes` is big enough that a JPEG is worth trying. */
export function worthTryingJpeg(pngBytes: number): boolean {
	return pngBytes > PICTURE_FLAT_BYTES;
}

/** Whether a JPEG of `jpegBytes` should replace a PNG of `pngBytes`. */
export function jpegWins(pngBytes: number, jpegBytes: number): boolean {
	return jpegBytes < pngBytes * PICTURE_JPEG_SHARE;
}

/**
 * Whether a slide is continuous-tone: raster images (an `<img>`, or a CSS `background-image` that
 * is a `url(...)` and not an SVG) or smooth gradients (a finish's wash) cover at least a quarter
 * of it. A host asks this BEFORE it shoots the slide, because it picks the cheap order. Both
 * kinds are poison for PNG: a PNG of a photograph takes about 1.2 s to encode against 0.36 s for
 * the JPEG and is 5x the size, and a soft wash is 1 MB as PNG against 160 KB as JPEG, while a
 * flat slide's PNG encodes in about 0.2 s and is smaller than its JPEG. So a continuous-tone
 * slide is a JPEG first, and any other slide is a PNG first. It decides the order only; the
 * size rule above still decides the encoding where the answer is close, and a wrong guess costs
 * one extra shot, never a worse file.
 *
 * Self-contained, like `readSlide`: a headless browser receives it as source.
 */
export function isContinuousTone(section: HTMLElement): boolean {
	const win = section.ownerDocument.defaultView as Window & typeof globalThis;
	const box = section.getBoundingClientRect();
	const area = box.width * box.height;
	if (!(area > 0)) return false;
	const svg = (v: string) => /\.svg(?:[?#"')]|$)|data:image\/svg/i.test(v);
	let covered = 0;
	for (const el of [section, ...Array.from(section.querySelectorAll('*'))] as HTMLElement[]) {
		const cs = win.getComputedStyle(el);
		const src = el.tagName === 'IMG' ? (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src || '' : '';
		const bg = cs.backgroundImage;
		const tone = (el.tagName === 'IMG' && !!src && !svg(src)) || (/url\(/.test(bg) && !svg(bg)) || /gradient\(/.test(bg);
		if (!tone) continue;
		const r = el.getBoundingClientRect();
		const w = Math.max(0, Math.min(r.right, box.right) - Math.max(r.left, box.left));
		const h = Math.max(0, Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top));
		covered += w * h;
	}
	// A quarter of the slide. A literal, not a constant: this function ships into the page as source.
	return covered >= 0.25 * area;
}
