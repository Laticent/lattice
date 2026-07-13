// The READ PATH — pure, deterministic, and structurally unable to reach the suggester (this module
// never imports ./suggest). A reader's view is computed ONLY from approved `_lens` tags + the
// registry. This is the whole engine: (slides, registry, lensId) -> ordered slide subset.

import { sha256Hex } from './hash';
import { parseSlideTags } from './tags';
import { FULL_LENS_ID, type LensDef, type LensProjection, type LensRegistry, type LensSlide } from './types';

/** Is this slide a member of this lens? Pure function of the slide's approved tags + the lens base. */
function memberOf(slideSrc: string, lens: LensDef): boolean {
	if (lens.id === FULL_LENS_ID) return true;
	const t = parseSlideTags(slideSrc);
	return lens.base === 'all' ? !t.exclude.has(lens.id) : t.include.has(lens.id);
}

function pairsOf(slides: string[]): LensSlide[] {
	return (Array.isArray(slides) ? slides : [])
		.map((slide, index) => ({ slide, index })) // index = ORIGINAL author position — never reassigned
		.filter((p) => typeof p.slide === 'string');
}

/** The ordered slide subset for a lens, each paired with its original author index. A PREDICATE FILTER
 *  over the author-ordered array — so pairs are unique and monotonic in `index`, and number-keyed
 *  captions stay correct even under reordering (the invariant locked in ./project.test.ts). An unknown
 *  lens id, or `full`, returns the whole deck. Does NOT enforce approval — that is the reader path
 *  below; this is the author-preview / internal projection. Always non-empty inputs => valid output. */
export function lensPairs(slides: string[], reg: LensRegistry, lensId: string): LensSlide[] {
	const all = pairsOf(slides);
	const lens = reg.lenses.find((l) => l.id === lensId);
	if (!lens || lens.id === FULL_LENS_ID) return all;
	const members = all.filter((p) => memberOf(p.slide, lens));
	return lens.single ? members.slice(0, 1) : members;
}

export function lensSlides(slides: string[], reg: LensRegistry, lensId: string): string[] {
	return lensPairs(slides, reg, lensId).map((p) => p.slide);
}

export function lensIndices(slides: string[], reg: LensRegistry, lensId: string): number[] {
	return lensPairs(slides, reg, lensId).map((p) => p.index);
}

/** The content hash bound at Approve. Covers the lens's RESOLVED membership + the member slide bodies +
 *  the base — i.e. exactly what a reader would see. Any later edit, reorder, or hand-forgery changes
 *  the digest, so the lens de-approves itself at read (§6.2). Deliberately does NOT bind the component
 *  catalog version: a reader's tag-driven view must stay stable across reclassification (§4). */
export function approvalHash(slides: string[], reg: LensRegistry, lensId: string): string {
	const pairs = lensPairs(slides, reg, lensId);
	const lens = reg.lenses.find((l) => l.id === lensId);
	const base = lens?.base ?? 'none';
	const body = pairs.map((p) => `${p.index} ${p.slide}`).join('\n');
	return `sha256:${sha256Hex(`${lensId}\n${base}\n${body}`)}`;
}

/** Reader-eligibility. `full` is always eligible; any other lens must carry an `approved` hash that
 *  MATCHES the current content, must not be hidden, and must have at least one member. Returns the
 *  precise reason when ineligible so the reader UI can fail CLOSED and visibly (never silent-to-full). */
export function lensEligibility(slides: string[], reg: LensRegistry, lensId: string): LensProjection {
	const lens = reg.lenses.find((l) => l.id === lensId);
	if (!lens) return { status: 'unavailable', reason: 'unknown' };
	if (lens.id === FULL_LENS_ID) return { status: 'ok', pairs: pairsOf(slides) };
	if (lens.hidden) return { status: 'unavailable', reason: 'hidden' };
	if (!lens.approved) return { status: 'unavailable', reason: 'unapproved' };
	const pairs = lensPairs(slides, reg, lensId);
	if (pairs.length === 0) return { status: 'unavailable', reason: 'empty' };
	if (lens.approved !== approvalHash(slides, reg, lensId)) return { status: 'unavailable', reason: 'drifted' };
	return { status: 'ok', pairs };
}

/** The lenses a READER may actually pick: `full`, plus every lens that is eligible right now. */
export function readerLenses(slides: string[], reg: LensRegistry): LensDef[] {
	return reg.lenses.filter((l) => l.id === FULL_LENS_ID || lensEligibility(slides, reg, l.id).status === 'ok');
}
