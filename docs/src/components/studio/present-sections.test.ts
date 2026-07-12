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

test('present-sections: section/divider slides open sections named by their heading', () => {
	const slides = [
		slide('section', 'Framing'), // 0
		slide('', 'why'), // 1
		slide('kpi', 'cost'), // 2
		slide('divider', 'The model'), // 3
		slide('', 'cap'), // 4
		slide('section', 'Rollout'), // 5
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

test('present-sections: a leading run before the first boundary is its own section', () => {
	const slides = [slide('title', 'Deck'), slide('', 'intro'), slide('section', 'Body'), slide('', 'point')];
	const secs = sectionsFromSlides(slides);
	assert.equal(secs.length, 2);
	assert.deepEqual(secs[0], { name: 'Deck', start: 0, count: 2 });
	assert.deepEqual(secs[1], { name: 'Body', start: 2, count: 2 });
});

test('present-sections: a multi-class boundary (e.g. "divider light numbered") is still a boundary', () => {
	const secs = sectionsFromSlides([slide('title', 'Deck'), slide('divider light numbered', 'The model'), slide('', 'x')]);
	assert.equal(secs.length, 2);
	assert.equal(secs[1].name, 'The model');
	assert.equal(secs[1].start, 1);
});

test('present-sections: a boundary slide with no heading falls back to Section N', () => {
	const secs = sectionsFromSlides([slide('section', ''), slide('', 'x')]);
	assert.equal(secs[0].name, 'Section 1');
});

test('present-sections: a heading with a trailing HTML comment keeps only the visible title', () => {
	// The comment strip cuts at the first `<!--` (no fragile regex that can leave a partial
	// `<!--` or miss a newline comment — CodeQL-clean). A heading is text before its comment.
	const secs = sectionsFromSlides([`<!-- _class: section -->\n# Rollout <!-- speaker: pace this -->\nbody`, slide('', 'x')]);
	assert.equal(secs[0].name, 'Rollout');
	// A malformed / unterminated comment can't leak a dangling marker into the title.
	const secs2 = sectionsFromSlides([`<!-- _class: section -->\n# Framing <!--<!--\nbody`, slide('', 'x')]);
	assert.equal(secs2[0].name, 'Framing');
});

test('present-sections: sectionOfIndex maps every slide to its section', () => {
	const secs = sectionsFromSlides([slide('section', 'A'), slide('', 'a2'), slide('section', 'B'), slide('', 'b2')]);
	assert.equal(sectionOfIndex(secs, 0), 0);
	assert.equal(sectionOfIndex(secs, 1), 0);
	assert.equal(sectionOfIndex(secs, 2), 1);
	assert.equal(sectionOfIndex(secs, 3), 1);
	// out-of-range clamps to the last section, never throws
	assert.equal(sectionOfIndex(secs, 99), 1);
	assert.equal(sectionOfIndex([], 0), -1);
});

test('present-sections: sectionNameOf returns the section name (or empty for flat)', () => {
	const grouped = sectionsFromSlides([slide('section', 'A'), slide('', 'a2')]);
	assert.equal(sectionNameOf(grouped, 1), 'A');
	const flat = sectionsFromSlides([slide('', 'x'), slide('', 'y')]);
	assert.equal(sectionNameOf(flat, 0), '');
});
