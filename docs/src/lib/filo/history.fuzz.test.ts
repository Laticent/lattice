// A reference-model fuzzer for History, written by an independent checker of PR #2930 and kept
// because it found two real defects (a mark inside an open typing run; a restore while stale).
// Unlike the model test in history.test.ts, it runs keystrokes 0-120 ms apart, so typing really
// coalesces, and it mixes in backspace, caret jumps, whole-text `next` commits, nested batches,
// drags, outside changes (`sync`), marks and restores. With large caps it checks every text
// against a plain list of the thread's texts; with small caps it checks the invariants that must
// hold however much has folded away.
import { describe, expect, it } from 'vitest';
import { History, type HistoryOptions } from './history';
import { applyPatch, type Patch, patchOf, patchSize } from './patch';

type Inner = { done: { net: Patch; size: number }[]; undone: { net: Patch; size: number }[]; marks_: { anchor: Patch | null }[]; textAtStep(n: number): string };
const inner = (h: History) => h as unknown as Inner;
function trueBytes(h: History): number {
	const p = inner(h);
	let n = 0;
	for (const s of p.done) n += patchSize(s.net);
	for (const s of p.undone) n += patchSize(s.net);
	for (const m of p.marks_) if (m.anchor) n += patchSize(m.anchor);
	return n;
}

function rng(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		return s / 0x7fffffff;
	};
}

function fuzz(seed: number, opts: HistoryOptions, ops: number, model: boolean): void {
	const r = rng(seed);
	let t = 1_000;
	const h = new History('doc', 'abc', { now: () => t, ...opts });
	const p = inner(h);
	let host = 'abc';
	let caret = 3;
	const S: string[] = ['abc']; // the thread: S[i] is the text after i steps (model runs only)
	let R: string[] = []; // the redo texts
	let outside: string | null = null;
	const marks = new Map<number, string>();
	const log: string[] = [];
	const fail = (msg: string): never => {
		throw new Error(`seed ${seed}: ${msg}\n${log.slice(-20).join('\n')}`);
	};
	const gapModel = () => {
		if (outside === null) return;
		S.push(outside);
		R = [];
		outside = null;
	};
	const observe = (newText: string, before: number) => {
		R = [];
		if (!model) return;
		const len = p.done.length;
		if (len === before + 1) S.push(newText);
		else if (len === before) S[S.length - 1] = newText;
		else if (len === before - 1) {
			S.pop();
			if (S[S.length - 1] !== newText) fail('an emptied step did not land on the text before it');
		} else fail(`step count jumped ${before} -> ${len}`);
	};
	const commit = (edits: { from: number; to: number; insert: string }[] | null, next: string | null, label: string, origin: string) => {
		gapModel();
		const before = p.done.length + (h.state().stale ? 1 : 0);
		const res = edits ? h.commit({ base: h.head, edits, label, origin }) : h.commit({ base: h.head, next: next as string, label, origin });
		const expected = edits ? applyPatch(host, patchOf(host, edits)) : (next as string);
		if (res.ok) {
			host = h.text;
			if (host !== expected) fail('commit landed on the wrong text');
			observe(expected, before);
		} else if (model && p.done.length !== S.length - 1) fail('a refused commit changed the steps');
		return res;
	};
	for (let i = 0; i < ops; i++) {
		const k = r();
		t += r() < 0.8 ? Math.floor(r() * 120) : Math.floor(r() * 3000);
		if (k < 0.3) {
			const ch = 'xyz\n'[Math.floor(r() * 4)];
			caret = Math.min(caret, host.length);
			log.push(`type ${JSON.stringify(ch)}@${caret}`);
			if (commit([{ from: caret, to: caret, insert: ch }], null, 'Typing', 'markdown').ok) caret++;
		} else if (k < 0.42) {
			caret = Math.min(caret, host.length);
			if (caret > 0) {
				log.push(`backspace@${caret}`);
				if (commit([{ from: caret - 1, to: caret, insert: '' }], null, 'Typing', 'markdown').ok) caret--;
			}
		} else if (k < 0.47) {
			caret = Math.floor(r() * (host.length + 1));
			log.push(`caret ${caret}`);
		} else if (k < 0.53) {
			const nx = `${host.slice(0, Math.floor(r() * host.length))}AI${Math.floor(r() * 9)}`;
			log.push(`next ${JSON.stringify(nx)}`);
			commit(null, nx, 'AI', 'ai');
		} else if (k < 0.58) {
			log.push('batch');
			const n = 1 + Math.floor(r() * 3);
			h.batch('B', () => {
				for (let j = 0; j < n; j++) {
					const at = Math.floor(r() * (host.length + 1));
					commit([{ from: at, to: at, insert: 'b' }], null, 'fix', 'lint');
					if (r() < 0.3) h.batch('inner', () => commit([{ from: 0, to: 0, insert: 'i' }], null, 'fix', 'lint'));
				}
			});
		} else if (k < 0.62) {
			log.push('openGroup');
			h.openGroup('Drag');
		} else if (k < 0.66) {
			log.push('closeGroup');
			h.closeGroup();
		} else if (k < 0.76) {
			log.push(`undo stale=${outside !== null}`);
			const m = h.undo();
			if (outside !== null) {
				gapModel();
				if (!m?.gap || m.text !== S[S.length - 1]) fail('the gap undo did not stop on the outside text');
				host = m?.text ?? host;
			} else if (!m) {
				if (model && S.length > 1) fail('undo returned null with steps left');
			} else {
				if (applyPatch(host, m.patch) !== m.text) fail('the undo patch does not produce its text');
				if (m.text === host) fail('an undo changed nothing visible');
				if (model) {
					R.push(S.pop() as string);
					if (m.text !== S[S.length - 1]) fail('undo landed on the wrong text');
				}
				host = m.text;
				caret = Math.min(m.caret ?? caret, host.length);
			}
		} else if (k < 0.82) {
			log.push('redo');
			const m = h.redo();
			if (m) {
				if (applyPatch(host, m.patch) !== m.text) fail('the redo patch does not produce its text');
				if (model) {
					const want = R.pop();
					S.push(want as string);
					if (m.text !== want) fail('redo landed on the wrong text');
				}
				host = m.text;
				caret = Math.min(m.caret ?? caret, host.length);
			} else if (model && outside === null && R.length) fail('redo returned null with redo left');
		} else if (k < 0.86) {
			const nx = `${host}S`;
			log.push(`sync ${JSON.stringify(nx)}`);
			h.sync(nx);
			host = nx;
			outside = nx === h.text ? null : nx;
		} else if (k < 0.92) {
			// A mark names exactly what the author sees, open typing run or outside change or not.
			log.push('mark');
			const before = p.done.length;
			const id = h.mark('m');
			if (outside !== null) {
				gapModel();
				if (model && p.done.length !== before + 1) fail('a stale mark did not record the gap');
			}
			marks.set(id, host);
		} else if (k < 0.96) {
			const ids = [...marks.keys()];
			if (ids.length) {
				const id = ids[Math.floor(r() * ids.length)];
				log.push(`restore ${id}`);
				const before = p.done.length + (h.state().stale ? 1 : 0); // restore records the gap first
				gapModel();
				const mv = h.restore(id);
				if (!mv) fail('restore returned null');
				else {
					if (mv.text !== marks.get(id)) fail('restore landed on the wrong text');
					if (applyPatch(host, mv.patch) !== mv.text) fail("the restore patch does not apply to the host's text");
					if (h.text !== mv.text) fail("restore left Filo's text elsewhere");
					if (mv.patch.length) observe(mv.text, before);
					host = mv.text;
				}
			}
		} else {
			t += 5_000;
			log.push('pause');
		}
		if (h.size !== trueBytes(h)) fail(`byte count drifted: ${h.size} != ${trueBytes(h)}`);
		if (p.textAtStep(p.done.length) !== h.text) fail('the thread does not reproduce the text');
		for (const s of p.done) if (s.net.length === 0) fail('an empty step stayed in the history');
		for (const [id, text] of marks) if (h.markText(id) !== text) fail(`mark ${id} moved`);
		if (model && p.done.length !== S.length - 1) fail(`steps ${p.done.length} != model ${S.length - 1}`);
		if (outside === null && host !== h.text) fail("the host's text and Filo's diverged");
	}
}

describe('History against a coalescing reference model (seeded)', () => {
	it('large caps: every text matches the model', () => {
		for (let s = 1; s <= 600; s++) fuzz(s, { limits: { entries: 500, bytes: 1e9 } }, 200, true);
		expect(true).toBe(true);
	});

	it('small caps: the invariants hold however much folds away', () => {
		for (let s = 1; s <= 600; s++) fuzz(s, { limits: { entries: 1 + (s % 6), bytes: s % 3 === 0 ? 120 : 1e9 } }, 200, false);
		expect(true).toBe(true);
	});
});
