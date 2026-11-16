import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
	BlockParser,
	deckModel,
	F_EMPTY,
	I_AUX,
	I_FLAGS,
	I_FROM,
	I_KIND,
	I_LEVEL,
	I_NEST,
	I_TO,
	InlineParser,
	type InlineState,
	type InlineTape,
	ISTRIDE,
	inlineOf,
	L_DEST0,
	L_DEST1,
	L_REF,
	L_TYPE,
	LINK_REF,
	LSTRIDE,
	leafText,
	leafToBody,
	normalizeReference,
	RSTRIDE,
	referencesOf,
	updateDeckModel,
} from './index.js';

// The root's work counter (test/helpers/work-count.js), CommonJS.
const { charReads } = createRequire(import.meta.url)('../../../../test/helpers/work-count.js') as {
	charReads: (fn: () => void) => { reads: number; scanned: number };
};

// A stand-in for the HTML entity table: the package takes the decision as a hook (the Lattice bridge asks markdown-it).
const ENTITIES = new Set(['&amp;', '&lt;', '&gt;', '&quot;', '&nbsp;', '&copy;']);
const parser = new InlineParser({ namedEntity: (m) => ENTITIES.has(m) });

/** A tape as `kind[from,to)` lines, nested lines for an image's alt text. */
function show(t: InlineTape, indent = ''): string[] {
	const out: string[] = [];
	for (let i = 0; i < t.length; i++) {
		const a = i * ISTRIDE;
		const k = t.kinds[t.tape[a + I_KIND]];
		const empty = t.tape[a + I_FLAGS] & F_EMPTY ? ' empty' : '';
		out.push(`${indent}${k} ${t.tape[a + I_LEVEL]} ${JSON.stringify(t.src.slice(t.tape[a + I_FROM], t.tape[a + I_TO]))}${empty}`);
		if (k === 'image') {
			const rec = t.tape[a + I_AUX] * LSTRIDE;
			out.push(...show(t.children[t.links[rec + 6]], `${indent}  `));
		}
	}
	return out;
}

describe('the inline pass', () => {
	it('reads emphasis with markdown-it’s delimiter runs, keeping every marker on the tape', () => {
		expect(show(parser.parse('a **b** _c_'))).toEqual([
			'text 0 "a "',
			'text 0 "*" empty',
			'strong_open 0 "*"',
			'text 1 "b"',
			'strong_close 0 "*"',
			'text 0 "*" empty',
			'text 0 " "',
			'em_open 0 "_"',
			'text 1 "c"',
			'em_close 0 "_"',
		]);
	});

	it('reads code spans, escapes, entities, breaks and inline HTML as ranges', () => {
		expect(show(parser.parse('`x` \\* &amp; &bogus; <b>y</b>  \nz\\\nw'))).toEqual([
			'code_inline 0 "`x`"',
			'text 0 " "',
			'text_special 0 "\\\\*"',
			'text 0 " "',
			'text_special 0 "&amp;"',
			'text 0 " &bogus; "',
			'html_inline 0 "<b>"',
			'text 0 "y"',
			'html_inline 0 "</b>"',
			'hardbreak 0 "  \\n"',
			'text 0 "z"',
			'hardbreak 0 "\\\\\\n"',
			'text 0 "w"',
		]);
	});

	it('resolves links and images, inline and by reference', () => {
		const refs = new Map([[normalizeReference('Ref'), 0]]);
		const t = parser.parse('[a *b*](/u "t") ![alt *x*][ref] [nope][]', refs);
		expect(show(t)).toEqual([
			'link_open 0 "["',
			'text 1 "a "',
			'em_open 1 "*"',
			'text 2 "b"',
			'em_close 1 "*"',
			'link_close 0 "](/u \\"t\\")"',
			'text 0 " "',
			'image 0 "![alt *x*][ref]"',
			'  text 0 "alt "',
			'  em_open 0 "*"',
			'  text 1 "x"',
			'  em_close 0 "*"',
			'text 0 " [nope][]"',
		]);
		const link = t.tape[0 * ISTRIDE + I_AUX] * LSTRIDE;
		expect(t.src.slice(t.links[link + L_DEST0], t.links[link + L_DEST1])).toBe('/u');
		const image = t.tape[7 * ISTRIDE + I_AUX] * LSTRIDE;
		expect([t.links[image + L_TYPE], t.links[image + L_REF]]).toEqual([LINK_REF, 0]);
	});

	it('refuses a destination markdown-it’s validateLink refuses', () => {
		expect(show(parser.parse('[a](javascript:x) <javascript:y> <https://ok>'))).toEqual([
			'text 0 "[a](javascript:x) <javascript:y> "',
			'link_open 0 "<"',
			'text 1 "https://ok"',
			'link_close 0 ">"',
		]);
	});

	it('runs a plugin rule where its anchor puts it, on its triggers only', () => {
		let calls = 0;
		const dollar = (state: InlineState, silent: boolean) => {
			calls++;
			if (state.src[state.pos] !== '$') return false;
			const end = state.src.indexOf('$', state.pos + 1);
			if (end < 0) return false;
			if (!silent) {
				const tok = state.push('math_inline', 'span', 0);
				tok.content = state.src.slice(state.pos + 1, end);
			}
			state.pos = end + 1;
			return true;
		};
		const p = new InlineParser({ namedEntity: () => false, rules: [{ name: 'math_inline', rule: dollar, after: 'escape', triggers: '$' }] });
		const t = p.parse('a $x$ *b* $');
		expect(show(t)).toEqual(['text 0 "a "', 'math_inline 0 "$x$"', 'text 0 " "', 'em_open 0 "*"', 'text 1 "b"', 'em_close 0 "*"', 'text 0 " $"']);
		expect(t.side.get(1)).toEqual({ tag: 'span', content: 'x' });
		expect(calls).toBe(2);
		expect(() => new InlineParser({ namedEntity: () => false, rules: [{ name: 'x', rule: dollar, after: 'nope' }] })).toThrow(/no rule "nope"/);
	});

	it('hands a plugin rule a new object per parse, so a host can key per-parse state on it', () => {
		const seen = new Set<object>();
		const rule = (state: InlineState) => {
			seen.add(state);
			return false;
		};
		const p = new InlineParser({ namedEntity: () => false, rules: [{ name: 'x', rule, after: 'escape', triggers: '$' }] });
		p.parse('$a');
		p.parse('$b');
		expect(seen.size).toBe(2);
	});

	it('tries a plugin rule with a trigger above ASCII on those characters', () => {
		const section = (state: InlineState, silent: boolean) => {
			if (state.src[state.pos] !== '§') return false;
			if (!silent) state.push('sect', 'span', 0);
			state.pos++;
			return true;
		};
		const p = new InlineParser({ namedEntity: () => false, rules: [{ name: 'sect', rule: section, before: 'text', triggers: '§' }] });
		// Before `text`, so the text rule (which `§` does not stop) cannot take the character first.
		expect(show(p.parse('§a'))).toEqual(['sect 0 "§"', 'text 0 "a"']);
	});

	it('gives every token its final level, as fragments_join recomputes it', () => {
		const t = parser.parse('[*a* `b`](u)');
		const levels = Array.from({ length: t.length }, (_, i) => `${t.tape[i * ISTRIDE + I_NEST]}:${t.tape[i * ISTRIDE + I_LEVEL]}`);
		expect(levels).toEqual(['1:0', '1:1', '0:2', '-1:1', '0:1', '0:1', '-1:0']);
	});
});

describe('the leaves on the deck model', () => {
	const block = new BlockParser();
	const model = (src: string) => deckModel(src, { parser: block, frontMatter: null, raw: true, inline: parser });
	const leaves = (src: string) => {
		const m = model(src);
		const b = m.blocks;
		const out: { text: string; mapped: string }[] = [];
		for (let i = 0; i < b.length; i++) {
			if (b.kinds[b.tape[i * 7]] !== 'inline') continue;
			const leaf = leafText(m, i);
			// Every unpinned character of the text is the body character it maps to.
			let mapped = '';
			for (let c = 0; c < leaf.text.length; c++) mapped += m.body[leafToBody(leaf, c)];
			out.push({ text: leaf.text, mapped });
		}
		return out;
	};

	it('drops a container’s prefix and maps every character back to the body', () => {
		const got = leaves('> - a *b*\n>   c\n>\n> # H #\n\n| x \\| y | z |\n|---|---|\n|  1 |\n');
		expect(got.map((l) => l.text)).toEqual(['a *b*\nc', 'H', 'x | y', 'z', '1', '']);
		for (const l of got) expect(l.mapped).toBe(l.text);
	});

	it('pins the spaces a partly consumed tab expands to', () => {
		const m = model('- a\n\n\t\tb\n');
		const b = m.blocks;
		let last = -1;
		for (let i = 0; i < b.length; i++) if (b.kinds[b.tape[i * 7]] === 'code_block') last = i;
		expect(last).toBeGreaterThan(0);
		const leaf = leafText(m, [...Array(b.length).keys()].filter((i) => b.kinds[b.tape[i * 7]] === 'inline')[0]);
		expect(leaf.runs.length % RSTRIDE).toBe(0);
	});

	it('resolves reference links against the deck’s first definition of a label, across slides', () => {
		const src = '[A]\n\n---\n\n[a]: /one\n[A]: /two\n';
		const m = model(src);
		const refs = referencesOf(m);
		expect(refs.list.map((r) => [r.key, r.dest])).toEqual([
			['A', '/one'],
			['A', '/two'],
		]);
		expect(refs.table?.get('A')).toBe(0);
		const first = [...Array(m.blocks.length).keys()].find((i) => m.blocks.kinds[m.blocks.tape[i * 7]] === 'inline') as number;
		const { tape } = inlineOf(m, first);
		expect(tape.kinds[tape.tape[I_KIND]]).toBe('link_open');
	});

	it('keeps a slide’s leaf tapes across an edit elsewhere, and drops them when a label changes', () => {
		const a = model('x *y*\n\n---\n\nz\n');
		const t1 = inlineOf(a, 1).tape;
		const b = updateDeckModel(a, 'x *y*\n\n---\n\nz!\n');
		expect(inlineOf(b, 1).tape).toBe(t1);
		const c = updateDeckModel(b, 'x *y*\n\n---\n\n[q]: /u\n');
		expect(inlineOf(c, 1).tape).not.toBe(t1);
		// A moved slide's leaf maps to where it is now.
		const d = updateDeckModel(a, 'w\n\n---\n\nx *y*\n\n---\n\nz\n');
		const at = [...Array(d.blocks.length).keys()].filter((i) => d.blocks.kinds[d.blocks.tape[i * 7]] === 'inline')[1];
		const leaf = inlineOf(d, at).leaf;
		expect(d.body.slice(leafToBody(leaf, 0), leafToBody(leaf, leaf.text.length))).toBe('x *y*');
	});
});

describe('bounds: every rule grows about 10x for 10x input', () => {
	const HOSTILE: Record<string, (n: number) => string> = {
		'unmatched emphasis openers': (n) => '*a '.repeat(n),
		'underscore runs that cannot close': (n) => '_a_b '.repeat(n),
		'mixed delimiter runs (rule of 3)': (n) => '***a** '.repeat(n),
		'closers with no opener': (n) => 'a* '.repeat(n),
		'strikethrough runs': (n) => '~~a ~~~'.repeat(n),
		'unclosed link labels': (n) => '[a '.repeat(n),
		'nested link labels': (n) => `${'['.repeat(n)}a${']'.repeat(n)}`,
		'labels without destinations': (n) => '[a]( '.repeat(n),
		'reference-looking labels': (n) => '[a][b '.repeat(n),
		'unclosed images': (n) => '![a '.repeat(n),
		'backtick runs of growing length': (n) => Array.from({ length: n }, (_, i) => '`'.repeat(1 + (i % 50))).join('a'),
		'unclosed comments': (n) => '<!-- a '.repeat(n),
		'unclosed tags': (n) => '<a b="c '.repeat(n),
		'unclosed autolinks': (n) => '<http://a '.repeat(n),
		'entities that are not': (n) => '&abc &#x '.repeat(n),
		'escapes': (n) => '\\* \\'.repeat(n),
		'soft breaks with trailing spaces': (n) => 'a  \n'.repeat(n),
	};
	const refs = new Map([['B', 0]]);
	const cost = (src: string) => {
		const w = charReads(() => parser.parse(src, refs));
		return w.reads + w.scanned;
	};
	for (const [name, make] of Object.entries(HOSTILE)) {
		it(name, () => {
			const small = cost(make(2000));
			const large = cost(make(20000));
			// Linear is ~10x; quadratic would be ~100x.
			expect(large / small).toBeLessThan(30);
		});
	}
});
