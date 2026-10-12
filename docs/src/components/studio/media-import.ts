// Turning a picked file into something the media store keeps. Decision note:
// engineering/decisions/2026-10-12-library-media-assets.md §3.
//
// The PLAN functions are pure and unit-tested. `importImage` is the browser half (decode,
// canvas, encode) and is exercised against a real browser, not jsdom — jsdom has no image
// decoder, so a test there would only confirm a stub (HARD RULE #23).
import { isMediaName, type MediaKind, mediaNameFromFile, type NewMedia } from './media-store';

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

/**
 * Decide what to do with a decoded image. Policy:
 *   - JPEG and HEIC/HEIF are ALWAYS re-encoded to JPEG, capped to MAX_IMAGE_EDGE. That is
 *     where a phone's GPS lives, and a canvas re-encode is what removes it from the bytes
 *     every export would otherwise embed.
 *   - PNG and WebP are re-encoded only when over the cap (they are screenshots and logos;
 *     a lossy pass would hurt, and they rarely carry location). They stay in their format,
 *     so transparency survives.
 *   - GIF (may be animated), SVG (vector) and AVIF are stored as given.
 * `width`/`height` are the DISPLAY size: the decoder has already applied EXIF rotation.
 */
export function planImage(mime: string, width: number, height: number): ImagePlan {
	const long = Math.max(width, height);
	const scale = long > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / long : 1;
	const w = Math.max(1, Math.round(width * scale));
	const h = Math.max(1, Math.round(height * scale));
	if (mime === 'image/jpeg' || mime === 'image/heic' || mime === 'image/heif') {
		return { reencode: true, width: w, height: h, mime: 'image/jpeg', downscaled: true };
	}
	if ((mime === 'image/png' || mime === 'image/webp') && scale < 1) {
		return { reencode: true, width: w, height: h, mime, downscaled: true };
	}
	return { reencode: false, width, height, mime, downscaled: false };
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
				: `${file.name} isn't an image this browser can open.`,
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

/** Decode, plan, and (when the plan says so) re-encode. Returns a record ready for
 *  `saveMedia`, minus the name — the caller resolves a clash before it saves. */
export async function importImage(file: File, scope: string): Promise<NewMedia> {
	const mime = mimeOf(file);
	if (mime === 'image/svg+xml') {
		const { width, height } = await intrinsicSize(file);
		return { kind: 'image', name: mediaNameFromFile(file.name, 'image'), scope, blob: file, mime, bytes: file.size, width, height, sourceName: file.name, original: true };
	}
	const bitmap = await decode(file);
	try {
		const plan = planImage(mime, bitmap.width, bitmap.height);
		if (!plan.reencode) {
			return { kind: 'image', name: mediaNameFromFile(file.name, 'image'), scope, blob: file, mime, bytes: file.size, width: plan.width, height: plan.height, sourceName: file.name, original: true };
		}
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
		return { kind: 'image', name: mediaNameFromFile(file.name, 'image'), scope, blob, mime: plan.mime, bytes: blob.size, width: plan.width, height: plan.height, sourceName: file.name, original: false };
	} finally {
		bitmap.close();
	}
}

/** `hero` → `hero-2`, `hero-3`… the first name not in `taken`. Used when a batch of camera-roll
 *  files (`IMG_0042`, `IMG_0042 (1)`) would otherwise refuse each other. */
export function uniqueName(name: string, taken: Set<string>): string {
	if (!taken.has(name)) return name;
	for (let n = 2; n < 1000; n++) {
		const candidate = `${name.slice(0, 44)}-${n}`;
		if (!taken.has(candidate) && isMediaName(candidate)) return candidate;
	}
	return `${name.slice(0, 40)}-${Date.now().toString(36)}`;
}
