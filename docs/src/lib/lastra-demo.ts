// The Lastra demo page's pipeline (src/pages/libraries/lastra/): one picture's bytes through the REAL
// @laticent/lastra — read the header, strip the metadata, decode, turn upright, resize, encode a JPEG — and
// Lattice's own verdict on it (lib/core/image-policy.js DEFAULTS, the numbers `images: optimized` means).
// Everything here is plain data in and out, so the page only draws and the test runs it in Node.
import { acceptRecode, cleanerFor, displaySize, encodeJpeg, type ImageInfo, lanczosResize, orientationAgreed, planRecode, type RecodeThresholds, readImage } from '@laticent/lastra';
import { applyOrientation, decodeJpeg, decodePng } from '@laticent/lastra/decode';
import imagePolicyCore from '../../../lib/core/image-policy.js';

/** Lattice's thresholds for `images: optimized`: the numbers its exports hand `planRecode` and `acceptRecode`. */
export const LATTICE: RecodeThresholds = (({ maxEdge, quality, minBytes, formatShare, sameFormatShare, tightJpegBytesPerPx }) => ({
	maxEdge,
	quality,
	minBytes,
	formatShare,
	sameFormatShare,
	tightJpegBytesPerPx,
}))(imagePolicyCore.DEFAULTS);

/** The long edges the page offers; 2560 is Lattice's. */
export const EDGES = [640, 1280, 2560] as const;

export interface Reading {
	info: ImageInfo | null;
	/** The size a browser paints, after the EXIF turn. */
	painted: { width: number; height: number } | null;
	/** Whether Chromium, Firefox and WebKit all apply the turn `info` reports. */
	agreed: boolean;
	/** The file without its metadata, or null when lastra has no cleaner for the format or the file does not parse. */
	cleaned: Uint8Array | null;
}

/** Everything lastra reads from the header, and the cleaned file. No pixels are decoded. */
export function readPicture(bytes: Uint8Array): Reading {
	const info = readImage(bytes);
	const clean = info ? cleanerFor(info.mime) : null;
	return {
		info,
		painted: info ? displaySize(info) : null,
		agreed: info ? orientationAgreed(bytes) : false,
		cleaned: clean ? clean(bytes) : null,
	};
}

/**
 * Why Lattice's export keeps a picture exactly as it is, in words, or null when `planRecode` plans a re-encode. The
 * same tests in the same order as `planRecode` (decide.ts); the test holds the two to the same answer.
 */
export function keepReason(info: ImageInfo | null, byteLength: number, t: RecodeThresholds): string | null {
	if (!info) return 'lastra could not read its header';
	if (info.format !== 'png' && info.format !== 'jpeg') return `it is ${info.format.toUpperCase()}, and only PNG and JPEG are re-encoded`;
	if (byteLength < t.minBytes) return `it is under ${Math.round(t.minBytes / 1024)} KB, so the saving would be noise`;
	if (info.orientation > 1) return 'it is stored turned, and the export keeps a turned photo as it is';
	if (!(info.width > 0 && info.height > 0)) return 'its header has no size';
	const long = Math.max(info.width, info.height);
	if (info.format === 'jpeg' && long <= t.maxEdge && byteLength / (info.width * info.height) <= t.tightJpegBytesPerPx) {
		return `it is a JPEG already at ${t.tightJpegBytesPerPx} bytes a pixel or less`;
	}
	return null;
}

/** The output size for a long edge: never larger than the picture. */
export function fitEdge(width: number, height: number, maxEdge: number): { width: number; height: number } {
	const scale = Math.min(1, maxEdge / Math.max(width, height));
	return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export interface Pixels {
	width: number;
	height: number;
	data: Uint8ClampedArray;
}

/** RGBA pixels, upright, for a PNG or JPEG; null for any other format (lastra decodes those two). */
export async function decodeUpright(bytes: Uint8Array, info: ImageInfo): Promise<Pixels | null> {
	const image = info.format === 'jpeg' ? await decodeJpeg(bytes) : info.format === 'png' ? await decodePng(bytes) : null;
	if (!image) return null;
	return applyOrientation(image, info.orientation);
}

export interface Recoded {
	width: number;
	height: number;
	jpeg: Uint8Array;
	/** Whether `acceptRecode` keeps it over the original, at Lattice's shares. */
	accepted: boolean;
}

/** Shrink to `maxEdge` with Lanczos-3 and encode a JPEG at `quality`. */
export function recode(pixels: Pixels, info: ImageInfo, originalLength: number, maxEdge: number, quality: number): Recoded {
	const { width, height } = fitEdge(pixels.width, pixels.height, maxEdge);
	const rgba = width === pixels.width && height === pixels.height ? pixels.data : lanczosResize(pixels.data, pixels.width, pixels.height, width, height);
	const jpeg = encodeJpeg(rgba, width, height, quality);
	return { width, height, jpeg, accepted: acceptRecode(originalLength, jpeg.length, { formatChange: info.format !== 'jpeg' }, LATTICE) };
}

/** What Lattice's export would do with this file, at the page's long edge and quality. */
export function verdict(info: ImageInfo | null, byteLength: number, maxEdge: number, quality: number): { plan: ReturnType<typeof planRecode>; reason: string | null } {
	const t = { ...LATTICE, maxEdge, quality };
	return { plan: planRecode(info, byteLength, t), reason: keepReason(info, byteLength, t) };
}

/** 117307 -> "115 KB"; under 1 KB in bytes. */
export function kb(n: number): string {
	return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
}
