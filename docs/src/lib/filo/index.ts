// Filo — one undo history for every way a document changes.
//
// *Filo* is Italian for "thread": every change leaves a length of thread, and ⌘Z walks back
// along it, whichever view you are in. Framework-free, zero dependencies. The in-memory core is
// slice 2 of engineering/decisions/2026-10-27-filo-undo-history.md; slice 5 adds storage
// (`store.ts`: IndexedDB, one writer per document, Clear all, a cross-document budget) and the
// narrowing of broad patches (`narrow.ts`), which the host runs off the main thread.

import { History, type HistoryOptions } from './history.js';

export type { CommitInput, CommitResult, Entry, HistoryOptions, HistoryState, Limits, Mark, Move, StepInfo } from './history.js';
export { DEFAULT_BYTES, DEFAULT_COALESCE_MS, DEFAULT_ENTRIES, DEFAULT_GROUP_QUIET_MS, History, MAX_ENTRIES } from './history.js';
export { NARROW_MAX_D, NARROW_MIN, narrowPatch, narrowSnapshot } from './narrow.js';
export type { Change, Edit, Patch } from './patch.js';
export { applyPatch, composePatch, hashText, invertPatch, mapPos, patchOf, patchSize, trimPatch } from './patch.js';
export type { Snapshot, SnapshotEntry, SnapshotMark, SnapshotStep } from './snapshot.js';
export { compactHistory, replaySnapshot, restoreSnapshot, toSnapshot } from './snapshot.js';
export type { Backend, Eviction, FiloStore, FiloStoreOptions, StoredIndex } from './store.js';
export { compactSnapshot, createFiloStore, DEFAULT_BUDGET, idbBackend, memoryBackend, planEviction, snapshotBytes } from './store.js';

export interface Filo<M = unknown> {
	/** Open (or return) the history for `doc`. By default it becomes the base: the document the keys
	 *  act on when no modal is pushed (the open deck). A modal editor loads its document with
	 *  `{ activate: false }` and then `push`es it. If the history already exists and its text
	 *  differs from `text`, the difference is recorded as an outside change (`History.sync`). */
	load(doc: string, text: string, opts?: { activate?: boolean }): History<M>;
	/** The history the keys and buttons act on. */
	readonly active: History<M> | null;
	/** Make an already-loaded history active above the base (a modal editor opening). Returns a
	 *  function that removes exactly this scope (the modal closing), whatever opened since. */
	push(doc: string): () => void;
	/** Forget a document's history (a deck deleted). */
	drop(doc: string): void;
	/** Every loaded document id. */
	docs(): string[];
}

export function createFilo<M = unknown>(options: HistoryOptions = {}): Filo<M> {
	const histories = new Map<string, History<M>>();
	// The base is the document `load` opened (the open deck); modal editors stack on top of it.
	// Each push gets its own token, so closing one modal never reactivates another that already
	// closed, and dropping a document removes it from the stack too.
	let base: History<M> | null = null;
	const stack: { token: object; h: History<M> }[] = [];
	return {
		load(doc, text, opts) {
			let h = histories.get(doc);
			if (!h) {
				h = new History<M>(doc, text, options);
				histories.set(doc, h);
			} else h.sync(text); // equal text clears a stale flag; different text records a gap
			if (opts?.activate !== false) base = h;
			return h;
		},
		get active() {
			return stack.length ? stack[stack.length - 1].h : base;
		},
		push(doc) {
			const h = histories.get(doc);
			if (!h) throw new Error(`filo: push('${doc}') before load`);
			const token = {};
			stack.push({ token, h });
			return () => {
				const i = stack.findIndex((e) => e.token === token);
				if (i >= 0) stack.splice(i, 1);
			};
		},
		drop(doc) {
			const h = histories.get(doc);
			histories.delete(doc);
			if (!h) return;
			if (base === h) base = null;
			for (let i = stack.length - 1; i >= 0; i--) if (stack[i].h === h) stack.splice(i, 1);
		},
		docs() {
			return [...histories.keys()];
		},
	};
}
