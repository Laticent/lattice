/**
 * decide — whether a picture is worth re-encoding, and whether the re-encode is worth keeping.
 *
 * Every threshold is the caller's: lastra holds no defaults and no words. (Lattice turns its `images:` line into these
 * numbers in lib/core/image-policy.js.) Only PNG and JPEG are planned: they are the formats a recode decodes and a JPEG
 * replaces; any other format is kept as it is.
 */

import type { ImageInfo } from './read.js';

export interface RecodeThresholds {
	/** Long edge, in pixels, a picture is shrunk to. */
	maxEdge: number;
	/** JPEG quality, 1 to 100, for the re-encode. */
	quality: number;
	/** A file under this many bytes is kept: the saving would be smaller than the noise. */
	minBytes: number;
	/** A format change (PNG to JPEG) must come in under this share of the original. */
	formatShare: number;
	/** A resize or re-encode that keeps the format must come in under this share. */
	sameFormatShare: number;
	/** A JPEG already at or under this many bytes a pixel, at a size that is not shrunk, is kept. */
	tightJpegBytesPerPx: number;
}

/** What a re-encode writes: a JPEG `width` x `height` at `quality`. `checkAlpha`: the header says the picture may be transparent, so the pixels must be checked first (a JPEG paints transparency black). */
export interface RecodePlan {
	width: number;
	height: number;
	quality: number;
	checkAlpha: boolean;
	formatChange: boolean;
}

/**
 * What to do with one picture, or null to keep the file exactly as it is: not a PNG or JPEG, under `minBytes`, stored
 * turned (a phone's portrait: the encoder would squeeze the upright pixels into the sideways box), or a JPEG already tight.
 */
export function planRecode(info: ImageInfo | null, byteLength: number, t: RecodeThresholds): RecodePlan | null {
	if (!info || (info.format !== 'png' && info.format !== 'jpeg') || byteLength < t.minBytes) return null;
	if (info.orientation > 1) return null;
	if (!(info.width > 0 && info.height > 0)) return null;
	const long = Math.max(info.width, info.height);
	const scale = Math.min(1, t.maxEdge / long);
	const width = Math.max(1, Math.round(info.width * scale));
	const height = Math.max(1, Math.round(info.height * scale));
	const resized = scale < 1;
	if (info.format === 'jpeg' && !resized && byteLength / (info.width * info.height) <= t.tightJpegBytesPerPx) return null;
	return { width, height, quality: t.quality, checkAlpha: info.alpha, formatChange: info.format !== 'jpeg' };
}

/** Whether the re-encoded bytes replace the original: smaller by the threshold's share, otherwise the original stays. */
export function acceptRecode(originalLength: number, recodedLength: number, plan: Pick<RecodePlan, 'formatChange'>, t: Pick<RecodeThresholds, 'formatShare' | 'sameFormatShare'>): boolean {
	const share = plan.formatChange ? t.formatShare : t.sameFormatShare;
	return recodedLength > 0 && recodedLength < originalLength * share;
}
