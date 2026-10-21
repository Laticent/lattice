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
