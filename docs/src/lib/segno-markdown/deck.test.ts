import { describe, expect, it } from 'vitest';
import { BlockParser, type BlockState, type DeckModel, deckModel, deckModelStats, ingest, STRIDE, updateDeckModel } from './index.js';

const parser = new BlockParser();

describe('S0 ingest', () => {
	it('strips a BOM and folds CRLF and lone CR, and nothing else', () => {
		expect(ingest('﻿a\r\nb\rc d')).toBe('a\nb\nc d');
	});
});

describe('the deck model', () => {
	const src = '---\ntheme: x\n---\n# A\n<!-- _class: lead -->\n\n---\n\n```js\n---\n```\n\n***\n\n# C\n';
	const m = deckModel(src, { parser });

	it('splits front matter as the engine does and numbers body lines from 0', () => {
		expect(m.bodyStart).toBe('---\ntheme: x\n---\n'.length);
		expect(m.body.startsWith('# A')).toBe(true);
	});

	it('reads boundaries, slides and ranges off one tape', () => {
		expect(Array.from(m.boundaries)).toEqual([3, 9]);
		expect(m.slides.map((s) => [s.fromLine, s.toLine, s.sepLine])).toEqual([
			[0, 3, -1],
			[4, 9, 3],
			[10, 12, 9],
		]);
		expect(m.directives.map((d) => [d.fromLine, d.slide])).toEqual([[1, 0]]);
		expect(m.fences.map((f) => [f.fromLine, f.toLine, m.fenceInfo(f)])).toEqual([[5, 8, 'js']]);
		expect(m.leaves.map((l) => l.type)).toEqual(['heading', 'heading']);
		expect(m.slideText(1)).toBe('\n```js\n---\n```\n');
	});

	it('says when the body opens with a break, which the engine drops a group for', () => {
		expect(deckModel('---\n\n# A\n', { parser, frontMatter: null }).leadingEmpty).toBe(true);
		// A reference definition is source with no tokens, so the break is still the first token: the engine
		// renders ONE section from these two chunks of text.
		expect(deckModel('[a]: /u\n---\n# A\n', { parser }).leadingEmpty).toBe(true);
		expect(deckModel('a\n\n---\n# A\n', { parser }).leadingEmpty).toBe(false);
	});
});

// ── Incremental: every update equals a full parse of the same text ──────────────────────────────────

/** A forward-scanning rule like math's `$$`: it opens only if a closer exists below, slides away. */
const dollars = (state: BlockState, start: number, end: number, silent: boolean): boolean => {
	const at = state.bMarks[start] + state.tShift[start];
	if (state.src.slice(at, at + 2) !== '$$') return false;
	let line = start;
	let closed = state.src.slice(at + 2, state.eMarks[start]).trim().endsWith('$$');
	while (!closed && line < end - 1) {
		line++;
		closed = state.src.slice(state.bMarks[line], state.eMarks[line]).trim().endsWith('$$');
	}
	if (!closed) return false;
	if (silent) return true;
	state.push('math_block', 'div', 0).map = [start, line + 1];
	state.line = line + 1;
	return true;
};
const mathParser = new BlockParser({ rules: [{ name: 'math_block', rule: dollars, triggers: '$', scansAhead: true }] });
// The failing arm's parser: the same rule, not declared as scanning ahead, so updates splice across it.
const undeclared = new BlockParser({ rules: [{ name: 'math_block', rule: dollars, triggers: '$' }] });

function same(a: DeckModel, b: DeckModel): boolean {
	const A = a.blocks;
	const B = b.blocks;
	if (A.length !== B.length || A.lines !== B.lines || a.bodyStart !== b.bodyStart) return false;
	for (let i = 0; i < A.length * STRIDE; i++) if (A.tape[i] !== B.tape[i]) return false;
	for (let i = 0; i <= A.lines; i++) if (A.bMarks[i] !== B.bMarks[i] || A.eMarks[i] !== B.eMarks[i]) return false;
	return a.boundaries.join() === b.boundaries.join() && a.slides.length === b.slides.length;
}

const ATOMS = ['# T', 'text', '---', '***', '- a', '  - b', '1. x', '> q', '```', '~~~', '<!-- c -->', '<!--', '-->', '<div>', '| a |', '|---|', '[a]: /u', '$$', 'x $$', '', '', '    code', '===', 'a\\'];
const SNIPS = ['\n', '---', '\n---\n', '-', '=', '`', '```', '> ', '- ', '#', 'x', '  ', '<!--', '-->', '|', '\n\n', '$$', '\r\n', '﻿'];

function rng(seed: number) {
	let s = seed;
	return () => {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		return s / 0x7fffffff;
	};
}

function run(opts: { parser: BlockParser }, seed: number, rounds: number): number {
	const rnd = rng(seed);
	const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
	let bad = 0;
	for (let k = 0; k < rounds; k++) {
		const lines = Array.from({ length: 4 + Math.floor(rnd() * 30) }, () => pick(ATOMS));
		let src = (rnd() < 0.3 ? '---\na: 1\n---\n' : '') + lines.join('\n') + (rnd() < 0.5 ? '\n' : '');
		let m = deckModel(src, opts);
		for (let step = 0; step < 6; step++) {
			const at = Math.floor(rnd() * (src.length + 1));
			const del = rnd() < 0.4 ? Math.floor(rnd() * 6) : 0;
			const ins = rnd() < 0.85 ? pick(SNIPS) : '';
			const next = src.slice(0, at) + ins + src.slice(at + del);
			const span = rnd() < 0.5 ? { from: at, toA: Math.min(at + del, src.length), toB: at + ins.length } : undefined;
			m = updateDeckModel(m, next, span);
			if (!same(m, deckModel(next, opts))) bad++;
			src = next;
		}
	}
	return bad;
}

describe('updateDeckModel', () => {
	it('equals a full parse after every edit, on random decks and random edits', () => {
		const before = deckModelStats.incremental;
		expect(run({ parser: mathParser }, 1, 400)).toBe(0);
		expect(run({ parser }, 2, 400)).toBe(0);
		expect(deckModelStats.incremental - before).toBeGreaterThan(1000); // the property ran the incremental path
	});

	it('goes red when the rule is not declared as scanning ahead: the property can fail', () => {
		// The failing arm (a property that cannot fail is no evidence): undeclared, a `$$` closer typed below a
		// break re-reads only the slide it is typed in, and misses the opener a slide above it.
		const src = '$$ a\n\n---\n\nb\n';
		const next = '$$ a\n\n---\n\nb $$\n';
		expect(same(updateDeckModel(deckModel(src, { parser: undeclared }), next), deckModel(next, { parser: undeclared }))).toBe(false);
		expect(same(updateDeckModel(deckModel(src, { parser: mathParser }), next), deckModel(next, { parser: mathParser }))).toBe(true);
		// A closer only `trim()` sees (a trailing no-break space) is caught the same way: no pattern is involved.
		const nbsp = '$$ a\n\n---\n\nb $$\u00a0\n';
		expect(same(updateDeckModel(deckModel(src, { parser: mathParser }), nbsp), deckModel(nbsp, { parser: mathParser }))).toBe(true);
	});

	it('stays exact at the end of the text (regressions found by the red team and the checker)', () => {
		const cases: [string, string][] = [
			['a\n\n---\n', 'a\n\n---\n '], // a whitespace-only last line is not a line
			['a\n\n---\n', 'a\n\n---\nx'], // text typed after a final break opens a slide
			['- ---', '- \n\n'], // a body ending on a break with no newline after it
			['a\n\n---\n\n- ---', 'a\n\n---\n\n- \n\n'],
			['a\n\n---', 'a\n\n---\n\nb'],
		];
		for (const [a, b] of cases) {
			const inc = updateDeckModel(deckModel(a, { parser }), b);
			const ref = deckModel(b, { parser });
			expect(same(inc, ref), JSON.stringify([a, b])).toBe(true);
			expect(inc.slides.map((_, i) => inc.slideText(i)), JSON.stringify([a, b])).toEqual(ref.slides.map((_, i) => ref.slideText(i)));
		}
	});

	it('re-reads one slide for a keystroke inside it, and reuses the others', () => {
		const deck = Array.from({ length: 50 }, (_, i) => `# Slide ${i}\n\n- a\n- b\n\n<!-- _class: x -->`).join('\n\n---\n\n');
		const m = deckModel(deck, { parser });
		const at = deck.indexOf('Slide 25') + 5;
		const lines = deckModelStats.reparsedLines;
		const next = updateDeckModel(m, `${deck.slice(0, at)}!${deck.slice(at)}`, { from: at, toA: at, toB: at + 1 });
		expect(deckModelStats.reparsedLines - lines).toBeLessThanOrEqual(10); // one slide (9 lines with its closing break)
		expect(next.segs[0]).toBe(m.segs[0]);
		expect(next.segs[49]).toBe(m.segs[49]);
		expect(Array.from(next.boundaries)).toEqual(Array.from(m.boundaries));
	});

	it('ignores a span that does not describe the edit', () => {
		const m = deckModel('a\n\n---\n\nb\n', { parser });
		const next = updateDeckModel(m, 'a\n\n---\n\nbc\n', { from: 0, toA: 0, toB: 5 });
		expect(same(next, deckModel('a\n\n---\n\nbc\n', { parser }))).toBe(true);
	});

	it('returns the same model for the same source', () => {
		const m = deckModel('a\n', { parser });
		expect(updateDeckModel(m, 'a\n')).toBe(m);
	});
});
