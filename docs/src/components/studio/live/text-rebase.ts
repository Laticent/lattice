// One edit, moved onto a text that has changed since. Its own module so Compose can merge a co-editor's change into its
// emit (ComposeView.tsx) without loading the live session's transport.

/**
 * The edit that turns `base` into `next`, located in `cur` (which may have moved on since `base`).
 * The changed span is found by the unchanged text on either side of it. When that text is gone the
 * edit is refused (null) rather than guessed: a guessed delete removes text the writer never saw, a
 * guessed replace doubles it, and a guessed insert lands mid-sentence in a co-author's line
 * (red-team round 2, finding 4).
 */
export function rebase(base: string, next: string, cur: string): { from: number; to: number; insert: string } | null {
	let p = 0;
	const min = Math.min(base.length, next.length);
	while (p < min && base.charCodeAt(p) === next.charCodeAt(p)) p++;
	let s = 0;
	while (s < min - p && base.charCodeAt(base.length - 1 - s) === next.charCodeAt(next.length - 1 - s)) s++;
	const insert = next.slice(p, next.length - s);
	const removed = base.slice(p, base.length - s);
	if (cur === base) return { from: p, to: base.length - s, insert };
	const ANCHOR = 24;
	const before = base.slice(Math.max(0, p - ANCHOR), p);
	const after = base.slice(base.length - s, base.length - s + ANCHOR);
	const needle = before + removed + after;
	if (needle.length === 0) return null;
	let at = -1;
	let best = Number.POSITIVE_INFINITY;
	for (let i = cur.indexOf(needle); i !== -1; i = cur.indexOf(needle, i + 1)) {
		const d = Math.abs(i - (p - before.length));
		if (d < best) {
			best = d;
			at = i;
		}
	}
	if (at === -1) return null;
	const from = at + before.length;
	return { from, to: from + removed.length, insert };
}

/** Where `a` and `b` differ, as one span: the common prefix length and the common suffix length (never overlapping). */
function span(a: string, b: string): [number, number] {
	let p = 0;
	const min = Math.min(a.length, b.length);
	while (p < min && a.charCodeAt(p) === b.charCodeAt(p)) p++;
	let s = 0;
	while (s < min - p && a.charCodeAt(a.length - 1 - s) === b.charCodeAt(b.length - 1 - s)) s++;
	return [p, s];
}

/**
 * `cur` with the edit that turns `base` into `next` applied, or null when it cannot be placed. `cur` is `base` with another
 * writer's change. When the two changes touch separate parts of `base`, the edit is placed by position, exactly (a three-way
 * merge of two single spans: nothing to guess). When they overlap, `rebase` places it by the text around it, or refuses.
 */
export function applyOnto(base: string, next: string, cur: string): string | null {
	const [p, s] = span(base, next);
	const [q, t] = span(base, cur);
	const end = base.length - s;
	const insert = next.slice(p, next.length - s);
	// Ours ends before theirs starts: the text up to `end` is the same in `cur`.
	if (end <= q) return cur.slice(0, p) + insert + cur.slice(end);
	// Ours starts after theirs ends: the text from `p` on is the same in `cur`, shifted by their change's length.
	if (p >= base.length - t) {
		const shift = cur.length - base.length;
		return cur.slice(0, p + shift) + insert + cur.slice(end + shift);
	}
	const edit = rebase(base, next, cur);
	return edit ? cur.slice(0, edit.from) + edit.insert + cur.slice(edit.to) : null;
}
