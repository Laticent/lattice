import { describe, expect, it } from 'vitest';
import { lens } from './builder';
import { approvalHash, lensEligibility, lensIndices, lensPairs, lensSlides, readerLenses } from './project';
import { parseLensRegistry } from './registry';
import { FULL_LENS_ID, type LensRegistry } from './types';

// A small deck + a registry with a `brief` lens (approved below) and an unapproved `draft` lens,
// so the parity check exercises ok / unavailable projections.
const SLIDES = [
	'<!-- _class: anchor -->\n# Title',
	'<!-- _class: statement -->\n<!-- _lens: brief -->\n## Bottom line',
	'<!-- _class: evidence -->\n### Data',
	'<!-- _lens: brief -->\n## Also brief',
];

/** A registry object (built directly, like project.test.ts). When `approveBrief`, stamp `brief`'s
 *  content hash so its projection is eligible. */
function regWith(approveBrief: boolean): LensRegistry {
	const reg: LensRegistry = {
		lenses: [
			{ id: 'full', label: 'Full deck', base: 'all' },
			{ id: 'brief', label: 'Brief', base: 'none' },
			{ id: 'draft', label: 'Draft', base: 'none' },
		],
		default: 'full',
	};
	if (approveBrief) {
		const brief = reg.lenses.find((l) => l.id === 'brief');
		if (brief) brief.approved = approvalHash(SLIDES, reg, 'brief');
	}
	return reg;
}

describe('lens() builder — a pass-through over ./project', () => {
	it('defaults to the full-only registry and the full lens (whole deck)', () => {
		const b = lens(SLIDES);
		expect(b.slides()).toEqual(SLIDES);
		expect(lens(SLIDES).pick(FULL_LENS_ID).slides()).toEqual(SLIDES);
		expect(lens(SLIDES).project()).toEqual({
			status: 'ok',
			pairs: SLIDES.map((slide, index) => ({ slide, index })),
		});
	});

	it('every terminal equals the matching ./project call over the collected triple', () => {
		const reg = regWith(true);
		for (const lensId of [FULL_LENS_ID, 'brief', 'draft', 'nonexistent']) {
			const b = () => lens(SLIDES).registry(reg).pick(lensId);
			expect(b().slides()).toEqual(lensSlides(SLIDES, reg, lensId));
			expect(b().pairs()).toEqual(lensPairs(SLIDES, reg, lensId));
			expect(b().indices()).toEqual(lensIndices(SLIDES, reg, lensId));
			expect(b().project()).toEqual(lensEligibility(SLIDES, reg, lensId));
			expect(b().hash()).toEqual(approvalHash(SLIDES, reg, lensId));
		}
		expect(lens(SLIDES).registry(reg).pickable()).toEqual(readerLenses(SLIDES, reg));
	});

	it('accepts raw front-matter text as the registry (=== parseLensRegistry)', () => {
		const fm = 'lenses:\n  brief: { label: "Brief", base: none }';
		expect(lens(SLIDES).registry(fm).pick('brief').pairs()).toEqual(
			lensPairs(SLIDES, parseLensRegistry(fm), 'brief'),
		);
	});

	it('fails CLOSED on an unapproved lens — never a silent full-deck substitution', () => {
		const reg = regWith(false); // brief NOT approved
		expect(lens(SLIDES).registry(reg).pick('brief').project()).toEqual({
			status: 'unavailable',
			reason: 'unapproved',
		});
	});

	it('de-approves on drift — an edit after Approve invalidates the stamped hash', () => {
		const reg = regWith(true); // brief approved against SLIDES
		const edited = [...SLIDES, '<!-- _lens: brief -->\n## Sneaked in after approval'];
		expect(lens(edited).registry(reg).pick('brief').project()).toEqual({
			status: 'unavailable',
			reason: 'drifted',
		});
	});
});
