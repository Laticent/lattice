// isStale — which segments of an LTT no longer match their source (engineering/ltt.md §Staleness).
//
// A producer hashes each segment's source (`segmentHashInput`, digested with its own SHA-256) and
// hands the hashes here. This package imports no digest, which is why the caller brings hashes and
// not text: the Studio digests with `crypto.subtle`, Node with `node:crypto`, and both must agree
// on the string, which `segmentHashInput` owns.
//
// THE RULE THIS FUNCTION EXISTS FOR: mark stale, never rebuild measured data. It reports; it never
// edits the file. Each stale segment says whether it holds data that cannot be rebuilt from text
// (`keep`) — a recorded wait, a measured clip length, a `measured` basis — so a caller rebuilds only
// the ones that can be rebuilt, and flags the rest for a producer to re-measure.

import type { LttHash, LttSegment } from './types.js';

/** One segment that no longer matches its source. */
export interface LttStale {
	/** The segment's id. */
	id: string;
	/** `changed`: its source hashes differently now. `gone`: its source no longer names it. */
	reason: 'changed' | 'gone';
	/** True when the segment holds measured data (a recorded wait, a measured clip, a `measured`
	 *  basis) that a rebuild from text would destroy. Keep it, and flag it for re-measuring. */
	keep: boolean;
}

/** Does this segment hold anything a rebuild from text could not reproduce? */
function holdsMeasured(seg: LttSegment): boolean {
	if (seg.kind === 'hold') return false;
	if (seg.basis === 'measured') return true;
	if (seg.kind === 'stretch' && typeof seg.waitedMs === 'number') return true;
	return !!seg.audio?.clips?.some((c) => typeof c.measuredMs === 'number');
}

/**
 * The segments of `ltt` that are stale against `current`: each segment id mapped to the hash of
 * its source NOW. A `hold` segment has no hash (its length depends only on `inputs.deckPace`) and is
 * never stale here. A segment the source no longer names is `gone`.
 *
 * Pure, and it never touches `ltt`: the measured data stays in the file whatever this returns.
 */
export function isStale(ltt: { segments: readonly LttSegment[] }, current: Readonly<Record<string, LttHash>>): LttStale[] {
	const out: LttStale[] = [];
	for (const seg of ltt.segments) {
		if (seg.kind === 'hold') continue;
		const now = Object.hasOwn(current, seg.id) ? current[seg.id] : undefined;
		if (now === seg.hash) continue;
		out.push({ id: seg.id, reason: now === undefined ? 'gone' : 'changed', keep: holdsMeasured(seg) });
	}
	return out;
}
