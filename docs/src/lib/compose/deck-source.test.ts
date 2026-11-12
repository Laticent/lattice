// @vitest-environment node
// This file touches no DOM. Under the suite default it paid for a jsdom window it
// never used; see engineering/decisions/2026-09-20-dom-library-bakeoff.md.
import { describe, expect, it } from 'vitest';
import { classNameOf, classPayloadOf, composeSlideChunk, hasLossyConstruct, splitSlideDirectives } from './deck-source';

// `hasLossyConstruct` decides which slides Compose locks read-only (edited in Markdown
// mode). It must fire on constructs the CommonMark round-trip would flatten/escape, and
// NOT on prose or the constructs that round-trip byte-exact (inline HTML, `<!-- -->`).

describe('hasLossyConstruct — detects what Compose cannot round-trip', () => {
	it('does NOT fire on a plain GFM table (Compose models tables as real nodes and round-trips them)', () => {
		expect(hasLossyConstruct('## Data\n\n| A | B |\n| --- | --- |\n| 1 | 2 |')).toBe(false);
	});
	it('does NOT fire on a table with LFM state markers (they are literal cell text that round-trips)', () => {
		expect(hasLossyConstruct('| Regime | Access |\n| --- | :---: |\n| GDPR | [x] |\n| CCPA | [-] |')).toBe(false);
	});
	it('does NOT fire on a table whose cell holds inline math: the atom writes it back (raw-block.ts)', () => {
		expect(hasLossyConstruct('| Shape | Area |\n| --- | --- |\n| Circle | $\\pi r^2$ |')).toBe(false);
	});
	it('STILL fires on a table whose cell holds inline HTML (Axis F / checker Bug 3)', () => {
		// The block-HTML rule is line-anchored, so a mid-line tag in a cell slipped past it; the
		// engine renders that HTML and a pipe in an attribute would split the cell, so it must lock.
		expect(hasLossyConstruct('| a | b |\n| --- | --- |\n| <div>x</div> | 2 |')).toBe(true);
		expect(hasLossyConstruct('| a | b |\n| --- | --- |\n| <span>t</span> | y |')).toBe(true);
	});
	it('fires on a BORDERLESS table row with inline HTML — either order (trio gap)', () => {
		// GFM allows omitting the leading/trailing pipe; the old lock anchored on a leading `|`.
		expect(hasLossyConstruct('h1 | h2\n---|---\na | b<span title="x|y">c</span>')).toBe(true); // pipe then tag
		expect(hasLossyConstruct('h1 | h2\n---|---\n<b>a</b> | c')).toBe(true); // tag then pipe
	});
	it('fires on an ENTITY-encoded tag in a cell — decodes to live HTML on edit (trio HIGH)', () => {
		expect(hasLossyConstruct('| a | b |\n| --- | --- |\n| &lt;img src=x onerror=alert(1)&gt; | 2 |')).toBe(true);
		expect(hasLossyConstruct('| a | b |\n| --- | --- |\n| &#60;script&#62; | 2 |')).toBe(true);
		expect(hasLossyConstruct('| a | b |\n| --- | --- |\n| &#x3c;div&#x3e; | 2 |')).toBe(true);
	});
	it('does NOT over-lock harmless entities or a lone `&lt;` (render-equivalent)', () => {
		expect(hasLossyConstruct('| a | b |\n| --- | --- |\n| Jack &amp; Jill | © 2026 |')).toBe(false);
		expect(hasLossyConstruct('| a | b |\n| --- | --- |\n| x &lt; y | ok |')).toBe(false); // `&lt;` + space, not a tag
	});
	it('fires on strikethrough', () => {
		expect(hasLossyConstruct('Price was ~~$5M~~ now $3M.')).toBe(true);
	});
	it('does not fire on a top-level block of HTML (an atom since raw-block.ts), but fires on one inside a list item', () => {
		expect(hasLossyConstruct('<figure>\n  <img src="x">\n</figure>')).toBe(false);
		expect(hasLossyConstruct('- item\n  <figure>\n    <img src="x">\n  </figure>')).toBe(true);
	});
	it('does not fire on a task list: the six markers round-trip', () => {
		// The serializer keeps a list item's leading marker unescaped (deck-markdown paragraph),
		// as it does in a table cell, so a checklist edits in place.
		expect(hasLossyConstruct('- [ ] todo\n- [x] done')).toBe(false);
	});
	it('fires only on `[X]`, the GFM checked box that is not one of the six', () => {
		for (const m of ['x', '-', '!', '?', ' ', '/']) {
			expect(hasLossyConstruct(`- Card\n  - [${m}] item`)).toBe(false);
		}
		expect(hasLossyConstruct('1. [!] failed')).toBe(false);
		expect(hasLossyConstruct('- Card\n  - [X] item')).toBe(true);
		expect(hasLossyConstruct('- [~] not a marker')).toBe(false);
	});
	it('fires on a footnote reference', () => {
		expect(hasLossyConstruct('A claim.[^1]\n\n[^1]: the source')).toBe(true);
	});

	it('does NOT fire on plain prose, headings, lists, blockquotes', () => {
		expect(hasLossyConstruct('# Title\n\n`Eyebrow`\n\n- one\n- two\n\n> insight')).toBe(false);
	});
	it('does NOT fire on inline HTML or HTML comments (they round-trip byte-exact)', () => {
		expect(hasLossyConstruct('A line with <br> inside it.')).toBe(false);
		expect(hasLossyConstruct('## Slide\n\n<!-- note: speaker aside -->\n\nBody.')).toBe(false);
	});
	it('does NOT fire on a big-number / KPI slide (dollar figures are not tables)', () => {
		expect(hasLossyConstruct('## Revenue\n\n1. $2.4B\n   - Total revenue\n2. 42%\n   - Margin')).toBe(false);
	});

	it('does not fire on inline or top-level display math (atoms since raw-block.ts), but fires on display math inside a list item', () => {
		expect(hasLossyConstruct('The area is $A = \\pi r^2$ per shape.')).toBe(false);
		expect(hasLossyConstruct('## Model\n\n$$E = mc^2$$')).toBe(false);
		expect(hasLossyConstruct('- Model\n  $$E = mc^2$$')).toBe(true);
	});
	it('does NOT fire on currency prose (the engine keeps $400M / $18M literal, so Compose can too)', () => {
		expect(hasLossyConstruct('Revenue was $400M, up 28% YoY, ahead by $18M.')).toBe(false);
	});
	it('does NOT fire on a $…$ shape / a pipe row inside code (the engine renders code literally)', () => {
		expect(hasLossyConstruct('Run this:\n\n```bash\necho "$A$B"\n```')).toBe(false); // shell var, not math
		expect(hasLossyConstruct('The `$x$` token is a placeholder.')).toBe(false); // inline code, not math
		expect(hasLossyConstruct('A grid sample:\n\n```\n| A | B |\n```')).toBe(false); // pipes in a fence, not a table
	});
});

// A pane marker marks WHERE a pane starts, so Compose keeps it in place in every spelling the shared reader
// (lib/core/meta-door.mjs `parsePaneMarker`) takes, and hoists only real directives.
describe('splitSlideDirectives — pane markers stay where they are', () => {
	it('hoists a record as it hoists a directive, reads its class, and keeps a record pane marker in place (step 3)', () => {
		const { directives, prose } = splitSlideDirectives('<!-- {layout=columns, footer="Q3"} -->\n\n## T\n\n<!-- {pane=bar} -->\n\n- a');
		expect(directives).toEqual(['<!-- {layout=columns, footer="Q3"} -->']);
		expect(prose).toContain('<!-- {pane=bar} -->\n\n- a');
		expect(classPayloadOf('<!-- {layout=cards, variant=compact} -->')).toBe('cards compact');
		expect(classNameOf('<!-- @meta{layout=kpi} -->')).toBe('kpi');
		expect(classPayloadOf('<!-- {footer=x} -->')).toBeNull();
		// A comment with text after it never runs on to a later comment and hoists the slide between them.
		const runaway = splitSlideDirectives('<!-- {class=dark} --> trailing\n\n# T\n\nmore prose\n\n<!-- a note -->\n');
		expect(runaway.prose).toContain('more prose');
	});

	it('keeps a `_pane:` marker in the prose and hoists the `_class`', () => {
		const { directives, prose } = splitSlideDirectives('<!-- _class: columns -->\n\n## T\n\n<!-- _pane: bar no-title -->\n\n- a\n\n<!-- _pane: list -->\n\n- b');
		expect(directives).toEqual(['<!-- _class: columns -->']);
		expect(prose).toContain('<!-- _pane: bar no-title -->\n\n- a\n\n<!-- _pane: list -->');
	});
	it('keeps a record marker, bare, `@meta` or mixed, in place', () => {
		for (const m of ['<!-- {pane="bar"} -->', '<!-- @meta{pane="bar"} -->', '<!-- {footer=x, pane="bar"} -->']) {
			const { directives, prose } = splitSlideDirectives(`## T\n\n${m}\n\n- a`);
			expect(directives, m).toEqual([]);
			expect(prose, m).toBe(`## T\n\n${m}\n\n- a`);
		}
	});
});

describe('splitSlideDirectives hoists only what the engine applies (the checker on #3136)', () => {
	it('leaves a record in indented code in the prose', () => {
		const { directives, prose } = splitSlideDirectives('# T\n\nExample:\n\n    <!-- {layout=kpi} -->\n\ntext');
		expect(directives).toEqual([]);
		expect(prose).toContain('    <!-- {layout=kpi} -->');
	});
	it('leaves a record folded into an HTML block in place', () => {
		const { directives } = splitSlideDirectives('<div>\n<!-- {layout=kpi} -->\n</div>');
		expect(directives).toEqual([]);
	});
	it('leaves a `_class` example in indented code in the prose', () => {
		expect(splitSlideDirectives('# T\n\n    <!-- _class: kpi -->\n').directives).toEqual([]);
	});
	it('still hoists a top-level record and directive', () => {
		expect(splitSlideDirectives('<!-- {layout=kpi} -->\n<!-- _footer: Q3 -->\n\n# T').directives).toEqual([
			'<!-- {layout=kpi} -->',
			'<!-- _footer: Q3 -->',
		]);
	});
	it('never lifts a record past a bare directive the engine applies, so the last one still wins', () => {
		const slide = '<!-- class: dark -->\n\n# T\n\n<!-- {class=light} -->';
		const { directives, prose } = splitSlideDirectives(slide);
		expect(directives).toEqual([]);
		expect(prose.indexOf('class: dark')).toBeLessThan(prose.indexOf('{class=light}'));
	});
});

describe('splitSlideDirectives: a bare directive blocks only the field it sets', () => {
	it('still hoists a `_class` below a bare `paginate:` comment', () => {
		expect(splitSlideDirectives('<!-- paginate: false -->\n<!-- _class: title -->\n\n# T').directives).toEqual(['<!-- _class: title -->']);
	});
});

// The round trip Compose makes on every edit (split the slide's directives off its prose, then put them back) must not
// change what the ENGINE applies to the slide. A seeded walk over slides built from the shapes the checkers on #3136 broke
// it with: renders each slide with lib/engine before and after, and compares the slide's class and its style declarations. The seed is
// fixed and printed (HARD RULE #32).
describe('the Compose round trip never changes what the engine applies', async () => {
	const { createRequire } = await import('node:module');
	const require = createRequire(import.meta.url);
	const { createEngine } = require('../../../../lib/engine');
	const engine = createEngine();
	const sectionOf = (md: string) => {
		const tag = String(engine.render(md).html).match(/<section[^>]*>/)?.[0] ?? '';
		const attr = (name: string) => tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] ?? '';
		// Declaration ORDER in the style attribute is not what applies; the set of declarations is.
		const style = attr('style').replaceAll('&quot;', '"').split(';').filter(Boolean).sort().join(';');
		// Each pane the slide draws, with its classes: a setting moved into or out of a pane changes these.
		const html = String(engine.render(md).html);
		const panes = (html.match(/<lat-pane[^>]*>/g) ?? []).join('');
		// How many lists and items: a setting lifted from between two lists merges them (the grader on #3136).
		const lists = `${(html.match(/<[ou]l[\s>]/g) ?? []).length}/${(html.match(/<li[\s>]/g) ?? []).length}`;
		return { class: attr('data-class'), style: `${style}|${panes}|${lists}` };
	};
	const SHAPES = [
		'<!-- _class: dark -->',
		'<!-- _class: light -->',
		'<!-- class: dark -->',
		'<!-- {class=light, footer=f} -->',
		'<!-- _footer: g -->',
		'<!-- {layout=kpi} -->',
		'<!-- {layout=divider} -->',
		'- a\n\n  <!-- _class: dark -->',
		'> <!-- _class: dark -->',
		'    <!-- {layout=kpi} -->',
		'    <!-- _class: divider -->',
		'```md\n<!-- _class: x -->\n```',
		'<div>\n<!-- _class: kpi -->\n</div>',
		'<div>\n<!-- {layout=kpi} -->\n</div>',
		'text',
		'more text',
		'<!-- remember\nfocus: c -->',
		'<!-- _focus: 2 -->',
		'<!-- {focus=3} -->',
		'<!-- paginate: false -->',
		'<!-- _paginate: false -->',
		'<!-- theme: indaco -->\n<!-- paginate: true -->',
		'<!-- _class: split-compare -->',
		'<!-- _pane: right -->',
		'<!-- {pane=left} -->',
		'<!-- {class=dark, note=hi} -->',
		'- a\n<!-- _pane: right -->',
		'1. a',
		'1. a\n<!-- _footer: z -->',
		'- a\n  more\n<!-- _footer: z -->',
		'- a\nmore\n<!-- _footer: z -->',
		'- a\n\n  more',
		'- b',
	];
	const SEED = Number(process.env.COMPOSE_ROUNDTRIP_SEED ?? 3136);
	let s = SEED >>> 0;
	const rand = () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	it(`holds for 400 random slides (seed ${SEED})`, () => {
		const broken: string[] = [];
		for (let n = 0; n < 400; n++) {
			const parts = Array.from({ length: 2 + Math.floor(rand() * 5) }, () => SHAPES[Math.floor(rand() * SHAPES.length)]);
			// At most one heading, and only first: the engine starts a new slide at a top-level heading, and Compose
			// splits a deck into slides before this round trip, so a chunk never holds two.
			const slide = (rand() < 0.5 ? ['## T', ...parts] : parts).join('\n\n');
			const { directives, prose } = splitSlideDirectives(slide);
			const back = composeSlideChunk(directives, prose);
			const before = sectionOf(slide);
			const after = sectionOf(back);
			if (before.class !== after.class || before.style !== after.style) broken.push(JSON.stringify({ slide, back, before, after }));
		}
		expect(broken.slice(0, 3), `seed ${SEED}: ${broken.length} of 400 slides changed`).toEqual([]);
	});
	// The path an edit takes: the editor parses the slide (`deckToDoc`) and writes it back through its serializer
	// (`docToDeck` re-serializes every slide, as an edit does). A slide Compose opens read-only (`locked`) is never
	// written back, so it is skipped. A slide never starts with an indented line here: the deck splitter trims each
	// slide first, which turns such an example on in main too (followups.d/2772-p5-indented-example-at-slide-top.md).
	it(`holds through the editor's parser and serializer for 400 random slides (seed ${SEED})`, async () => {
		const { deckToDoc, docToDeck } = await import('./deck-doc');
		const broken: string[] = [];
		let edited = 0;
		for (let n = 0; n < 400; n++) {
			const parts = Array.from({ length: 2 + Math.floor(rand() * 5) }, () => SHAPES[Math.floor(rand() * SHAPES.length)]);
			const slide = ['text', ...parts].join('\n\n');
			const doc = deckToDoc(slide);
			if (doc.firstChild?.attrs.locked) continue;
			edited++;
			const back = docToDeck(doc);
			const before = sectionOf(slide);
			const after = sectionOf(back);
			if (before.class !== after.class || before.style !== after.style) broken.push(JSON.stringify({ slide, back, before, after }));
		}
		expect(edited, 'most random slides are editable in Compose').toBeGreaterThan(200);
		expect(broken.slice(0, 3), `seed ${SEED}: ${broken.length} of ${edited} edited slides changed`).toEqual([]);
	});
});

describe('splitSlideDirectives: the reviewer cases on #3136', () => {
	it('lifts a directive nested in a list with the rest, in order, so the last still wins', () => {
		const slide = '- a\n\n  <!-- _class: dark -->\n\n<!-- _class: light -->\n\n# T';
		expect(splitSlideDirectives(slide).directives).toEqual(['<!-- _class: dark -->', '<!-- _class: light -->']);
	});
	it('opens a slide in Markdown when a setting must stay right under a list item', () => {
		const slide = '<!-- class: dark -->\n\n- x\n<!-- _class: light -->';
		const { prose } = splitSlideDirectives(slide);
		expect(hasLossyConstruct(prose)).toBe(true);
	});
	it('keeps an indented example at the top of the prose indented', () => {
		const a = splitSlideDirectives('    <!-- {layout=kpi} -->\n\n# T');
		expect(a.directives).toEqual([]);
		expect(a.prose.startsWith('    <!--')).toBe(true);
		const b = splitSlideDirectives('<!-- _footer: Q3 -->\n\n    <!-- _class: divider -->\n\nExample above.');
		expect(composeSlideChunk(b.directives, b.prose)).toContain('\n\n    <!-- _class: divider -->');
	});
	it('a record kept in place keeps the other fields it sets in place too', () => {
		const slide = '<!-- class: dark -->\n\n# T\n\n<!-- {class=light, footer=f} -->\n\n<!-- _footer: g -->';
		const { directives, prose } = splitSlideDirectives(slide);
		expect(directives).toEqual([]);
		expect(prose.indexOf('footer=f')).toBeLessThan(prose.indexOf('_footer: g'));
	});
});

describe('splitSlideDirectives and the lock: the second review of #3136', () => {
	it('two settings stacked on adjacent lines stay editable', () => {
		const { prose } = splitSlideDirectives('<!-- theme: indaco -->\n<!-- paginate: true -->\n\n## Title');
		expect(hasLossyConstruct(prose)).toBe(false);
	});
	it('a setting right under a heading or a paragraph stays editable', () => {
		expect(hasLossyConstruct('## T\n<!-- paginate: false -->')).toBe(false);
		expect(hasLossyConstruct('text\n<!-- {pane=right} -->')).toBe(false);
	});
	it('a pane marker right under a list item locks the slide (the list would take it in)', () => {
		const { prose } = splitSlideDirectives('<!-- _class: split-compare -->\n\n## T\n\n- a\n<!-- _pane: right -->\n\nb');
		expect(hasLossyConstruct(prose)).toBe(true);
	});
	it('a record that carries a speaker note stays where it is, so the notes keep their order', () => {
		const { directives } = splitSlideDirectives('## T\n\n<!-- first note -->\n\ntext\n\n<!-- {class=dark, note=second} -->');
		expect(directives).toEqual([]);
	});
	it('nothing after a pane marker moves out of its pane', () => {
		const slide = '<!-- _class: split-compare -->\n\n## T\n\n<!-- {pane=right} -->\n\n<!-- {class=dark} -->\n\nbody\n\n<!-- {pane=left} -->\n\nx';
		expect(splitSlideDirectives(slide).directives).toEqual(['<!-- _class: split-compare -->']);
	});
	it('a setting between two list items stays, so the lists do not merge', () => {
		expect(splitSlideDirectives('## T\n\n1. a\n<!-- _footer: z -->\n\n1. b').directives).toEqual([]);
	});
	it('a setting under a list item that runs onto more lines stays too (the grader on #3136)', () => {
		for (const slide of [
			'## T\n\n- a\n  more\n<!-- _footer: z -->\n- b',
			'## T\n\n- a\nmore\n<!-- _footer: z -->\n- b',
			'## T\n\n- a\n\n  more\n\n<!-- _footer: z -->\n\n- b',
		])
			expect(splitSlideDirectives(slide).directives, slide).toEqual([]);
	});
	it('a setting under a paragraph that follows a list still moves', () => {
		expect(splitSlideDirectives('## T\n\n- a\n\npara\n<!-- _footer: z -->\n\n- b').directives).toEqual(['<!-- _footer: z -->']);
	});
});
