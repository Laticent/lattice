/**
 * Slide pictures: PNG or JPEG. A slide is photographed once and stored whole. Which encoding to take, and every threshold that decides it, is the
 * host's policy (Lattice's `choosePicture` in lib/core/image-policy.js), not Calco's: Calco is handed the encoded bytes and names the part by what they
 * are. What stays here is what only a reader of the page can tell, and what the bytes say about themselves.
 */

/** The media type of PNG or JPEG bytes, from the file signature. Anything else is called PNG, as before. */
export function imageMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' {
	return bytes.length > 2 && bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg' : 'image/png';
}

/** The file extension for `imageMime`. */
export function imageExt(bytes: Uint8Array): 'png' | 'jpg' {
	return imageMime(bytes) === 'image/jpeg' ? 'jpg' : 'png';
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
