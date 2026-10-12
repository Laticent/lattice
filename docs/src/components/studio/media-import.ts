// Turning a picked file into something the media store keeps. Decision note:
// engineering/decisions/2026-10-12-library-media-assets.md §3.
//
// The PLAN functions are pure and unit-tested. `importImage` is the browser half (decode,
// canvas, encode) and is exercised against a real browser, not jsdom — jsdom has no image
// decoder, so a test there would only confirm a stub (HARD RULE #23).

import { scrubberFor } from './media-scrub';
import { MAX_MEDIA_FILE_BYTES, type MediaKind, mediaNameFromFile, type NewMedia, sniffImageMime, uniqueName } from './media-store';

/** The long edge a stored photo is capped to. A slide shows at most ~1920 px wide, so pixels
 *  past this cost storage quota and buy nothing a viewer can see. */
export const MAX_IMAGE_EDGE = 2560;
const JPEG_QUALITY = 0.88;

/** What the native picker is asked for. `image/*` opens Photo Library / Take Photo / Files
 *  on Android and iOS; the extensions cover HEIC where the OS reports no MIME type. */
export const MEDIA_ACCEPT = 'image/*,.heic,.heif';

const EXT_MIME: Record<string, string> = {
	jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
	svg: 'image/svg+xml', avif: 'image/avif', heic: 'image/heic', heif: 'image/heif',
};

/** The MIME type to trust: the browser's, else one inferred from the extension (iOS and some
 *  Android pickers hand back HEIC with an empty `type`). */
export function mimeOf(file: { name: string; type: string }): string {
	if (file.type) return file.type.toLowerCase();
	const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase() ?? '';
	return EXT_MIME[ext] ?? '';
}

/** Is this file one the Images tab takes? (Slice 5 adds video.) */
export function classifyMedia(file: { name: string; type: string }): MediaKind | null {
	return mimeOf(file).startsWith('image/') ? 'image' : null;
}

export type ImagePlan = {
	/** Re-encode through a canvas? Strips ALL embedded metadata (EXIF, GPS) and bakes the
	 *  rotation into the pixels. */
	reencode: boolean;
	width: number;
	height: number;
	/** Encoded type when `reencode`; otherwise the file's own. */
	mime: string;
	/** True when the stored pixels differ from the camera's (resized or re-encoded). */
	downscaled: boolean;
};

/** Types a camera or editor writes with location in them, always re-encoded to JPEG. `image/jpg` and
 *  `image/pjpeg` are the spellings some pickers report; leaving them out kept GPS in every export. */
const JPEG_LIKE = new Set(['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/heic', 'image/heif', 'image/avif']);
/** Types stored exactly as given (PNG and WebP only when under the cap). Anything else is re-encoded to
 *  PNG, so the Library only ever holds a type a backup can carry and every browser can draw. */
const KEEP_AS_IS = new Set(['image/png', 'image/webp', 'image/gif']);
/** A vector's raster size: crisp at slide size, never past the cap. */
const SVG_TARGET_EDGE = 2048;

/**
 * Decide what to do with a decoded image. Policy:
 *   - JPEG-like and HEIC/HEIF are ALWAYS re-encoded to JPEG, capped to MAX_IMAGE_EDGE. That is
 *     where a phone's GPS lives, and a canvas re-encode is what removes it from the bytes
 *     every export would otherwise embed.
 *   - PNG and WebP are re-encoded only when over the cap (they are screenshots and logos;
 *     a lossy pass would hurt, and they rarely carry location). They stay in their format,
 *     so transparency survives.
 *   - AVIF is re-encoded to JPEG like the rest: its metadata sits in a container a byte scrub does not
 *     parse here, and a canvas re-encode removes it. (An AVIF with transparency loses it; rare for photos.)
 *   - PNG, WebP and GIF that are kept are stored with their pixels untouched and their metadata blocks
 *     (EXIF, XMP, text, comments) cut out by `media-scrub.ts`, so animation and transparency survive and
 *     location does not.
 *   - EVERYTHING ELSE (BMP, TIFF, ICO, an unknown `image/*`) is re-encoded to PNG, so a type the
 *     Library does not store never reaches a backup that would have to drop it.
 *   - SVG is rasterized to PNG by `importImage`, never stored: an SVG opened as a document (a
 *     right-click "Open image in new tab" on a `blob:` URL) runs its script on the site's origin.
 * `width`/`height` are the DISPLAY size: the decoder has already applied EXIF rotation.
 */
export function planImage(mime: string, width: number, height: number): ImagePlan {
	const long = Math.max(width, height);
	const scale = long > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / long : 1;
	const w = Math.max(1, Math.round(width * scale));
	const h = Math.max(1, Math.round(height * scale));
	if (JPEG_LIKE.has(mime)) return { reencode: true, width: w, height: h, mime: 'image/jpeg', downscaled: true };
	if ((mime === 'image/png' || mime === 'image/webp') && scale < 1) return { reencode: true, width: w, height: h, mime, downscaled: true };
	if (KEEP_AS_IS.has(mime)) return { reencode: false, width, height, mime, downscaled: false };
	return { reencode: true, width: w, height: h, mime: 'image/png', downscaled: true };
}

/** Thrown for a file the importer cannot use; the message is shown to the person as is. */
export class MediaImportError extends Error {}

async function decode(file: File): Promise<ImageBitmap> {
	try {
		// 'from-image' applies the EXIF Orientation, so a portrait phone photo is upright.
		return await createImageBitmap(file, { imageOrientation: 'from-image' });
	} catch {
		const heic = /heic|heif/.test(mimeOf(file));
		throw new MediaImportError(
			heic
				? `This browser can't read ${file.name} (HEIC). Export it as JPEG, or add it from Safari.`
				: `${file.name} couldn't be read. It may be a type this browser can't open, or too large for it to decode.`,
		);
	}
}

async function intrinsicSize(file: File): Promise<{ width: number; height: number }> {
	// SVG has no pixel size to decode reliably in every browser; read the root's viewBox/size,
	// falling back to a square so the card still lays out.
	const text = await file.text();
	const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(text);
	if (vb) return { width: Math.round(+vb[1]) || 1, height: Math.round(+vb[2]) || 1 };
	const w = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/i.exec(text);
	const h = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/i.exec(text);
	return { width: Math.round(+(w?.[1] ?? 1)) || 1, height: Math.round(+(h?.[1] ?? 1)) || 1 };
}

function toBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((b) => (b ? resolve(b) : reject(new MediaImportError('The browser could not encode that image.'))), mime, mime === 'image/jpeg' ? JPEG_QUALITY : undefined);
	});
}

/**
 * Draw an SVG to a PNG through an `<img>`, which never runs a script or loads another resource, and keep
 * only the pixels. The stored file is then a picture and nothing else.
 */
async function rasterizeSvg(file: File): Promise<{ blob: Blob; width: number; height: number }> {
	const url = URL.createObjectURL(file);
	try {
		const img = new Image();
		img.src = url;
		try {
			await img.decode();
		} catch {
			throw new MediaImportError(`${file.name} isn't an SVG this browser can draw.`);
		}
		let w = img.naturalWidth;
		let h = img.naturalHeight;
		// An SVG with no size of its own reports 0 in some engines: read its viewBox, else assume a square.
		if (!w || !h) ({ width: w, height: h } = await intrinsicSize(file));
		const k = SVG_TARGET_EDGE / Math.max(w, h);
		const width = Math.max(1, Math.min(MAX_IMAGE_EDGE, Math.round(w * k)));
		const height = Math.max(1, Math.min(MAX_IMAGE_EDGE, Math.round(h * k)));
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new MediaImportError('The browser could not prepare that image.');
		ctx.drawImage(img, 0, 0, width, height);
		return { blob: await toBlob(canvas, 'image/png'), width, height };
	} finally {
		URL.revokeObjectURL(url);
	}
}

/** Decode, plan, and (when the plan says so) re-encode. Returns a record ready for
 *  `saveMedia`, minus the name — the caller resolves a clash before it saves. */
export async function importImage(file: File, scope: string): Promise<NewMedia> {
	// Refused before anything decodes it: a restore reads at most this much per photo, so a photo the
	// Library took above it would be one a backup could never bring back.
	if (file.size > MAX_MEDIA_FILE_BYTES) throw new MediaImportError(`${file.name} is ${Math.round(file.size / 1_048_576)} MB; a photo may be at most ${Math.floor(MAX_MEDIA_FILE_BYTES / 1_048_576)} MB.`);
	// The bytes decide what a file is, not its extension: a JPEG named `.png` carries the phone's GPS and
	// would otherwise skip the re-encode that removes it.
	const sniffed = sniffImageMime(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
	const mime = sniffed ?? mimeOf(file);
	if (mime === 'image/svg+xml') {
		const { blob, width, height } = await rasterizeSvg(file);
		return { kind: 'image', name: mediaNameFromFile(file.name, 'image'), scope, blob, mime: blob.type || 'image/png', bytes: blob.size, width, height, sourceName: file.name, original: false };
	}
	const bitmap = await decode(file);
	try {
		const plan = planImage(mime, bitmap.width, bitmap.height);
		const scrub = !plan.reencode ? scrubberFor(mime) : undefined;
		const cleaned = scrub ? scrub(new Uint8Array(await file.arrayBuffer())) : null;
		if (!plan.reencode && cleaned) {
			return { kind: 'image', name: mediaNameFromFile(file.name, 'image'), scope, blob: new Blob([cleaned as BlobPart], { type: mime }), mime, bytes: cleaned.length, width: plan.width, height: plan.height, sourceName: file.name, original: true };
		}
		// A kept type the scrubber could not parse falls through to a canvas re-encode: never stored with a
		// metadata block nobody could read.
		const canvas = document.createElement('canvas');
		canvas.width = plan.width;
		canvas.height = plan.height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new MediaImportError('The browser could not prepare that image.');
		// JPEG has no alpha: paint white first so a transparent source does not turn black.
		if (plan.mime === 'image/jpeg') {
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, plan.width, plan.height);
		}
		ctx.drawImage(bitmap, 0, 0, plan.width, plan.height);
		const blob = await toBlob(canvas, plan.mime);
		// The type the browser actually wrote: an engine without a WebP encoder answers a WebP request with a PNG.
		return { kind: 'image', name: mediaNameFromFile(file.name, 'image'), scope, blob, mime: blob.type || plan.mime, bytes: blob.size, width: plan.width, height: plan.height, sourceName: file.name, original: false };
	} finally {
		bitmap.close();
	}
}

export { uniqueName };
