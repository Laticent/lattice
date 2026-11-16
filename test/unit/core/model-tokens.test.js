/**
 * The inline pass (S2) and the token adapter (lib/core/model-tokens.mjs), held to markdown-it as Lattice configures
 * it (Segno deck pipeline P4, engineering/decisions/2026-10-22-segno-deck-pipeline.md §P4 landed).
 *
 * THE ORACLE IS markdown-it ITSELF, configured as `buildMd` configures it (the engine's rules and plugins), and the
 * comparison is EVERY FIELD of every token, children included: type, tag, nesting, level, map, content, markup, info,
 * attrs, meta, block, hidden, and `env.references`. A structure-only comparison would pass an adapter that agrees on
 * shape and disagrees on an href. The engine-level proof (the same HTML from a render with only the parse swapped) is
 * the integration tier's: test/integration/invariants/model-parse-identity.test.js.
 *
 * THE FUZZ'S ATOMS ARE THE INLINE RULE SURFACE: delimiter runs of each length (the rule of 3), flanking neighbors
 * (punctuation, Unicode spaces and symbols), brackets and destinations, titles, reference labels, autolinks the
 * protocol rule refuses, entities named, numeric and bogus, code spans of mismatched runs, HTML comments, tags and
 * declarations, escapes, breaks, and the math plugin's `$`. Each document is placed in every leaf context (paragraph,
 * heading, quote, list item, table cell), so a leaf whose text is not a slice of the body is exercised too.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const MarkdownIt = require('markdown-it');

const { FRONT_MATTER, normalizeSource } = require('../../../lib/core/boundary-parser.js');
const { installPlugins } = require('../../../lib/plugins/host');
const { installSlidePipeline } = require('../../../lib/engine/slides');
const { tolerateRawtextClose } = require('../../../lib/core/rawtext-close.mjs');
const { modelTokens, parseFromModel, parsersFor } = require('../../../lib/core/model-tokens.mjs');
const { deckModel, isPunct, leafText, leafToBody, RSTRIDE, updateDeckModel } = require('@laticent/segno-markdown');
const { charReads } = require('../../helpers/work-count.js');

const ROOT = path.join(__dirname, '..', '..', '..');

/** The engine's parser, assembled as `buildMd` (lib/engine/index.js) assembles it, with plugins `off` left out. */
function engineLike(off = []) {
	const md = new MarkdownIt('commonmark', { html: true, breaks: true });
	md.enable(['table', 'strikethrough']);
	tolerateRawtextClose(md);
	installSlidePipeline(md, {}, {});
	installPlugins(md, { disabled: off });
	return md;
}

const rule = (md, name) => md.core.ruler.__rules__.find((r) => r.name === name).fn;

/** markdown-it's tokens after its own `block` and `inline` core rules, and the env they left. */
function oracle(md, src, env = {}) {
	const state = new md.core.State(src, md, env);
	rule(md, 'normalize')(state);
	rule(md, 'block')(state);
	rule(md, 'inline')(state);
	return { tokens: state.tokens, env, src: state.src };
}

const FIELDS = ['type', 'tag', 'nesting', 'level', 'content', 'markup', 'info', 'block', 'hidden'];

/** The first difference between two token lists, or null. */
function difference(a, b, at = '') {
	if (a.length !== b.length) return `${at} ${a.length} tokens vs ${b.length}: ${a.map((t) => t.type).join(' ')} | ${b.map((t) => t.type).join(' ')}`;
	for (let i = 0; i < a.length; i++) {
		const x = a[i];
		const y = b[i];
		for (const f of FIELDS) if (x[f] !== y[f]) return `${at}[${i}] ${x.type}.${f}: ${JSON.stringify(x[f])} vs ${JSON.stringify(y[f])}`;
		for (const f of ['map', 'attrs', 'meta']) if (JSON.stringify(x[f]) !== JSON.stringify(y[f])) return `${at}[${i}] ${x.type}.${f}: ${JSON.stringify(x[f])} vs ${JSON.stringify(y[f])}`;
		if (!x.children !== !y.children) return `${at}[${i}] children`;
		if (x.children) {
			const d = difference(x.children, y.children, `${at}[${i}]>`);
			if (d) return d;
		}
	}
	return null;
}

function compare(md, src, env0 = null) {
	const want = oracle(md, src, env0 ? structuredClone(env0) : {});
	const env = env0 ? structuredClone(env0) : {};
	const got = modelTokens(md, want.src, env);
	return difference(want.tokens, got) ?? (JSON.stringify(want.env) === JSON.stringify(env) ? null : `env.references ${JSON.stringify(want.env)} vs ${JSON.stringify(env)}`);
}

const DECKS = execSync("git ls-files 'examples/*.md' 'examples/**/*.md' '*.gallery.md' 'test/integration/baseline-decks/*.md' 'lib/**/*.fixtures.md' 'exemplars/*.md' 'test/fixtures/*.md'", { cwd: ROOT, encoding: 'utf8' })
	.split('\n')
	.filter(Boolean);

const md = engineLike();

test('every committed deck and plugin fixture: the adapter’s tokens are markdown-it’s, field for field', () => {
	assert.ok(DECKS.length > 400, `expected the corpus, found ${DECKS.length} files`);
	const bad = [];
	let inline = 0;
	for (const f of DECKS) {
		const body = normalizeSource(fs.readFileSync(path.join(ROOT, f), 'utf8')).replace(FRONT_MATTER, '');
		const d = compare(md, body);
		if (d) bad.push(`${f}: ${d}`);
		inline += body.length;
	}
	assert.deepEqual(bad, []);
	assert.ok(inline > 1e6, `characters compared: ${inline}`);
});

test('a plugin’s per-parse memo does not carry from one leaf to the next (the inline state is pooled)', () => {
	// math's `$` rule remembers "no closer from here" on its facade, keyed by the state object it is handed. Two leaves
	// of the same length: the first leaves that memo, the second must not read it.
	assert.equal(compare(md, '$ab c\n\n$x$ y'), null);
	assert.equal(compare(md, '- $ab c\n- $x$ y'), null);
});

test('references a caller filled in `env.references` win, and resolve labels the document never defines', () => {
	const env = { references: { X: { href: '/pre', title: 'T' } } };
	for (const src of ['[x]', '[x]: /doc\n\n[x] [y]\n\n[y]: /why', '- ![x]']) assert.equal(compare(md, src, env), null, src);
});

test('an update through one copy of the package with a parser from the other stays exact (each copy has its own scratch)', async () => {
	const esm = await import('@laticent/segno-markdown');
	const { block } = parsersFor(md);
	assert.notEqual(esm.deckModel, deckModel, 'the test needs the two copies');
	const cjsModel = deckModel('\n\n\n', { parser: block, frontMatter: null, raw: true });
	const next = '$$\n\n\n';
	const updated = updateDeckModel(cjsModel, next);
	assert.equal(updated.blocks.length, deckModel(next, { parser: block, frontMatter: null, raw: true }).blocks.length);
	assert.ok(updated.blocks.length > 0);
});

test('a deck that did not load math reads `$` as markdown-it without the plugin does', () => {
	const off = engineLike(['math']);
	assert.ok(!off.inline.ruler.__rules__.some((r) => r.name === 'math_inline' && r.enabled));
	for (const src of ['a $x$ b', '$$\nx\n$$', '- $a$ *b*']) assert.equal(compare(off, src), null, src);
	assert.notEqual(parsersFor(off).inline, parsersFor(md).inline);
});

// ── The fuzz ─────────────────────────────────────────────────────────────────────────────────────────

const ATOMS = [
	'a', 'b', 'word', ' ', ' ', '  ', '\n', '\t', '*', '**', '***', '****', '_', '__', '___', '~', '~~', '~~~', '`', '``', '```',
	'\\', '\\*', '\\_', '\\`', '\\[', '\\\n', '\\ ', '\\a', '\\é', '[', ']', '(', ')', '[a]', '[A ]', '[b]', '![', '](', '](/u)',
	'](/u "t")', "](/u 't')", '](/u (t))', '](<a b>)', '](  /u  )', '](javascript:x)', '](javascript&colon;x)', '](/u&amp;v)', ']()',
	'][', '][]', '][a]', '<', '>', '<a>', '</a>', '<b x="1">', '<b x=\'2\' y>', '<!--', '-->', '<!-- c -->', '<?p?>', '<!X y>',
	'<![CDATA[x]]>', '<http://x.y/z>', '<a@b.co>', '<javascript:x>', '<data:image/png;x>', '<MAILTO:a@b>', '&amp;', '&nbsp;',
	'&copy;', '&bogus;', '&#35;', '&#x26;', '&#0;', '&#xD800;', '&ampx;', '$', '$x$', '$ y$', '$z $', '$1', '$$', '5', '.', ',',
	'"', "'", '!', '#', '|', ':', 'é', ' ', '　', '—', '©', 'ẞ', '\u{1F600}', 'javascript:x',
];
const CONTEXTS = [
	(s) => s,
	(s) => `# ${s}`,
	(s) => `> ${s.replace(/\n/g, '\n> ')}`,
	(s) => `- ${s.replace(/\n/g, '\n  ')}`,
	(s) => `1. x\n2. ${s.replace(/\n/g, '\n   ')}`,
	(s) => `| h | i |\n|---|:-:|\n| ${s.replace(/\n/g, ' ').replace(/\|/g, '\\|')} | z |`,
	(s) => `${s}\n===`,
	(s) => `[a]: /ref "T"\n[A ]: <other>\n\n${s}`,
];

function mulberry32(seed) {
	let t = seed >>> 0;
	return () => {
		t = (t + 0x6d2b79f5) >>> 0;
		let r = Math.imul(t ^ (t >>> 15), 1 | t);
		r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
	};
}

test('a seeded fuzz over the inline rule surface, in every leaf context: markdown-it’s tokens, and every leaf maps back', () => {
	const seed = Number(process.env.SEGNO_FUZZ_SEED ?? 20261116);
	const runs = Number(process.env.SEGNO_FUZZ_RUNS ?? 12000);
	const rand = mulberry32(seed);
	const bad = [];
	for (let n = 0; n < runs && bad.length < 5; n++) {
		let s = '';
		const len = 1 + Math.floor(rand() * 14);
		for (let i = 0; i < len; i++) s += ATOMS[Math.floor(rand() * ATOMS.length)];
		const src = CONTEXTS[n % CONTEXTS.length](s);
		const d = compare(md, src);
		if (d) bad.push(`seed ${seed} run ${n}: ${JSON.stringify(src)}: ${d}`);
		// The leaf maps: every character the model says came from the body is that body character.
		const { block, inline } = parsersFor(md);
		const m = deckModel(src, { parser: block, inline, frontMatter: null, raw: true });
		for (let i = 0; i < m.blocks.length; i++) {
			if (m.blocks.kinds[m.blocks.tape[i * 7]] !== 'inline') continue;
			const leaf = leafText(m, i);
			for (let c = 0; c < leaf.text.length; c++) {
				const pinned = leaf.runs.some((_, k) => k % RSTRIDE === 0 && leaf.runs[k] <= c && leaf.runs[k + 2] === 1 && (k + RSTRIDE >= leaf.runs.length || leaf.runs[k + RSTRIDE] > c));
				if (!pinned && m.body[leafToBody(leaf, c)] !== leaf.text[c]) {
					bad.push(`seed ${seed} run ${n}: leaf ${JSON.stringify(leaf.text)} offset ${c} maps to ${JSON.stringify(m.body[leafToBody(leaf, c)])}`);
					break;
				}
			}
		}
	}
	assert.deepEqual(bad, [], `reproduce with SEGNO_FUZZ_SEED=${seed}`);
});

// ── Pieces ───────────────────────────────────────────────────────────────────────────────────────────

test('the flanking rules’ punctuation is markdown-it’s at every code point', () => {
	const u = md.utils;
	const bad = [];
	for (let c = 0; c <= 0x10ffff; c++) {
		if (c >= 0xd800 && c <= 0xdfff) continue;
		const want = u.isMdAsciiPunct(c) || u.isPunctChar(String.fromCodePoint(c));
		if (isPunct(c) !== want && bad.length < 10) bad.push(c.toString(16));
	}
	assert.deepEqual(bad, [], 'uc.micro moved: regenerate RANGES in docs/src/lib/segno-markdown/punct.ts from md.utils.isPunctChar');
});

test('`parseFromModel` is `md.parse` with the parse swapped, inline mode included', () => {
	for (const src of ['# A *b*\n\n[x]: /u\n\n[x] and `c`', 'just *inline* text']) {
		const env1 = {};
		const env2 = {};
		assert.equal(md.renderer.render(parseFromModel(md, src, env2), md.options, env2), md.renderer.render(md.parse(src, env1), md.options, env1));
	}
	const env = {};
	assert.equal(md.renderer.render(parseFromModel(md, 'a **b**', env, true), md.options, env), md.renderInline('a **b**'));
});

test('a markdown-it configuration the model has no port of is refused, not approximated', () => {
	const linkify = new MarkdownIt('commonmark', { html: true, linkify: true });
	assert.throws(() => modelTokens(linkify, 'a', {}), /no port of/);
	const plain = new MarkdownIt('commonmark', { html: true });
	assert.throws(() => modelTokens(plain, 'a', {}), /rawtext close/);
});

test('bounds: math’s `$` rule reads an unclosed-dollar paragraph once, in markdown-it and in the model', () => {
	const cost = (fn) => {
		const w = charReads(fn);
		return w.reads + w.scanned;
	};
	// The third: a `$` inside a link label has its own `posMax`; a one-slot memo forgot the paragraph's answer at each one.
	for (const make of [(n) => '$a '.repeat(n), (n) => 'price $5 and $'.repeat(n), (n) => 'Costs $5 per seat, see [the $5 plan](u). '.repeat(n), (n) => '$a [ $b](c) '.repeat(n)]) {
		const viaMd = cost(() => md.parse(make(20000), {})) / cost(() => md.parse(make(2000), {}));
		const viaModel = cost(() => modelTokens(md, make(20000), {})) / cost(() => modelTokens(md, make(2000), {}));
		// Linear is ~10x; the rule before its memo read ~100x.
		assert.ok(viaMd < 30, `markdown-it: ${viaMd}`);
		assert.ok(viaModel < 30, `model: ${viaModel}`);
	}
});
