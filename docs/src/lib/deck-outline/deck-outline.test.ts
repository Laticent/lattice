import fs from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import sectionSplit from '../../../../lib/core/section-source-split.js';
import { addSlideAfter, deleteSlide, duplicateSlide, moveSlide } from '../../components/studio/deck-ops';
import { splitSlides } from '../../components/studio/lint';
import { createFocusHub } from '../fuoco/hub';
import { flatPart, partAt, partOfFlat, partText, unitText } from '../fuoco/outline';
import { buildDeckIndex, type DeckIndex, deckOutliner, indexStats, updateDeckIndex } from './deck-outline';

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
const shape = (ix: DeckIndex) => ({ bodyStart: ix.bodyStart, mode: ix.mode, seps: ix.seps, chunks: ix.units.map((c) => [c.from, c.start, c.end, [...c.parts]]) });

describe('DeckIndex — agrees with the derivations it replaces', () => {
	const decks = corpus();

	it('reads a real corpus (the oracle is not vacuous)', () => {
		expect(decks.length).toBeGreaterThan(50);
	});

	it('chunk i is splitSlides(source)[i], on every committed deck', () => {
		for (const [name, src] of decks) {
			const ix = buildDeckIndex(src);
			const got = ix.units.map((_, i) => unitText(ix, i));
			expect(got, name).toEqual(splitSlides(src.slice(ix.bodyStart)));
		}
	});

	it("sections are the ENGINE's slides: the texts splitSourceToSections recovers, on every committed deck", () => {
		let headingSplitDecks = 0;
		for (const [name, src] of decks) {
			const ix = buildDeckIndex(src);
			const mine: string[] = [];
			ix.units.forEach((c, i) => {
				for (let k = 0; k < c.parts.length; k++) mine.push(partText(ix, i, k));
			});
			const engine = splitSourceToSections(src).filter(Boolean);
			expect(mine, name).toEqual(engine);
			if (ix.units.some((c) => c.parts.length > 1)) headingSplitDecks++;
		}
		// The property means something only if some committed deck actually splits on headings.
		expect(headingSplitDecks).toBeGreaterThan(0);
	});

	it('an outline-style deck is three slides, not one (#1570)', () => {
		const ix = buildDeckIndex('# Title\n\n## One\n\nbody\n\n## Two\n');
		expect(ix.units.length).toBe(1);
		expect(ix.partBase[1]).toBe(3);
		expect(partText(ix, 0, 2)).toBe('## Two');
		expect(partAt(ix, ix.source.indexOf('body'))).toEqual({ unit: 0, part: 1 });
		expect(partOfFlat(ix, 2)).toEqual({ unit: 0, part: 2 });
		expect(flatPart(ix, 0, 1)).toBe(1);
	});

	it('a body that opens with a separator is parsed once, as the engine parses it', () => {
		// Before Fuoco, splitSlides stripped front matter a second time and read `---\n\n# A\n\n---`
		// as front matter: two slides became one for every slide operation (the checker's catch).
		const src = '---\nmarp: true\n---\n\n---\n\n# A\n\n---\n\n# B\n';
		const ix = buildDeckIndex(src);
		expect(ix.units.map((_, i) => unitText(ix, i))).toEqual(['# A', '# B']);
		expect(splitSlides(src.slice(ix.bodyStart))).toEqual(['# A', '# B']);
		expect(splitSourceToSections(src).filter(Boolean)).toEqual(['# A', '# B']);
	});

	it('a re-split under new parser rules keeps the revision of the same text', async () => {
		const { setBoundaryPluginsOff } = await import('../../../../lib/core/boundary-parser.mjs');
		const src = '# A\n\n$$\n\n---\n\n$$\n';
		const ix = buildDeckIndex(src);
		try {
			setBoundaryPluginsOff(['math']);
			const next = updateDeckIndex(ix, src);
			expect(next).not.toBe(ix);
			expect(next.rev).toBe(ix.rev);
			expect(next.units.length).not.toBe(ix.units.length);
		} finally {
			setBoundaryPluginsOff([]);
		}
	});

	it('split: rule keeps one section per chunk', () => {
		const ix = buildDeckIndex('---\nsplit: rule\n---\n\n# Title\n\n## One\n');
		expect(ix.mode).toBe('rule');
		expect(ix.partBase[ix.units.length]).toBe(1);
	});

	it('an eyebrow and directives travel with their heading', () => {
		const src = '# A\n\n<!-- _class: kpi -->\n\n`EYEBROW`\n\n## B\n';
		const ix = buildDeckIndex(src);
		expect(partText(ix, 0, 1).startsWith('<!-- _class: kpi -->')).toBe(true);
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
		expect(next.units.map((c) => c.id)).toEqual(ix.units.map((c) => c.id));
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
		expect(next.units.length).toBe(4);
		expect(next.units[0].id).toBe(ix.units[0].id);
		expect(next.units[1].id).toBe(ix.units[1].id);
		expect(next.units[3].id).toBe(ix.units[2].id);
		expect(new Set(next.units.map((c) => c.id)).size).toBe(4);
	});
	it('a duplicated slide gets a new id; the original keeps its own', () => {
		const ix = buildDeckIndex(deck);
		const at = deck.indexOf('---\n\n# C');
		const ins = '---\n\n# B\n\n';
		const next = updateDeckIndex(ix, `${deck.slice(0, at)}${ins}${deck.slice(at)}`, { span: { from: at, toA: at, toB: at + ins.length } });
		expect(next.units.map((c) => unitText(next, next.units.indexOf(c)))).toEqual(['# A', '# B', '# B', '# C']);
		expect(next.units[1].id).toBe(ix.units[1].id);
		expect(next.units[2].id).not.toBe(ix.units[1].id);
		expect(next.units[3].id).toBe(ix.units[2].id);
	});
	it('deleting a separator merges into the slide above, which keeps its id', () => {
		const ix = buildDeckIndex(deck);
		const next = updateDeckIndex(ix, deck.replace('\n\n---\n\n# B', '\n\n# B'));
		expect(next.units.length).toBe(2);
		expect(next.units[0].id).toBe(ix.units[0].id);
		expect(next.units[1].id).toBe(ix.units[2].id);
	});
});

// A SLIDE'S ID FOLLOWS THE SLIDE through a structural edit (engineering/decisions/2026-10-27-slide-structure-strip.md §10).
// By offset alone, deleting B handed B's id to C and adding after B handed C's id to the new slide; the focus hub
// re-places a viewer by id, so a Live viewer on C landed on the wrong slide. `moved` from the slide ops is the answer key.
describe('DeckIndex — ids follow the slide through structural edits', () => {
	const deck = '# A\n\na\n\n---\n\n# B\n\nb\n\n---\n\n# C\n\n## C1\n\nx\n\n## C2\n\ny\n\n---\n\n# D\n\nd\n\n---\n\n# E\n\ne\n';
	const keeps = (src: string, r: { source: string; moved?: number[] }, path: 'incremental' | 'full') => {
		const ix = buildDeckIndex(src);
		const next = path === 'full' ? buildDeckIndex(r.source, ix, () => undefined) : updateDeckIndex(ix, r.source);
		(r.moved ?? []).forEach((to, from) => {
			if (to >= 0) expect(next.units[to].id, `${path}: slide ${from} → ${to}`).toBe(ix.units[from].id);
		});
		const ids = next.units.map((u) => u.id);
		expect(new Set(ids).size).toBe(ids.length);
	};

	it('delete, add, move and duplicate each keep every surviving slide its own id', () => {
		for (const path of ['incremental', 'full'] as const) {
			keeps(deck, deleteSlide(deck, 1), path);
			keeps(deck, addSlideAfter(deck, 1), path);
			keeps(deck, moveSlide(deck, 1, 3), path);
			keeps(deck, duplicateSlide(deck, 1), path);
		}
	});

	it('the slide a viewer is on is still found by its id after a peer adds a slide before it', () => {
		const ix = buildDeckIndex(deck);
		const charlie = ix.units[2].id;
		const next = updateDeckIndex(ix, addSlideAfter(deck, 1).source);
		expect(unitText(next, next.units.findIndex((u) => u.id === charlie))).toMatch(/^# C/);
	});

	it('a reader whose caret sits at the top of a slide stays on it when a slide is added just before it', () => {
		// A view puts the caret at the top of the slide it shows (its first character, or the blank line above it). An
		// insertion there leaves `mapOffset`'s caret on the near side, in the NEW slide; the hub moves it to the top of the
		// slide the reader was on, which its id still names.
		const sched = { frame: (f: () => void) => f(), idle: (f: () => void) => f() };
		for (const at of ['start', 'from'] as const) {
			const hub = createFocusHub({ outliner: deckOutliner, scheduler: sched });
			hub.update(deck);
			const c = (hub.outline() as DeckIndex).units[2];
			hub.report('markdown', { head: at === 'start' ? c.start : c.from });
			hub.update(addSlideAfter(deck, 1).source);
			const f = hub.get();
			expect(unitText(hub.outline() as DeckIndex, f.unitIndex), `caret at ${at}`).toMatch(/^# C/);
		}
	});

	it('a reader at the top of a slide that a peer merges into the one above stays with its text', () => {
		// The slide's id is gone, so the hub must not move the caret to the "top" of whatever now sits at its index.
		const sched = { frame: (f: () => void) => f(), idle: (f: () => void) => f() };
		for (const at of ['start', 'from'] as const) {
			const hub = createFocusHub({ outliner: deckOutliner, scheduler: sched });
			hub.update(deck);
			const c = (hub.outline() as DeckIndex).units[2];
			hub.report('markdown', { head: at === 'start' ? c.start : c.from });
			const cut = deck.indexOf('\n---\n\n# C');
			hub.update(deck.slice(0, cut) + deck.slice(cut + '\n---\n'.length));
			expect(unitText(hub.outline() as DeckIndex, hub.get().unitIndex), `caret at ${at}`).toMatch(/^# B[\s\S]*# C/);
		}
	});

	it('typing in a slide that has an identical copy keeps both their ids, on both paths', () => {
		// `$$` forces the full rebuild on every keystroke (a forward-scanning rule), the path where text alone would match
		// the untouched copy to the edited original's old text.
		const math = '# A\n\na\n\n---\n\n# B\n\n$$\nx\n$$\n\n---\n\n# C\n\nc\n';
		for (const src of [math, deck]) {
			const dup = duplicateSlide(src, 1).source;
			const ix = buildDeckIndex(dup);
			const at = ix.units[1].start + '# B'.length;
			const typed = `${dup.slice(0, at)}!${dup.slice(at)}`;
			const next = updateDeckIndex(ix, typed);
			expect(next.units[1].id, 'the edited original').toBe(ix.units[1].id);
			expect(next.units[2].id, 'the untouched copy').toBe(ix.units[2].id);
		}
	});

	it('holds on random decks and random ops', () => {
		fc.assert(
			fc.property(fc.integer({ min: 2, max: 7 }), fc.nat(), fc.nat(), fc.constantFrom('move', 'delete', 'add', 'dup'), fc.boolean(), (n, a, b, op, full) => {
				const src = Array.from({ length: n }, (_, k) => `# S${k}\n\ntext ${k}`).join('\n\n---\n\n');
				const i = a % n;
				const j = b % n;
				const r = op === 'move' ? moveSlide(src, i, j) : op === 'delete' ? deleteSlide(src, i) : op === 'add' ? addSlideAfter(src, i) : duplicateSlide(src, i);
				keeps(src, r, full ? 'full' : 'incremental');
			}),
			{ numRuns: 300 },
		);
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
