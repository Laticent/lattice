// Turning a picked file into something the media store keeps. Decision note:
// engineering/decisions/2026-10-12-library-media-assets.md §3.
//
// The PLAN functions are pure and unit-tested. `importImage` is the browser half (decode,
// canvas, encode) and is exercised against a real browser, not jsdom — jsdom has no image
// decoder, so a test there would only confirm a stub (HARD RULE #23).

import { type FileMeta, readFileMeta } from './media-exif';
import { scrubberFor } from './media-scrub';
import { MAX_MEDIA_FILE_BYTES, type MediaKind, mediaNameFromFile, type NewMedia, sniffImageMime, uniqueName } from './media-store';

/** The long edge a stored photo is capped to. A slide shows at most ~1920 px wide, so pixels
 *  past this cost storage quota and buy nothing a viewer can see. */
export const MAX_IMAGE_EDGE = 2560;
const JPEG_QUALITY = 0.88;
/** Lossy WebP: visually the same as the JPEG above at slide size, at roughly two thirds of the bytes. */
const WEBP_QUALITY = 0.82;

/** What the person asked a photo to be stored as (the Add-photos dialog). Left out, the importer applies its
 *  automatic policy (`planImage`), which is what the chat's photo intake still uses.
 *   - `original`: the file's own pixels and type, no resize, only metadata (location, camera, caption) cut out.
 *     A type the Library cannot store (HEIC, AVIF) becomes JPEG, because there is nothing else to keep.
 *   - `jpeg`, `webp`: lossy, capped to `MAX_IMAGE_EDGE`. Transparency is lost (painted white).
 *   - `png`: lossless, capped to `MAX_IMAGE_EDGE`. A PNG already under the cap is kept as it is, never made bigger. */
export type PhotoFormat = 'original' | 'jpeg' | 'webp' | 'png';
export const PHOTO_FORMATS: PhotoFormat[] = ['original', 'jpeg', 'webp', 'png'];

let webpOk: boolean | undefined;
/** Can this browser WRITE WebP? Safari before 17 answers a WebP request with a PNG; the probe reads what it wrote. */
export function webpSupported(): boolean {
	if (webpOk === undefined) {
		try {
			webpOk = document.createElement('canvas').toDataURL('image/webp').startsWith('data:image/webp');
		} catch {
			webpOk = false;
		}
	}
	return webpOk;
}

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
		canvas.toBlob((b) => (b ? resolve(b) : reject(new MediaImportError('The browser could not encode that image.'))), mime, mime === 'image/jpeg' ? JPEG_QUALITY : mime === 'image/webp' ? WEBP_QUALITY : undefined);
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

/** What the file says about itself, read BEFORE anything scrubs or re-encodes it, as fields of a new record.
 *  A JPEG keeps its metadata in the first segments, so a slice is enough; PNG and WebP can put theirs after the
 *  picture data, so those are read whole (the importer reads a kept PNG or WebP whole to scrub it anyway). A
 *  file this cannot read gives nothing, and the import goes on. */
export async function fileMetaFields(file: File, mime: string): Promise<Pick<NewMedia, 'credit' | 'taken' | 'fileCaption' | 'hadLocation'>> {
	let meta: FileMeta = {};
	try {
		const buf = JPEG_LIKE.has(mime) ? await file.slice(0, 2 * 1_048_576).arrayBuffer() : mime === 'image/png' || mime === 'image/webp' ? await file.arrayBuffer() : null;
		if (buf) meta = readFileMeta(new Uint8Array(buf));
	} catch {
		meta = {};
	}
	return {
		...(meta.credit ? { credit: meta.credit } : {}),
		...(meta.taken ? { taken: meta.taken } : {}),
		...(meta.caption ? { fileCaption: meta.caption } : {}),
		...(meta.hadLocation ? { hadLocation: true as const } : {}),
	};
}

type Encoded = { blob: Blob; mime: string; width: number; height: number; original: boolean };

/** One photo, as one chosen format. Shared by the import and by the size measurement, so the sizes the
 *  dialog shows are the bytes the import writes. */
async function encodeAs(file: File, bitmap: ImageBitmap, mime: string, format: PhotoFormat): Promise<Encoded> {
	const keepable = mime === 'image/jpeg' || KEEP_AS_IS.has(mime);
	const long = Math.max(bitmap.width, bitmap.height);
	// A file is kept as it is (metadata cut) when the person asked for the original, or when it is already the
	// lossless type they asked for and under the cap, since re-encoding it could only grow it.
	const keep = (format === 'original' && keepable) || (long <= MAX_IMAGE_EDGE && ((format === 'png' && mime === 'image/png') || (format === 'webp' && mime === 'image/webp')));
	if (keep) {
		const scrub = scrubberFor(mime);
		const cleaned = scrub ? scrub(new Uint8Array(await file.arrayBuffer())) : null;
		if (cleaned) return { blob: new Blob([cleaned as BlobPart], { type: mime }), mime, width: bitmap.width, height: bitmap.height, original: true };
	}
	// Re-encode. `original` that could not be kept (HEIC, AVIF, an unreadable file) keeps the closest type.
	const target = format === 'webp' ? 'image/webp' : format === 'png' || (format === 'original' && mime === 'image/png') ? 'image/png' : 'image/jpeg';
	if (target === 'image/webp' && !webpSupported()) throw new MediaImportError('This browser cannot save WebP. Choose JPEG or PNG.');
	const scale = long > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / long : 1;
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new MediaImportError('The browser could not prepare that image.');
	if (target === 'image/jpeg') {
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, width, height);
	}
	ctx.drawImage(bitmap, 0, 0, width, height);
	const blob = await toBlob(canvas, target);
	return { blob, mime: blob.type || target, width, height, original: false };
}

/** The type the bytes say a file is, as the importer reads it. */
async function sniffedMime(file: File): Promise<string> {
	return sniffImageMime(new Uint8Array(await file.slice(0, 16).arrayBuffer())) ?? mimeOf(file);
}

export type FormatSizes = {
	/** The files' size as picked. */
	pickedBytes: number;
	/** Bytes this choice would store for ALL the files; null when the browser cannot write it. */
	bytes: Record<PhotoFormat, number | null>;
	/** Files the numbers were MEASURED on, out of the batch. Past that the rest are scaled by size. */
	sampled: number;
	of: number;
	/** Photos the browser cannot decode or an SVG (always stored as PNG): left out of the measurement. */
	skipped: number;
};

/** How big the picked files would be in each format, MEASURED by running the import's own encoder on the
 *  files (up to `SAMPLE`; a larger batch is scaled by file size). `isCanceled` stops it early when the dialog closes. */
export async function measureFormats(files: File[], isCanceled: () => boolean = () => false): Promise<FormatSizes> {
	const SAMPLE = 4;
	const pickedBytes = files.reduce((n, f) => n + f.size, 0);
	const bytes: Record<PhotoFormat, number | null> = { original: 0, jpeg: 0, webp: webpSupported() ? 0 : null, png: 0 };
	let sampleBytes = 0;
	let sampled = 0;
	let skipped = 0;
	for (const file of files) {
		if (sampled >= SAMPLE || isCanceled()) break;
		let bitmap: ImageBitmap | undefined;
		try {
			const mime = await sniffedMime(file);
			if (mime === 'image/svg+xml') {
				skipped++;
				continue;
			}
			bitmap = await decode(file);
			for (const f of PHOTO_FORMATS) {
				if (bytes[f] === null) continue;
				bytes[f] = (bytes[f] as number) + (await encodeAs(file, bitmap, mime, f)).blob.size;
			}
			sampleBytes += file.size;
			sampled++;
		} catch {
			skipped++;
		} finally {
			bitmap?.close();
		}
	}
	// A batch bigger than the sample is scaled by how much of its size was measured.
	const k = sampleBytes > 0 ? pickedBytes / sampleBytes : 1;
	for (const f of PHOTO_FORMATS) if (bytes[f] !== null) bytes[f] = Math.round((bytes[f] as number) * k);
	return { pickedBytes, bytes, sampled, of: files.length, skipped };
}

/** Decode, plan, and (when the plan says so) re-encode. Returns a record ready for
 *  `saveMedia`, minus the name — the caller resolves a clash before it saves. */
export async function importImage(file: File, scope: string, format?: PhotoFormat): Promise<NewMedia> {
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
	const fromFile = await fileMetaFields(file, mime);
	const bitmap = await decode(file);
	try {
		if (format) {
			const e = await encodeAs(file, bitmap, mime, format);
			if (e.blob.size > MAX_MEDIA_FILE_BYTES) throw new MediaImportError(`${file.name} is still ${Math.round(e.blob.size / 1_048_576)} MB after it was converted; a photo may be at most ${Math.floor(MAX_MEDIA_FILE_BYTES / 1_048_576)} MB.`);
			return { kind: 'image', name: mediaNameFromFile(file.name, 'image'), scope, blob: e.blob, mime: e.mime, bytes: e.blob.size, width: e.width, height: e.height, sourceName: file.name, original: e.original };
		}
		const plan = planImage(mime, bitmap.width, bitmap.height);
		const scrub = !plan.reencode ? scrubberFor(mime) : undefined;
		const cleaned = scrub ? scrub(new Uint8Array(await file.arrayBuffer())) : null;
		if (!plan.reencode && cleaned) {
			return { kind: 'image', name: mediaNameFromFile(file.name, 'image'), scope, blob: new Blob([cleaned as BlobPart], { type: mime }), mime, bytes: cleaned.length, width: plan.width, height: plan.height, sourceName: file.name, original: true, ...fromFile };
		}
		// A kept type the scrubber could not parse falls through to a canvas
		// re-encode, capped like any other photo and stored as PNG: never stored with a block nobody could read.
		const out = plan.reencode ? plan : planImage('image/x-unreadable', bitmap.width, bitmap.height);
		const canvas = document.createElement('canvas');
		canvas.width = out.width;
		canvas.height = out.height;
		const ctx = canvas.getContext('2d');
		if (!ctx) throw new MediaImportError('The browser could not prepare that image.');
		// JPEG has no alpha: paint white first so a transparent source does not turn black.
		if (out.mime === 'image/jpeg') {
			ctx.fillStyle = '#fff';
			ctx.fillRect(0, 0, out.width, out.height);
		}
		ctx.drawImage(bitmap, 0, 0, out.width, out.height);
		const blob = await toBlob(canvas, out.mime);
		if (blob.size > MAX_MEDIA_FILE_BYTES) throw new MediaImportError(`${file.name} is still ${Math.round(blob.size / 1_048_576)} MB after it was converted; a photo may be at most ${Math.floor(MAX_MEDIA_FILE_BYTES / 1_048_576)} MB.`);
		// The type the browser actually wrote: an engine without a WebP encoder answers a WebP request with a PNG.
		return { kind: 'image', name: mediaNameFromFile(file.name, 'image'), scope, blob, mime: blob.type || out.mime, bytes: blob.size, width: out.width, height: out.height, sourceName: file.name, original: false, ...fromFile };
	} finally {
		bitmap.close();
	}
}

export { uniqueName };
