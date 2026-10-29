// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { addSlideAfter, deleteSlide, deleteTargetName, duplicateSlide, moveSlide, NEW_SLIDE, replaceSlide } from './deck-ops';
import { stripFrontMatter } from './front-matter';
import { slideRanges, splitSlides } from './lint';
import { canSplitSlide, splitSlideInHalf } from './split-slide';

const DECK = '<!-- _class: title -->\n\n# A\n\n---\n\n<!-- _class: kpi -->\n\n## B\n\n---\n\n<!-- _class: closing -->\n\n## C';
const count = (s: string) => splitSlides(stripFrontMatter(s)).length;

describe('deck-ops — structural slide editing', () => {
	it('addSlideAfter inserts and returns the new index', () => {
		const r = addSlideAfter(DECK, 0);
		expect(count(r.source)).toBe(4);
		expect(r.active).toBe(1);
		expect(splitSlides(stripFrontMatter(r.source))[1]).toBe(NEW_SLIDE);
	});

	it('keeps a blank slide through every structural edit, as the engine renders it', () => {
		// splitSlides used to drop an empty chunk, so any edit rejoined the deck without it and deleted the blank
		// slide from the source (followups.d/2789-p3, closed).
		const blank = '# A\n\n---\n\n---\n\n# C\n';
		expect(splitSlides(blank)).toEqual(['# A', '', '# C']);
		expect(splitSlides(moveSlide(blank, 2, 0).source)).toEqual(['# C', '# A', '']);
		expect(splitSlides(duplicateSlide(blank, 0).source)).toEqual(['# A', '# A', '', '# C']);
		expect(splitSlides(addSlideAfter(blank, 1).source)).toEqual(['# A', '', NEW_SLIDE, '# C']);
		expect(splitSlides(deleteSlide(blank, 1).source)).toEqual(['# A', '# C']);
	});

	it('never deletes a leading link reference definition when it rejoins the deck', () => {
		const src = '[a]: https://example.com\n\n---\n\n# One [link][a]\n\n---\n\n# Two\n';
		expect(moveSlide(src, 1, 2).source).toContain('[a]: https://example.com');
		expect(addSlideAfter(src, 2).source).toContain('[a]: https://example.com');
	});

	it('addSlideAfter seeds an empty-deck entry: -1 and non-finite both land at 0', () => {
		// The empty-deck "add your first slide" entry point may pass -1 (no current
		// slide) or, if a cursor was never set, a non-finite index. Both must insert
		// at position 0 and return a real `active` (never NaN, which would poison the
		// rail highlight and every subsequent curIndex+1 insert).
		const seedNeg = addSlideAfter('', -1);
		expect(seedNeg.active).toBe(0);
		expect(count(seedNeg.source)).toBe(1);
		const seedNaN = addSlideAfter('', Number.NaN);
		expect(Number.isFinite(seedNaN.active)).toBe(true);
		expect(seedNaN.active).toBe(0);
		// @ts-expect-error — an entry point that never set a cursor can pass undefined
		expect(addSlideAfter(DECK, undefined).active).toBe(0);
	});

	it('duplicateSlide copies the slide right after it', () => {
		const r = duplicateSlide(DECK, 1);
		const slides = splitSlides(stripFrontMatter(r.source));
		expect(count(r.source)).toBe(4);
		expect(slides[1]).toBe(slides[2]); // B duplicated
		expect(r.active).toBe(2);
	});

	it('deleteSlide removes the slide, never the last one', () => {
		const r = deleteSlide(DECK, 1);
		const slides = splitSlides(stripFrontMatter(r.source));
		expect(count(r.source)).toBe(2);
		expect(slides.some((s) => s.includes('## B'))).toBe(false);
		// A one-slide deck is never emptied.
		const single = '<!-- _class: title -->\n\n# Only';
		expect(count(deleteSlide(single, 0).source)).toBe(1);
	});

	it('moveSlide reorders and the active index follows', () => {
		const r = moveSlide(DECK, 0, 2); // A to the end
		const slides = splitSlides(stripFrontMatter(r.source));
		expect(slides[2]).toContain('# A');
		expect(r.active).toBe(2);
	});

	it('preserves front-matter across every op', () => {
		const withFm = `---\nsize: square\npaginate: true\n---\n\n${DECK}`;
		for (const r of [addSlideAfter(withFm, 0), duplicateSlide(withFm, 0), deleteSlide(withFm, 0), moveSlide(withFm, 0, 1)]) {
			expect(r.source).toMatch(/^---\nsize: square\npaginate: true\n---\n/);
			// The front-matter is not counted as a slide.
			expect(count(r.source)).toBeGreaterThanOrEqual(2);
		}
	});
});

describe('replaceSlide — changes one slide and no other byte', () => {
	// A Slide-panel edit used to rejoin the whole deck, which dropped the final newline: the edit then also touched the
	// LAST byte, the focus hub mapped the caret through one span reaching the end, and the preview jumped to the last slide.
	const AUTHORED = '---\ntitle: X\n---\n\n<!-- _class: image statement card-clear -->\n\n## A\n\n---\n\n## B\n\n\n---\n## C\n\nlast line\n';

	it('keeps the final newline, the separators and the other slides byte for byte', () => {
		const next = replaceSlide(AUTHORED, 0, '<!-- _class: image statement card-clear ink-dark -->\n\n## A').source;
		expect(next).toBe(AUTHORED.replace('card-clear -->', 'card-clear ink-dark -->'));
	});

	it('edits a middle and a last slide in place too', () => {
		expect(replaceSlide(AUTHORED, 1, '## B2').source).toBe(AUTHORED.replace('## B\n', '## B2\n'));
		expect(replaceSlide(AUTHORED, 2, '## C\n\nnew line').source).toBe(AUTHORED.replace('last line', 'new line'));
	});

	it('slideRanges point at exactly the text splitSlides returns', () => {
		for (const deck of [AUTHORED, DECK, '\n\n---\n\n## X\n\n---\n\n\n\n---\n\n## Y  \n']) {
			const body = stripFrontMatter(deck);
			expect(slideRanges(body).map((r) => body.slice(r.from, r.to))).toEqual(splitSlides(body));
		}
	});
});

describe('splitSlideInHalf — the one-click fix for a slide too full for its venue', () => {
	const FM = '---\nmarp: true\nvenue: hall\n---\n\n';
	const steps = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}. Step ${i + 1}\n   - Why it matters.`).join('\n');
	const slide = (n: number) => `<!-- _class: list-steps -->\n\n\`Eyebrow\`\n\n## Heading.\n\n${steps(n)}\n\n> The takeaway.\n\n<!--\nSpeaker note.\n-->`;

	it('halves the main list; the second half repeats the heading and keeps the takeaway and notes', () => {
		const src = `${FM}<!-- _class: title -->\n\n# T\n\n---\n\n${slide(5)}`;
		const r = splitSlideInHalf(src, 1);
		expect(r).not.toBeNull();
		const out = splitSlides(stripFrontMatter(r!.source));
		expect(out).toHaveLength(3);
		expect(r!.active).toBe(1);
		expect(r!.source.startsWith(FM)).toBe(true);
		expect(out[1]).toContain('3. Step 3');
		expect(out[1]).not.toContain('4. Step 4');
		expect(out[1]).not.toContain('takeaway');
		expect(out[2]).toMatch(/^<!-- _class: list-steps -->\n\n`Eyebrow`\n\n## Heading\./);
		expect(out[2]).toContain('4. Step 4\n   - Why it matters.\n5. Step 5');
		expect(out[2]).toContain('> The takeaway.');
		expect(out[2].match(/Speaker note/g)).toHaveLength(1);
		expect(out[1]).not.toContain('Speaker note');
	});

	it('a table keeps its header on both halves', () => {
		const t = '## Rows.\n\n| A | B |\n|---|---|\n| 1 | x |\n| 2 | y |\n| 3 | z |\n| 4 | w |';
		const out = splitSlides(stripFrontMatter(splitSlideInHalf(t, 0)!.source));
		expect(out[0]).toBe('## Rows.\n\n| A | B |\n|---|---|\n| 1 | x |\n| 2 | y |');
		expect(out[1]).toBe('## Rows.\n\n| A | B |\n|---|---|\n| 3 | z |\n| 4 | w |');
	});

	it('picks the biggest collection and ignores a list inside a code fence', () => {
		const s = '## H.\n\n```\n- a\n- b\n- c\n- d\n```\n\n- one\n- two';
		const out = splitSlides(stripFrontMatter(splitSlideInHalf(s, 0)!.source));
		expect(out[0]).toContain('- a\n- b\n- c\n- d');
		expect(out[0].endsWith('- one')).toBe(true);
		expect(out[1]).toBe('## H.\n\n- two');
	});

	it('does not double a speaker note that opens like a directive, and skips $$ math', () => {
		const s = '<!-- _class: list -->\n<!-- Note: mention the Q3 dip -->\n## H.\n\n$$\n- x\n- y\n- z\n$$\n\n- a\n- b';
		const out = splitSlides(stripFrontMatter(splitSlideInHalf(s, 0)!.source));
		expect(out[1]).toBe('<!-- _class: list -->\n## H.\n\n- b');
		expect(out[0]).toContain('$$\n- x\n- y\n- z\n$$');
	});

	it('never splits a list inside a speaker-note comment', () => {
		const s = '<!-- _class: list -->\n# Title\n\n- a\n- b\n\n<!--\n- n1\n- n2\n- n3\n- n4\n-->';
		const out = splitSlides(stripFrontMatter(splitSlideInHalf(s, 0)!.source));
		expect(out[0]).toBe('<!-- _class: list -->\n# Title\n\n- a');
		expect(out[1]).toContain('- b\n\n<!--\n- n1\n- n2\n- n3\n- n4\n-->');
		expect(canSplitSlide('## H.\n\nText.\n\n<!--\n- n1\n- n2\n-->')).toBe(false);
	});

	it('returns null, and canSplitSlide is false, when there is nothing to divide', () => {
		expect(canSplitSlide('## One idea.\n\nA paragraph.')).toBe(false);
		expect(splitSlideInHalf('## One idea.\n\n- only one', 0)).toBeNull();
		expect(canSplitSlide(slide(2))).toBe(true);
	});
});

describe('deleteTargetName', () => {
	it('names the block by title, and counts the rendered slides that go with it', () => {
		expect(deleteTargetName('Pricing', 1)).toBe('“Pricing”');
		expect(deleteTargetName('Pricing', 3)).toBe('“Pricing” (3 slides)');
	});
	it('falls back to words that still say how much goes', () => {
		expect(deleteTargetName('', 1)).toBe('this slide');
		expect(deleteTargetName('  ', 3)).toBe('these 3 slides');
	});
	it('keeps a long title to one short line', () => {
		const name = deleteTargetName('A heading that runs far longer than any confirm has room to show', 1);
		expect(name.length).toBeLessThanOrEqual(42);
		expect(name.endsWith('…”')).toBe(true);
	});
});

// TOUCH ONLY WHAT YOU CHANGE (engineering/decisions/2026-10-27-slide-structure-strip.md §8): an op changes the slides it
// involves and leaves every other byte of the deck as the author wrote it.
describe('deck-ops — edits only the slides involved', () => {
	const changed = (a: string, b: string) => {
		let i = 0;
		while (i < a.length && i < b.length && a[i] === b[i]) i++;
		let j = 0;
		while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
		return Math.max(a.length - i - j, b.length - i - j);
	};
	// A blank line before each `---`: directly under a paragraph, `---` is a heading underline, not a separator.
	const thirty = `${Array.from({ length: 30 }, (_, k) => `# Slide ${k + 1}\n\nBody ${k + 1}.`).join('\n\n---\n')}\n`;

	it('moving the last slide of thirty rewrites only the two slides it swaps', () => {
		// Measured before: 557 of 595 characters rewritten.
		expect(splitSlides(thirty)).toHaveLength(30);
		const out = moveSlide(thirty, 29, 28).source;
		expect(out).not.toBe(thirty);
		// The span between the first and last changed byte is the two swapped slides and the separator between them:
		// 47 of the deck's 757 bytes. Before, the op rewrote almost all of it.
		expect(changed(thirty, out)).toBeLessThanOrEqual(60);
		expect(out.split('\n\n---\n')).toHaveLength(30);
	});

	it("keeps the author's separators and spacing on every op", () => {
		const src = '---\ntheme: indaco\n---\n\n# A\n\n***\n\n# B\n\n***\n\n# C\n';
		for (const r of [moveSlide(src, 0, 2), deleteSlide(src, 1), duplicateSlide(src, 0), addSlideAfter(src, 2), replaceSlide(src, 1, '# B2')]) {
			expect(r.source.startsWith('---\ntheme: indaco\n---\n\n')).toBe(true);
			expect(r.source).toContain('***');
		}
		expect(deleteSlide(src, 1).source).toBe('---\ntheme: indaco\n---\n\n# A\n\n***\n\n# C\n');
		expect(replaceSlide(src, 1, '# B2').source).toBe('---\ntheme: indaco\n---\n\n# A\n\n***\n\n# B2\n\n***\n\n# C\n');
	});

	it('reports where every slide went', () => {
		const src = '# A\n\n---\n\n# B\n\n---\n\n# C\n\n---\n\n# D';
		expect(moveSlide(src, 1, 3).moved).toEqual([0, 3, 1, 2]);
		expect(deleteSlide(src, 1).moved).toEqual([0, -1, 1, 2]);
		expect(addSlideAfter(src, 1).moved).toEqual([0, 1, 3, 4]);
		expect(duplicateSlide(src, 2).moved).toEqual([0, 1, 2, 4]);
	});

	it('agrees with the list edit on random decks, separators and spacing (the arm: the slide lists must match)', () => {
		let seed = 7;
		const rnd = (n: number) => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed % n;
		};
		const seps = ['\n---\n', '\n\n---\n\n', '\n***\n', '\n\n---\n'];
		// Leading blank slides are the engine's to drop, on either side of the comparison.
		const lead = (l: string[]) => {
			const out = [...l];
			while (out.length && !out[0]) out.shift();
			return out;
		};
		const got = (src: string) => lead(splitSlides(stripFrontMatter(src)));
		for (let run = 0; run < 300; run++) {
			const n = 1 + rnd(6);
			const bodies = Array.from({ length: n }, (_, k) => (rnd(5) === 0 ? '' : `# S${k}\n\ntext ${k}`));
			const sep = seps[rnd(seps.length)];
			const src = (rnd(2) ? '---\ntheme: indaco\n---\n\n' : '') + bodies.join(sep) + (rnd(2) ? '\n' : '');
			const list = splitSlides(stripFrontMatter(src));
			const a = rnd(list.length || 1);
			const b = rnd(list.length || 1);
			const want = (op: string): string[] => {
				const l = [...list];
				if (op === 'move' && l.length > 1) l.splice(b, 0, l.splice(a, 1)[0]);
				if (op === 'delete' && l.length > 1) l.splice(a, 1);
				if (op === 'dup' && l.length) l.splice(a + 1, 0, l[a]);
				if (op === 'add') l.splice(Math.min(a + 1, l.length), 0, NEW_SLIDE);
				return lead(l);
			};
			expect(got(moveSlide(src, a, b).source), `move ${a}->${b} of ${JSON.stringify(src)}`).toEqual(want('move'));
			expect(got(deleteSlide(src, a).source), `delete ${a} of ${JSON.stringify(src)}`).toEqual(want('delete'));
			expect(got(duplicateSlide(src, a).source), `dup ${a} of ${JSON.stringify(src)}`).toEqual(want('dup'));
			expect(got(addSlideAfter(src, a).source), `add after ${a} of ${JSON.stringify(src)}`).toEqual(want('add'));
		}
	});
});

// The checker's findings on the slot rewrite (2026-10-27): each failed before the fix.
describe('deck-ops — compact separators and indented first lines', () => {
	const units = (src: string) => splitSlides(stripFrontMatter(src)).length;

	it('never lets written content turn a compact separator into a heading underline', () => {
		// `- y\n---` is a separator after a list; `para\n---` would be a setext heading that merges two slides.
		const src = '# A\n\n- x\n- y\n---\n# B\n\nA closing paragraph.\n';
		expect(units(src)).toBe(2);
		expect(units(addSlideAfter(src, 1).source)).toBe(3);
		expect(units(addSlideAfter(src, 0).source)).toBe(3);
		expect(units(moveSlide(src, 1, 0).source)).toBe(2);
		expect(units(duplicateSlide(src, 1).source)).toBe(3);
		expect(units(replaceSlide(src, 0, '# A\n\nNow a paragraph.').source)).toBe(2);
	});

	it('keeps indentation with the content it belongs to, and writes moved or new content flush left', () => {
		const src = '# A\n\n---\n\n    code line\n\n---\n\n# C\n';
		expect(addSlideAfter(src, 0).source).not.toMatch(/\n[ \t]+<!-- _class/);
		expect(moveSlide(src, 2, 1).source).not.toMatch(/\n[ \t]+# C/);
		expect(duplicateSlide(src, 2).source).not.toMatch(/\n[ \t]+# C/);
		// The indented slide itself, untouched, keeps its code-block indentation.
		expect(addSlideAfter(src, 0).source).toContain('\n    code line');
	});

	it('reports `moved` against the deck the engine reads when a blank first slide drops', () => {
		const src = '# A\n\n---\n\n---\n\n# C\n';
		const r = moveSlide(src, 1, 0);
		expect(Math.max(...(r.moved ?? []))).toBeLessThan(units(r.source));
		const del = deleteSlide(src, 0);
		expect(Math.max(...(del.moved ?? []))).toBeLessThan(units(del.source));
	});

	it('ends front matter on its own line before a first slide', () => {
		expect(addSlideAfter('---\ntheme: x\n---', 0).source).toMatch(/^---\ntheme: x\n---\n/);
	});

	it('agrees with the list edit on random compact and indented decks', () => {
		let seed = 11;
		const rnd = (n: number) => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed % n;
		};
		const lead = (l: string[]) => {
			const out = [...l];
			while (out.length && !out[0]) out.shift();
			return out;
		};
		const got = (src: string) => lead(splitSlides(stripFrontMatter(src)));
		for (let run = 0; run < 400; run++) {
			const n = 1 + rnd(6);
			// Endings that a COMPACT separator may follow (a list, a heading) and one it may not (a paragraph); the
			// generator gives a paragraph-ending slide a blank line before its separator, as an author's deck would.
			const parts: string[] = [];
			for (let k = 0; k < n; k++) {
				const first = rnd(4) === 0 ? `    code ${k}` : `# S${k}`;
				const end = ['- item', '## Sub', 'A paragraph.'][rnd(3)];
				parts.push(`${first}\n\n${end}`);
				if (k < n - 1) parts.push(end === 'A paragraph.' || rnd(2) ? '\n\n---\n' : '\n---\n');
			}
			const src = parts.join('') + (rnd(2) ? '\n' : '');
			const list = splitSlides(stripFrontMatter(src));
			const a = rnd(list.length || 1);
			const b = rnd(list.length || 1);
			const want = (op: string): string[] => {
				const l = [...list];
				if (op === 'move' && l.length > 1) l.splice(b, 0, l.splice(a, 1)[0]);
				if (op === 'dup' && l.length) l.splice(a + 1, 0, l[a]);
				if (op === 'add') l.splice(Math.min(a + 1, l.length), 0, NEW_SLIDE);
				if (op === 'delete' && l.length > 1) l.splice(a, 1);
				// Written content goes flush left, as the old rejoin wrote it.
				return lead(l.map((x) => x.trim()));
			};
			for (const [op, r] of [['move', moveSlide(src, a, b)], ['dup', duplicateSlide(src, a)], ['add', addSlideAfter(src, a)], ['delete', deleteSlide(src, a)]] as const) {
				expect(got(r.source), `${op} ${a}/${b} of ${JSON.stringify(src)}`).toEqual(want(op));
				expect(r.source, `${op} indented a heading or directive`).not.toMatch(/\n[ \t]+(?:# S|<!-- _class)/);
			}
		}
	});
});

describe('delete lands on the slide that takes the deleted one’s place', () => {
	const four = ['A', 'B', 'C', 'D'].map((t) => `# ${t}`).join('\n\n---\n\n');
	it('the last slide: the new last slide, not the one before it', () => {
		// Was clamped to a length one short, so deleting slide 4 of 4 landed on 2 of 3 (found driving the strip on a phone).
		expect(deleteSlide(four, 3).active).toBe(2);
	});
	it('a middle slide: the one after it; the first: the new first', () => {
		expect(deleteSlide(four, 1).active).toBe(1);
		expect(deleteSlide(four, 0).active).toBe(0);
	});
});

describe('deck ops keep the front-matter say: narration on its slide (§8)', async () => {
	const { buildDeckIndex } = await import('@/lib/deck-outline');
	const { partText } = await import('@/lib/fuoco/outline');
	const { frontMatterSayMap } = await import('@/lib/resolve-narration');
	// Every rendered slide, in order, as the narration counts them (1-based numbers).
	const slides = (src: string) => {
		const ix = buildDeckIndex(src);
		return ix.units.flatMap((u, i) => u.parts.map((_, k) => partText(ix, i, k)));
	};
	// Each entry names the heading of the slide it belongs to; after an op, it must still sit on that slide.
	const onItsSlide = (src: string) => {
		const all = slides(src);
		for (const [n, said] of frontMatterSayMap(src)) expect(all[n - 1], `say ${n}: ${said}`).toMatch(new RegExp(`^#+ ${said}\\b`, 'm'));
	};
	const deck = (n: number, keys = Array.from({ length: n }, (_, k) => k)) =>
		`---\ntheme: indaco\nsay:\n${keys.map((k) => `  ${k + 1}: S${k}`).join('\n')}\nlang: en\n---\n\n${Array.from({ length: n }, (_, k) => `# S${k}\n\ntext ${k}`).join('\n\n---\n\n')}\n`;

	it('move, add, duplicate and delete each keep every entry on its slide', () => {
		const src = deck(5);
		for (const r of [moveSlide(src, 0, 3), moveSlide(src, 4, 1), addSlideAfter(src, 1), addSlideAfter(src, -1), duplicateSlide(src, 2), deleteSlide(src, 1), deleteSlide(src, 4)]) onItsSlide(r.source);
	});

	it('a deleted slide takes its entry with it, and a duplicate copies it', () => {
		expect([...frontMatterSayMap(deleteSlide(deck(4), 1).source).values()]).toEqual(['S0', 'S2', 'S3']);
		expect([...frontMatterSayMap(duplicateSlide(deck(3), 1).source)]).toEqual([[1, 'S0'], [2, 'S1'], [3, 'S1'], [4, 'S2']]);
	});

	it('changes only the key digits: the rest of the front matter and the body are as they were', () => {
		const src = deck(4).replace('  2: S1', '  2: "S1"   # quoted');
		const r = moveSlide(src, 1, 2);
		expect(r.source.replace(/^ {2}\d+:/gm, '')).toBe(moveSlide(src.replace(/^ {2}\d+:/gm, ''), 1, 2).source.replace(/^ {2}\d+:/gm, ''));
		expect(r.source).toContain('  3: "S1"   # quoted');
	});

	it('a block that headings split counts as its slides', () => {
		// Block 1 renders as two slides (S1 and S1b), so moving it shifts every number after it by two.
		const src = '---\nsplit: headings\nsay:\n  1: S0\n  2: S1\n  3: S1b\n  4: S2\n---\n\n# S0\n\nzero\n\n---\n\n# S1\n\none\n\n# S1b\n\none b\n\n---\n\n# S2\n\ntwo\n';
		expect(slides(src).length).toBe(4);
		const r = moveSlide(src, 1, 2);
		onItsSlide(r.source);
		expect([...frontMatterSayMap(r.source)].sort((a, b) => a[0] - b[0])).toEqual([[1, 'S0'], [2, 'S2'], [3, 'S1'], [4, 'S1b']]);
	});

	it('holds on random decks, random ops and sparse say: maps', () => {
		for (let run = 0; run < 400; run++) {
			const n = 2 + (run % 6);
			const keys = Array.from({ length: n }, (_, k) => k).filter((k) => (run >> k) & 1 || k === 0);
			const src = deck(n, keys);
			const a = (run * 7) % n;
			const b = (run * 13 + 1) % n;
			const op = run % 4;
			const r = op === 0 ? moveSlide(src, a, b) : op === 1 ? deleteSlide(src, a) : op === 2 ? addSlideAfter(src, a) : duplicateSlide(src, a);
			onItsSlide(r.source);
			const survivors = keys.length - (op === 1 && keys.includes(a) && n > 1 ? 1 : 0) + (op === 3 && keys.includes(a) ? 1 : 0);
			expect(frontMatterSayMap(r.source).size, `run ${run}`).toBe(survivors);
		}
	});

	it('a deck with no say: block comes back byte for byte as before', () => {
		const src = deck(3).replace(/say:\n(?: {2}.*\n)+/, '');
		expect(moveSlide(src, 0, 2).source).not.toContain('say:');
	});
});

describe('ops on a rendered slide inside a heading-split block (§6)', async () => {
	const fs = await import('node:fs');
	const path = await import('node:path');
	const { addAfterAt, addBeforeAt, deleteAt, duplicateAt, moveAt, renderedCount } = await import('./deck-ops');
	const { buildDeckIndex } = await import('@/lib/deck-outline');
	const sectionSplit = (await import('../../../../lib/core/section-source-split.js')).default as { splitSourceToSections: (s: string) => string[] };
	// The ENGINE's slides, trimmed: what a cut must leave exactly as it was.
	const engine = (src: string) => sectionSplit.splitSourceToSections(src).map((t) => t.trim()).filter(Boolean);
	// The rendered slide at flat position `f`, as the strip names it.
	const at = (src: string, f: number) => {
		const units = buildDeckIndex(src).units;
		let n = f;
		for (let u = 0; u < units.length; u++) {
			if (n < units[u].parts.length) return { unit: u, part: n };
			n -= units[u].parts.length;
		}
		throw new Error(`no slide ${f}`);
	};
	const example = fs.readFileSync(path.resolve(__dirname, '../../../../examples/split-headings.md'), 'utf8');
	const outline = '---\nsplit: headings\n---\n\n# A\n\na\n\n## B\n\nb\n\n## C\n\nc\n\n---\n\n# D\n\nd\n\n## E\n\ne\n';

	it('the example deck renders as one block of several slides, so the strip has something to cut', () => {
		expect(buildDeckIndex(example).units.length).toBeLessThan(renderedCount(example));
	});

	it('every op on every slide of both decks gives the slides a list model predicts, by the engine’s own split', () => {
		for (const src of [example, outline]) {
			const before = engine(src);
			const n = before.length;
			expect(renderedCount(src)).toBe(n);
			const NEW = '## Fresh\n\nnew body';
			for (let f = 0; f < n; f++) {
				const s = at(src, f);
				const dup = [...before.slice(0, f + 1), before[f], ...before.slice(f + 1)];
				expect(engine(duplicateAt(src, s).source), `duplicate ${f}`).toEqual(dup);
				expect(engine(deleteAt(src, s).source), `delete ${f}`).toEqual(before.filter((_, k) => k !== f));
				expect(engine(addAfterAt(src, s, NEW).source), `add after ${f}`).toEqual([...before.slice(0, f + 1), NEW, ...before.slice(f + 1)]);
				const b = addBeforeAt(src, s, NEW);
				expect(engine(b.source), `add before ${f}`).toEqual([...before.slice(0, f), NEW, ...before.slice(f)]);
				expect(engine(b.source)[buildDeckIndex(b.source).units.slice(0, b.active).reduce((k, u) => k + u.parts.length, 0)], `add before ${f} lands on the new slide`).toBe(NEW);
				for (const dir of [-1, 1] as const) {
					const to = f + dir;
					const moved = to < 0 || to >= n ? before : before.map((t, k) => (k === f ? before[to] : k === to ? before[f] : t));
					expect(engine(moveAt(src, s, dir).source), `move ${f} by ${dir}`).toEqual(moved);
				}
			}
		}
	});

	it('a drag’s move to any position gives the list model’s order, in one write, landing on the moved slide', async () => {
		const { moveToAt, flatOfSlide, slideAtFlat } = await import('./deck-ops');
		for (const src of [example, outline]) {
			const before = engine(src);
			const n = before.length;
			for (let f = 0; f < n; f++) {
				expect(flatOfSlide(src, at(src, f))).toBe(f);
				expect(slideAtFlat(src, f)).toEqual(at(src, f));
				for (let t = 0; t < n; t++) {
					const want = [...before];
					const [x] = want.splice(f, 1);
					want.splice(t, 0, x);
					const r = moveToAt(src, at(src, f), t);
					expect(engine(r.source), `move ${f} to ${t}`).toEqual(want);
					if (t !== f) expect(flatOfSlide(r.source, { unit: r.active, part: 0 }), `move ${f} to ${t} lands on it`).toBe(t);
				}
			}
			expect(slideAtFlat(src, n)).toBeNull();
			expect(flatOfSlide(src, { unit: 99, part: 0 })).toBe(-1);
			expect(moveToAt(src, at(src, 0), 0).source).toBe(src);
		}
	});

	it('the result lands on the slide the op acted on', () => {
		const flatOf = (src: string, unit: number) => buildDeckIndex(src).units.slice(0, unit).reduce((k, u) => k + u.parts.length, 0);
		const s = at(outline, 1); // B, inside the first block
		const d = duplicateAt(outline, s);
		expect(engine(d.source)[flatOf(d.source, d.active)]).toMatch(/^## B/);
		const m = moveAt(outline, s, 1);
		expect(engine(m.source)[flatOf(m.source, m.active)]).toMatch(/^## B/);
		expect(flatOf(m.source, m.active)).toBe(2);
		const a = addAfterAt(outline, s, '## Fresh');
		expect(flatOf(a.source, a.active)).toBe(2);
	});

	it('a say: entry stays on its slide through an op that cuts a block', async () => {
		const { frontMatterSayMap } = await import('@/lib/resolve-narration');
		const src = outline.replace('split: headings\n', 'split: headings\nsay:\n  2: Say B\n  3: Say C\n');
		const r = moveAt(src, at(src, 1), 1);
		const slides = engine(r.source);
		for (const [n, said] of frontMatterSayMap(r.source)) expect(slides[n - 1], said).toMatch(new RegExp(`^## ${said.slice(-1)}`));
		expect([...frontMatterSayMap(r.source).keys()].sort()).toEqual([2, 3]);
	});

	it('cuts only what the op needs: a slide in its own block is untouched, and the deck’s last slide stays', () => {
		const rule = '# A\n\na\n\n---\n\n# B\n\nb\n';
		expect(duplicateAt(rule, { unit: 1, part: 0 }).source).toBe(duplicateSlide(rule, 1).source);
		const one = '---\nsplit: headings\n---\n\n# Only\n\nx\n';
		expect(deleteAt(one, { unit: 0, part: 0 }).source).toBe(one);
	});
});
