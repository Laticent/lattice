import { describe, expect, it } from 'vitest';
import { approvalHash, deeperLens, ladderRungs, lensEscapees, lensKind } from './project';
import type { LensRegistry } from './types';
import { validateLadder } from './validate';

// The DEPTH model — rungs, the ladder, and an honest step deeper
// (engineering/decisions/2026-08-25-lens-view-defaults-and-depth.md §4).

// A five-slide deck: brief ⊂ evidence ⊂ full, with `story` cutting across both.
//   0  in brief, in evidence, in story
//   1  in evidence
//   2  in evidence, in story
//   3  in brief, in evidence
//   4  in nothing but full
const DECK = [
	'<!-- _lens: brief story -->\n# A',
	'# B',
	'<!-- _lens: story -->\n# C',
	'<!-- _lens: brief -->\n# D',
	'<!-- _lens: -evidence -->\n# E',
];

/** base:all `evidence` shows everything except slide 4; `brief` and `story` are additive. */
function reg(over: Partial<Record<string, Partial<Record<string, unknown>>>> = {}): LensRegistry {
	const lenses = [
		{ id: 'full', label: 'Full deck', base: 'all' as const },
		{ id: 'brief', label: 'Bottom line', base: 'none' as const, kind: 'rung' as const },
		{ id: 'evidence', label: 'The evidence', base: 'all' as const, kind: 'rung' as const },
		{ id: 'story', label: 'The story', base: 'none' as const },
	].map((l) => ({ ...l, ...(over[l.id] ?? {}) }));
	return { default: 'full', lenses } as LensRegistry;
}

/** Approve every non-`full` view against the current deck, so eligibility is not the thing under test. */
function approved(base: LensRegistry, slides = DECK): LensRegistry {
	const out = { ...base, lenses: base.lenses.map((l) => ({ ...l })) };
	for (const l of out.lenses) if (l.id !== 'full') l.approved = approvalHash(slides, base, l.id);
	return out;
}

describe('lensKind — the absent-means-cut default', () => {
	it('reads a declared rung as a rung and an undeclared view as a cut', () => {
		const r = reg();
		expect(lensKind(r.lenses[1])).toBe('rung');
		expect(lensKind(r.lenses[3])).toBe('cut'); // story declares nothing
	});
	it('treats `full` as a rung even when its record says otherwise', () => {
		// A host (or a test) that assembles its own `full` entry omits `kind`; `full` contains every
		// view by construction, so it terminates every ladder regardless of what the field says.
		expect(lensKind({ id: 'full', label: 'Full deck', base: 'all' })).toBe('rung');
		expect(lensKind({ id: 'full', label: 'Full deck', base: 'all', kind: 'cut' })).toBe('rung');
	});
});

describe('ladderRungs — altitude is derived, not declared', () => {
	it('orders rungs narrowest first and ends at full', () => {
		expect(ladderRungs(DECK, reg()).map((l) => l.id)).toEqual(['brief', 'evidence', 'full']);
	});
	it('leaves cuts out of the ladder entirely', () => {
		expect(ladderRungs(DECK, reg()).some((l) => l.id === 'story')).toBe(false);
	});
	it('does not depend on the order the views were ADDED', () => {
		// The same two rungs, registered in the opposite order — the ladder is the same, because it is
		// a function of what the views CONTAIN, not of the author's picker arrangement.
		const r = reg();
		const flipped: LensRegistry = { ...r, lenses: [r.lenses[0], r.lenses[2], r.lenses[1], r.lenses[3]] };
		expect(ladderRungs(DECK, flipped).map((l) => l.id)).toEqual(['brief', 'evidence', 'full']);
	});
	it('is deterministic for equal-sized rungs (ties break on registry order)', () => {
		const r = reg({ evidence: { base: 'none' } }); // evidence now additive => 0 members, same as… nothing
		const ladder = ladderRungs(['# A'], r).map((l) => l.id);
		expect(ladder).toEqual(['brief', 'evidence', 'full']);
	});
	it('an empty deck still yields a ladder terminating at full', () => {
		expect(ladderRungs([], reg()).map((l) => l.id)).toEqual(['brief', 'evidence', 'full']);
	});
});

describe('lensEscapees — the containment primitive', () => {
	it('is empty when the inner view nests', () => {
		expect(lensEscapees(DECK, reg(), 'evidence', 'brief')).toEqual([]);
	});
	it('names the slides the outer view does not show', () => {
		// story keeps slide 2, which evidence also keeps — but brief keeps 0 and 3, and story keeps only 0.
		expect(lensEscapees(DECK, reg(), 'story', 'brief')).toEqual([3]);
	});
	it('measures PROJECTIONS, so a `single` view is judged at the one slide a reader gets', () => {
		const r = reg({ brief: { single: true } });
		expect(lensEscapees(DECK, r, 'story', 'brief')).toEqual([]); // brief projects only slide 0
	});
});

describe('validateLadder — the invariant nothing enforced before', () => {
	it('is silent on a sound ladder', () => {
		expect(validateLadder(DECK, reg())).toEqual([]);
	});
	it('reports one error per escaping slide when a rung does not nest', () => {
		// Promote `story` to a rung: it keeps slide 2, brief keeps 3, and neither contains the other.
		const d = validateLadder(DECK, reg({ story: { kind: 'rung' } }));
		expect(d.length).toBeGreaterThan(0);
		expect(d.every((x) => x.code === 'ladder-containment')).toBe(true);
		expect(d.every((x) => x.level === 'error')).toBe(true);
		expect(d.map((x) => x.slide)).toContain(3); // brief's slide 3 escapes story
	});
	it('attributes the finding to the LOWER rung — the one whose slide escaped', () => {
		const d = validateLadder(DECK, reg({ story: { kind: 'rung' } }));
		const escaped = d.find((x) => x.slide === 3);
		expect(escaped?.lensId).toBe('brief');
		expect(escaped?.message).toContain('Bottom line');
	});
	it('says nothing about a CUT that fails to nest — a cut promises nothing', () => {
		// The identical membership, with `story` left as the cut it is: no finding at all.
		expect(validateLadder(DECK, reg())).toEqual([]);
	});
});

describe('deeperLens — the honest step up', () => {
	it('climbs to the next eligible rung that strictly contains the current one', () => {
		expect(deeperLens(DECK, approved(reg()), 'brief')?.id).toBe('evidence');
		expect(deeperLens(DECK, approved(reg()), 'evidence')?.id).toBe('full');
	});
	it('offers nothing from a cut — there is no altitude above "the story"', () => {
		expect(deeperLens(DECK, approved(reg()), 'story')).toBeUndefined();
	});
	it('offers nothing from `full` or from an unknown id', () => {
		const r = approved(reg());
		expect(deeperLens(DECK, r, 'full')).toBeUndefined();
		expect(deeperLens(DECK, r, 'ghost')).toBeUndefined();
	});
	it('STEPS OVER an ineligible middle rung rather than switching off', () => {
		const r = approved(reg());
		const staged: LensRegistry = { ...r, lenses: r.lenses.map((l) => (l.id === 'evidence' ? { ...l, hidden: true } : l)) };
		expect(deeperLens(DECK, staged, 'brief')?.id).toBe('full');
	});
	it('never climbs to a rung that would DROP a slide the reader just read', () => {
		// story promoted to a rung and approved, but it does not contain brief. Even sitting directly
		// above brief in the ladder it is refused — containment is re-checked against the CANDIDATE,
		// never inferred from the chain — so the step lands on `full` instead.
		const r = approved(reg({ story: { kind: 'rung' } }));
		const next = deeperLens(DECK, r, 'brief');
		expect(next?.id).not.toBe('story');
		expect(lensEscapees(DECK, r, next?.id ?? '', 'brief')).toEqual([]);
	});
	it('refuses a rung with exactly the same slides — "deeper" must deliver more', () => {
		// `twin` is an approved rung sitting directly above brief with the IDENTICAL projection. Climbing
		// to it would be a button that promises more and delivers the same slide, so it is skipped and
		// the step lands on `full`, which does add one.
		const deck = ['<!-- _lens: brief twin -->\n# A', '# B'];
		const base: LensRegistry = {
			default: 'full',
			lenses: [
				{ id: 'full', label: 'Full deck', base: 'all' },
				{ id: 'brief', label: 'Bottom line', base: 'none', kind: 'rung' },
				{ id: 'twin', label: 'Same again', base: 'none', kind: 'rung' },
			],
		};
		const r = approved(base, deck);
		expect(lensEscapees(deck, r, 'twin', 'brief')).toEqual([]); // it DOES contain brief…
		expect(deeperLens(deck, r, 'brief')?.id).toBe('full'); // …and is still not a step deeper
	});
	it('offers nothing when the only rung above is unapproved and full adds nothing', () => {
		// A rung that already IS the whole deck: `full` is not a strict superset, so there is no step.
		const deck = ['<!-- _lens: brief -->\n# A'];
		const r = approved(reg(), deck);
		expect(deeperLens(deck, r, 'brief')).toBeUndefined();
	});
});
