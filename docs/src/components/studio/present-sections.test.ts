// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it, test } from 'vitest';
import { isSectionBoundary, sectionNameOf, sectionOfIndex, sectionsFromSlides } from './present-sections';

const assert = {
	equal: (a: unknown, b: unknown) => expect(a).toBe(b),
	deepEqual: (a: unknown, b: unknown) => expect(a).toEqual(b),
};

const slide = (cls: string, heading = '') => `${cls ? `<!-- _class: ${cls} -->\n` : ''}${heading ? `# ${heading}\n` : ''}body text`;

test('present-sections: a deck with no boundary slides is one flat section', () => {
	const secs = sectionsFromSlides([slide('', 'A'), slide('', 'B'), slide('kpi', 'C')]);
	assert.equal(secs.length, 1);
	assert.deepEqual(secs[0], { name: '', start: 0, count: 3 });
});

test('present-sections: empty deck yields no sections', () => {
	assert.deepEqual(sectionsFromSlides([]), []);
});

test('present-sections: divider slides open sections named by their heading', () => {
	const slides = [
		slide('divider', 'Framing'), // 0
		slide('', 'why'), // 1
		slide('kpi', 'cost'), // 2
		slide('divider', 'The model'), // 3
		slide('', 'cap'), // 4
		slide('divider', 'Rollout'), // 5
		slide('', 'week one'), // 6
	];
	const secs = sectionsFromSlides(slides);
	assert.deepEqual(secs, [
		{ name: 'Framing', start: 0, count: 3 },
		{ name: 'The model', start: 3, count: 2 },
		{ name: 'Rollout', start: 5, count: 2 },
	]);
	// tiles with no gaps/overlaps
	assert.equal(secs.reduce((a, s) => a + s.count, 0), slides.length);
});

test('present-sections: the leading cover run before the first divider is a NAMELESS section', () => {
	// A title/agenda run before the first divider is the cover — the rail shows its segments
	// but no section title (else it would print the deck title, truncated, as a "section").
	const slides = [slide('title', 'Deck'), slide('', 'intro'), slide('divider', 'Body'), slide('', 'point')];
	const secs = sectionsFromSlides(slides);
	assert.equal(secs.length, 2);
	assert.deepEqual(secs[0], { name: '', start: 0, count: 2 });
	assert.deepEqual(secs[1], { name: 'Body', start: 2, count: 2 });
});

test('present-sections: a dark multi-class divider is a boundary; `divider light` is NOT', () => {
	// A dark `divider` (with any extra modifiers like `numbered`) opens a section…
	const dark = sectionsFromSlides([slide('title', 'Deck'), slide('divider numbered', 'The model'), slide('', 'x')]);
	assert.equal(dark.length, 2);
	assert.equal(dark[1].name, 'The model');
	assert.equal(dark[1].start, 1);
	// …but `divider light` is a within-section waypoint (divider.docs.md), never a section start,
	// so a deck whose only "divider" is a light one stays ONE flat, nameless section.
	const light = sectionsFromSlides([slide('title', 'Deck'), slide('divider light', 'Narrowing'), slide('', 'x')]);
	assert.equal(light.length, 1);
	assert.deepEqual(light[0], { name: '', start: 0, count: 3 });
});

test('present-sections: a boundary slide with no heading falls back to Section N', () => {
	const secs = sectionsFromSlides([slide('divider', ''), slide('', 'x')]);
	assert.equal(secs[0].name, 'Section 1');
});

test('present-sections: a heading with a trailing HTML comment keeps only the visible title', () => {
	// The comment strip cuts at the first `<!--` (no fragile regex that can leave a partial
	// `<!--` or miss a newline comment — CodeQL-clean). A heading is text before its comment.
	const secs = sectionsFromSlides([`<!-- _class: divider -->\n# Rollout <!-- speaker: pace this -->\nbody`, slide('', 'x')]);
	assert.equal(secs[0].name, 'Rollout');
	// A malformed / unterminated comment can't leak a dangling marker into the title.
	const secs2 = sectionsFromSlides([`<!-- _class: divider -->\n# Framing <!--<!--\nbody`, slide('', 'x')]);
	assert.equal(secs2[0].name, 'Framing');
});

test('present-sections: sectionOfIndex maps every slide to its section', () => {
	const secs = sectionsFromSlides([slide('divider', 'A'), slide('', 'a2'), slide('divider', 'B'), slide('', 'b2')]);
	assert.equal(sectionOfIndex(secs, 0), 0);
	assert.equal(sectionOfIndex(secs, 1), 0);
	assert.equal(sectionOfIndex(secs, 2), 1);
	assert.equal(sectionOfIndex(secs, 3), 1);
	// out-of-range clamps to the last section, never throws
	assert.equal(sectionOfIndex(secs, 99), 1);
	assert.equal(sectionOfIndex([], 0), -1);
});

test('present-sections: sectionNameOf returns the section name (or empty for flat)', () => {
	const grouped = sectionsFromSlides([slide('divider', 'A'), slide('', 'a2')]);
	assert.equal(sectionNameOf(grouped, 1), 'A');
	const flat = sectionsFromSlides([slide('', 'x'), slide('', 'y')]);
	assert.equal(sectionNameOf(flat, 0), '');
});

describe('a slide record is a section break as its `_class` comment is (meta record step 3)', () => {
	it('reads `{layout=divider}`, and not `{layout=divider, class=light}`', () => {
		expect(isSectionBoundary('<!-- {layout=divider} -->\n\n## Part two')).toBe(true);
		expect(isSectionBoundary('<!-- {layout=divider, class=light} -->\n\n## Part two')).toBe(false);
	});
});

describe('present-sections: the boundary reads the class the way the engine does', () => {
	it('a comment holding several keys still opens a section', () => {
		expect(isSectionBoundary('<!--\n_class: divider\npaginate: false\n-->\n# Part two')).toBe(true);
		expect(isSectionBoundary('<!-- paginate: false\n_class: divider -->\n# Part two')).toBe(true);
	});
	it('a `_class` comment inside fenced code is an example, not the slide', () => {
		expect(isSectionBoundary('# How to\n\n```md\n<!-- _class: divider -->\n```\n')).toBe(false);
	});
	it('a `_class` comment in an indented code block is an example, not the slide', () => {
		expect(isSectionBoundary('# How to\n\n    <!-- _class: divider -->\n')).toBe(false);
	});
});

describe('present-sections: a class set twice', () => {
	it('opens a section when the class that wins is a divider', () => {
		expect(isSectionBoundary('<!-- _class: divider -->\n<!-- _class: divider -->\n\n# A')).toBe(true);
		expect(isSectionBoundary('<!-- {layout=divider} -->\n<!-- {layout=divider} -->\n\n# A')).toBe(true);
	});
	it('follows the last one, as the engine does', () => {
		expect(isSectionBoundary('<!-- _class: divider -->\n<!-- _class: content -->\n\n# A')).toBe(false);
		expect(isSectionBoundary('<!-- _class: content -->\n<!-- _class: divider -->\n\n# A')).toBe(true);
	});
});

test('present-sections: a quoted divider opens a section, as the engine reads it', () => {
	expect(isSectionBoundary('<!-- _class: "divider" -->\n\n# A')).toBe(true);
	expect(isSectionBoundary("<!-- _class: 'divider light' -->\n\n# A")).toBe(false);
});
