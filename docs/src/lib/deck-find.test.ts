import { describe, expect, it } from 'vitest';
import { findInSlide, literalMatcher, matchSnippet, replaceInSlide, slideSegments, slideStructure } from './deck-find';

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

	it('escapes a heading, list item, quote, table cell or emphasis instead of making one', () => {
		for (const [slide, find, rep, want] of [
			['TBD line', 'TBD', '# New', '\\# New line'],
			['TBD line', 'TBD', '- New', '\\- New line'],
			['TBD line', 'TBD', '> New', '\\> New line'],
			['TBD line', 'TBD', '1. New', '1\\. New line'],
			['| oct | 2 |', 'oct', 'x | y', '| x \\| y | 2 |'],
			['say oct here', 'oct', '*bold', 'say \\*bold here'],
			['say oct here', 'oct', '`tick', 'say \\`tick here'],
		]) {
			const out = replaceInSlide(slide, find, rep);
			expect(out.text).toBe(want);
			expect(slideStructure(out.text)).toBe(slideStructure(slide));
		}
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
describe('replace works like a word processor: words change, formatting stays (#3208, the owner on #3318)', () => {
	const r = (slide: string, find: string, rep: string) => replaceInSlide(slide, find, rep);
	it('escapes what Markdown would read as markup, instead of refusing', () => {
		expect(r('## Price\n\nIt costs five', 'five', '$5').text).toBe('## Price\n\nIt costs \\$5');
		expect(r('## A\n\nsee file now', 'file', 'file_name').text).toBe('## A\n\nsee file_name now');
		expect(r('## A\n\nthe Oct note', 'Oct', 'Q3 [draft]').text).toBe('## A\n\nthe Q3 \\[draft\\] note');
		expect(r('## A\n\nsee x', 'x', 'a *b* c').text).toBe('## A\n\nsee a \\*b\\* c');
		expect(r('## A\n\nfive', 'five', '# 1').text).toBe('## A\n\n\\# 1'); // a line-opening # is not a heading
		expect(r('## A\n\nfive', 'five', '1. first').text).toBe('## A\n\n1\\. first');
		expect(r('| oct | 2 |\n|---|---|', 'oct', 'x | y').text).toBe('| x \\| y | 2 |\n|---|---|');
	});
	it('keeps the formatting around a word, and leaves a match that crosses formatting alone', () => {
		expect(r('## A\n\n- **Oct** sold out', 'Oct', 'October').text).toBe('## A\n\n- **October** sold out');
		expect(r('## A\n\nsee [Oct](u) now', 'Oct', 'Nov').text).toBe('## A\n\nsee [Nov](u) now');
		const crossed = r('## A\n\n**Oct.** Tenth', 'Oct. Tenth', 'October 10');
		expect(crossed.replaced).toEqual([]);
		expect(crossed.skipped).toEqual([expect.objectContaining({ reason: 'crosses formatting' })]);
	});
	it('finds what a reader sees: an escaped character matches its plain form', () => {
		expect(findInSlide('## A\n\nIt costs \\$5', '$5').map((m) => m.field)).toEqual(['body']);
		expect(r('## A\n\nIt costs \\$5', '$5', '$6').text).toBe('## A\n\nIt costs \\$6');
		expect(findInSlide('## A\n\na *b* c', '*b*')).toEqual([]); // the asterisks are bold, not text
	});
	it('the checker cases: a marker can no longer move or appear', () => {
		expect(r('## A\n\nsee [x](u) now', 'see ', 'see !').text).toBe('## A\n\nsee \\![x](u) now'); // no image
		expect(r('## A\n\nx*bold*', 'x', 'x\\').text).toBe('## A\n\nx\\\\*bold*'); // no escaped emphasis
		expect(findInSlide('## A\n\nand [Oct](u)', '[Oct')).toEqual([]);
	});
	it('writes code spans, spoken lines and notes as typed, and refuses only what they cannot hold', () => {
		expect(r('`OCT LAUNCH`\n\n## A', 'OCT', '$5').text).toBe('`$5 LAUNCH`\n\n## A');
		expect(r('## A\n\n<!-- say: five days -->', 'five', '$5').text).toBe('## A\n\n<!-- say: $5 days -->');
		expect(r('`OCT`\n\n## A', 'OCT', 'a`b').blocked).toContain('backtick');
		expect(r('## A\n\n<!-- note: five -->', 'five', 'a--b').blocked).toContain('`--`');
	});
});

describe('slideStructure sees indentation, nested markers and hard breaks', () => {
	const blocked = (slide: string, find: string, rep: string) => expect(replaceInSlide(slide, find, rep).blocked).toBeTruthy();
	it('refuses a replacement that indents a line into code, nests a list, or adds a hard break', () => {
		blocked('## A\n\nTBD here', 'TBD', '    TBD');
		// A list marker right after `- ` is escaped now, not refused (the checker's round 3).
		expect(replaceInSlide('- a\n- TBD', 'TBD', '1. b').text).toBe('- a\n- 1\\. b');
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

// The checker's round 3 on #3318.
describe('Lattice syntax in backticks is found but never written into', () => {
	it('leaves a pill or an icon alone, by the default rule and by an injected reader', () => {
		for (const opts of [{}, { inlineDirective: (t: string) => t.startsWith('{') || t.startsWith('^{') }]) {
			const pill = replaceInSlide('## A\n\nShipped `{BETA, tag, c4}` today', 'tag', 'label', opts);
			expect(pill.replaced).toEqual([]);
			expect(pill.skipped.map((m) => m.field)).toEqual(['inline syntax']);
			expect(replaceInSlide('## A\n\nLand in `^{bucket, c4}` S3', 'bucket', 'pail', opts).replaced).toEqual([]);
		}
	});
	it('refuses a replacement that would turn a plain code span or an eyebrow into syntax', () => {
		expect(replaceInSlide('`Oct`\n\n## A', 'Oct', '{LIVE}').blocked).toContain('Lattice syntax');
		expect(replaceInSlide('## A\n\nrun `npm x` now', 'npm x', '^{bucket}').blocked).toContain('Lattice syntax');
	});
});

describe('find matches ordinary text that holds * | ~ _ or an entity', () => {
	const found = (slide: string, q: string) => findInSlide(slide, q).length;
	it('reads a lone or space-wrapped marker character as text', () => {
		expect(found('## A\n\n2 * 3 = 6', '2 * 3')).toBe(1);
		expect(found('## A\n\n5*3 is 15', '5*3')).toBe(1);
		expect(found('## A\n\nthe *nix way', '*nix')).toBe(1);
		expect(found('## A\n\nA | B wins', 'A | B')).toBe(1);
		expect(found('## A\n\nabout ~5% more', '~5%')).toBe(1);
	});
	it('still skips real emphasis and table separators', () => {
		expect(found('## A\n\na *b* c', '*b*')).toBe(0);
		expect(found('| A | B |\n|---|---|\n| 1 | 2 |', 'A | B')).toBe(0);
	});
	it('reads entities as their characters, and replaces the whole entity', () => {
		expect(found('## A\n\nAT&amp;T grew', 'AT&T')).toBe(1);
		expect(found('## A\n\nOct.&nbsp;Tenth', 'Oct. Tenth')).toBe(1);
		expect(replaceInSlide('## A\n\nAT&amp;T grew', 'AT&T', 'Verizon').text).toBe('## A\n\nVerizon grew');
	});
});
