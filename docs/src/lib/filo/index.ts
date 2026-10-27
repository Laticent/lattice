// Filo — one undo history for every way a document changes.
//
// *Filo* is Italian for "thread": every change leaves a length of thread, and ⌘Z walks back
// along it, whichever view you are in. Framework-free, zero dependencies. This is the in-memory
// core (slice 2 of engineering/decisions/2026-10-27-filo-undo-history.md); persistence, the
// cross-document byte budget and the worker arrive in slice 5.

import { History, type HistoryOptions } from './history';

export type { CommitInput, CommitResult, Entry, HistoryOptions, HistoryState, Limits, Mark, Move } from './history';
export { DEFAULT_BYTES, DEFAULT_COALESCE_MS, DEFAULT_ENTRIES, DEFAULT_GROUP_QUIET_MS, History, MAX_ENTRIES } from './history';
export type { Change, Edit, Patch } from './patch';
export { applyPatch, composePatch, hashText, invertPatch, mapPos, patchOf, patchSize, trimPatch } from './patch';

export interface Filo<M = unknown> {
	/** Open (or return) the history for `doc` and make it the active one. If the history already
	 *  exists and its text differs from `text`, the difference is recorded as an outside change
	 *  (see `History.sync`). */
	load(doc: string, text: string): History<M>;
	/** The history the keys and buttons act on. */
	readonly active: History<M> | null;
	/** Make an already-loaded history active (a modal editor opening), returning a function that
	 *  restores the previous one (the modal closing). */
	push(doc: string): () => void;
	/** Forget a document's history (a deck deleted). */
	drop(doc: string): void;
	/** Every loaded document id. */
	docs(): string[];
}

export function createFilo<M = unknown>(options: HistoryOptions = {}): Filo<M> {
	const histories = new Map<string, History<M>>();
	let active: History<M> | null = null;
	return {
		load(doc, text) {
			let h = histories.get(doc);
			if (!h) {
				h = new History<M>(doc, text, options);
				histories.set(doc, h);
			} else if (h.text !== text) h.sync(text);
			active = h;
			return h;
		},
		get active() {
			return active;
		},
		push(doc) {
			const h = histories.get(doc);
			if (!h) throw new Error(`filo: push('${doc}') before load`);
			const prev = active;
			active = h;
			return () => {
				if (active === h) active = prev;
			};
		},
		drop(doc) {
			const h = histories.get(doc);
			histories.delete(doc);
			if (active === h) active = null;
		},
		docs() {
			return [...histories.keys()];
		},
	};
}
