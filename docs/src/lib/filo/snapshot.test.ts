import { describe, expect, it } from 'vitest';
import { History } from './history';
import { NARROW_MIN, narrowPatch, narrowSnapshot } from './narrow';
import { applyPatch, trimPatch } from './patch';
import { compactHistory, restoreSnapshot, toSnapshot } from './snapshot';

function make(text = '') {
	let t = 1_000;
	const h = new History('doc', text, { now: () => t });
	return { h, tick: (ms: number) => (t += ms) };
}

/** A history with typing, a broad replace, an undo (so a redo branch) and a mark. */
function busy() {
	const { h, tick } = make('alpha\nbeta\ngamma\n');
	h.commit({ base: h.head, edits: [{ from: 0, to: 0, insert: 'X' }], label: 'Typing', origin: 'markdown' });
	tick(1_000);
	const mark = h.mark('v1');
	h.commit({ base: h.head, next: 'alpha\nBETA\ngamma\ndelta\n', label: 'AI', origin: 'ai' });
	tick(1_000);
	h.commit({ base: h.head, edits: [{ from: 1, to: 1, insert: 'Y' }], label: 'Typing', origin: 'markdown' });
	h.undo();
	return { h, mark };
}

describe('snapshot and restore', () => {
	it('a restored history undoes, redoes and restores marks exactly as the original', () => {
		const { h, mark } = busy();
		const snap = JSON.parse(JSON.stringify(toSnapshot(h)));
		const { h: r } = make(h.text);
		expect(restoreSnapshot(r, snap)).toBe(true);
		expect(r.text).toBe(h.text);
		expect(r.state().canRedo).toBe(true);
		expect(r.markText(mark)).toBe(h.markText(mark));
		expect(r.size).toBe(h.size);
		const a = [h.redo()?.text, h.undo()?.text, h.undo()?.text, h.undo()?.text];
		const b = [r.redo()?.text, r.undo()?.text, r.undo()?.text, r.undo()?.text];
		expect(b).toEqual(a);
		expect(r.text).toBe('alpha\nbeta\ngamma\n');
	});

	it('refuses a snapshot for another document, with a wrong hash, or whose steps do not fit', () => {
		const { h } = busy();
		const snap = toSnapshot(h);
		const fresh = () => make('untouched').h;
		const other = new History('other', 'x');
		expect(restoreSnapshot(other, snap)).toBe(false);
		expect(restoreSnapshot(fresh(), { ...snap, hash: snap.hash + 1 })).toBe(false);
		expect(restoreSnapshot(fresh(), { ...snap, floor: `${snap.floor}!` })).toBe(false);
		const bad = { ...snap, undone: [{ ...snap.undone[0], net: [{ from: 0, to: 3, insert: 'q', deleted: 'zzz' }] }] };
		const r = fresh();
		expect(restoreSnapshot(r, bad)).toBe(false);
		expect(r.text, 'a refused snapshot changes nothing').toBe('untouched');
		expect(r.state().canUndo).toBe(false);
	});

	it('keeps a writer’s head valid: ids continue after the restored ones', () => {
		const { h } = busy();
		const { h: r } = make(h.text);
		restoreSnapshot(r, toSnapshot(h));
		const res = r.commit({ base: r.head, edits: [{ from: 0, to: 0, insert: 'Z' }], label: 'Typing', origin: 'markdown' });
		expect(res.ok).toBe(true);
		expect(res.ok && res.id).toBeGreaterThan(h.head);
	});

	it('compact folds every step into the floor and keeps every mark', () => {
		const { h, mark } = busy();
		const before = h.markText(mark);
		compactHistory(h);
		expect(h.state().canUndo).toBe(false);
		expect(h.state().canRedo).toBe(false);
		expect(h.markText(mark)).toBe(before);
		expect(restoreSnapshot(h, toSnapshot(h))).toBe(true);
	});

	it('reports every change through the revision', () => {
		const { h } = make('a');
		const seen: number[] = [];
		h.subscribe((s) => s.revision, (v) => seen.push(v));
		h.commit({ base: h.head, edits: [{ from: 1, to: 1, insert: 'b' }], label: 'Typing', origin: 'm' });
		h.undo();
		expect(seen.length).toBe(2);
	});
});

describe('narrowing broad patches', () => {
	const deck = Array.from({ length: 400 }, (_, i) => `Line ${i} of the deck.\n`).join('');

	it('splits a broad replace into the lines that changed, applying to the same text', () => {
		const next = deck.replace('Line 3 of', 'Line three of').replace('Line 390 of', 'Line 390, edited, of');
		const broad = trimPatch(deck, next);
		expect(broad.length, 'witness: the trim is one change spanning both edits').toBe(1);
		const narrow = narrowPatch(deck, broad);
		expect(narrow.length).toBe(2);
		expect(applyPatch(deck, narrow)).toBe(next);
		const span = (p: typeof broad) => p.reduce((n, c) => n + c.deleted.length + c.insert.length, 0);
		expect(span(narrow)).toBeLessThan(span(broad) / 20);
	});

	it('leaves a narrow change, and a change past the diff bound, alone', () => {
		const small = trimPatch(deck, deck.replace('Line 3 of', 'Line III of'));
		expect(narrowPatch(deck, small)).toBe(small);
		const unrelated = Array.from({ length: 400 }, (_, i) => `Other ${i}\n`).join('');
		const broad = trimPatch(deck, unrelated);
		expect(narrowPatch(deck, broad, { maxD: 50 })).toBe(broad);
		expect(applyPatch(deck, narrowPatch(deck, broad))).toBe(unrelated);
	});

	it('handles inserted and deleted lines, a missing final newline, and an empty side', () => {
		const cases = [deck.replace('Line 7 of the deck.\n', ''), deck.replace('Line 7 of', 'New line.\nLine 7 of'), `${deck}tail without newline`, deck.slice(0, 2000), ''];
		for (const next of cases) {
			const p = trimPatch(deck, next);
			expect(applyPatch(deck, narrowPatch(deck, p, { min: 1 }))).toBe(next);
		}
	});

	it('always reproduces the target text (randomized)', () => {
		let seed = 7;
		const rnd = (n: number) => {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			return seed % n;
		};
		const words = ['a\n', 'b\n', 'cc\n', 'slide\n', '---\n', '\n', 'x'];
		const doc = () => Array.from({ length: rnd(60) }, () => words[rnd(words.length)]).join('');
		let narrowed = 0;
		for (let i = 0; i < 300; i++) {
			const a = doc();
			let b = a;
			for (let k = rnd(5); k >= 0; k--) {
				const at = rnd(b.length + 1);
				b = b.slice(0, at) + (rnd(2) ? words[rnd(words.length)] : '') + b.slice(Math.min(b.length, at + rnd(6)));
			}
			const p = trimPatch(a, b);
			const n = narrowPatch(a, p, { min: 1, maxD: 1 + rnd(40) });
			expect(applyPatch(a, n)).toBe(b);
			if (n !== p) narrowed++;
		}
		// The check inside narrowPatch falls back to the broad patch, which would hide a broken diff:
		// it must actually narrow most multi-line cases.
		expect(narrowed, 'witness: the diff narrowed, not the fallback').toBeGreaterThan(100);
	});

	it('narrows every broad step of a snapshot, done and undone, and it still restores', () => {
		const { h } = make(deck);
		h.commit({ base: h.head, next: deck.replace('Line 1 of', 'L1').replace('Line 300 of', 'L300'), label: 'AI', origin: 'ai' });
		h.commit({ base: h.head, next: deck.replace('Line 5 of', 'L5').replace('Line 350 of', 'L350'), label: 'AI', origin: 'ai' });
		h.undo();
		const snap = toSnapshot(h);
		const narrowed = narrowSnapshot(snap);
		expect(narrowed).not.toBe(snap);
		const size = (s: typeof snap) => JSON.stringify(s).length;
		expect(size(narrowed)).toBeLessThan(size(snap) - NARROW_MIN);
		const { h: r } = make(h.text);
		expect(restoreSnapshot(r, narrowed)).toBe(true);
		expect(r.redo()?.text).toBe(h.redo()?.text);
		expect(r.undo()?.text).toBe(h.undo()?.text);
		expect(r.undo()?.text).toBe(deck);
	});
});
