// One document's history: a linear thread of patches, undone and redone synchronously.
//
// The model (engineering/decisions/2026-10-27-filo-undo-history.md §2, §4):
//   · An ENTRY is one recorded change: a patch, a label, an origin, the caret offsets around it.
//   · A STEP is what one ⌘Z undoes: one entry, or a group of entries (typing that coalesced, a
//     batch, a slider drag). The entry cap counts steps.
//   · Filo keeps the current text, so every undo and redo lands on an exact earlier text, its
//     caret offsets are exact, and the patch it hands back is one narrow change.
//   · The FLOOR is a full copy of the text at the oldest retained step. Steps past the caps fold
//     into it. A MARK names a point; a mark whose point folded keeps an ANCHOR, a patch from the
//     floor to its text, so it still restores.
//   · A change made outside this history (`sync`) becomes one GAP entry on the next undo, and
//     that undo stops there: an old patch is never applied to text it was not recorded against.

import { applyPatch, composePatch, type Edit, invertPatch, type Patch, patchOf, patchSize, trimPatch } from './patch';

export const DEFAULT_ENTRIES = 100;
export const MAX_ENTRIES = 500;
export const DEFAULT_BYTES = 2_000_000;
export const DEFAULT_COALESCE_MS = 500;
export const DEFAULT_GROUP_QUIET_MS = 2_000;

export interface Limits {
	/** Undo steps kept per document. Default 100; clamped to [1, 500]. */
	readonly entries?: number;
	/** Characters of patches (and mark anchors) kept per document. Default 2,000,000. The floor
	 *  copy and the newest step are exempt, so one oversized change stays one ⌘Z away. */
	readonly bytes?: number;
}

export interface HistoryOptions {
	readonly limits?: Limits;
	/** Typing within this many ms (same origin, same label, adjacent offset) joins one step. */
	readonly coalesceMs?: number;
	/** An open group with no commit for this long closes on its own (a drag whose pointer-up
	 *  never arrived must not swallow later typing). */
	readonly groupQuietMs?: number;
	/** True when a boundary the host cares about (a slide break) lies between two offsets of
	 *  `text`. Typing never coalesces across one. Filo itself knows nothing about slides. */
	readonly boundary?: (a: number, b: number, text: string) => boolean;
	/** Clock, injectable for tests. */
	readonly now?: () => number;
}

export interface Entry<M = unknown> {
	readonly id: number;
	readonly patch: Patch;
	readonly label: string;
	readonly origin: string;
	/** Caret offset in the text before / after this entry. */
	readonly before: number;
	readonly after: number;
	readonly ts: number;
	readonly meta?: M;
}

interface Step<M> {
	label: string;
	origin: string;
	/** The step's whole change: the text before the step to the text after it. A coalesced run of
	 *  2,000 keystrokes is still one patch, so an undo is one apply, not 2,000. */
	net: Patch;
	/** The first and last entries, for the caret and for deciding what joins. */
	first: Entry<M>;
	last: Entry<M>;
	size: number;
	/** A group still accepting commits (a batch, a drag, typing that may coalesce). */
	open: 'typing' | 'explicit' | null;
}

export interface Mark {
	readonly id: number;
	readonly label: string;
	readonly ts: number;
	readonly auto: boolean;
}
interface MarkRec extends Mark {
	/** The step count from the floor this mark sits at, or null once folded (then `anchor`). */
	at: number | null;
	anchor: Patch | null;
}

export interface CommitInput<M = unknown> {
	/** `head` as the writer last saw it. A commit against an older head is refused. */
	readonly base: number;
	/** The change, as edits against Filo's current text. Give this or `next`. */
	readonly edits?: readonly Edit[];
	/** The whole new text, when the writer has no precise change (an AI apply, an import). */
	readonly next?: string;
	readonly label: string;
	readonly origin: string;
	readonly before?: number;
	readonly after?: number;
	readonly meta?: M;
}

export type CommitResult = { ok: true; id: number } | { ok: false; reason: 'stale' | 'noop' };

/** What an undo or redo hands the host: the one change to apply, the text it produces, and where
 *  to put the caret. `gap` says this step recorded an outside change instead of undoing one. */
export interface Move {
	readonly patch: Patch;
	readonly text: string;
	/** Where to put the caret, or null to leave it where it is (a restore that changed nothing). */
	readonly caret: number | null;
	readonly label: string;
	readonly origin: string;
	readonly gap?: boolean;
}

export interface HistoryState {
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	readonly head: number;
	readonly undoLabel: string | null;
	readonly redoLabel: string | null;
	readonly steps: number;
	readonly stale: boolean;
}

type Listener = () => void;

export class History<M = unknown> {
	readonly doc: string;
	private text_: string;
	private floor: string;
	private done: Step<M>[] = [];
	private undone: Step<M>[] = [];
	private marks_: MarkRec[] = [];
	private nextId = 1;
	private nextMarkId = 1;
	private outside: string | null = null; // text a `sync` reported that this history did not record
	private batchDepth = 0;
	private readonly entryCap: number;
	private readonly byteCap: number;
	private readonly coalesceMs: number;
	private readonly groupQuietMs: number;
	private readonly boundary?: (a: number, b: number, text: string) => boolean;
	private readonly now: () => number;
	private readonly listeners = new Set<Listener>();
	private bytes = 0;

	constructor(doc: string, text: string, opts: HistoryOptions = {}) {
		this.doc = doc;
		this.text_ = text;
		this.floor = text;
		const e = Math.round(opts.limits?.entries ?? DEFAULT_ENTRIES);
		this.entryCap = Math.min(MAX_ENTRIES, Math.max(1, Number.isFinite(e) ? e : DEFAULT_ENTRIES));
		this.byteCap = Math.max(0, opts.limits?.bytes ?? DEFAULT_BYTES);
		this.coalesceMs = opts.coalesceMs ?? DEFAULT_COALESCE_MS;
		this.groupQuietMs = opts.groupQuietMs ?? DEFAULT_GROUP_QUIET_MS;
		this.boundary = opts.boundary;
		this.now = opts.now ?? (() => Date.now());
	}

	/** The text as this history knows it. */
	get text(): string {
		return this.text_;
	}
	/** The id of the newest step's last entry still applied; 0 for none. */
	get head(): number {
		const last = this.done[this.done.length - 1];
		return last ? last.last.id : 0;
	}
	/** The entry cap in force (after clamping). */
	get entryLimit(): number {
		return this.entryCap;
	}

	state(): HistoryState {
		const u = this.done[this.done.length - 1];
		const r = this.undone[this.undone.length - 1];
		return {
			canUndo: !!u || this.outside !== null,
			canRedo: !!r && this.outside === null,
			head: this.head,
			undoLabel: this.outside !== null ? 'Changed outside this history' : (u?.label ?? null),
			redoLabel: this.outside === null ? (r?.label ?? null) : null,
			steps: this.done.length,
			stale: this.outside !== null,
		};
	}

	// ── Recording ─────────────────────────────────────────────────────────────

	commit(input: CommitInput<M>): CommitResult {
		if (input.base !== this.head) return { ok: false, reason: 'stale' };
		if (this.outside !== null) this.recordGap();
		let patch: Patch;
		if (input.edits) patch = patchOf(this.text_, input.edits);
		else if (input.next !== undefined) patch = trimPatch(this.text_, input.next);
		else throw new TypeError('filo: commit needs `edits` or `next`');
		const prevText = this.text_;
		const nextText = patch.length ? applyPatch(prevText, patch) : prevText;
		// An edit that rewrites text with itself changes nothing: recording it would leave an undo
		// step that visibly does nothing (§3.4).
		if (nextText === prevText) return { ok: false, reason: 'noop' };
		const ts = this.now();
		const entry: Entry<M> = {
			id: this.nextId++,
			patch,
			label: input.label,
			origin: input.origin,
			before: input.before ?? patch[0].from,
			after: input.after ?? afterOffset(patch),
			ts,
			meta: input.meta,
		};
		this.dropRedo(prevText);
		this.text_ = nextText;
		const last = this.done[this.done.length - 1];
		if (last && this.joins(last, entry, prevText)) {
			// The step's net change: from the text before the step to the text now.
			const net = composePatch(last.net, patch, prevText, nextText);
			if (net.length === 0) {
				// Typed and taken back within one step: the step changes nothing, so it goes. An undo
				// that visibly does nothing is a bug (§3.4).
				this.done.pop();
				this.bytes -= last.size;
			} else {
				const size = patchSize(net);
				this.bytes += size - last.size;
				last.net = net;
				last.size = size;
				last.last = entry;
			}
		} else {
			if (last) last.open = null;
			const grouped = this.groupLabel !== null;
			if (grouped) this.groupOrigin = input.origin;
			const size = patchSize(patch);
			this.done.push({ label: grouped ? (this.groupLabel as string) : input.label, origin: input.origin, net: patch, first: entry, last: entry, size, open: grouped ? 'explicit' : 'typing' });
			this.bytes += size;
		}
		this.enforceLimits();
		this.emit();
		return { ok: true, id: entry.id };
	}

	private groupLabel: string | null = null;
	/** The origin of the first commit in the open explicit group: a commit from another origin
	 *  ends a drag (§2.1), so typing that follows a slider is never undone with it. */
	private groupOrigin: string | null = null;

	/** Open a group: every commit until `closeGroup` is one step (a slider drag). */
	openGroup(label: string): void {
		this.closeGroup();
		this.groupLabel = label;
	}

	private guardBatch(what: string): void {
		if (this.batchDepth > 0) throw new TypeError(`filo: ${what}() inside batch() would split the batch into several steps. Call it outside.`);
	}

	/** End the open group or typing run, so the next commit starts a new step. */
	closeGroup(): void {
		this.groupLabel = null;
		this.groupOrigin = null;
		const last = this.done[this.done.length - 1];
		if (last) last.open = null;
	}

	/**
	 * Run `fn`; every commit it makes is one step labeled `label`. `fn` must be synchronous: an
	 * async batch would hold the group open while the author types, and that typing would be
	 * undone with it. Collect an async result first, then commit once.
	 */
	batch<T>(label: string, fn: () => T): T {
		const outer = this.batchDepth === 0;
		if (outer) this.openGroup(label);
		this.batchDepth++;
		let result: T;
		try {
			result = fn();
		} finally {
			this.batchDepth--;
			if (outer) this.closeGroup();
		}
		if (result && typeof (result as { then?: unknown }).then === 'function') {
			throw new TypeError('filo: batch() was given an async function. Await the work first, then commit once.');
		}
		return result;
	}

	private joins(last: Step<M>, entry: Entry<M>, prevText: string): boolean {
		const prev = last.last;
		if (this.groupLabel !== null) {
			// An explicit group (a batch, a drag): join while it stays open and not quiet too long.
			if (last.open !== 'explicit') return false;
			if (this.batchDepth === 0 && (entry.ts - prev.ts > this.groupQuietMs || entry.origin !== this.groupOrigin)) {
				// A drag whose pointer-up never came, or another source writing: end the group here.
				this.groupLabel = null;
				this.groupOrigin = null;
				return false;
			}
			return true;
		}
		// Typing: same origin and label, soon after, next to the last edit, no boundary between.
		if (last.open !== 'typing') return false;
		if (prev.origin !== entry.origin || prev.label !== entry.label) return false;
		if (entry.ts - prev.ts > this.coalesceMs) return false;
		const at = entry.patch[0].from;
		if (Math.abs(at - prev.after) > 1) return false;
		if (this.boundary?.(Math.min(at, prev.after), Math.max(at, prev.after), prevText)) return false;
		return true;
	}

	// ── Undo / redo ───────────────────────────────────────────────────────────

	undo(): Move | null {
		this.guardBatch('undo');
		if (this.outside !== null) {
			// Record the outside change as one step, and stop: the next ⌘Z undoes it.
			this.recordGap();
			const step = this.done[this.done.length - 1];
			const entry = step.first;
			this.emit();
			return { patch: [], text: this.text_, caret: entry.after, label: entry.label, origin: 'gap', gap: true };
		}
		const step = this.done.pop();
		if (!step) return null;
		step.open = null;
		this.groupLabel = null;
		this.groupOrigin = null;
		const before = this.text_;
		let text = before;
		text = applyPatch(text, invertPatch(step.net));
		this.text_ = text;
		this.undone.push(step);
		this.emit();
		return { patch: trimPatch(before, text), text, caret: step.first.before, label: step.label, origin: step.origin };
	}

	redo(): Move | null {
		this.guardBatch('redo');
		if (this.outside !== null) return null;
		const step = this.undone.pop();
		if (!step) return null;
		const before = this.text_;
		let text = before;
		text = applyPatch(text, step.net);
		this.text_ = text;
		this.done.push(step);
		this.emit();
		return { patch: trimPatch(before, text), text, caret: step.last.after, label: step.label, origin: step.origin };
	}

	/**
	 * The host's text moved without a commit (a live session ended, a write that bypassed the
	 * commit path, a file changed on disk). Nothing is recorded yet: the next undo records the
	 * difference as one step and stops there, and the next commit records it first.
	 */
	sync(text: string): void {
		if (text === this.text_) {
			if (this.outside !== null) {
				this.outside = null;
				this.emit();
			}
			return;
		}
		this.outside = text;
		this.emit();
	}

	private recordGap(): void {
		const outside = this.outside;
		if (outside === null) return;
		this.outside = null;
		const prevText = this.text_;
		const patch = trimPatch(prevText, outside);
		this.dropRedo(prevText);
		const entry: Entry<M> = {
			id: this.nextId++,
			patch,
			label: 'Changed outside this history',
			origin: 'gap',
			before: patch[0]?.from ?? 0,
			after: afterOffset(patch),
			ts: this.now(),
		};
		this.text_ = outside;
		const size = patchSize(patch);
		this.done.push({ label: entry.label, origin: 'gap', net: patch, first: entry, last: entry, size, open: null });
		this.bytes += size;
		this.enforceLimits();
	}

	// ── Marks (named versions) ────────────────────────────────────────────────

	/** Name the current point. Returns the mark's id. */
	mark(label: string): number {
		// A mark names a fixed point: an open typing run or drag would carry it forward with the
		// next keystroke (and an emptied run would leave it past the end of the thread), and an
		// outside change not yet recorded would leave it naming text the author no longer sees.
		this.closeGroup();
		this.recordGap();
		return this.addMark(label, false, this.done.length, null);
	}

	marks(): Mark[] {
		return this.marks_.map(({ id, label, ts, auto }) => ({ id, label, ts, auto })).sort((a, b) => b.ts - a.ts || b.id - a.id);
	}

	/** The text a mark names. */
	markText(id: number): string | null {
		const m = this.marks_.find((x) => x.id === id);
		if (!m) return null;
		return this.textOfMark(m);
	}

	/** Go back to a mark, as one new step (so the restore itself can be undone). */
	restore(id: number, label?: string): Move | null {
		this.guardBatch('restore');
		const m = this.marks_.find((x) => x.id === id);
		if (!m) return null;
		// Record any outside change FIRST, so the patch handed back is against the text the host
		// actually shows.
		this.recordGap();
		this.closeGroup();
		const target = this.textOfMark(m);
		const before = this.text_;
		const name = label ?? `Restored "${m.label}"`;
		const r = this.commit({ base: this.head, next: target, label: name, origin: 'restore' });
		this.closeGroup();
		if (!r.ok) return { patch: [], text: this.text_, caret: null, label: name, origin: 'restore' };
		const patch = trimPatch(before, target);
		return { patch, text: target, caret: patch[0]?.from ?? 0, label: name, origin: 'restore' };
	}

	removeMark(id: number): void {
		const i = this.marks_.findIndex((m) => m.id === id);
		if (i < 0) return;
		const [m] = this.marks_.splice(i, 1);
		if (m.anchor) this.bytes -= patchSize(m.anchor);
		this.emit();
	}

	private addMark(label: string, auto: boolean, at: number | null, anchor: Patch | null): number {
		const id = this.nextMarkId++;
		this.marks_.push({ id, label, ts: this.now(), auto, at, anchor });
		if (anchor) this.bytes += patchSize(anchor);
		this.emit();
		return id;
	}

	/** Step i of the thread from the floor: the applied steps, then the undone ones in redo order. */
	private threadStep(i: number): Step<M> {
		return i < this.done.length ? this.done[i] : this.undone[this.undone.length - 1 - (i - this.done.length)];
	}

	private textAtStep(n: number): string {
		let text = this.floor;
		for (let i = 0; i < n; i++) text = applyPatch(text, this.threadStep(i).net);
		return text;
	}

	/** Re-anchor every mark that points past step `n` of the thread to the floor, before those
	 *  steps go (a dropped redo branch). Marks are never dropped silently. */
	private detachMarksBeyond(n: number): void {
		for (const m of this.marks_) {
			if (m.at === null || m.at <= n) continue;
			const text = this.textOfMark(m);
			if (m.anchor) this.bytes -= patchSize(m.anchor);
			m.anchor = trimPatch(this.floor, text);
			m.at = null;
			this.bytes += patchSize(m.anchor);
		}
	}

	private textOfMark(m: MarkRec): string {
		if (m.anchor) return applyPatch(m.at === null ? this.floor : this.textAtStep(m.at), m.anchor);
		return this.textAtStep(m.at ?? 0);
	}

	/** Typing after an undo drops the redo branch; keep its tip as one automatic mark. */
	private dropRedo(forkText: string): void {
		if (this.undone.length === 0) return;
		let tip = forkText;
		for (let i = this.undone.length - 1; i >= 0; i--) tip = applyPatch(tip, this.undone[i].net);
		const n = this.undone.length;
		this.detachMarksBeyond(this.done.length);
		for (const s of this.undone) this.bytes -= s.size;
		this.undone = [];
		for (const old of this.marks_.filter((m) => m.auto)) this.removeMarkSilently(old.id);
		this.addMark(`Before you undid ${n} change${n === 1 ? '' : 's'}`, true, this.done.length, trimPatch(forkText, tip));
	}

	private removeMarkSilently(id: number): void {
		const i = this.marks_.findIndex((m) => m.id === id);
		if (i < 0) return;
		const [m] = this.marks_.splice(i, 1);
		if (m.anchor) this.bytes -= patchSize(m.anchor);
	}

	// ── Limits ────────────────────────────────────────────────────────────────

	private enforceLimits(): void {
		while (this.done.length > this.entryCap) this.foldOldest();
		// The byte cap: fold the oldest steps first, then give up the far end of the redo branch.
		// The newest step and the floor are exempt; mark anchors count but are never dropped.
		while (this.bytes > this.byteCap) {
			if (this.done.length > 1) this.foldOldest();
			else if (this.undone.length) {
				this.detachMarksBeyond(this.done.length + this.undone.length - 1);
				const s = this.undone.shift();
				if (s) this.bytes -= s.size;
			} else break;
		}
	}

	/** Fold the oldest step into the floor, re-anchoring every mark that pointed into it. */
	private foldOldest(): void {
		const step = this.done.shift();
		if (!step) return;
		const oldFloor = this.floor;
		let newFloor = oldFloor;
		newFloor = applyPatch(newFloor, step.net);
		for (const m of this.marks_) {
			let text: string | null = null;
			if (m.at === null) text = applyPatch(oldFloor, m.anchor ?? []);
			else if (m.at === 0) text = m.anchor ? applyPatch(oldFloor, m.anchor) : oldFloor;
			if (text !== null) {
				if (m.anchor) this.bytes -= patchSize(m.anchor);
				m.anchor = trimPatch(newFloor, text);
				m.at = null;
				this.bytes += patchSize(m.anchor);
			} else if (m.at !== null) m.at -= 1;
		}
		this.floor = newFloor;
		this.bytes -= step.size;
	}

	// ── Subscriptions ─────────────────────────────────────────────────────────

	/** Hear changes to `select(state)`. Called synchronously, only when the selected value changes. */
	subscribe<T>(select: (s: HistoryState) => T, listener: (value: T) => void): () => void {
		let prev = select(this.state());
		const fn = () => {
			const next = select(this.state());
			if (Object.is(next, prev)) return;
			prev = next;
			listener(next);
		};
		this.listeners.add(fn);
		return () => this.listeners.delete(fn);
	}

	private emit(): void {
		for (const fn of this.listeners) fn();
	}

	/** Characters held by patches and anchors, the figure the byte cap counts. */
	get size(): number {
		return this.bytes;
	}
}

function afterOffset(patch: Patch): number {
	let shift = 0;
	let after = 0;
	for (const c of patch) {
		after = c.from + shift + c.insert.length;
		shift += c.insert.length - (c.to - c.from);
	}
	return after;
}
