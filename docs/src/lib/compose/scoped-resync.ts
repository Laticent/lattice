// Apply a source change to Compose by changing ONLY the slides it touches, in one transaction, so
// every other slide keeps its node identity (and with it its exact emit bytes), the caret and the
// plugin state (folds). Filo slice 4 (engineering/decisions/2026-10-27-filo-undo-history.md §3.3,
// change 4); proven by the slice 1 spike over 326 decks, 3,890 cases, 0 failures (§10).
// `resyncFrom` (ComposeView.tsx) rebuilds the whole EditorState instead, and stays the fallback.
//
// Two halves:
//   · `scopedResync` / `scopedResyncPatch` — source → transaction. Diffs the new slide chunks
//     against the emit baseline's, re-parses only the changed run, and replaces just that run of
//     slide nodes. The patch-driven form splits and parses only the slides the patch overlaps.
//   · `emitPatch` — the narrow `{ from, to, insert }` between two emits, in source offsets.
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { splitSlides } from '../../components/studio/lint';
import { deckToDoc, type EmitBaseline } from './deck-doc';
import { normalizeSource, parseDeck } from './deck-source';

const SEP = '\n\n---\n\n';

/** The deck source the baseline emits: front matter, then each slide's bytes joined by SEP. */
export function baselineSource(fm: string, raws: readonly string[]): string {
	const body = raws.join(SEP);
	return fm ? fm + body : body;
}

export type ScopedResync = {
	tr: Transaction;
	/** Slides [first, first + removed) of the old doc became [first, first + added) of the new one. */
	first: number;
	removed: number;
	added: number;
	/** Advance the baseline to the doc this transaction produces. Call after it is applied. */
	commit: (doc: PMNode) => void;
};

/**
 * Turn `next` into a transaction that changes only the slides whose bytes differ from the
 * baseline's. Returns null when the baseline does not describe this doc (the caller falls
 * back to a full resync), or when nothing differs.
 */
export function scopedResync(state: EditorState, baseline: EmitBaseline, next: string): ScopedResync | null {
	const doc = state.doc;
	if (baseline.nodes.length !== doc.childCount) return null;
	for (let i = 0; i < doc.childCount; i++) if (baseline.nodes[i] !== doc.child(i)) return null;

	const { fm, slides } = parseDeck(next);
	return resyncToRaws(state, baseline, fm, slides.length ? slides.map((s) => s.raw) : ['']);
}

/** The shared core: move the doc to `nextRaws` (and `fm`), touching only the changed run. */
function resyncToRaws(state: EditorState, baseline: EmitBaseline, fm: string, nextRaws: string[]): ScopedResync | null {
	const doc = state.doc;
	const oldRaws = baseline.raws;
	const oldFm = (doc.attrs.frontMatter as string) || '';

	let head = 0;
	while (head < oldRaws.length && head < nextRaws.length && oldRaws[head] === nextRaws[head]) head++;
	let tail = 0;
	while (tail < oldRaws.length - head && tail < nextRaws.length - head && oldRaws[oldRaws.length - 1 - tail] === nextRaws[nextRaws.length - 1 - tail]) tail++;
	const removed = oldRaws.length - head - tail;
	const added = nextRaws.length - head - tail;
	if (removed === 0 && added === 0 && fm === oldFm) return null;

	let nodes: PMNode[] = [];
	if (added > 0) {
		const parsed = deckToDoc(nextRaws.slice(head, head + added).join(SEP));
		if (parsed.childCount !== added) return null; // a chunk that re-splits differently: full resync
		parsed.forEach((n) => {
			nodes.push(n);
		});
	}

	let from = 0;
	for (let i = 0; i < head; i++) from += doc.child(i).nodeSize;
	let to = from;
	for (let i = head; i < head + removed; i++) to += doc.child(i).nodeSize;

	const tr = state.tr;
	if (removed || added) tr.replaceWith(from, to, nodes);
	if (fm !== oldFm) tr.setDocAttribute('frontMatter', fm);
	nodes = [];
	return {
		tr,
		first: head,
		removed,
		added,
		commit: (newDoc) => {
			const ns: PMNode[] = [];
			newDoc.forEach((n) => {
				ns.push(n);
			});
			baseline.nodes = ns;
			baseline.raws = nextRaws.slice();
		},
	};
}

export type SourcePatch = { from: number; to: number; insert: string };

/**
 * The narrow source patch between two emits, `{ from, to, insert }` in offsets of `before`.
 * Both strings come from cached per-slide bytes (no serializer runs), and the trim is one
 * linear scan, so this is exact and cheap. Null when nothing changed.
 */
export function emitPatch(before: string, after: string): SourcePatch | null {
	if (before === after) return null;
	const min = Math.min(before.length, after.length);
	let p = 0;
	while (p < min && before.charCodeAt(p) === after.charCodeAt(p)) p++;
	let q = 0;
	while (q < min - p && before.charCodeAt(before.length - 1 - q) === after.charCodeAt(after.length - 1 - q)) q++;
	return { from: p, to: before.length - q, insert: after.slice(p, after.length - q) };
}

/**
 * `scopedResync`, driven by a source patch instead of a whole new source: only the slides the
 * patch overlaps are split and parsed, so the cost follows the edit, not the deck. `patch` is
 * in offsets of the baseline's emit. Falls back to the whole-source path (same result, more
 * work) when the patch reaches into the front matter, or when the edited run no longer ends
 * at the next slide's separator (an edit that opened a code fence, say).
 */
export function scopedResyncPatch(state: EditorState, baseline: EmitBaseline, patch: SourcePatch): ScopedResync | null {
	const doc = state.doc;
	if (baseline.nodes.length !== doc.childCount) return null;
	const fm = (doc.attrs.frontMatter as string) || '';
	const raws = baseline.raws;
	const whole = () => {
		const src = baselineSource(fm, raws);
		return scopedResync(state, baseline, src.slice(0, patch.from) + patch.insert + src.slice(patch.to));
	};
	if (patch.from < fm.length) return whole();
	// Slide i occupies [start[i], start[i] + raws[i].length); separators sit between.
	const start: number[] = [];
	let o = fm.length;
	for (const r of raws) {
		start.push(o);
		o += r.length + SEP.length;
	}
	let first = 0;
	while (first + 1 < raws.length && start[first + 1] <= patch.from) first++;
	let last = first;
	while (last + 1 < raws.length && start[last] + raws[last].length < patch.to) last++;
	const regionStart = start[first];
	const regionEnd = start[last] + raws[last].length;
	const region = baselineSource('', raws.slice(first, last + 1));
	if (patch.to > regionEnd) return whole(); // cannot happen with the run chosen above; a guard, not a path
	const edited = normalizeSource(region.slice(0, patch.from - regionStart) + patch.insert + region.slice(patch.to - regionStart));
	// Split as the whole deck would: a run that does not open the deck must not have a blank
	// first chunk dropped, so it is split behind a sentinel slide.
	const split = first === 0 ? splitSlides(edited) : splitSlides(`x${SEP}${edited}`).slice(1);
	const mid = split.length || first > 0 || last < raws.length - 1 ? split : [''];
	// The run must still end at the next slide's separator.
	if (last + 1 < raws.length) {
		const probe = splitSlides(`${mid[mid.length - 1] ?? 'x'}${SEP}${raws[last + 1]}`);
		if (probe.length !== 2 || probe[1] !== raws[last + 1]) return whole();
	}
	return resyncToRaws(state, baseline, fm, [...raws.slice(0, first), ...mid, ...raws.slice(last + 1)]);
}
