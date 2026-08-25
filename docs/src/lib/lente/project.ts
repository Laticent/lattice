// The READ PATH — pure, deterministic, and structurally unable to reach the suggester (this module
// never imports ./suggest). A reader's view is computed ONLY from approved `_lens` tags + the
// registry. This is the whole engine: (slides, registry, lensId) -> ordered slide subset.

import { sha256Hex } from './hash';
import { parseSlideTags } from './tags';
import { FULL_LENS_ID, type LensDef, type LensKind, type LensProjection, type LensRegistry, type LensSlide } from './types';

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
 *  the base — i.e. exactly what a reader would see. Any later edit, reorder, or retag changes the
 *  digest, so the lens de-approves itself at read (§6.2, and the 2026-07-18 correction note in
 *  `engineering/decisions/2026-07-13-lente-reader-lenses.md`). Deliberately does NOT bind the component
 *  catalog version: a reader's tag-driven view must stay stable across reclassification (§4).
 *
 *  The pre-image is an INJECTIVE (JSON) encoding of `[lensId, base, [[index, slide], …]]`. An earlier
 *  scheme joined `${index} ${slide}` records with `\n`, which was NOT injective: a slide body
 *  containing a `\n<index> ` sequence could forge the boundary between two members, so two structurally
 *  different decks collided to the same digest and a drifted deck read as approved (a fail-OPEN hole an
 *  adversarial-trio pass found). `JSON.stringify` escapes control characters and quotes, so distinct
 *  (index, body) lists always map to distinct strings.
 *
 *  What the digest is and is NOT: it binds the reader-visible content, so it detects any DRIFT (edit,
 *  reorder, retag) and de-approves on it. It is an unkeyed SHA-256, so it is NOT a forgery proof — any
 *  actor that can write the deck source can recompute a matching digest. The human-in-the-loop
 *  assurance lives in the Approve gate of the host app (a person clicks Approve), not in the hash. */
export function approvalHash(slides: string[], reg: LensRegistry, lensId: string): string {
	const pairs = lensPairs(slides, reg, lensId);
	const lens = reg.lenses.find((l) => l.id === lensId);
	const base = lens?.base ?? 'none';
	const preimage = JSON.stringify([lensId, base, pairs.map((p) => [p.index, p.slide])]);
	return `sha256:${sha256Hex(preimage)}`;
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

// ── The depth model: rungs, the ladder, and an honest step deeper ───────────────────────────────
// (engineering/decisions/2026-08-25-lens-view-defaults-and-depth.md §4.) Views are two different
// kinds of thing. RUNGS are altitudes in one containment-checked chain — each contains the one below,
// so climbing is guaranteed ADDITIVE and a reader never loses a slide they just read. CUTS are
// arbitrary subsets with no order and no containment; there is no altitude above "the ask", so a cut
// is landed on or handed over, never escalated from.

/** The EFFECTIVE kind of a view, resolving both defaults the field cannot carry: absent means `cut`
 *  (a view that never declared itself a rung promises nothing), and `full` is ALWAYS a rung whatever
 *  its record says — it contains every view by construction, so it terminates every ladder. Callers
 *  read kind through here, never off `lens.kind`, because a registry assembled in code (a test, a
 *  host that builds its own `full` entry) routinely omits it. */
export function lensKind(lens: LensDef): LensKind {
	if (lens.id === FULL_LENS_ID) return 'rung';
	return lens.kind === 'rung' ? 'rung' : 'cut';
}

/** The slides that ESCAPE a containment relation: every member of `innerId`'s projection that
 *  `outerId`'s projection does NOT show, as author indices in ascending order. Empty means
 *  `inner ⊆ outer`. This is the one primitive the whole depth model rests on — the validator reports
 *  what it returns, and `deeperLens` refuses to climb while it is non-empty. Compares PROJECTIONS, not
 *  raw tags, so a `single` view is measured at the one slide a reader actually gets. */
export function lensEscapees(slides: string[], reg: LensRegistry, outerId: string, innerId: string): number[] {
	const outer = new Set(lensIndices(slides, reg, outerId));
	return lensIndices(slides, reg, innerId).filter((i) => !outer.has(i));
}

/** The deck's ONE ladder: every rung ordered by ALTITUDE, narrowest first, with `full` always on top.
 *
 *  Altitude is DERIVED from the projections (member count ascending), not declared, because
 *  containment IS the order — under a sound ladder a lower rung is a strict subset, so it is strictly
 *  smaller. Three things follow, and each is why this is not `order`-driven:
 *   - the chain does not depend on the order the author happened to ADD the views in, nor on a picker
 *     position they re-numbered for display reasons (`LensDef.order` is explicitly not this);
 *   - a ladder that does NOT nest fails in `validateLadder` naming the two views that do not, rather
 *     than presenting as a mystery ordering;
 *   - it stays right while the author is still tagging — a half-tagged rung sits low and rises as it
 *     fills, instead of being wrong until some separate number is updated.
 *  Ties break on registry order, so the result is deterministic for equal-sized rungs. */
export function ladderRungs(slides: string[], reg: LensRegistry): LensDef[] {
	const rungs = reg.lenses.filter((l) => l.id !== FULL_LENS_ID && lensKind(l) === 'rung');
	const size = new Map(rungs.map((l) => [l.id, lensPairs(slides, reg, l.id).length]));
	const pos = new Map(reg.lenses.map((l, i) => [l.id, i]));
	const sorted = [...rungs].sort((a, b) => (size.get(a.id) ?? 0) - (size.get(b.id) ?? 0) || (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
	const full = reg.lenses.find((l) => l.id === FULL_LENS_ID);
	return full ? [...sorted, full] : sorted;
}

/** The next altitude a reader may HONESTLY climb to from `lensId` — the read-path primitive a "go
 *  deeper" affordance is built on. `undefined` means there is nothing honest to offer, which is the
 *  ordinary case and not an error:
 *   - `lensId` is a cut, is unknown, or is already `full` — a cut has no altitude above it (§4.2);
 *   - no rung above it is reader-ELIGIBLE right now (unapproved / drifted / staged / empty);
 *   - no eligible rung above it actually CONTAINS the current view.
 *
 *  It walks UP the ladder and takes the first rung clearing all three, so an unapproved or broken
 *  middle rung is stepped over rather than switching the affordance off — and containment is re-checked
 *  against the CANDIDATE directly, never inferred through the chain, so a ladder `validateLadder` is
 *  complaining about can never produce a "deeper" that drops a slide the reader just read. That is the
 *  fail-CLOSED half: the affordance goes quiet rather than lying.
 *
 *  The superset must be STRICT. A rung projecting exactly the current members is a button promising
 *  more and delivering the same slides; it is skipped, and no diagnostic is needed for it because the
 *  read path already declines to offer it. */
export function deeperLens(slides: string[], reg: LensRegistry, lensId: string): LensDef | undefined {
	const here = reg.lenses.find((l) => l.id === lensId);
	if (!here || here.id === FULL_LENS_ID || lensKind(here) !== 'rung') return undefined;
	const ladder = ladderRungs(slides, reg);
	const at = ladder.findIndex((l) => l.id === lensId);
	if (at < 0) return undefined;
	const mine = lensIndices(slides, reg, lensId).length;
	for (const cand of ladder.slice(at + 1)) {
		if (lensEligibility(slides, reg, cand.id).status !== 'ok') continue;
		if (lensEscapees(slides, reg, cand.id, lensId).length > 0) continue;
		if (lensIndices(slides, reg, cand.id).length <= mine) continue;
		return cand;
	}
	return undefined;
}

/** The lenses a READER may actually pick: `full`, plus every lens that is eligible right now. */
export function readerLenses(slides: string[], reg: LensRegistry): LensDef[] {
	return reg.lenses.filter((l) => l.id === FULL_LENS_ID || lensEligibility(slides, reg, l.id).status === 'ok');
}
