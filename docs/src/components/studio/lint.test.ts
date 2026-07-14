import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { presentationIndices, presentationSet, scoreDeck, slideClass, slideIndexAt, slideStartOffset, splitSlides, unknownComponents, usedComponents } from './lint';

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

describe('presentationSet (reader lenses, fuzz)', () => {
	const slideArb = fc.array(fc.constantFrom('title', 'kpi', 'quote', 'agenda', 'stats', 'closing', 'cards-grid'), { minLength: 1, maxLength: 10 }).map((cs) => cs.map((c) => `<!-- _class: ${c} -->\n# ${c}`));

	it('every lens returns a non-empty SUBSET of the deck (order preserved) — never throws', () => {
		fc.assert(
			fc.property(slideArb, fc.constantFrom('full', 'exec', 'onepager'), (slides, lens) => {
				const out = presentationSet(slides, lens as 'full' | 'exec' | 'onepager');
				expect(out.length).toBeGreaterThan(0);
				expect(out.length).toBeLessThanOrEqual(slides.length);
				for (const s of out) expect(slides).toContain(s);
			}),
		);
	});

	it('`full` is the whole deck; `onepager` is exactly one slide', () => {
		fc.assert(
			fc.property(slideArb, (slides) => {
				expect(presentationSet(slides, 'full')).toEqual(slides);
				expect(presentationSet(slides, 'onepager')).toHaveLength(1);
			}),
		);
	});

	it('handles an empty deck without throwing', () => {
		expect(presentationSet([], 'exec')).toEqual([]);
		expect(presentationSet(undefined as unknown as string[], 'full')).toEqual([]);
	});

	// presentationIndices is what lets a front-matter `captions:` map (keyed by author slide
	// NUMBER) resolve under a FILTERED lens — each shown slide maps back to its original index.
	it('presentationIndices is positionally aligned with presentationSet and holds ORIGINAL indices', () => {
		fc.assert(
			fc.property(slideArb, fc.constantFrom('full', 'exec', 'onepager'), (slides, lens) => {
				const set = presentationSet(slides, lens as 'full' | 'exec' | 'onepager');
				const idx = presentationIndices(slides, lens as 'full' | 'exec' | 'onepager');
				expect(idx.length).toBe(set.length); // same length, positionally aligned
				for (let i = 0; i < set.length; i++) {
					expect(slides[idx[i]]).toBe(set[i]); // idx[i] is the slide's original deck position
					expect(idx[i]).toBeGreaterThanOrEqual(0);
					expect(idx[i]).toBeLessThan(slides.length);
				}
			}),
		);
	});

	it('under `full`, presentationIndices is the identity 0..n-1', () => {
		const slides = ['<!-- _class: title -->\n# a', '<!-- _class: kpi -->\n# b', '<!-- _class: quote -->\n# c'];
		expect(presentationIndices(slides, 'full')).toEqual([0, 1, 2]);
	});

	it('under a FILTERING lens, a dropped slide shifts the ORIGINAL index, not the set position', () => {
		// exec keeps title/kpi/stats/big-number/closing; the middle `quote` is dropped.
		const slides = [
			'<!-- _class: title -->\n# t', // 0 — kept
			'<!-- _class: quote -->\n# q', // 1 — dropped by exec
			'<!-- _class: kpi -->\n# k', // 2 — kept
		];
		expect(presentationSet(slides, 'exec')).toEqual([slides[0], slides[2]]);
		// The second SHOWN slide is authored slide 3 (index 2), NOT set-position 2 → its
		// front-matter caption is keyed on 3, resolved via presentationIndices[1] + 1.
		expect(presentationIndices(slides, 'exec')).toEqual([0, 2]);
	});

	// The adapter seam: when the deck defines a `lenses:` registry, projection flows through the
	// tag-driven @slidewright/lente read path instead of the legacy heuristic — and the author-index
	// contract (captions) is preserved identically.
	it('projects a registry (tag-driven) lens via the library, preserving author indices', () => {
		const registry = {
			default: 'full',
			lenses: [
				{ id: 'full', label: 'Full deck', base: 'all' as const },
				{ id: 'brief', label: 'Bottom line', base: 'none' as const },
			],
		};
		const slides = [
			'<!-- _class: title -->\n<!-- _lens: brief -->\n# t', // 0 — tagged into brief
			'<!-- _class: quote -->\n# q', // 1 — not in brief
			'<!-- _class: kpi -->\n<!-- _lens: brief -->\n# k', // 2 — tagged into brief
		];
		expect(presentationSet(slides, 'brief', registry)).toEqual([slides[0], slides[2]]);
		expect(presentationIndices(slides, 'brief', registry)).toEqual([0, 2]);
		// Without the registry, 'brief' is an unknown lens → safe fallback to the whole deck.
		expect(presentationSet(slides, 'brief')).toEqual(slides);
		// A registry lens with no members projects an EMPTY set (honest, not fail-open to the whole
		// deck) — the reader path renders "unavailable"; a fail-open here would leak a redaction lens.
		expect(presentationSet(['<!-- _class: title -->\n# t'], 'brief', registry)).toEqual([]);
	});
});
