import { describe, expect, it } from 'vitest';
import { findInSlide, literalMatcher, markupChange, matchSnippet, replaceInSlide, slideSegments } from './deck-find';

// The "Oct. Tenth" slide from #3208's session, with every field the term turned up in.
const SLIDE = [
	'<!-- _class: quote -->',
	'`OCT. TENTH LAUNCH`',
	'',
	'## What happened Oct. Tenth',
	'',
	'> We sold out by noon on Oct. Tenth.',
	'> — Store lead, Oct. Tenth',
	'',
	'![The Oct. Tenth queue](photos/oct.-tenth.jpg)',
	'',
	'See [the Oct. Tenth recap](https://example.com/oct.-tenth).',
	'',
	'<!-- say: On October tenth, we sold out by noon. Oct. Tenth was the day. -->',
	'<!-- The note for Oct. Tenth: thank the store lead. -->',
	'',
	'```text',
	'Oct. Tenth in a code sample',
	'```',
].join('\n');

describe('slideSegments / findInSlide', () => {
	it('labels each match by the field a reader would name', () => {
		const fields = findInSlide(SLIDE, 'Oct. Tenth').map((m) => m.field);
		expect(fields).toEqual(['eyebrow', 'heading', 'quote', 'quote', 'alt text', 'body', 'spoken line', 'note', 'code']);
	});

	it('never searches a link or image target, or a directive', () => {
		const hits = findInSlide(SLIDE, 'oct.-tenth');
		expect(hits).toEqual([]);
		expect(findInSlide(SLIDE, 'quote').map((m) => m.field)).toEqual([]); // `_class: quote` is a directive
	});

	it('marks code and records as found but not replaceable', () => {
		const rec = '## A\n\n<!-- {say="Oct. Tenth was busy"} -->';
		expect(findInSlide(rec, 'Oct. Tenth')).toEqual([expect.objectContaining({ field: 'record', replaceable: false })]);
		expect(findInSlide(SLIDE, 'code sample')).toEqual([expect.objectContaining({ field: 'code', replaceable: false })]);
	});

	it('honors case and whole-word options', () => {
		expect(findInSlide(SLIDE, 'OCT. TENTH').length).toBe(9);
		expect(findInSlide(SLIDE, 'OCT. TENTH', { caseSensitive: true }).map((m) => m.field)).toEqual(['eyebrow']);
		expect(findInSlide('## Tent and Tenth', 'Tent', { wholeWord: true }).length).toBe(1);
		expect(findInSlide('## Tent and Tenth', 'Tent').length).toBe(2);
	});

	it('treats the query literally, never as a pattern', () => {
		expect(findInSlide('## a.b and axb', 'a.b').length).toBe(1);
		expect(literalMatcher('')).toBeNull();
	});

	it('keeps segments in source order without overlap', () => {
		const segs = slideSegments(SLIDE);
		for (let i = 1; i < segs.length; i++) expect(segs[i].start).toBeGreaterThanOrEqual(segs[i - 1].end);
	});
});

describe('replaceInSlide', () => {
	it('replaces every replaceable match and leaves targets, directives and code byte-for-byte', () => {
		const r = replaceInSlide(SLIDE, 'Oct. Tenth', 'October Tenth');
		expect(r.replaced.length).toBe(8);
		expect(r.skipped.map((m) => m.field)).toEqual(['code']);
		expect(r.text).toContain('## What happened October Tenth');
		expect(r.text).toContain('<!-- say: On October tenth, we sold out by noon. October Tenth was the day. -->');
		expect(r.text).toContain('![The October Tenth queue](photos/oct.-tenth.jpg)');
		expect(r.text).toContain('(https://example.com/oct.-tenth)');
		expect(r.text).toContain('<!-- _class: quote -->');
		expect(r.text).toContain('Oct. Tenth in a code sample');
	});

	it('changes nothing when nothing matches', () => {
		expect(replaceInSlide(SLIDE, 'Derby', 'Darby').text).toBe(SLIDE);
	});
});

describe('matchSnippet', () => {
	it('marks the match and keeps to its own line', () => {
		expect(matchSnippet('one\ntwo three four', 4, 7, 4)).toBe('«two» thr…');
		expect(matchSnippet('a long line with the word in it', 21, 25, 6)).toBe('…h the «word» in it');
	});
});

// The checker's reproductions on #3208's find/replace. Each one used to change a slide's structure or
// a target; each must now leave the slide byte-for-byte.
describe('replaceInSlide refuses what changes structure (the checker on #3208)', () => {
	const unchanged = (slide: string, find: string, rep: string) => {
		const r = replaceInSlide(slide, find, rep);
		expect(r.text).toBe(slide);
		return r;
	};

	it('never closes a comment early', () => {
		expect(unchanged('## A\n\n<!-- note: a>b -->', 'a', 'x--').blocked).toBeTruthy();
		expect(unchanged('## A\n\n<!-- see --b -->', 'b', '>').blocked).toBeTruthy();
	});

	it('never turns a note into a directive, a hide, a spoken line or a pane marker', () => {
		for (const rep of ['_class: lead', 'hide', 'say: hi']) expect(unchanged('## A\n\n<!-- Oct -->', 'Oct', rep).blocked).toBeTruthy();
		expect(unchanged('## A\n\n<!-- pane: check the numbers -->', ' the numbers', '').blocked).toBeTruthy();
	});

	it('never makes a heading, a list item, a quote, a table cell or emphasis', () => {
		for (const [slide, find, rep] of [
			['TBD line', 'TBD', '# New'],
			['TBD line', 'TBD', '- New'],
			['TBD line', 'TBD', '> New'],
			['TBD line', 'TBD', '1. New'],
			['| oct | 2 |', 'oct', 'x | y'],
			['say oct here', 'oct', '*bold'],
			['say oct here', 'oct', '`tick'],
		]) expect(unchanged(slide, find, rep).blocked).toBeTruthy();
	});

	it('still replaces plain words beside structure', () => {
		expect(replaceInSlide('| oct | 2 |', 'oct', 'Nov').text).toBe('| Nov | 2 |');
		expect(replaceInSlide('- **Oct** sold out', 'Oct', 'October').text).toBe('- **October** sold out');
	});
});

describe('slideSegments protects every kind of code and target (the checker on #3208)', () => {
	const fieldsOf = (slide: string, q = 'oct') => findInSlide(slide, q).map((m) => [m.field, m.replaceable]);

	it('finds code and math but never replaces them', () => {
		expect(fieldsOf('## A\n\n    oct indented code')).toEqual([['code', false]]);
		expect(fieldsOf('## A\n\n> ```\n> oct\n> ```')).toEqual([['code', false]]);
		expect(fieldsOf('## A\n\n$$\n\\text{oct}\n$$')).toEqual([['math', false]]);
		expect(fieldsOf('## A\n\nthe $oct^2$ term and oct')).toEqual([
			['math', false],
			['body', true],
		]);
		expect(fieldsOf('## A\n\n<style>\n.oct { color: red }\n</style>')).toEqual([['html', false]]);
		expect(fieldsOf('## A\n\n<img\n  src="oct.png">')).toEqual([['html', false]]);
	});

	it('never searches a reference definition, a bare URL or a footnote label', () => {
		expect(fieldsOf('## A\n\n[r]: https://x.test/Oct-Tenth')).toEqual([]);
		expect(fieldsOf('## A\n\nSee https://x.test/Oct-Tenth today')).toEqual([]);
		expect(fieldsOf('## A\n\nA claim[^oct].\n\n[^oct]: The source.')).toEqual([]);
	});

	it('keeps an indented list continuation as text, not code', () => {
		expect(fieldsOf('- item\n\n    oct continues the item')).toEqual([['body', true]]);
	});

	it('labels a match by its whole line, past a mid-line comment', () => {
		expect(fieldsOf('## H <!-- note: x --> Oct', 'Oct')).toEqual([['heading', true]]);
	});

	it('treats a combining accent as part of its word', () => {
		expect(findInSlide('## café', 'cafe', { wholeWord: true })).toEqual([]);
	});

	it('leaves a bare less-than sign searchable', () => {
		expect(fieldsOf('## A\n\nrevenue < cost, oct up')).toEqual([['body', true]]);
	});
});

// The checker's second round on #3208.
describe('markupChange: a marker may change its words, never move or appear', () => {
	it('refuses a moved, added or escaped marker, naming the character', () => {
		expect(markupChange('*b*', 'b**')).toBeTruthy();
		expect(markupChange('[Oct', 'Oct[')).toBeTruthy();
		expect(markupChange('see ', 'see !')).toContain('`!`');
		expect(markupChange('x', 'x\\')).toContain('`\\`');
		expect(markupChange('five', '$5')).toContain('`$`'); // a known, safe-side refusal: edit_slides handles it
	});
	it('allows a word change inside the same markup, and plain words', () => {
		expect(markupChange('*b*', '*c*')).toBeNull();
		expect(markupChange('Oct. Tenth', 'October Tenth')).toBeNull();
	});
});

describe('slideStructure sees indentation, nested markers and hard breaks', () => {
	const blocked = (slide: string, find: string, rep: string) => expect(replaceInSlide(slide, find, rep).blocked).toBeTruthy();
	it('refuses a replacement that indents a line into code, nests a list, or adds a hard break', () => {
		blocked('## A\n\nTBD here', 'TBD', '    TBD');
		blocked('- a\n- TBD', 'TBD', '1. b');
		blocked('word\nnext', 'word', 'word  ');
	});
});

describe('slideSegments follows the parser on tags, definitions, math and code (round 2)', () => {
	const fieldsOf = (slide: string, q: string) => findInSlide(slide, q).map((m) => [m.field, m.replaceable]);
	it('keeps prose with a bare < or an inline tag searchable and replaceable', () => {
		expect(fieldsOf('## A\n\nx<y and Oct', 'Oct')).toEqual([['body', true]]);
		expect(fieldsOf('## A\n\n<b>Oct</b> grew', 'Oct')).toEqual([['body', true]]);
		expect(fieldsOf('## A\n\n<span class="pill"><i></i>Solid Oct</span>', 'Oct')).toEqual([['body', true]]);
	});
	it('reads `[Draft]: Oct review` as a paragraph, not a link definition', () => {
		expect(fieldsOf('## A\n\n[Draft]: Oct review', 'Oct')).toEqual([['body', true]]);
		expect(fieldsOf('## A\n\n[r]: https://x.test/Oct "Oct title"', 'Oct')).toEqual([]);
	});
	it('reads prices the way the math rule does', () => {
		expect(fieldsOf('## A\n\nCosts $5M-$6M in Oct', '5M')).toEqual([['body', true]]);
		expect(fieldsOf('## A\n\nthe $x^2$ term', 'x^2')).toEqual([['math', false]]);
	});
	it('treats an indented block right under a heading as code', () => {
		expect(fieldsOf('## H\n    Oct code', 'Oct')).toEqual([['code', false]]);
	});
});
