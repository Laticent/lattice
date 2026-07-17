import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { presentationIndices, presentationSet, scoreDeck, slideClass, slideIndexAt, slideStartOffset, slideTitle, splitSlides, unknownComponents, usedComponents } from './lint';

const KNOWN = ['title', 'kpi', 'quote', 'cards-grid', 'stats'];
// Component-name-ish tokens (won't accidentally contain a `-->` or a fence).
const nameArb = fc.stringMatching(/^[a-z][a-z0-9-]{0,11}$/);
// Slide body that can't introduce an accidental `\n---\n` fence.
const bodyArb = fc.stringMatching(/^[\p{L}\p{N} .,!?#*]{0,40}$/u);

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
			fc.property(fc.array(bodyArb.filter((b) => b.trim().length > 0), { minLength: 1, maxLength: 8 }), (bodies) => {
				const src = bodies.join('\n---\n');
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
			fc.property(fc.array(bodyArb.filter((b) => b.trim().length > 0), { minLength: 1, maxLength: 8 }), (bodies) => {
				const src = bodies.join('\n---\n');
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
		expect(slideStartOffset('a\n---\nb', 0)).toBe(0);
		expect(slideStartOffset('a\n---\nb', 1)).toBe(6);
	});
});

describe('scoreDeck (Architect readiness, fuzz)', () => {
	it('always returns a score in [0, 10] with three rows — for ANY input', () => {
		fc.assert(
			fc.property(fc.string(), (s) => {
				const r = scoreDeck(s, KNOWN);
				expect(r.score).toBeGreaterThanOrEqual(0);
				expect(r.score).toBeLessThanOrEqual(10);
				expect(r.rows).toHaveLength(3);
				expect(['pass', 'review', 'fix']).toContain(r.intent);
			}),
		);
	});

	it('any unknown component forces the `fix` posture and flags the row', () => {
		fc.assert(
			fc.property(fc.array(nameArb, { minLength: 1, maxLength: 6 }), (names) => {
				// At least one guaranteed-unknown component.
				const src = ['<!-- _class: title -->', ...names.map((n) => `<!-- _class: zzz-${n} -->`)].join('\n---\n');
				const r = scoreDeck(src, KNOWN);
				expect(r.intent).toBe('fix');
				expect(r.rows[0].ok).toBe(false);
			}),
		);
	});

	it('a clean, varied, titled deck scores high and reads `pass`', () => {
		const src = ['title', 'kpi', 'quote', 'stats'].map((c) => `<!-- _class: ${c} -->\n# ${c}`).join('\n---\n');
		const r = scoreDeck(src, KNOWN);
		expect(r.intent).toBe('pass');
		expect(r.score).toBeGreaterThanOrEqual(8);
		expect(r.rows.every((row) => row.ok)).toBe(true);
	});
});

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
