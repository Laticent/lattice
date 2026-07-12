import { expect, test } from 'vitest';
import { sectionNameOf, sectionOfIndex, sectionsFromSlides } from './present-sections';

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
