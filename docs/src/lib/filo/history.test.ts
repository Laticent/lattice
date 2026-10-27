import { describe, expect, it } from 'vitest';
import { History, type HistoryOptions, MAX_ENTRIES } from './history';
import { createFilo } from './index';
import { applyPatch } from './patch';

/** A history with a hand-driven clock. */
function make(text = '', opts: HistoryOptions = {}) {
	let t = 1_000;
	const h = new History('doc', text, { now: () => t, ...opts });
	const tick = (ms: number) => {
		t += ms;
	};
	/** Type `s` at `at`, one keystroke 50 ms after the last. */
	const type = (at: number, s: string, origin = 'markdown') => {
		for (let i = 0; i < s.length; i++) {
			tick(50);
			h.commit({ base: h.head, edits: [{ from: at + i, to: at + i, insert: s[i] }], label: 'Typing', origin });
		}
	};
	return { h, tick, type };
}

describe('commit, undo, redo', () => {
	it('lands on exact earlier texts, with the caret where the change was', () => {
		const { h, tick } = make('hello');
		tick(1000);
		h.commit({ base: h.head, edits: [{ from: 5, to: 5, insert: ' world' }], label: 'Typing', origin: 'markdown' });
		tick(1000);
		h.commit({ base: h.head, next: 'Hello world!', label: 'AI: polish', origin: 'ai' });
		expect(h.text).toBe('Hello world!');
		const u1 = h.undo();
		expect(u1).toMatchObject({ text: 'hello world', label: 'AI: polish', origin: 'ai' });
		expect(u1 && applyPatch('Hello world!', u1.patch)).toBe('hello world');
		const u2 = h.undo();
		expect(u2).toMatchObject({ text: 'hello', caret: 5 });
		expect(h.undo()).toBeNull();
		expect(h.redo()).toMatchObject({ text: 'hello world', caret: 11 });
		expect(h.redo()).toMatchObject({ text: 'Hello world!' });
		expect(h.redo()).toBeNull();
	});

	it('refuses a commit against a stale head, and records nothing for a no-op', () => {
		const { h } = make('a');
		const first = h.commit({ base: 0, next: 'ab', label: 'x', origin: 'o' });
		expect(first.ok).toBe(true);
		expect(h.commit({ base: 0, next: 'abc', label: 'x', origin: 'o' })).toEqual({ ok: false, reason: 'stale' });
		expect(h.commit({ base: h.head, next: 'ab', label: 'x', origin: 'o' })).toEqual({ ok: false, reason: 'noop' });
		expect(h.state().steps).toBe(1);
	});

	it('a new change after an undo drops the redo branch', () => {
		const { h, tick } = make('');
		h.commit({ base: h.head, next: 'a', label: 'A', origin: 'o' });
		tick(1000);
		h.commit({ base: h.head, next: 'ab', label: 'B', origin: 'o' });
		h.undo();
		tick(1000);
		h.commit({ base: h.head, next: 'ac', label: 'C', origin: 'o' });
		expect(h.state().canRedo).toBe(false);
		expect(h.undo()?.text).toBe('a');
	});
});

describe('grouping', () => {
	it('typing coalesces into one step, and breaks on a pause, a jump, another origin or a boundary', () => {
		const { h, tick, type } = make('');
		type(0, 'abc');
		expect(h.state().steps).toBe(1);
		tick(600); // a pause past 500 ms
		type(3, 'de');
		expect(h.state().steps).toBe(2);
		type(0, 'X'); // a jump to elsewhere
		expect(h.state().steps).toBe(3);
		type(1, 'Y', 'compose'); // another origin
		expect(h.state().steps).toBe(4);
		expect(h.undo()?.text).toBe('Xabcde');
		expect(h.undo()?.text).toBe('abcde');
		expect(h.undo()?.text).toBe('abc');
		expect(h.undo()?.text).toBe('');
	});

	it('a run that types and deletes the same text leaves no empty step behind', () => {
		const { h, tick } = make('ab');
		tick(1000);
		h.commit({ base: h.head, next: 'abX', label: 'x', origin: 'o' });
		tick(1000);
		h.commit({ base: h.head, edits: [{ from: 3, to: 3, insert: 'c' }], label: 'Typing', origin: 'markdown' });
		tick(50);
		h.commit({ base: h.head, edits: [{ from: 3, to: 4, insert: '' }], label: 'Typing', origin: 'markdown' });
		expect(h.state().steps).toBe(1);
		expect(h.undo()?.text).toBe('ab'); // the first ⌘Z visibly undoes something
	});

	it('never coalesces across a boundary the host names', () => {
		const { h, type } = make('one|two', { boundary: (a, b, text) => text.slice(a, b).includes('|') || text[a] === '|' });
		type(3, 'x'); // "onex|two"
		type(4, 'y'); // at the boundary
		expect(h.state().steps).toBe(2);
	});

	it('batch makes one step with the batch label; an async batch throws', () => {
		const { h } = make('abc');
		h.batch('Fix all (2)', () => {
			h.commit({ base: h.head, edits: [{ from: 0, to: 1, insert: 'A' }], label: 'fix', origin: 'lint' });
			h.commit({ base: h.head, edits: [{ from: 2, to: 3, insert: 'C' }], label: 'fix', origin: 'lint' });
		});
		expect(h.state()).toMatchObject({ steps: 1, undoLabel: 'Fix all (2)' });
		expect(h.undo()?.text).toBe('abc');
		expect(() => h.batch('async', async () => undefined)).toThrow(/async/);
	});

	it('a drag is one step until it closes, and closes itself after a quiet spell', () => {
		const { h, tick } = make('size: 1');
		h.openGroup('Size');
		for (const v of ['2', '3', '4']) {
			tick(30);
			h.commit({ base: h.head, next: `size: ${v}`, label: 'set', origin: 'settings' });
		}
		h.closeGroup();
		expect(h.state()).toMatchObject({ steps: 1, undoLabel: 'Size' });
		h.openGroup('Size');
		tick(30);
		h.commit({ base: h.head, next: 'size: 5', label: 'set', origin: 'settings' });
		tick(5_000); // pointer-up never came
		h.commit({ base: h.head, next: 'size: 5x', label: 'Typing', origin: 'markdown' });
		expect(h.state().steps).toBe(3);
		expect(h.undo()?.text).toBe('size: 5');
	});
});

describe('limits', () => {
	it('keeps 100 steps by default, folding the oldest into the floor', () => {
		const { h, tick } = make('');
		for (let i = 0; i < 130; i++) {
			tick(1000);
			h.commit({ base: h.head, next: `${h.text}x`, label: 'x', origin: 'o' });
		}
		expect(h.state().steps).toBe(100);
		let n = 0;
		while (h.undo()) n++;
		expect(n).toBe(100);
		expect(h.text).toBe('x'.repeat(30));
	});

	it('clamps the entry cap to [1, 500]', () => {
		expect(new History('d', '', { limits: { entries: 501 } }).entryLimit).toBe(MAX_ENTRIES);
		expect(new History('d', '', { limits: { entries: 10_000 } }).entryLimit).toBe(500);
		expect(new History('d', '', { limits: { entries: 0 } }).entryLimit).toBe(1);
		expect(new History('d', '', { limits: { entries: Number.NaN } }).entryLimit).toBe(100);
		expect(new History('d', '').entryLimit).toBe(100);
	});

	it('the byte cap folds old steps but keeps the newest one undoable, however large', () => {
		const { h, tick } = make('', { limits: { bytes: 1_000 } });
		for (let i = 0; i < 20; i++) {
			tick(1000);
			h.commit({ base: h.head, next: `${h.text}${'y'.repeat(100)}`, label: 'x', origin: 'o' });
		}
		expect(h.size).toBeLessThanOrEqual(1_000);
		tick(1000);
		const before = h.text;
		h.commit({ base: h.head, next: `${before}${'z'.repeat(50_000)}`, label: 'paste', origin: 'o' });
		expect(h.state().steps).toBe(1);
		expect(h.undo()?.text).toBe(before);
	});
});

describe('marks', () => {
	it('restore lands on the marked text exactly, and is itself undoable', () => {
		const { h, tick } = make('v0');
		tick(1000);
		h.commit({ base: h.head, next: 'v1', label: 'a', origin: 'o' });
		const m = h.mark('Saved version');
		tick(1000);
		h.commit({ base: h.head, next: 'v2', label: 'b', origin: 'o' });
		expect(h.restore(m)?.text).toBe('v1');
		expect(h.text).toBe('v1');
		expect(h.undo()?.text).toBe('v2');
	});

	it('a mark older than the window still restores, through its anchor', () => {
		const { h, tick } = make('start', { limits: { entries: 3 } });
		const m = h.mark('Original');
		for (let i = 0; i < 10; i++) {
			tick(1000);
			h.commit({ base: h.head, next: `step ${i}`, label: 'x', origin: 'o' });
		}
		expect(h.state().steps).toBe(3);
		expect(h.markText(m)).toBe('start');
		expect(h.restore(m)?.text).toBe('start');
	});

	it('a mark made after some undos points at the right text', () => {
		const { h, tick } = make('a');
		for (const t of ['ab', 'abc', 'abcd']) {
			tick(1000);
			h.commit({ base: h.head, next: t, label: 'x', origin: 'o' });
		}
		h.undo();
		h.undo();
		const m = h.mark('here');
		h.redo();
		expect(h.markText(m)).toBe('ab');
	});

	it('typing after undoing keeps the dropped branch as one automatic mark', () => {
		const { h, tick } = make('');
		for (const t of ['1', '12', '123']) {
			tick(1000);
			h.commit({ base: h.head, next: t, label: 'x', origin: 'o' });
		}
		h.undo();
		h.undo();
		tick(1000);
		h.commit({ base: h.head, next: '1z', label: 'x', origin: 'o' });
		const auto = h.marks().filter((m) => m.auto);
		expect(auto).toHaveLength(1);
		expect(auto[0].label).toBe('Before you undid 2 changes');
		expect(h.markText(auto[0].id)).toBe('123');
		h.undo();
		tick(1000);
		h.commit({ base: h.head, next: '1q', label: 'x', origin: 'o' });
		expect(h.marks().filter((m) => m.auto)).toHaveLength(1); // replaced, not piled up
	});
});

describe('changes made outside the history', () => {
	it('the next undo records the gap and stops; the one after undoes it', () => {
		const { h, tick } = make('a');
		tick(1000);
		h.commit({ base: h.head, next: 'ab', label: 'x', origin: 'o' });
		h.sync('ab + remote');
		expect(h.state()).toMatchObject({ stale: true, canUndo: true, undoLabel: 'Changed outside this history' });
		const g = h.undo();
		expect(g).toMatchObject({ gap: true, text: 'ab + remote' });
		expect(h.text).toBe('ab + remote');
		expect(h.undo()?.text).toBe('ab');
		expect(h.undo()?.text).toBe('a');
	});

	it('a commit after an outside change records the gap first', () => {
		const { h, tick } = make('a');
		h.sync('a!');
		tick(1000);
		h.commit({ base: h.head, edits: [{ from: 2, to: 2, insert: '?' }], label: 'x', origin: 'o' });
		expect(h.text).toBe('a!?');
		expect(h.undo()?.text).toBe('a!');
		expect(h.undo()?.text).toBe('a');
	});
});

describe('subscribe and the registry', () => {
	it('calls a listener only when its selected value changes', () => {
		const { h } = make('');
		const seen: boolean[] = [];
		h.subscribe((s) => s.canUndo, (v) => seen.push(v));
		h.commit({ base: h.head, next: 'a', label: 'x', origin: 'o' });
		h.commit({ base: h.head, next: 'ab', label: 'x', origin: 'o' });
		h.undo();
		h.undo();
		expect(seen).toEqual([true, false]);
	});

	it('keeps one history per document, never across documents', () => {
		const filo = createFilo();
		const a = filo.load('deck:a', 'same template');
		a.commit({ base: a.head, next: 'same template + A', label: 'x', origin: 'o' });
		const b = filo.load('deck:b', 'same template');
		expect(b).not.toBe(a);
		expect(b.state().canUndo).toBe(false);
		expect(filo.active).toBe(b);
		expect(filo.load('deck:a', 'same template + A')).toBe(a);
		const pop = filo.push('deck:b');
		expect(filo.active).toBe(b);
		pop();
		expect(filo.active).toBe(a);
		expect(filo.load('deck:a', 'edited elsewhere').state().stale).toBe(true);
		filo.drop('deck:a');
		expect(filo.docs()).toEqual(['deck:b']);
	});
});

describe('against a reference model (random sequences, seeded)', () => {
	it('every undo, redo and restore lands on the text the model says', () => {
		let seed = 7;
		const r = () => {
			seed = (seed * 1103515245 + 12345) & 0x7fffffff;
			return seed / 0x7fffffff;
		};
		for (let run = 0; run < 300; run++) {
			let t = 0;
			const h = new History('d', '', { now: () => t, limits: { entries: 1 + Math.floor(r() * 12), bytes: r() < 0.3 ? 200 : 2_000_000 } });
			// The model: the thread of texts, a cursor, and marks as plain texts.
			let texts = [''];
			let cur = 0;
			const marks = new Map<number, string>();
			for (let op = 0; op < 60; op++) {
				t += 1000; // never coalesce, so one commit is one step
				const x = r();
				if (x < 0.45) {
					const next = `${h.text.slice(0, Math.floor(r() * (h.text.length + 1)))}${'abc'[Math.floor(r() * 3)]}${h.text.slice(Math.floor(r() * h.text.length))}`;
					const res = h.commit({ base: h.head, next, label: 'x', origin: 'o' });
					if (res.ok) {
						texts = [...texts.slice(0, cur + 1), next];
						cur++;
					}
				} else if (x < 0.7) {
					const m = h.undo();
					if (m) {
						cur--;
						expect(m.text).toBe(texts[cur]);
					}
				} else if (x < 0.85) {
					const m = h.redo();
					if (m) {
						cur++;
						expect(m.text).toBe(texts[cur]);
					}
				} else if (x < 0.93) {
					marks.set(h.mark('m'), h.text);
				} else if (marks.size) {
					const ids = [...marks.keys()];
					const id = ids[Math.floor(r() * ids.length)];
					expect(h.markText(id)).toBe(marks.get(id));
					const res = h.restore(id);
					if (res && res.text !== texts[cur]) {
						texts = [...texts.slice(0, cur + 1), res.text];
						cur++;
					}
				}
				expect(h.text).toBe(texts[cur]);
			}
			for (const [id, text] of marks) expect(h.markText(id)).toBe(text);
		}
	});
});
