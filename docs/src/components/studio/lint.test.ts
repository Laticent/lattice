import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { boundaryParser as md } from '../../../../lib/core/boundary-parser.js';
import { stripFrontMatter } from './front-matter';
import { presentationIndices, presentationSet, slideClass, slideIndexAt, slideStartOffset, slideTitle, splitSlides, unknownComponents, usedComponents } from './lint';

const KNOWN = ['title', 'kpi', 'quote', 'cards-grid', 'stats'];
// Component-name-ish tokens (won't accidentally contain a `-->` or a fence).
const nameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,11}$/);
// A slide body that carries no slide boundary of its own.
//
// The character class alone does not guarantee that: `*` is in it, so the generator produces
// `***` — a thematic break — and a deck built from it has more slides than bodies. The old
// splitter did not recognize `***`, so the claim held by accident.
//
// FILTERED BY THE PARSER, NOT BY THE CODE UNDER TEST. An interim cut filtered on
// `slideBoundaries(b)` — the very kernel `splitSlides` is built on — which made the property
// circular: a false negative in the kernel would silently EXCLUDE the input that exposes it
// (found by the independent checker). The filter asks markdown-it directly, so it stays an
// independent statement about the generated deck.
const boundaryFree = (b: string) =>
	md
		.parse(b, {})
		.filter((t: { type: string; level: number }) => t.type === 'hr' && t.level === 0).length === 0;
const bodyArb = fc.stringMatching(/^[\p{L}\p{N} .,!?#*]{0,40}$/u).filter((b) => b.trim().length > 0 && boundaryFree(b));
// HOW A DECK JOINS ITS SLIDES, and it is not `\n---\n`.
//
// These fuzz decks used to be built with the separator hard against the text above it. To the
// ENGINE that is not a separator at all: a run of `-` directly under a paragraph is that
// paragraph's setext underline, so `one\n---\ntwo\n---\nthree` renders as ONE slide titled
// "one". The old splitter cut it into three, the tests asserted three, and the property held
// while every assertion in it described behavior the renderer does not have.
//
// Blank-line-flanked is what every committed deck writes and what the engine reads as a break.
// The tight form now has its own test asserting it is a HEADING (below), so the shape is still
// covered — it is just covered with the right expectation.
const SEP = '\n\n---\n\n';

describe('splitSlides (fuzz)', () => {
	it('never throws and yields trimmed, non-empty chunks for ANY input', () => {
		fc.assert(
			fc.property(fc.string(), (s) => {
				const out = splitSlides(s);
				expect(Array.isArray(out)).toBe(true);
				for (const chunk of out) {
					expect(chunk.length).toBeGreaterThan(0);
					expect(chunk).toBe(chunk.trim());
				}
			}),
		);
	});

	it('recovers exactly N slides from N fenced bodies', () => {
		fc.assert(
			fc.property(fc.array(bodyArb, { minLength: 1, maxLength: 8 }), (bodies) => {
				const src = bodies.join(SEP);
				expect(splitSlides(src)).toHaveLength(bodies.length);
			}),
		);
	});

	it('handles undefined/empty without throwing', () => {
		expect(splitSlides(undefined as unknown as string)).toEqual([]);
		expect(splitSlides('')).toEqual([]);
	});
});

describe('unknownComponents (fuzz)', () => {
	it('flags exactly the names not in the known set — never throws', () => {
		fc.assert(
			fc.property(fc.array(nameArb, { maxLength: 12 }), (names) => {
				const src = names.map((n) => `<!-- _class: ${n} -->\n# ${n}`).join('\n---\n');
				const flagged = unknownComponents(src, KNOWN);
				const expected = names.filter((n) => !KNOWN.includes(n));
				expect(flagged).toEqual(expected);
				// Invariant: flagged ⊆ used, and none are known.
				const used = new Set(usedComponents(src));
				for (const f of flagged) {
					expect(used.has(f)).toBe(true);
					expect(KNOWN.includes(f)).toBe(false);
				}
			}),
		);
	});

	it('a deck of only-known components has zero issues', () => {
		fc.assert(
			fc.property(fc.array(fc.constantFrom(...KNOWN), { minLength: 1, maxLength: 10 }), (names) => {
				const src = names.map((n) => `<!-- _class: ${n} -->`).join('\n---\n');
				expect(unknownComponents(src, KNOWN)).toEqual([]);
			}),
		);
	});

	it('arbitrary prose never crashes the detector', () => {
		fc.assert(
			fc.property(fc.string(), (s) => {
				expect(() => unknownComponents(s, KNOWN)).not.toThrow();
			}),
		);
	});
});

describe('slideClass (fuzz)', () => {
	it("returns the slide's first `_class`, or `text` for a bare slide — never throws", () => {
		fc.assert(
			fc.property(nameArb, bodyArb, (name, body) => {
				expect(slideClass(`<!-- _class: ${name} -->\n${body}`)).toBe(name);
			}),
		);
		// Bare-Markdown slide (no _class) and degenerate inputs fall back to `text`.
		expect(slideClass('## Just a heading\n\nSome prose.')).toBe('text');
		expect(slideClass('')).toBe('text');
		expect(slideClass(undefined as unknown as string)).toBe('text');
	});

	it('reads only the FIRST class when a slide somehow carries two', () => {
		expect(slideClass('<!-- _class: kpi -->\n<!-- _class: quote -->')).toBe('kpi');
	});
});

describe('slideTitle (reader-facing navigator label)', () => {
	it("returns the slide's first heading, past directives, stripped of inline syntax", () => {
		expect(slideTitle('<!-- _class: title -->\n\n# Welcome to Lattice')).toBe('Welcome to Lattice');
		expect(slideTitle('<!-- _class: big-number -->\n\n## What’s in the box')).toBe('What’s in the box');
		// Inline emphasis / code / links are stripped to plain text.
		expect(slideTitle('# The **bold** `truth` and a [link](https://x.io)')).toBe('The bold truth and a link');
		// A closing-hash ATX heading trims the trailing hashes.
		expect(slideTitle('### Closing ###')).toBe('Closing');
	});

	it('returns empty string when the slide has no heading (caller falls back to "Slide N") — never throws', () => {
		expect(slideTitle('<!-- _class: quote -->\n\nJust a pull quote, no heading.')).toBe('');
		expect(slideTitle('')).toBe('');
		expect(slideTitle(undefined as unknown as string)).toBe('');
		// A `#` without the required space is not an ATX heading.
		expect(slideTitle('#notaheading')).toBe('');
	});

	it('takes the FIRST heading when a slide has several', () => {
		expect(slideTitle('# First\n\nbody\n\n## Second')).toBe('First');
	});
});

describe('slideIndexAt / slideStartOffset (editor↔preview sync, fuzz)', () => {
	it('the index at a slide start round-trips back to that slide — for any deck', () => {
		fc.assert(
			fc.property(fc.array(bodyArb, { minLength: 1, maxLength: 8 }), (bodies) => {
				const src = bodies.join(SEP);
				for (let i = 0; i < bodies.length; i++) {
					const start = slideStartOffset(src, i);
					// The offset lands inside slide i, so reading the index back gives i.
					expect(slideIndexAt(src, start)).toBe(i);
				}
			}),
		);
	});

	it('the index is monotonic across the document and never throws', () => {
		fc.assert(
			fc.property(fc.string(), fc.nat(), (src, pos) => {
				expect(() => slideIndexAt(src, pos)).not.toThrow();
				const here = slideIndexAt(src, pos);
				// A position never sees more fences than the whole doc has.
				expect(here).toBeLessThanOrEqual(slideIndexAt(src, src.length));
				expect(here).toBeGreaterThanOrEqual(0);
			}),
		);
	});

	it('clamps degenerate input', () => {
		expect(slideIndexAt('', 0)).toBe(0);
		expect(slideIndexAt(undefined as unknown as string, 5)).toBe(0);
		expect(slideStartOffset('a\n\n---\n\nb', 0)).toBe(0);
		expect(slideStartOffset('a\n\n---\n\nb', 1)).toBe(8);
	});

	it('a separator hard against the text above it is a HEADING, not a slide break', () => {
		// The shape these tests used to be built from, now asserted the way the ENGINE reads it.
		// `a` over `---` with no blank line is a setext h2, so the deck is ONE slide called "a"
		// — and `slideStartOffset(src, 1)` has no second slide to reach, so it clamps to the
		// only one there is. The old splitter cut here, the old tests asserted the cut, and the
		// preview painted a slide the renderer never produced.
		const tight = 'a\n---\nb';
		expect(splitSlides(tight)).toEqual([tight]);
		expect(slideStartOffset(tight, 1)).toBe(0);
		expect(slideIndexAt(tight, 6)).toBe(0);
		// Every OTHER thematic-break form does split there, because none of them is an underline.
		for (const sep of ['***', '___', '- - -']) expect(splitSlides(`a\n${sep}\nb`)).toHaveLength(2);
	});

	// THE GAP THE FUZZ TEST ABOVE COULD NOT SEE. It joins non-empty bodies with `\n---\n`, so it never
	// produces a deck with FRONT MATTER — and front matter is what broke this pair on every real deck.
	// Its closing `---` is newline-flanked, so a raw separator count treats it as separator #0 while the
	// rail counts slides in the STRIPPED body: `slideStartOffset(src, 3)` framed slide 2 and a caret in
	// slide 0 reported slide 1. Both functions were self-consistent, so the round-trip property held and
	// the editor still framed a different slide than the preview showed.
	const FM = '---\nmarp: true\npaginate: true\nheader: "H"\n---\n\n';

	it('indexes slides the same way the rail does — WITH front matter', () => {
		fc.assert(
			fc.property(fc.array(bodyArb, { minLength: 1, maxLength: 8 }), (bodies) => {
				const src = FM + bodies.join(SEP);
				const slides = splitSlides(stripFrontMatter(src));
				expect(slides.length).toBe(bodies.length);
				for (let i = 0; i < slides.length; i++) {
					const start = slideStartOffset(src, i);
					// The offset must be the FIRST CHARACTER of slide i, so revealing it frames that slide.
					expect(src.slice(start, start + slides[i].length)).toBe(slides[i]);
					// And reading the index back at that offset must return i, not i+1.
					expect(slideIndexAt(src, start)).toBe(i);
				}
			}),
		);
	});

	it('slide 0 starts after the front matter, not at offset 0', () => {
		const src = `${FM}<!-- _class: title -->\n\n# Title`;
		expect(slideStartOffset(src, 0)).toBe(FM.length);
		expect(slideIndexAt(src, FM.length)).toBe(0);
		// A caret INSIDE the front matter clamps to slide 0 rather than naming a slide that isn't there.
		expect(slideIndexAt(src, 5)).toBe(0);
	});

	it('an EMPTY slide chunk does not shift every later slide', () => {
		// `splitSlides` drops empty chunks; a raw separator count did not, so a stray double separator
		// desynced the rest of the deck on top of the front-matter offset.
		const src = `${FM}one${SEP}---${SEP}two${SEP}three`;
		const slides = splitSlides(stripFrontMatter(src));
		expect(slides).toEqual(['one', 'two', 'three']);
		for (let i = 0; i < slides.length; i++) {
			const start = slideStartOffset(src, i);
			expect(src.slice(start, start + slides[i].length)).toBe(slides[i]);
			expect(slideIndexAt(src, start)).toBe(i);
		}
	});

	it('a separator inside a fence is still not a slide boundary', () => {
		// Guards the interaction: fence masking has to survive the front-matter offset.
		const src = `${FM}one\n\n\`\`\`yaml\n---\nkey: v\n---\n\`\`\`${SEP}two`;
		const slides = splitSlides(stripFrontMatter(src));
		expect(slides.length).toBe(2);
		expect(slideStartOffset(src, 1)).toBe(src.lastIndexOf('two'));
		expect(slideIndexAt(src, src.indexOf('key: v'))).toBe(0);
	});
});

// The toy `scoreDeck` heuristic was deleted (replaced by the engine's real scorecard
// via coach/coach-core.ts — see coach-core.test.ts). Its tests are removed here rather
// than repointed by name: the engine export is also called `scoreDeck` but takes a
// different (object) signature, so a name-match repoint would have silently tested the
// wrong function. The real assessment (incl. the empty-deck K1 guard) is covered by
// coach/coach-core.test.ts.

describe('presentationSet (reader lenses)', () => {
	// A registry with a `brief` lens (base:none — additive, tag-driven). The old author-blind
	// `exec`/`onepager` heuristics are RETIRED: `full` is the identity, every other id is a registry lens.
	const registry = {
		default: 'full',
		lenses: [
			{ id: 'full', label: 'Full deck', base: 'all' as const },
			{ id: 'brief', label: 'Bottom line', base: 'none' as const },
		],
	};

	it('`full` is the whole deck; an unknown lens with no registry falls back to the whole deck', () => {
		const slideArb = fc.array(fc.constantFrom('title', 'kpi', 'quote', 'stats', 'closing'), { minLength: 1, maxLength: 8 }).map((cs) => cs.map((c) => `<!-- _class: ${c} -->\n# ${c}`));
		fc.assert(
			fc.property(slideArb, (slides) => {
				expect(presentationSet(slides, 'full')).toEqual(slides);
				expect(presentationSet(slides, 'brief')).toEqual(slides); // no registry → safe full-deck fallback
			}),
		);
	});

	it('handles an empty / undefined deck without throwing', () => {
		expect(presentationSet([], 'brief', registry)).toEqual([]);
		expect(presentationSet(undefined as unknown as string[], 'full')).toEqual([]);
	});

	it('under `full`, presentationIndices is the identity 0..n-1', () => {
		const slides = ['<!-- _class: title -->\n# a', '<!-- _class: kpi -->\n# b', '<!-- _class: quote -->\n# c'];
		expect(presentationIndices(slides, 'full')).toEqual([0, 1, 2]);
	});

	// The tag-driven read path: when the deck defines a `lenses:` registry, projection flows through the
	// @slidewright/lente library, and the author-index contract (what keeps number-keyed front-matter
	// `captions:` resolving under a FILTERED lens) is preserved — a dropped slide shifts the ORIGINAL
	// index, not the set position.
	it('projects a registry (tag-driven) lens via the library, preserving author indices', () => {
		const slides = [
			'<!-- _class: title -->\n<!-- _lens: brief -->\n# t', // 0 — tagged into brief
			'<!-- _class: quote -->\n# q', // 1 — not in brief (dropped)
			'<!-- _class: kpi -->\n<!-- _lens: brief -->\n# k', // 2 — tagged into brief
		];
		expect(presentationSet(slides, 'brief', registry)).toEqual([slides[0], slides[2]]);
		// The second SHOWN slide is authored slide 3 (index 2) → its number-keyed caption resolves via
		// presentationIndices[1] + 1, not the set position.
		expect(presentationIndices(slides, 'brief', registry)).toEqual([0, 2]);
		// A registry lens with no members projects an EMPTY set (honest, not fail-open to the whole deck)
		// — the reader path renders "unavailable"; a fail-open here would leak a redaction lens.
		expect(presentationSet(['<!-- _class: title -->\n# t'], 'brief', registry)).toEqual([]);
	});
});
