// Narrowing broad patches: the work that never runs on the main thread (§4.3).
//
// A broad change (an AI apply, an import, a restore, an outside change) is committed as ONE
// trimmed replace: everything between the first and the last character that differ. That needs no
// diff, so it is cheap at commit time, but an AI pass that edits slides 2 and 40 stores the whole
// deck between them twice (the inserted text and the deleted text). Before a history is stored,
// the host runs `narrowSnapshot` off the main thread (the Studio uses a worker), which splits each
// broad change into the lines that actually changed. The narrowed patch applies to exactly the
// same text with exactly the same result; `narrowSnapshot` checks that for every step it touches
// and keeps the original step when the check fails.
//
// The diff is Myers' O(ND) on lines, bounded: past `maxD` edits it gives up and keeps the change
// as it was (two unrelated decks have nothing to narrow, and the bound keeps that case cheap).

import { applyPatch, type Change, type Patch } from './patch.js';
import { replaySnapshot, type Snapshot, type SnapshotStep } from './snapshot.js';

/** A change narrower than this many characters (deleted plus inserted) is left alone. */
export const NARROW_MIN = 1024;
/** The line diff gives up past this many inserted plus deleted lines. */
export const NARROW_MAX_D = 2000;

/** Split `s` into lines, each keeping its own line break, so the pieces join back to `s`. */
function lines(s: string): string[] {
	const out: string[] = [];
	let at = 0;
	for (;;) {
		const nl = s.indexOf('\n', at);
		if (nl < 0) break;
		out.push(s.slice(at, nl + 1));
		at = nl + 1;
	}
	if (at < s.length) out.push(s.slice(at));
	return out;
}

/** Myers' greedy diff of two line arrays, as matched [i, j] runs. Null past `maxD` edits. */
function matches(a: string[], b: string[], maxD: number): Array<[number, number]> | null {
	const n = a.length;
	const m = b.length;
	const max = Math.min(n + m, maxD);
	const off = max + 1;
	const v = new Int32Array(2 * max + 3);
	const trace: Int32Array[] = [];
	let end = -1;
	for (let d = 0; d <= max; d++) {
		trace.push(v.slice());
		for (let k = -d; k <= d; k += 2) {
			let x = k === -d || (k !== d && v[off + k - 1] < v[off + k + 1]) ? v[off + k + 1] : v[off + k - 1] + 1;
			let y = x - k;
			while (x < n && y < m && a[x] === b[y]) {
				x++;
				y++;
			}
			v[off + k] = x;
			if (x >= n && y >= m) {
				end = d;
				break;
			}
		}
		if (end >= 0) break;
	}
	if (end < 0) return null;
	// Walk the trace back from (n, m), collecting the diagonal (matched) moves. trace[d] is the
	// frontier before round d, so round d's move came from the k it names.
	const out: Array<[number, number]> = [];
	let x = n;
	let y = m;
	for (let d = end; d >= 0; d--) {
		const vd = trace[d];
		const k = x - y;
		const prevK = k === -d || (k !== d && vd[off + k - 1] < vd[off + k + 1]) ? k + 1 : k - 1;
		const px = d === 0 ? 0 : vd[off + prevK];
		const py = d === 0 ? 0 : px - prevK;
		while (x > px && y > py) {
			out.push([x - 1, y - 1]);
			x--;
			y--;
		}
		x = px;
		y = py;
	}
	return out.reverse();
}

/** One broad change split into the line runs that differ. */
function narrowChange(c: Change, maxD: number): Change[] {
	const a = lines(c.deleted);
	const b = lines(c.insert);
	const run = matches(a, b, maxD);
	if (!run) return [c];
	const out: Change[] = [];
	// Character offsets of each line start, in the deleted (old) and inserted (new) text.
	const startA = [0];
	for (const l of a) startA.push(startA[startA.length - 1] + l.length);
	const startB = [0];
	for (const l of b) startB.push(startB[startB.length - 1] + l.length);
	let i = 0;
	let j = 0;
	const flush = (ti: number, tj: number) => {
		if (ti === i && tj === j) return;
		const deleted = c.deleted.slice(startA[i], startA[ti]);
		const insert = c.insert.slice(startB[j], startB[tj]);
		out.push({ from: c.from + startA[i], to: c.from + startA[ti], insert, deleted });
	};
	for (const [mi, mj] of run) {
		flush(mi, mj);
		i = mi + 1;
		j = mj + 1;
	}
	flush(a.length, b.length);
	return out.length ? out : [c];
}

/** `patch` (made against `text`) with every broad change split into the lines that differ. */
export function narrowPatch(text: string, patch: Patch, opts: { min?: number; maxD?: number } = {}): Patch {
	const min = opts.min ?? NARROW_MIN;
	const maxD = opts.maxD ?? NARROW_MAX_D;
	if (!patch.some((c) => c.deleted.length + c.insert.length >= min)) return patch;
	const out: Change[] = [];
	let split = false;
	for (const c of patch) {
		const parts = c.deleted.length + c.insert.length < min ? [c] : narrowChange(c, maxD);
		if (parts.length !== 1 || parts[0] !== c) split = true;
		out.push(...parts);
	}
	// The narrowed patch must reproduce the original exactly, or it is not used.
	return split && applyPatch(text, out) === applyPatch(text, patch) ? out : patch;
}

/**
 * `snap` with every broad step narrowed. Pure and synchronous: the host runs it where a long task
 * does no harm (a worker). A snapshot that does not replay comes back unchanged.
 */
export function narrowSnapshot(snap: Snapshot, opts: { min?: number; maxD?: number } = {}): Snapshot {
	const texts = replaySnapshot(snap);
	if (!texts) return snap;
	let changed = false;
	const narrow = (s: SnapshotStep, before: string): SnapshotStep => {
		const net = narrowPatch(before, s.net, opts);
		if (net === s.net) return s;
		changed = true;
		return { ...s, net };
	};
	const done = snap.done.map((s, i) => narrow(s, texts[i]));
	// The redo branch replays newest-undone-last reversed: undone[k] applies to text index
	// done.length + (undone.length - 1 - k).
	const undone = snap.undone.map((s, k) => narrow(s, texts[snap.done.length + (snap.undone.length - 1 - k)]));
	return changed ? { ...snap, done, undone } : snap;
}
