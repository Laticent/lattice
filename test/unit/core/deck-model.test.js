/**
 * The deck model (lib/core/deck-model.mjs, @laticent/segno-markdown) held to markdown-it, the parser it
 * replaces as the source of slide boundaries (Segno deck pipeline P2,
 * engineering/decisions/2026-10-22-segno-deck-pipeline.md §Acceptance).
 *
 * THE ORACLE IS markdown-it ITSELF, configured as the engine configures it (lib/core/boundary-parser.mjs),
 * and the comparison is TOKEN FOR TOKEN: type, level, nesting, line map and `hidden`, not just the `hr`
 * set. A boundary-only comparison would pass a parser that agrees on breaks by accident while disagreeing
 * on the structure the next phases (directives, fences, leaves) read.
 *
 * THE FUZZ'S ATOMS ARE CommonMark's RULE SURFACE, not deck shapes. slide-boundaries.mjs records why: the
 * scanner it replaced passed "720,000 decks, zero disagreements" over atoms an author thought of, and three
 * more strings turned that into a defect every ~220 decks. So the atoms below name each block rule's edge:
 * list markers that cannot interrupt a paragraph, ordered lists not at 1, a table delimiter that miscounts,
 * empty and escaped reference labels, entity-encoded destinations, tabs after markers, setext against
 * thematic breaks, HTML block starts and ends, lazy continuation, plugin openers and closers.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const { boundaryParser: md, FRONT_MATTER, normalizeSource, setBoundaryPluginsOff } = require('../../../lib/core/boundary-parser.js');
const { bodyModel, deckModel, deckParser, updateDeckModel } = require('../../../lib/core/deck-model.mjs');
const { STRIDE } = require('@laticent/segno-markdown');

const ROOT = path.join(__dirname, '..', '..', '..');

/** markdown-it's block tokens as comparable lines. */
function oracle(src) {
	const tokens = [];
	md.block.parse(src, md, {}, tokens);
	return tokens.map((t) => `${t.type}|${t.level}|${t.nesting}|${t.map ? t.map.join('-') : ''}|${t.hidden ? 'h' : ''}`);
}

/** The model's tape as the same lines. */
function mine(src) {
	const b = bodyModel(src).blocks;
	const out = [];
	for (let i = 0; i < b.length; i++) {
		const a = i * STRIDE;
		const t = b.tape;
		out.push(`${b.kinds[t[a]]}|${t[a + 1]}|${t[a + 2]}|${t[a + 3] >= 0 ? `${t[a + 3]}-${t[a + 4]}` : ''}|${t[a + 5] & 1 ? 'h' : ''}`);
	}
	return out;
}

function firstDifference(a, b) {
	let i = 0;
	while (i < a.length && a[i] === b[i]) i++;
	return { at: i, markdownIt: a.slice(i, i + 3), model: b.slice(i, i + 3) };
}

const DECKS = execSync("git ls-files 'examples/*.md' 'examples/**/*.md' '*.gallery.md' 'test/integration/baseline-decks/*.md'", { cwd: ROOT, encoding: 'utf8' })
	.split('\n')
	.filter(Boolean);

test('every committed deck: the model matches markdown-it token for token, and every slide boundary', () => {
	assert.ok(DECKS.length > 300, `expected the deck corpus, found ${DECKS.length} files`);
	let slides = 0;
	const bad = [];
	for (const f of DECKS) {
		const body = normalizeSource(fs.readFileSync(path.join(ROOT, f), 'utf8')).replace(FRONT_MATTER, '');
		const want = oracle(body);
		const got = mine(body);
		if (want.join('\n') !== got.join('\n')) bad.push({ f, ...firstDifference(want, got) });
		const hr = want.filter((s) => s.startsWith('hr|0|')).map((s) => Number(s.split('|')[3].split('-')[0]));
		assert.deepEqual(Array.from(bodyModel(body).boundaries), hr, `${f}: slide boundaries`);
		slides += hr.length + 1;
	}
	assert.deepEqual(bad, []);
	assert.ok(slides > 3000, `slides counted: ${slides}`);
});

const ATOMS = [
	'', '', '', ' ', '\t', '--', '**', '__', '- -', '* *', '---', '***', '___', '- - -', '--- ', '  ---', '   ---', '    ---', '----', '===', '=', '-',
	'Text', 'more text', '# H', '## H', '#', '#5', '###### six', '####### seven', '- item', '* item', '+ item', '1. one',
	'2) two', '0.', '1.', '10. x', '1234567890. big', '> quote', '>', '> - q', '>> deep', '>\tx', '```', '```js', '~~~',
	'````', '``` a`b', '~~~ a`b', '    code', '\tcode', '<!-- c -->', '<!--', '-->', 'a --> b', '<!-->', '<!--->', '<div>',
	'</div>', '<div', '<script>', '</script>', '<pre x>', '<custom-el x="1">', '</span>', '<?php', '?>', '<!DOCTYPE html>',
	'<![CDATA[', ']]>', '| a | b |', '|---|---|', '|:-:|--:|', 'a | b', '--- | ---', '-|-', '|-', 'a|b|c', '\\| x |',
	'| a \\| b |', '[a]: /url', '[a]:', '[a]: <x y>', '[ ]: /u', '[a]: /u "t"', '"title"', "'t'", '(t)', '[a]: /u "t" x',
	'[a]: javascript:x', '[b]: &#106;avascript:x', '[c]: java&colon;x', '[d]: &amp;x', '[a\\]]: /u', '[a', 'b]: /u', '[]: /u',
	'$$', '$$ x $$', 'x $$', '$$x', '`@code{a=1}`', '`@code{}` x', '- [ ] task', '  - nested', '   - three', '     five',
	'\t- tab', '-\tx', '- ```', '> ```', '1. ```', 'a\\', '\\---', '- # h', '- > q', '* * *', '-     wide', ' - one',
	'2. two', '1) p', '- ', '1. ', '  > x', '    > x', '- | -', ': | -', '[a]: /u)x', '[a]: (b)c', '[a]: (b', '> a', '>', '> > >',
	`${'>'.repeat(22)} deep`, `${'- '.repeat(12)}x`,
];

test('a fuzz over CommonMark\'s rule surface agrees with markdown-it token for token', () => {
	let seed = 20261105;
	const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
	const bad = [];
	for (let k = 0; k < 30000 && bad.length < 5; k++) {
		const lines = [];
		for (let i = 1 + Math.floor(rnd() * 14); i > 0; i--) {
			let a = ATOMS[Math.floor(rnd() * ATOMS.length)];
			if (rnd() < 0.15) a = ' '.repeat(Math.floor(rnd() * 5)) + a;
			if (rnd() < 0.1) a = `> ${a}`;
			if (rnd() < 0.1) a = `  ${a}`;
			lines.push(a);
		}
		const src = lines.join('\n') + (rnd() < 0.5 ? '\n' : '');
		if (oracle(src).join('\n') !== mine(src).join('\n')) bad.push(src);
	}
	assert.deepEqual(bad, []);
});

test('the port is of the markdown-it it is tested against', () => {
	// block.ts is markdown-it 14.1.1's block rules, line for line. A bump (Dependabot merges minors on its own) is
	// a reason to diff the two rule sets by hand, not only to trust the corpus and the fuzz to notice.
	assert.equal(require('markdown-it/package.json').version, '14.1.1', 'markdown-it moved: diff its lib/rules_block against docs/src/lib/segno-markdown/block.ts, then update this pin');
});

test('every plugin block rule keeps the promise its triggers make', () => {
	// The model tries a plugin rule only on lines that open with one of its manifest triggers; markdown-it tries
	// every rule on every line. A rule that can open on another character would make the two disagree, so the
	// same parse without dispatch must give the same tokens on the corpus and the fuzz.
	const { BlockParser } = require('@laticent/segno-markdown');
	const { BLOCK_TRIGGERS, installPluginBlocks } = require('../../../lib/plugins/blocks.generated.mjs');
	const rules = [];
	installPluginBlocks({ block: { ruler: { before: (before, name, rule) => rules.push({ name, rule, before }) } } });
	assert.deepEqual(rules.map((r) => r.name).sort(), Object.keys(BLOCK_TRIGGERS).sort(), 'every plugin block rule has generated triggers');
	const open = new BlockParser({ rules });
	const gated = new BlockParser({ rules: rules.map((r) => ({ ...r, triggers: BLOCK_TRIGGERS[r.name] })) });
	const tape = (p, src) => Array.from(p.parse(src).tape).join();
	const probes = [...DECKS.map((f) => normalizeSource(fs.readFileSync(path.join(ROOT, f), 'utf8')).replace(FRONT_MATTER, '')), ...ATOMS.map((a) => `${a}\nx $$\n\`\`\`\n`)];
	for (const src of probes) assert.equal(tape(gated, src), tape(open, src));
});

test('an entity-encoded destination is judged by markdown-it, so the boundary under it matches', () => {
	// `java&colon;x` decodes to `java:x`, a fine link; `javascript&colon;x` to a refused one, which leaves a
	// paragraph that the `---` below turns into a heading: no break.
	for (const src of ['[a]: java&colon;x\n---\n', '[a]: javascript&colon;x\n---\n', '[a]: &#x6A;avascript:x\n---\n']) {
		assert.deepEqual(mine(src), oracle(src), src);
	}
});

test('a host that switches a plugin off gets that plugin\'s block rules off in the model too', () => {
	const src = '$$\nx\n\n---\n\ny\n$$\n';
	try {
		assert.deepEqual(Array.from(bodyModel(src).boundaries), []);
		setBoundaryPluginsOff(['math']);
		assert.deepEqual(Array.from(bodyModel(src).boundaries), [3]);
		assert.deepEqual(mine(src), oracle(src));
	} finally {
		setBoundaryPluginsOff([]);
	}
	assert.deepEqual(Array.from(bodyModel(src).boundaries), []);
});

test('the full deck model splits front matter as the engine does, and updates per edit', () => {
	const src = '---\ntheme: x\n---\n# A\n\n---\n\n$$\nx\n$$\n';
	const m = deckModel(src);
	assert.equal(m.text.slice(0, m.bodyStart), '---\ntheme: x\n---\n');
	assert.deepEqual(m.plugins.map((p) => p.type), ['math_block']);
	// A `$$` edit touches a forward-scanning rule's line, so the update re-reads the deck, and still matches.
	const next = updateDeckModel(m, src.replace('x\n$$', 'x\n'));
	assert.deepEqual(Array.from(next.boundaries), Array.from(deckModel(src.replace('x\n$$', 'x\n')).boundaries));
	assert.equal(deckParser(), deckParser(), 'one parser per plugin admission');
});

test('regressions from the adversarial review: math\'s cross-slide memo, and a BOM after front matter', () => {
	// `> $$` finds no closer inside its quote and sets math's "no closer ahead" memo, which turns the `$$`
	// two slides down into a paragraph. A splice that started a fresh parse lost that memo.
	const a = '> $$\n\n---\n\n$$\nx\n\n---\n\n$$\n';
	const b = a.replace('x', 'y');
	assert.deepEqual(Array.from(updateDeckModel(bodyModel(a), b).boundaries), Array.from(bodyModel(b).boundaries));
	assert.deepEqual(mine(b), oracle(b));
	// section-source-split reads the body as markdown-it does: a BOM after the front matter is text, not a
	// byte to strip, so the `---` after it is not a break (the engine renders it as one literal section).
	const { splitSourceToSections } = require('../../../lib/core/section-source-split.js');
	assert.deepEqual(splitSourceToSections('---\ntheme: indaco\n---\n﻿---\n\n# Two\n'), ['---\n\n# Two']);
});
