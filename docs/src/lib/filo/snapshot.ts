// Filo's storage half: a history as plain data and back (slice 5 of
// engineering/decisions/2026-10-27-filo-undo-history.md, §5). Functions over a History rather than
// methods on it, so an app that only keeps history in memory (the Studio before its first idle
// write) does not carry them: the Studio loads this module after its first paint.
//
// They reach the history's internals through `Inner`, which mirrors History's private fields and
// methods. history.ts and this file change together.

import type { Entry, History, Mark } from './history.js';
import { applyPatch, hashText, type Patch, patchSize } from './patch.js';

/** One step as stored. Entries keep their caret offsets and ids, not their patches: a stored step
 *  is closed, so only its net patch is ever applied again. */
export interface SnapshotStep {
	readonly label: string;
	readonly origin: string;
	readonly net: Patch;
	readonly first: SnapshotEntry;
	readonly last: SnapshotEntry;
}
export interface SnapshotEntry {
	readonly id: number;
	readonly label: string;
	readonly origin: string;
	readonly before: number;
	readonly after: number;
	readonly ts: number;
}
export interface SnapshotMark extends Mark {
	readonly at: number | null;
	readonly anchor: Patch | null;
}

/**
 * A history as plain data, for storage (structured-clone and JSON safe). `hash` is the cyrb53 hash
 * of `text`, so a host can compare it with the document it holds without replaying anything.
 * Restoring replays the floor through every done step and refuses a snapshot whose replay does not
 * land on `text`: a stack is never applied to text it was not recorded against.
 */
export interface Snapshot {
	readonly v: 1;
	readonly doc: string;
	readonly text: string;
	readonly hash: number;
	readonly floor: string;
	readonly done: readonly SnapshotStep[];
	/** The redo branch, newest undone last (the order `redo` pops). */
	readonly undone: readonly SnapshotStep[];
	readonly marks: readonly SnapshotMark[];
	readonly nextId: number;
	readonly nextMarkId: number;
}


interface InnerStep {
	label: string;
	origin: string;
	net: Patch;
	first: Entry<unknown>;
	last: Entry<unknown>;
	size: number;
	open: 'typing' | 'explicit' | null;
}
interface InnerMark extends Mark {
	at: number | null;
	anchor: Patch | null;
}
/** History's private state and methods, as this module uses them. */
interface Inner {
	readonly doc: string;
	text_: string;
	floor: string;
	done: InnerStep[];
	undone: InnerStep[];
	marks_: InnerMark[];
	nextId: number;
	nextMarkId: number;
	outside: string | null;
	groupLabel: string | null;
	groupOrigin: string | null;
	bytes: number;
	guardBatch(what: string): void;
	enforceLimits(): void;
	emit(): void;
	recordGap(): void;
	closeGroup(): void;
	detachMarksBeyond(n: number): void;
	foldOldest(): void;
}
const inner = (h: History<unknown>): Inner => h as unknown as Inner;

const entryRec = (e: Entry<unknown>): SnapshotEntry => ({ id: e.id, label: e.label, origin: e.origin, before: e.before, after: e.after, ts: e.ts });
const entryOf = (e: SnapshotEntry): Entry<unknown> => ({ ...e, patch: [] });

/**
 * `h` as plain data. The strings and patches are shared, not copied, so it is cheap to take on
 * every save; the storage layer clones it. An outside change not yet recorded is not in it: the
 * snapshot names the text the history recorded, and the host's own comparison on load finds the
 * difference again.
 */
export function toSnapshot<M>(h: History<M>): Snapshot {
	const x = inner(h as History<unknown>);
	const step = (s: InnerStep): SnapshotStep => ({ label: s.label, origin: s.origin, net: s.net, first: entryRec(s.first), last: entryRec(s.last) });
	return {
		v: 1,
		doc: x.doc,
		text: x.text_,
		hash: hashText(x.text_),
		floor: x.floor,
		done: x.done.map(step),
		undone: x.undone.map(step),
		marks: x.marks_.map(({ id, label, ts, auto, at, anchor }) => ({ id, label, ts, auto, at, anchor })),
		nextId: x.nextId,
		nextMarkId: x.nextMarkId,
	};
}

/**
 * Replace `h`'s thread with `snap`'s, in place, so every subscriber and every writer's reference
 * stays valid. Returns false and changes nothing when the snapshot is for another document,
 * malformed, or does not replay to its own text. The history's caps apply to the restored thread.
 * The host decides what to do about any difference between the restored text and the document it
 * shows (commit it, or `sync` it as an outside change). `verified` skips the replay for a snapshot
 * the host already checked with `replaySnapshot` (in a worker).
 */
export function restoreSnapshot<M>(h: History<M>, snap: Snapshot, opts: { verified?: boolean } = {}): boolean {
	const x = inner(h as History<unknown>);
	x.guardBatch('restoreSnapshot');
	// Replaying the thread checks every step against the text it was recorded on. On a long history
	// that costs more than one frame, so a host may run `replaySnapshot` off the main thread first
	// and pass `verified`; the cheap checks still run here.
	if (opts.verified) {
		if (!snap || snap.v !== 1 || snap.doc !== x.doc || typeof snap.text !== 'string' || hashText(snap.text) !== snap.hash) return false;
	} else if (!replaySnapshot(snap, x.doc)) return false;
	const step = (s: SnapshotStep): InnerStep => ({ label: s.label, origin: s.origin, net: s.net, first: entryOf(s.first), last: entryOf(s.last), size: patchSize(s.net), open: null });
	x.text_ = snap.text;
	x.floor = snap.floor;
	x.done = snap.done.map(step);
	x.undone = snap.undone.map(step);
	x.marks_ = snap.marks.map((m) => ({ ...m }));
	x.nextId = Math.max(snap.nextId, x.nextId);
	x.nextMarkId = Math.max(snap.nextMarkId, x.nextMarkId);
	x.outside = null;
	x.groupLabel = null;
	x.groupOrigin = null;
	x.bytes = 0;
	for (const s of x.done) x.bytes += s.size;
	for (const s of x.undone) x.bytes += s.size;
	for (const m of x.marks_) if (m.anchor) x.bytes += patchSize(m.anchor);
	x.enforceLimits();
	x.emit();
	return true;
}

/**
 * Fold every step of `h` into the floor and drop the redo branch, keeping every mark
 * (re-anchored). What a storage budget does to a deck before it gives up its history (§4.4).
 */
export function compactHistory<M>(h: History<M>): void {
	const x = inner(h as History<unknown>);
	x.guardBatch('compact');
	x.recordGap();
	x.closeGroup();
	if (x.undone.length) {
		x.detachMarksBeyond(x.done.length);
		for (const s of x.undone) x.bytes -= s.size;
		x.undone = [];
	}
	while (x.done.length) x.foldOldest();
	x.emit();
}

/** Every text `snap`'s thread passes through, from the floor: the done steps, then the redo branch
 *  in replay order. Null when the snapshot is malformed or its replay misses its own text. */
export function replaySnapshot(snap: Snapshot, doc?: string): string[] | null {
	try {
		if (!snap || snap.v !== 1 || (doc !== undefined && snap.doc !== doc)) return null;
		if (typeof snap.text !== 'string' || typeof snap.floor !== 'string' || !Array.isArray(snap.done) || !Array.isArray(snap.undone) || !Array.isArray(snap.marks)) return null;
		if (hashText(snap.text) !== snap.hash) return null;
		const texts = [snap.floor];
		let text = snap.floor;
		const step = (s: SnapshotStep) => {
			if (!fits(text, s.net)) throw new Error('filo: a stored step does not fit its text');
			texts.push((text = applyPatch(text, s.net)));
		};
		for (const s of snap.done) step(s);
		if (text !== snap.text) return null;
		for (let i = snap.undone.length - 1; i >= 0; i--) step(snap.undone[i]);
		for (const m of snap.marks) if (m.at !== null && (m.at < 0 || m.at >= texts.length)) return null;
		return texts;
	} catch {
		return null;
	}
}

/** True when every change of `patch` is in order, inside `text`, and deletes exactly the text it
 *  says it deletes: the patch was recorded against this text. */
function fits(text: string, patch: Patch): boolean {
	if (!Array.isArray(patch)) return false;
	let pos = 0;
	for (const c of patch) {
		if (!Number.isInteger(c.from) || !Number.isInteger(c.to) || c.from < pos || c.to < c.from || c.to > text.length) return false;
		if (typeof c.insert !== 'string' || text.slice(c.from, c.to) !== c.deleted) return false;
		pos = c.to;
	}
	return true;
}
