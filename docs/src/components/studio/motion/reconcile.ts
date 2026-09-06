// REPLACE IS A DIFF, NOT A RESET.
//
// The realistic loop is: paste, choreograph twenty parts, notice one shape is wrong, fix it in
// Illustrator, re-paste. Ids are stable against the SAME bytes — but touching one path shifts its
// siblings, so a fresh intake mints different ids for everything after it and the plan maps onto
// nothing. Silently throwing away twenty parts of someone's work is the §7c data-loss lesson wearing
// a different hat, so Replace stages the new drawing, reconciles, and reports before it commits.
//
// Three rungs, weakest last, because each survives a different kind of edit:
//
//   1. the LABEL — survives a geometry edit, a re-order, and a re-export;
//   2. the STRUCTURAL SIGNATURE (tag + parent chain + geometry prefix) — survives a rename;
//   3. the ORDINAL position among same-tag siblings — the last resort, and only when the tag agrees.

import type { IntakePart } from './svg-intake';

export interface ReconcileEntry {
	/** The part in the NEW drawing, when one matched. */
	next?: IntakePart;
	/** The `pathRef` the old plan was keyed on. */
	previous?: string;
	previousLabel?: string;
	how: 'label' | 'structure' | 'ordinal' | 'new' | 'gone';
}

export interface ReconcileResult {
	entries: ReconcileEntry[];
	/** `oldPathRef → newPathRef`, ready to re-key a plan. */
	remap: Map<string, string>;
	matched: number;
	added: number;
	dropped: number;
	/** Already phrased for the receipt. */
	summary: string;
}

/** What a part looks like structurally, independent of its id. Two parts with the same tag, the same
 *  place in the sibling order and the same label are the same part as far as a human is concerned. */
function signature(p: IntakePart): string {
	return `${p.tag}|${p.band ? 'band' : 'leaf'}|${p.childCount}`;
}

/**
 * Match the parts of a re-pasted drawing to the plan already in hand.
 *
 * Never mutates its inputs, and never drops an entry silently: a part that vanished is reported as
 * `gone` with the label the user gave it, so the receipt can say "1 is gone — its beat was dropped"
 * and offer Cancel.
 */
export function reconcile(previous: IntakePart[], next: IntakePart[]): ReconcileResult {
	const remap = new Map<string, string>();
	const entries: ReconcileEntry[] = [];
	const takenNext = new Set<string>();
	const unmatchedPrev: IntakePart[] = [];

	// Rung 1 — the label. A user-given name is the strongest signal there is, and it survives the
	// geometry edit that broke the ids in the first place.
	const byLabel = new Map<string, IntakePart[]>();
	for (const p of next) {
		const list = byLabel.get(p.label) ?? [];
		list.push(p);
		byLabel.set(p.label, list);
	}
	for (const prev of previous) {
		const candidate = (byLabel.get(prev.label) ?? []).find((c) => !takenNext.has(c.pathRef));
		if (candidate) {
			takenNext.add(candidate.pathRef);
			remap.set(prev.pathRef, candidate.pathRef);
			entries.push({ previous: prev.pathRef, previousLabel: prev.label, next: candidate, how: 'label' });
		} else {
			unmatchedPrev.push(prev);
		}
	}

	// Rung 2 — the structural signature. Survives a rename.
	const stillUnmatched: IntakePart[] = [];
	for (const prev of unmatchedPrev) {
		const candidate = next.find((c) => !takenNext.has(c.pathRef) && signature(c) === signature(prev));
		if (candidate) {
			takenNext.add(candidate.pathRef);
			remap.set(prev.pathRef, candidate.pathRef);
			entries.push({ previous: prev.pathRef, previousLabel: prev.label, next: candidate, how: 'structure' });
		} else {
			stillUnmatched.push(prev);
		}
	}

	// Rung 3 — ordinal position, and only when the tag agrees. Deliberately last: it is the rung most
	// likely to pair two shapes that merely sit in the same slot.
	for (const prev of stillUnmatched) {
		const prevIndex = previous.indexOf(prev);
		const candidate = next[prevIndex];
		if (candidate && !takenNext.has(candidate.pathRef) && candidate.tag === prev.tag) {
			takenNext.add(candidate.pathRef);
			remap.set(prev.pathRef, candidate.pathRef);
			entries.push({ previous: prev.pathRef, previousLabel: prev.label, next: candidate, how: 'ordinal' });
		} else {
			entries.push({ previous: prev.pathRef, previousLabel: prev.label, how: 'gone' });
		}
	}

	for (const p of next) {
		if (!takenNext.has(p.pathRef)) entries.push({ next: p, how: 'new' });
	}

	const matched = remap.size;
	const added = entries.filter((e) => e.how === 'new').length;
	const dropped = entries.filter((e) => e.how === 'gone').length;
	const bits = [`${matched} part${matched === 1 ? '' : 's'} matched`];
	if (added) bits.push(`${added} ${added === 1 ? 'is' : 'are'} new`);
	if (dropped) bits.push(`${dropped} ${dropped === 1 ? 'is' : 'are'} gone — ${dropped === 1 ? 'its beat was' : 'their beats were'} dropped`);
	return { entries, remap, matched, added, dropped, summary: bits.join(', ') };
}

/** Re-key a plan through a remap, dropping entries whose part is gone and leaving new parts to the
 *  caller's default. Pure: the input map is untouched. */
export function remapPlan<T>(plan: Map<string, T>, remap: Map<string, string>): Map<string, T> {
	const out = new Map<string, T>();
	for (const [oldRef, value] of plan) {
		const next = remap.get(oldRef);
		if (next) out.set(next, value);
	}
	return out;
}
