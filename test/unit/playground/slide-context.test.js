/**
 * Unit: slide-context.js — the pure slide-context detection + completion grammar
 * behind the editor's autocomplete sources.
 *
 * Proves the backward-walk to the active `_class:` directive, the open-directive
 * completion parse (component name vs modifier position), the option builders,
 * and the map basemap selection — including the regression for the bug where a
 * bare `<!-- _class: map -->` (a WORLD map) resolved to the US basemap, hiding
 * every country + group (Global South, blocs) behind a redundant `world` token.
 *
 * Import-free module → tested directly with a plain line accessor, no
 * CodeMirror (a docs-only dep, absent from the repo-root install). Mirrors the
 * focus-block.js split.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

async function load() {
	return import('../../../docs/src/playground/slide-context.js');
}

// 1-based line accessor over an array of lines, matching CodeMirror's doc.line.
const getter = (lines) => (n) => lines[n - 1];

describe('slideClassAt', () => {
	test('finds the directive governing the cursor, parsing name + modifiers', async () => {
		const { slideClassAt } = await load();
		const lines = ['<!-- _class: map us -->', '', '- California `4`', '- Texas `7`'];
		const info = slideClassAt(getter(lines), 3);
		assert.equal(info.name, 'map');
		assert.deepEqual(info.modifiers, ['us']);
		assert.deepEqual(info.tokens, ['map', 'us']);
		assert.equal(info.directiveLine, 1);
	});

	test('reads the directive on the cursor line itself', async () => {
		const { slideClassAt } = await load();
		const lines = ['<!-- _class: cards-grid four -->'];
		const info = slideClassAt(getter(lines), 1);
		assert.equal(info.name, 'cards-grid');
		assert.deepEqual(info.modifiers, ['four']);
	});

	test('returns null when a slide boundary sits between cursor and directive', async () => {
		const { slideClassAt } = await load();
		const lines = ['<!-- _class: map -->', '- Brazil `4`', '', '---', '', '# next slide'];
		assert.equal(slideClassAt(getter(lines), 6), null);
	});

	test('returns null in front matter / before any directive', async () => {
		const { slideClassAt } = await load();
		const lines = ['---', 'marp: true', '---', '', '# untitled'];
		assert.equal(slideClassAt(getter(lines), 5), null);
	});

	test('tolerates missing lines from the accessor', async () => {
		const { slideClassAt } = await load();
		assert.equal(slideClassAt(() => undefined, 3), null);
	});
});

describe('classDirectiveCompletion', () => {
	test('completes the component name on the first token', async () => {
		const { classDirectiveCompletion } = await load();
		const spot = classDirectiveCompletion('<!-- _class: ti');
		assert.equal(spot.kind, 'class');
		assert.equal(spot.typed, 'ti');
		assert.equal(spot.from, '<!-- _class: '.length);
	});

	test('offers the empty first token (for explicit Ctrl-Space)', async () => {
		const { classDirectiveCompletion } = await load();
		const spot = classDirectiveCompletion('<!-- _class: ');
		assert.equal(spot.kind, 'class');
		assert.equal(spot.typed, '');
	});

	test('switches to modifier completion after the component name', async () => {
		const { classDirectiveCompletion } = await load();
		const spot = classDirectiveCompletion('<!-- _class: map u');
		assert.equal(spot.kind, 'modifier');
		assert.equal(spot.name, 'map');
		assert.equal(spot.typed, 'u');
		assert.deepEqual(spot.present, []);
	});

	test('reports already-present modifiers so they can be excluded', async () => {
		const { classDirectiveCompletion } = await load();
		const spot = classDirectiveCompletion('<!-- _class: kpi dark ');
		assert.equal(spot.kind, 'modifier');
		assert.equal(spot.name, 'kpi');
		assert.deepEqual(spot.present, ['dark']);
		assert.equal(spot.typed, '');
	});

	test('stays quiet once the directive is closed (cursor past `-->`)', async () => {
		const { classDirectiveCompletion } = await load();
		assert.equal(classDirectiveCompletion('<!-- _class: map --> '), null);
		assert.equal(classDirectiveCompletion('## A heading'), null);
		assert.equal(classDirectiveCompletion('- a bullet'), null);
	});
});

describe('classOptions / modifierOptions', () => {
	const catalog = [
		{ name: 'map', bucket: 'chart', variants: ['us', 'world', 'highlight'], summary: 'A choropleth.' },
		{ name: 'title', bucket: 'anchor', variants: [] },
	];
	const universals = ['dark', 'scale-l', 'silent'];

	test('classOptions maps catalog entries to {label, detail}', async () => {
		const { classOptions } = await load();
		const opts = classOptions(catalog);
		assert.deepEqual(opts.map((o) => o.label), ['map', 'title']);
		const map = opts.find((o) => o.label === 'map');
		assert.equal(map.detail, 'chart');
		assert.equal(map.type, 'class');
	});

	test('modifierOptions lists a component variants first, universals after', async () => {
		const { modifierOptions } = await load();
		const opts = modifierOptions('map', catalog, universals);
		const labels = opts.map((o) => o.label);
		assert.deepEqual(labels.slice(0, 3), ['us', 'world', 'highlight']);
		assert.deepEqual(labels.slice(3), ['dark', 'scale-l', 'silent']);
		assert.equal(opts[0].detail, 'variant');
		assert.equal(opts[3].detail, 'universal');
	});

	test('modifierOptions excludes already-present tokens and dedupes', async () => {
		const { modifierOptions } = await load();
		const opts = modifierOptions('map', catalog, universals, ['us', 'dark']);
		const labels = opts.map((o) => o.label);
		assert.ok(!labels.includes('us'));
		assert.ok(!labels.includes('dark'));
		assert.ok(labels.includes('world'));
	});

	test('modifierOptions inserts a component familyModifiers after variants, before universals', async () => {
		const { modifierOptions } = await load();
		const cat = [{ name: 'checklist', bucket: 'inventory', variants: [], familyModifiers: ['checks-bold', 'heat'] }];
		const opts = modifierOptions('checklist', cat, universals);
		assert.deepEqual(opts.map((o) => o.label), ['checks-bold', 'heat', 'dark', 'scale-l', 'silent']);
		assert.equal(opts[0].detail, 'modifier');
		assert.equal(opts[2].detail, 'universal');
	});

	test('modifierOptions on an unknown component still offers universals', async () => {
		const { modifierOptions } = await load();
		const opts = modifierOptions('nope', catalog, universals);
		assert.deepEqual(opts.map((o) => o.label), ['dark', 'scale-l', 'silent']);
	});
});

describe('slideBodyEmpty — gate for skeleton insertion (surface C)', () => {
	test('true when only blank + directive lines follow the class directive', async () => {
		const { slideBodyEmpty } = await load();
		const lines = ['<!-- _class: cards-grid -->', '<!-- _paginate: false -->', '', '   '];
		assert.equal(slideBodyEmpty(getter(lines), lines.length, 1), true);
	});

	test('false once real content is present', async () => {
		const { slideBodyEmpty } = await load();
		const lines = ['<!-- _class: cards-grid -->', '', '## A heading', ''];
		assert.equal(slideBodyEmpty(getter(lines), lines.length, 1), false);
	});

	test('stops at the next slide break (content on the following slide does not count)', async () => {
		const { slideBodyEmpty } = await load();
		const lines = ['<!-- _class: title -->', '', '---', '## next slide body'];
		assert.equal(slideBodyEmpty(getter(lines), lines.length, 1), true);
	});

	test('skipLine excludes the cursor line so a typed trigger word still counts as empty', async () => {
		const { slideBodyEmpty } = await load();
		const lines = ['<!-- _class: cards-grid -->', '', 'ske'];
		assert.equal(slideBodyEmpty(getter(lines), lines.length, 1), false); // without skip: "ske" is content
		assert.equal(slideBodyEmpty(getter(lines), lines.length, 1, 3), true); // skipping line 3: empty
	});
});

describe('skeletonBody — strips the directive block (surface C)', () => {
	test('drops leading comment + blank lines, keeps the slot scaffold', async () => {
		const { skeletonBody } = await load();
		const skel = '<!-- _class: cards-grid -->\n\n## Slide heading.\n\n- First\n  - Body.\n';
		assert.equal(skeletonBody(skel), '## Slide heading.\n\n- First\n  - Body.');
	});

	test('strips a multi-directive header (title) down to the first content line', async () => {
		const { skeletonBody } = await load();
		const skel = "<!-- _class: title -->\n<!-- _paginate: false -->\n\n# Deck title\n\n`Eyebrow`\n";
		assert.equal(skeletonBody(skel), '# Deck title\n\n`Eyebrow`');
	});

	test('empty / missing skeleton yields empty string', async () => {
		const { skeletonBody } = await load();
		assert.equal(skeletonBody(''), '');
		assert.equal(skeletonBody(undefined), '');
	});
});

describe('blankBodyPartial — body-line cursor position (surface C)', () => {
	test('a blank line yields from=0, empty partial', async () => {
		const { blankBodyPartial } = await load();
		assert.deepEqual(blankBodyPartial(''), { from: 0, typed: '' });
		assert.deepEqual(blankBodyPartial('  '), { from: 2, typed: '' });
	});

	test('a leading partial word is captured', async () => {
		const { blankBodyPartial } = await load();
		assert.deepEqual(blankBodyPartial('ske'), { from: 0, typed: 'ske' });
	});

	test('null when the line already holds other content', async () => {
		const { blankBodyPartial } = await load();
		assert.equal(blankBodyPartial('## heading'), null);
		assert.equal(blankBodyPartial('- bullet '), null);
	});
});

describe('makeDataSource — per-component gate (surface D)', () => {
	// Minimal duck-typed completion context over a lines array.
	const ctx = (lines, cursorLine) => ({
		pos: cursorLine,
		explicit: true,
		state: {
			doc: {
				lineAt: () => ({ text: lines[cursorLine - 1], from: 0, number: cursorLine }),
				line: (n) => ({ text: lines[n - 1], from: 0, number: n }),
			},
		},
	});

	test('calls the completer only inside a matching component slide', async () => {
		const { makeDataSource } = await load();
		const calls = [];
		const src = makeDataSource(['map'], (_c, info) => {
			calls.push(info.name);
			return { from: 0, options: [{ label: 'Brazil' }] };
		});
		const onMap = src(ctx(['<!-- _class: map -->', '- Braz'], 2));
		assert.deepEqual(onMap.options.map((o) => o.label), ['Brazil']);
		assert.deepEqual(calls, ['map']);
	});

	test('returns null (and never calls the completer) on a non-matching slide', async () => {
		const { makeDataSource } = await load();
		let called = false;
		const src = makeDataSource(['map'], () => {
			called = true;
			return { from: 0, options: [] };
		});
		assert.equal(src(ctx(['<!-- _class: kpi -->', '1. $2'], 2)), null);
		assert.equal(called, false);
	});

	test('returns null between slides (no governing directive)', async () => {
		const { makeDataSource } = await load();
		const src = makeDataSource(['map'], () => ({ from: 0, options: [] }));
		assert.equal(src(ctx(['# loose prose', 'more prose'], 2)), null);
	});
});

describe('inFrontMatter — front-matter detection (Tier 1)', () => {
	test('true inside the opening YAML block, false past the closing fence', async () => {
		const { inFrontMatter } = await load();
		const lines = ['---', 'marp: true', 'theme: indaco', '---', '', '<!-- _class: title -->'];
		assert.equal(inFrontMatter(getter(lines), 1), false); // the opening fence line itself
		assert.equal(inFrontMatter(getter(lines), 3), true); // the theme: line
		assert.equal(inFrontMatter(getter(lines), 6), false); // body, past the close
	});

	test('false when the document does not open with a fence', async () => {
		const { inFrontMatter } = await load();
		const lines = ['# just a heading', 'theme: not-front-matter'];
		assert.equal(inFrontMatter(getter(lines), 2), false);
	});

	test('an unterminated block (mid-typing) still counts', async () => {
		const { inFrontMatter } = await load();
		const lines = ['---', 'theme: ind'];
		assert.equal(inFrontMatter(getter(lines), 2), true);
	});
});

describe('themeValuePosition — the theme: value slot (Tier 1)', () => {
	test('captures the partial after `theme:`', async () => {
		const { themeValuePosition } = await load();
		assert.deepEqual(themeValuePosition('theme: ind'), { from: 'theme: '.length, typed: 'ind' });
		assert.deepEqual(themeValuePosition('theme: '), { from: 'theme: '.length, typed: '' });
	});

	test('null on non-theme lines or once a value + trailing content exists', async () => {
		const { themeValuePosition } = await load();
		assert.equal(themeValuePosition('paginate: true'), null);
		assert.equal(themeValuePosition('  header: "Q4 review"'), null);
	});
});

describe('finishValuePosition — the finish: register slot (Tier 1)', () => {
	test('captures the partial after `finish:` (incl. the hyphenated value)', async () => {
		const { finishValuePosition } = await load();
		assert.deepEqual(finishValuePosition('finish: sk'), { from: 'finish: '.length, typed: 'sk' });
		assert.deepEqual(finishValuePosition('finish: '), { from: 'finish: '.length, typed: '' });
		assert.deepEqual(finishValuePosition('finish: sketch-cl'), { from: 'finish: '.length, typed: 'sketch-cl' });
	});

	test('null on non-finish lines', async () => {
		const { finishValuePosition } = await load();
		assert.equal(finishValuePosition('theme: indaco'), null);
		assert.equal(finishValuePosition('paginate: true'), null);
	});
});

describe('formValuePosition — the form: composition slot (Tier 1)', () => {
	test('captures the partial after `form:`', async () => {
		const { formValuePosition } = await load();
		assert.deepEqual(formValuePosition('form: st'), { from: 'form: '.length, typed: 'st' });
		assert.deepEqual(formValuePosition('form: '), { from: 'form: '.length, typed: '' });
		assert.deepEqual(formValuePosition('form: minimal'), { from: 'form: '.length, typed: 'minimal' });
	});

	test('null on non-form lines (and not confused by no-form / format)', async () => {
		const { formValuePosition } = await load();
		assert.equal(formValuePosition('theme: indaco'), null);
		assert.equal(formValuePosition('paginate: true'), null);
	});
});

describe('sizeValuePosition — the size: value slot (Tier 1)', () => {
	test('captures the partial after `size:`, including aspect-alias colons', async () => {
		const { sizeValuePosition } = await load();
		assert.deepEqual(sizeValuePosition('size: st'), { from: 'size: '.length, typed: 'st' });
		assert.deepEqual(sizeValuePosition('size: '), { from: 'size: '.length, typed: '' });
		assert.deepEqual(sizeValuePosition('size: 16:9'), { from: 'size: '.length, typed: '16:9' });
	});

	test('null on non-size lines', async () => {
		const { sizeValuePosition } = await load();
		assert.equal(sizeValuePosition('theme: indaco'), null);
		assert.equal(sizeValuePosition('split: rule'), null);
	});
});

describe('directiveNameAt / paginateValuePosition / fenceLangAt (Tier 2)', () => {
	test('directiveNameAt captures a directive name before the colon', async () => {
		const { directiveNameAt } = await load();
		assert.deepEqual(directiveNameAt('<!-- _pag'), { from: '<!-- '.length, typed: '_pag' });
		assert.deepEqual(directiveNameAt('<!-- '), { from: '<!-- '.length, typed: '' });
	});

	test('directiveNameAt stops once a colon is typed (value sources take over)', async () => {
		const { directiveNameAt } = await load();
		assert.equal(directiveNameAt('<!-- _class: cards'), null);
		assert.equal(directiveNameAt('## a heading'), null);
	});

	test('paginateValuePosition captures the value after _paginate:', async () => {
		const { paginateValuePosition } = await load();
		assert.deepEqual(paginateValuePosition('<!-- _paginate: fa'), { from: '<!-- _paginate: '.length, typed: 'fa' });
		assert.equal(paginateValuePosition('<!-- _header: x'), null);
	});

	test('fenceLangAt captures the info string on a fence line', async () => {
		const { fenceLangAt } = await load();
		assert.deepEqual(fenceLangAt('```mer'), { from: 3, typed: 'mer' });
		assert.deepEqual(fenceLangAt('  ~~~'), { from: 5, typed: '' });
		assert.equal(fenceLangAt('not a fence'), null);
		assert.equal(fenceLangAt('```js extra'), null); // trailing content → not a bare info string
	});
});

describe('inFencedLang / identifierBefore (Tier 3 — mermaid keywords)', () => {
	test('detects the cursor is inside a ```mermaid block', async () => {
		const { inFencedLang } = await load();
		const lines = ['```mermaid', 'graph TD', 'A --> B', '```'];
		assert.equal(inFencedLang(getter(lines), 2, ['mermaid']), 'mermaid');
		assert.equal(inFencedLang(getter(lines), 3, ['mermaid']), 'mermaid');
	});

	test('null inside a non-mermaid fence, and past a closing fence', async () => {
		const { inFencedLang } = await load();
		const js = ['```js', 'const x = 1', '```'];
		assert.equal(inFencedLang(getter(js), 2, ['mermaid']), null);
		const after = ['```mermaid', 'graph TD', '```', 'plain prose'];
		assert.equal(inFencedLang(getter(after), 4, ['mermaid']), null); // past the close
	});

	test('a fence line is itself a boundary — even after an unclosed mermaid block', async () => {
		const { inFencedLang } = await load();
		// malformed: ```mermaid never closed, then a ```js opener. The ```js line
		// must NOT count as "inside mermaid" (so only fence-lang completes there).
		const malformed = ['```mermaid', 'graph TD', '```js'];
		assert.equal(inFencedLang(getter(malformed), 3, ['mermaid']), null);
		// and the cursor on a mermaid block's own closing fence is a boundary too
		const onClose = ['```mermaid', 'graph TD', '```'];
		assert.equal(inFencedLang(getter(onClose), 3, ['mermaid']), null);
	});

	test('identifierBefore captures a letter-led token incl. hyphen/digits', async () => {
		const { identifierBefore } = await load();
		assert.deepEqual(identifierBefore('  gr'), { from: 2, typed: 'gr' });
		assert.deepEqual(identifierBefore('stateDiagram-v'), { from: 0, typed: 'stateDiagram-v' });
		assert.equal(identifierBefore('123'), null); // not letter-led
		assert.equal(identifierBefore('A --> '), null); // no trailing word
	});
});

describe('MERMAID_KEYWORDS — shared with the highlighter (Tier 3)', () => {
	test('KW_DECLARE rebuilt from the shared list is byte-identical to the prior literal', async () => {
		const { MERMAID_KEYWORDS } = await import('../../../docs/src/playground/grammar-vocab.js');
		const built = `^(?:${MERMAID_KEYWORDS.declare.join('|')})(?![\\w$-])`;
		const prior =
			'^(?:action|callback|class|classDef|classDiagram|click|direction|erDiagram|flowchart|gantt|gitGraph|graph|journey|link|linkStyle|pie|requirementDiagram|sequenceDiagram|stateDiagram-v2|stateDiagram|style|subgraph)(?![\\w$-])';
		assert.equal(built, prior);
	});
});

describe('mapBasemapFor — world is the default basemap (regression)', () => {
	test('a bare `map` slide resolves to the WORLD basemap, not US', async () => {
		const { mapBasemapFor } = await load();
		assert.equal(mapBasemapFor({ name: 'map', modifiers: [] }), 'world');
	});

	test('`map us` and `map usa` switch to the US basemap', async () => {
		const { mapBasemapFor } = await load();
		assert.equal(mapBasemapFor({ name: 'map', modifiers: ['us'] }), 'us');
		assert.equal(mapBasemapFor({ name: 'map', modifiers: ['usa'] }), 'us');
	});

	test('an explicit `world` token is still world', async () => {
		const { mapBasemapFor } = await load();
		assert.equal(mapBasemapFor({ name: 'map', modifiers: ['world'] }), 'world');
	});

	test('returns null for non-map slides and null info', async () => {
		const { mapBasemapFor } = await load();
		assert.equal(mapBasemapFor({ name: 'kpi', modifiers: [] }), null);
		assert.equal(mapBasemapFor(null), null);
	});
});

describe('typeaheadContext — proactive popup entry classification', () => {
	test('a bare `_class:` value position is the class context', async () => {
		const { typeaheadContext } = await load();
		const lines = ['<!-- _class: '];
		assert.equal(typeaheadContext(getter(lines), 1, '<!-- _class: '), 'class');
	});

	test('a partial component name is still the class context', async () => {
		const { typeaheadContext } = await load();
		const lines = ['<!-- _class: big'];
		assert.equal(typeaheadContext(getter(lines), 1, '<!-- _class: big'), 'class');
	});

	test('a second token (after the component name + space) is the modifier context', async () => {
		const { typeaheadContext } = await load();
		const before = '<!-- _class: bigfact ';
		assert.equal(typeaheadContext(getter([before]), 1, before), 'modifier');
	});

	test('past a closed directive (-->), there is no context', async () => {
		const { typeaheadContext } = await load();
		const before = '<!-- _class: bigfact --> body text';
		assert.equal(typeaheadContext(getter([before]), 1, before), null);
	});

	test('a directive NAME (before the colon) is the directive context', async () => {
		const { typeaheadContext } = await load();
		const before = '<!-- _pag';
		assert.equal(typeaheadContext(getter([before]), 1, before), 'directive');
	});

	test('a `_paginate:` value is the paginate context', async () => {
		const { typeaheadContext } = await load();
		const before = '<!-- _paginate: ';
		assert.equal(typeaheadContext(getter([before]), 1, before), 'paginate');
	});

	test('a fence info string is the fence context', async () => {
		const { typeaheadContext } = await load();
		const before = '```';
		assert.equal(typeaheadContext(getter([before]), 1, before), 'fence');
	});

	test('front-matter value lines classify by key (gated by inFrontMatter)', async () => {
		const { typeaheadContext } = await load();
		const lines = ['---', 'theme: ', 'finish: ', 'form: ', 'split: ', 'autosplit: '];
		assert.equal(typeaheadContext(getter(lines), 2, 'theme: '), 'theme');
		assert.equal(typeaheadContext(getter(lines), 3, 'finish: '), 'finish');
		assert.equal(typeaheadContext(getter(lines), 4, 'form: '), 'form');
		assert.equal(typeaheadContext(getter(lines), 5, 'split: '), 'split');
		// `autosplit:` must not be mis-read as `split:` — the split detector is
		// anchored at ^, so the `auto` prefix keeps the two distinct.
	});

	test('a `theme:` line OUTSIDE front matter is not a context (no false open in body)', async () => {
		const { typeaheadContext } = await load();
		const lines = ['# Heading', 'theme: foo']; // no opening --- fence → not front matter
		assert.equal(typeaheadContext(getter(lines), 2, 'theme: '), null);
	});

	test('plain prose is no context', async () => {
		const { typeaheadContext } = await load();
		const before = 'Just some body prose here';
		assert.equal(typeaheadContext(getter([before]), 1, before), null);
	});

	test('a Mermaid fence body is NOT proactive (needs a typed identifier)', async () => {
		const { typeaheadContext } = await load();
		const lines = ['```mermaid', ''];
		// inside the fence, nothing typed → no proactive context (mermaid is excluded)
		assert.equal(typeaheadContext(getter(lines), 2, ''), null);
	});
});

describe('focus directives — autocomplete grammar (Tier 2)', () => {
	test('focusStyleValuePosition captures the value after _focusStyle:', async () => {
		const { focusStyleValuePosition } = await load();
		assert.deepEqual(focusStyleValuePosition('<!-- _focusStyle: ri'), { from: '<!-- _focusStyle: '.length, typed: 'ri' });
		assert.deepEqual(focusStyleValuePosition('<!-- _focusStyle: '), { from: '<!-- _focusStyle: '.length, typed: '' });
		assert.equal(focusStyleValuePosition('<!-- _focus: row 4'), null); // not the style directive
		assert.equal(focusStyleValuePosition('<!-- _header: x'), null);
	});

	test('focusAxisPosition fires on the axis word, not the ordinal', async () => {
		const { focusAxisPosition } = await load();
		// first axis, after the colon
		assert.deepEqual(focusAxisPosition('<!-- _focus: ro'), { from: '<!-- _focus: '.length, typed: 'ro' });
		assert.deepEqual(focusAxisPosition('<!-- _focus: '), { from: '<!-- _focus: '.length, typed: '' });
		// after a comma (focus) and a pipe (steps)
		assert.deepEqual(focusAxisPosition('<!-- _focus: row 4, it'), { from: '<!-- _focus: row 4, '.length, typed: 'it' });
		assert.deepEqual(focusAxisPosition('<!-- _focusSteps: row 1 | ro'), { from: '<!-- _focusSteps: row 1 | '.length, typed: 'ro' });
		// does NOT fire while typing an ordinal or after a completed axis+space
		assert.equal(focusAxisPosition('<!-- _focus: row 4'), null);
		assert.equal(focusAxisPosition('<!-- _focus: row '), null);
		assert.equal(focusAxisPosition('<!-- _focusStyle: ring'), null); // style, not axis
	});

	test('typeaheadContext distinguishes focus-style and focus axis', async () => {
		const { typeaheadContext } = await load();
		assert.equal(typeaheadContext(getter(['<!-- _focusStyle: ']), 1, '<!-- _focusStyle: '), 'focus-style');
		assert.equal(typeaheadContext(getter(['<!-- _focus: ']), 1, '<!-- _focus: '), 'focus');
	});

	// Drift gate (the self-maintaining-autocomplete contract): the completion
	// vocab MUST equal the lint source of truth, so a new focus style/axis can't
	// be lint-valid yet un-completable (or vice versa).
	test('completion vocab stays locked to the lint source of truth', async () => {
		const vocab = await import('../../../docs/src/playground/grammar-vocab.js');
		const lint = require('../../../lib/authoring/lint-core');
		const sorted = (it) => [...it].sort();
		assert.deepEqual(sorted(vocab.FOCUS_STYLE_VALUES), sorted(lint.FOCUS_STYLES),
			'FOCUS_STYLE_VALUES (grammar-vocab) must mirror FOCUS_STYLES (lint-core)');
		assert.deepEqual(sorted(vocab.FOCUS_AXIS_VALUES), sorted(lint.FOCUS_AXES),
			'FOCUS_AXIS_VALUES (grammar-vocab) must mirror FOCUS_AXES (lint-core)');
		for (const d of ['_focus', '_focusStyle', '_focusSteps']) {
			assert.ok(vocab.DIRECTIVE_NAMES.includes(d), `${d} must be a completable directive name`);
		}
	});
});
