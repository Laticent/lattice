import { describe, expect, it } from 'vitest';
import { approvalHash, deeperLens, ladderRungs, lensEscapees, lensIndices, lensKind } from './project';
import type { LensRegistry } from './types';
import { validateLadder, validateRegistry } from './validate';

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
	it('is stable across repeated calls when two rungs are the same size', () => {
		// Deliberately NOT "ties break on registry order": `Array.prototype.sort` is required to be
		// stable (ES2019), so equal-sized rungs keep their `reg.lenses` order whether or not the
		// comparator says so — an assertion on the ORDER passes with the tiebreak deleted and proves
		// nothing about it. What is worth pinning is the property a caller depends on: the same
		// registry always yields the same ladder, so a rung cannot change altitude between two renders.
		const r = reg({ evidence: { base: 'none' } }); // additive with nothing tagged => 0 members, tying brief
		const deck = ['# A'];
		expect(ladderRungs(deck, r).map((l) => l.id)).toEqual(ladderRungs(deck, r).map((l) => l.id));
		expect(new Set(ladderRungs(deck, r).map((l) => l.id))).toEqual(new Set(['brief', 'evidence', 'full']));
		expect(ladderRungs(deck, r).at(-1)?.id).toBe('full'); // full still terminates it
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
	it('reports a break between the SECOND and THIRD rungs, not just the first pair', () => {
		// The loop in validateLadder walks every adjacent pair, but every other fixture puts its
		// violation in the first one — so `i > 0` was never executed and truncating the loop to the
		// first pair left the suite green.
		const deck = [
			'<!-- _lens: low mid -->\n# A', //     0 — low, mid, and (base:all) top
			'<!-- _lens: mid -->\n# B', //         1 — mid and top
			'<!-- _lens: mid -top -->\n# C', //    2 — in mid, EXCLUDED from top: the break
			'# D', //                              3 — top and full only
			'# E', //                              4 — top and full only
		];
		const r: LensRegistry = {
			default: 'full',
			lenses: [
				{ id: 'full', label: 'Full deck', base: 'all' },
				{ id: 'low', label: 'Low', base: 'none', kind: 'rung' }, //   {0}
				{ id: 'mid', label: 'Mid', base: 'none', kind: 'rung' }, //   {0,1,2}
				{ id: 'top', label: 'Top', base: 'all', kind: 'rung' }, //    {0,1,3,4} — drops 2, which IS in mid
			],
		};
		expect(ladderRungs(deck, r).map((l) => l.id)).toEqual(['low', 'mid', 'top', 'full']);
		// low ⊆ mid holds, so the FIRST pair is clean and only the SECOND pair can report.
		expect(lensEscapees(deck, r, 'mid', 'low')).toEqual([]);
		const findings = validateLadder(deck, r);
		expect(findings.map((f) => f.lensId)).toEqual(['mid']); // attributed to the lower rung of the broken pair
		expect(findings.map((f) => f.slide)).toEqual([2]);
	});

	it('surfaces ladder findings through validateRegistry — the single deck-health entry point', () => {
		// validateRegistry folds validateLadder in; deleting that one line left every test green.
		const d = validateRegistry(DECK, reg({ story: { kind: 'rung' } }));
		expect(d.some((x) => x.code === 'ladder-containment')).toBe(true);
		expect(d.some((x) => x.level === 'error')).toBe(true); // the only error among otherwise warnings
	});

	it('says nothing about a CUT that fails to nest — a cut promises nothing', () => {
		// The contrast, on ONE membership: promoted to a rung `story` produces findings; left as the cut
		// it is, the very same tags produce none. (An earlier version of this test re-ran the
		// sound-ladder assertion verbatim and carried no signal of its own.)
		expect(validateLadder(DECK, reg({ story: { kind: 'rung' } })).length).toBeGreaterThan(0);
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
	it('never climbs to a STRICTLY LARGER rung that does not contain the current one', () => {
		// The counterexample the whole design exists to prevent, and the one case the fixture above
		// cannot express. `wide` is bigger than `brief` AND approved AND directly above it — so
		// eligibility and the strict-superset rule both wave it through, and ONLY the containment check
		// refuses it. Delete that check and this is the test that notices: `deeperLens` starts returning
		// `wide`, and a reader clicking "deeper" loses the slide they were just reading.
		const deck = [
			'<!-- _lens: brief wide -->\n# A', // 0 — in both
			'<!-- _lens: wide -->\n# B', //       1 — wide only
			'<!-- _lens: wide -->\n# C', //       2 — wide only
			'<!-- _lens: brief -->\n# D', //      3 — brief only: the slide `wide` would drop
			'# E', //                             4 — full only, so full outgrows wide
		];
		const base: LensRegistry = {
			default: 'full',
			lenses: [
				{ id: 'full', label: 'Full deck', base: 'all' },
				{ id: 'brief', label: 'Bottom line', base: 'none', kind: 'rung' },
				{ id: 'wide', label: 'Wider, but not deeper', base: 'none', kind: 'rung' },
			],
		};
		const r = approved(base, deck);
		// The trap is armed: `wide` sits directly above `brief` in the ladder and IS strictly larger.
		expect(ladderRungs(deck, r).map((l) => l.id)).toEqual(['brief', 'wide', 'full']);
		expect(lensIndices(deck, r, 'wide').length).toBeGreaterThan(lensIndices(deck, r, 'brief').length);
		expect(lensEscapees(deck, r, 'wide', 'brief')).toEqual([3]); // …and it drops slide 3.
		// So the step must pass over it entirely.
		expect(deeperLens(deck, r, 'brief')?.id).toBe('full');
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
	it('offers nothing from a rung that already IS the whole deck', () => {
		// `full` is not a STRICT superset here, so there is no step to take — everything is approved,
		// which is the point: the refusal comes from the strictness rule, not from eligibility.
		const deck = ['<!-- _lens: brief -->\n# A'];
		const r = approved(reg(), deck);
		expect(deeperLens(deck, r, 'brief')).toBeUndefined();
	});
});
