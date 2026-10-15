import fs from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import sectionSplit from '../../../../lib/core/section-source-split.js';
import { slideIndexAt, slideStartOffset, splitSlides } from '../../components/studio/lint';
import { buildDeckIndex, chunkAt, chunkText, type DeckIndex, flatSection, indexStats, sectionAt, sectionOfFlat, sectionStart, sectionText, updateDeckIndex } from './deck-index';

const { splitSourceToSections } = sectionSplit as { splitSourceToSections: (s: string) => string[] };
const ROOT = path.resolve(__dirname, '../../../..');

function corpus(): Array<[string, string]> {
	const out: Array<[string, string]> = [];
	for (const dir of ['examples', 'test/integration/baseline-decks']) {
		for (const f of fs.readdirSync(path.join(ROOT, dir))) if (f.endsWith('.md')) out.push([`${dir}/${f}`, fs.readFileSync(path.join(ROOT, dir, f), 'utf8')]);
	}
	return out;
}

// The shape two snapshots must agree on; ids are compared separately.
const shape = (ix: DeckIndex) => ({ bodyStart: ix.bodyStart, mode: ix.mode, seps: ix.seps, chunks: ix.chunks.map((c) => [c.from, c.start, c.end, [...c.sections]]) });

describe('DeckIndex — agrees with the derivations it replaces', () => {
	const decks = corpus();

	it('reads a real corpus (the oracle is not vacuous)', () => {
		expect(decks.length).toBeGreaterThan(50);
	});

	it('chunk i is splitSlides(source)[i], on every committed deck', () => {
		for (const [name, src] of decks) {
			const ix = buildDeckIndex(src);
			const got = ix.chunks.map((_, i) => chunkText(ix, i));
			expect(got, name).toEqual(splitSlides(src.slice(ix.bodyStart)));
		}
	});

	it('the caret → chunk answer is slideIndexAt, and the reveal offset is slideStartOffset', () => {
		for (const [name, src] of decks.slice(0, 120)) {
			const ix = buildDeckIndex(src);
			for (let o = 0; o <= src.length; o += Math.max(1, Math.floor(src.length / 97))) expect(chunkAt(ix, o), `${name}@${o}`).toBe(slideIndexAt(src, o));
			for (let i = 0; i < ix.chunks.length; i++) expect(sectionStart(ix, i, 0), `${name}#${i}`).toBe(slideStartOffset(src, i));
		}
	});

	it("sections are the ENGINE's slides: the texts splitSourceToSections recovers, on every committed deck", () => {
		let headingSplitDecks = 0;
		for (const [name, src] of decks) {
			const ix = buildDeckIndex(src);
			const mine: string[] = [];
			ix.chunks.forEach((c, i) => {
				for (let k = 0; k < c.sections.length; k++) mine.push(sectionText(ix, i, k));
			});
			const engine = splitSourceToSections(src).filter(Boolean);
			expect(mine, name).toEqual(engine);
			if (ix.chunks.some((c) => c.sections.length > 1)) headingSplitDecks++;
		}
		// The property means something only if some committed deck actually splits on headings.
		expect(headingSplitDecks).toBeGreaterThan(0);
	});

	it('an outline-style deck is three slides, not one (#1570)', () => {
		const ix = buildDeckIndex('# Title\n\n## One\n\nbody\n\n## Two\n');
		expect(ix.chunks.length).toBe(1);
		expect(ix.sectionBase[1]).toBe(3);
		expect(sectionText(ix, 0, 2)).toBe('## Two');
		expect(sectionAt(ix, ix.source.indexOf('body'))).toEqual({ chunk: 0, section: 1 });
		expect(sectionOfFlat(ix, 2)).toEqual({ chunk: 0, section: 2 });
		expect(flatSection(ix, 0, 1)).toBe(1);
	});

	it('split: rule keeps one section per chunk', () => {
		const ix = buildDeckIndex('---\nsplit: rule\n---\n\n# Title\n\n## One\n');
		expect(ix.mode).toBe('rule');
		expect(ix.sectionBase[ix.chunks.length]).toBe(1);
	});

	it('an eyebrow and directives travel with their heading', () => {
		const src = '# A\n\n<!-- _class: kpi -->\n\n`EYEBROW`\n\n## B\n';
		const ix = buildDeckIndex(src);
		expect(sectionText(ix, 0, 1).startsWith('<!-- _class: kpi -->')).toBe(true);
	});
});

// ── Incremental updates equal a full build ──────────────────────────────────────

const LINES = ['# Head', '## Sub', 'text line', '', '---', '***', '```', '~~~', '$$', '<div>', '</div>', 'Setext', '===', '- item', '> quote', '<!-- _class: kpi -->', '`EYEBROW`', '| a | b |', '|---|---|', '    code', '- - -'];
const deckArb = fc.tuple(fc.boolean(), fc.boolean(), fc.array(fc.constantFrom(...LINES), { minLength: 0, maxLength: 40 })).map(([fm, rule, lines]) => `${fm ? `---\ntheme: indaco\n${rule ? 'split: rule\n' : ''}---\n\n` : ''}${lines.join('\n')}\n`);
const editArb = fc.record({ at: fc.nat(), del: fc.nat({ max: 12 }), ins: fc.oneof(fc.constantFrom('\n---\n', '```\n', '# X\n', '\n', 'x', '\n\n', '=', '-', '<div>\n', '## Y\n'), fc.string({ maxLength: 6 })) });
function apply(src: string, e: { at: number; del: number; ins: string }): string {
	const at = e.at % (src.length + 1);
	return src.slice(0, at) + e.ins + src.slice(Math.min(src.length, at + e.del));
}

describe('DeckIndex — incremental update', () => {
	it('equals a full build of the same text, over random decks and edit sequences', () => {
		fc.assert(
			fc.property(deckArb, fc.array(editArb, { minLength: 1, maxLength: 12 }), (deck, edits) => {
				let ix = buildDeckIndex(deck);
				let src = deck;
				for (const e of edits) {
					src = apply(src, e);
					ix = updateDeckIndex(ix, src);
					expect(shape(ix)).toEqual(shape(buildDeckIndex(src)));
				}
			}),
			{ numRuns: Number(process.env.FUOCO_RUNS || 400) },
		);
	});

	it('FAILING ARM: without the closing-separator check the same property goes red', () => {
		const run = () =>
			fc.assert(
				fc.property(deckArb, fc.array(editArb, { minLength: 1, maxLength: 12 }), (deck, edits) => {
					let ix = buildDeckIndex(deck);
					let src = deck;
					for (const e of edits) {
						src = apply(src, e);
						ix = updateDeckIndex(ix, src, { skipClosingCheck: true });
						expect(shape(ix)).toEqual(shape(buildDeckIndex(src)));
					}
				}),
				{ numRuns: Number(process.env.FUOCO_RUNS || 400) },
			);
		expect(run).toThrow();
	});

	it('a keystroke inside one slide of a large deck parses a region, not the deck', () => {
		const src = fs.readFileSync(path.join(ROOT, 'test/integration/baseline-decks/gallery.md'), 'utf8');
		const ix = buildDeckIndex(src);
		const at = src.indexOf('\n', Math.floor(src.length / 2));
		const before = { ...indexStats };
		const next = updateDeckIndex(ix, `${src.slice(0, at)}x${src.slice(at)}`);
		expect(indexStats.incremental - before.incremental).toBe(1);
		expect(indexStats.full - before.full).toBe(0);
		expect(indexStats.regionChars - before.regionChars).toBeLessThan(src.length / 20);
		// Every chunk keeps its id across a keystroke.
		expect(next.chunks.map((c) => c.id)).toEqual(ix.chunks.map((c) => c.id));
	});

	it('a span that does not describe the edit is ignored, not trusted', () => {
		const ix = buildDeckIndex('# A\n\n---\n\n# B\n');
		const next = updateDeckIndex(ix, '# A\n\n---\n\n# BB\n', { span: { from: 0, toA: 1, toB: 1 } });
		expect(shape(next)).toEqual(shape(buildDeckIndex('# A\n\n---\n\n# BB\n')));
	});

	it('identical text returns the same snapshot', () => {
		const ix = buildDeckIndex('# A\n\n---\n\n# B\n');
		expect(updateDeckIndex(ix, '# A\n\n---\n\n# B\n')).toBe(ix);
	});
});

describe('DeckIndex — stable ids', () => {
	const deck = '# A\n\n---\n\n# B\n\n---\n\n# C\n';
	it('typing a separator inside a slide keeps the first half and mints the second', () => {
		const ix = buildDeckIndex(deck);
		const at = deck.indexOf('# B') + 3;
		const ins = '\n\n---\n\n# B2';
		const next = updateDeckIndex(ix, `${deck.slice(0, at)}${ins}${deck.slice(at)}`, { span: { from: at, toA: at, toB: at + ins.length } });
		expect(next.chunks.length).toBe(4);
		expect(next.chunks[0].id).toBe(ix.chunks[0].id);
		expect(next.chunks[1].id).toBe(ix.chunks[1].id);
		expect(next.chunks[3].id).toBe(ix.chunks[2].id);
		expect(new Set(next.chunks.map((c) => c.id)).size).toBe(4);
	});
	it('a duplicated slide gets a new id; the original keeps its own', () => {
		const ix = buildDeckIndex(deck);
		const at = deck.indexOf('---\n\n# C');
		const ins = '---\n\n# B\n\n';
		const next = updateDeckIndex(ix, `${deck.slice(0, at)}${ins}${deck.slice(at)}`, { span: { from: at, toA: at, toB: at + ins.length } });
		expect(next.chunks.map((c) => chunkText(next, next.chunks.indexOf(c)))).toEqual(['# A', '# B', '# B', '# C']);
		expect(next.chunks[1].id).toBe(ix.chunks[1].id);
		expect(next.chunks[2].id).not.toBe(ix.chunks[1].id);
		expect(next.chunks[3].id).toBe(ix.chunks[2].id);
	});
	it('deleting a separator merges into the slide above, which keeps its id', () => {
		const ix = buildDeckIndex(deck);
		const next = updateDeckIndex(ix, deck.replace('\n\n---\n\n# B', '\n\n# B'));
		expect(next.chunks.length).toBe(2);
		expect(next.chunks[0].id).toBe(ix.chunks[0].id);
		expect(next.chunks[1].id).toBe(ix.chunks[2].id);
	});
});

describe('DeckIndex — forward-scanning plugin rules', () => {
	it('a `$$` closer added slides below an opener rebuilds rather than answering from the region', () => {
		const deck = '$$\n$$\n# Head\n\n---\n\n$$\n';
		const ix = buildDeckIndex(deck);
		const next = `\n---\n\n${deck.slice(2)}`;
		expect(shape(updateDeckIndex(ix, next))).toEqual(shape(buildDeckIndex(next)));
	});
});
