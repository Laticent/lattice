/**
 * lib/export/cli-deck-sheet.js — the CLI export's deck sheet builder, shared with
 * tools/palette-sweep.js. The real-render arms live in
 * test/integration/export/palette-cascade-order.test.js; these pin the pure pieces.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cliThemeStore, cliDeckSheet, packAuthorCss, packInlineStyles } = require('../../../lib/export/cli-deck-sheet.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const BASE = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
const INDACO = fs.readFileSync(path.join(ROOT, 'themes', 'indaco.css'), 'utf8');

test('the sheet is the engine flat pack, unwrapped to top-level slides', () => {
	const { css } = cliDeckSheet(cliThemeStore(BASE, [{ name: 'indaco', css: INDACO }]), { theme: 'indaco', sizeName: 'hd' });
	assert.ok(css.length > 100000, `sheet is ${css.length} bytes`);
	assert.doesNotMatch(css, /article\.lattice\s*>/);
	assert.match(css, /:where\(section:not\(section \*\)\):not\(\[\\20 root\]\), :root\s*\{/, 'a :root arm lands on the top-level slides AND as written');
	// A child-only slide selector must stay child-only: a `<section>` nested in a slide is not a
	// slide. Plain `section` specificity is kept, so no rule moves against another.
	assert.match(css, /section:where\(:not\(section \*\)\)\s*\{[^}]*width:\s*1280px/, 'the scaffold box is scoped to top-level slides');
	assert.doesNotMatch(css, /(^|[{},]\s*)section\s*\{[^}]*width:\s*1280px/, 'no bare `section` rule gives every section the slide box');
});

test("a panes deck's sheet carries the twins for the components in its panes, in the flat shape", () => {
	const store = cliThemeStore(BASE, [{ name: 'indaco', css: INDACO }]);
	const plain = cliDeckSheet(store, { theme: 'indaco', sizeName: 'hd' }).css;
	const panes = cliDeckSheet(store, { theme: 'indaco', sizeName: 'hd', panes: ['stats'] }).css;
	// The twins are composed BEFORE the pack, so they come out rooted on a top-level slide like
	// every other rule. Widening the packed sheet afterwards found no `section.stats` to twin, and
	// a stats pane exported unstyled (caught on the PR's review deck after main moved the CLI onto
	// this sheet).
	assert.match(panes, /section:where\(:not\(section \*\)\) lat-pane\.stats/);
	assert.doesNotMatch(plain, /lat-pane\.stats/);
	// Only the components the deck's panes carry: no list twin for a stats-only deck.
	assert.doesNotMatch(panes, /lat-pane\.list(?![\w-])/);
});

test('an installed root palette without @import lattice still sits on the layout sheet', () => {
	// The package gate allows a theme that imports nothing. composeCss inlines the base only at
	// the import, so without `rootsOnBase` the export shipped scaffold alone (12 KB, h1 in Times).
	const bare = INDACO.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@import\s*(['"])lattice\1\s*;?/g, '');
	const store = cliThemeStore(BASE, [{ name: 'bare', css: bare }]);
	const { css } = cliDeckSheet(store, { theme: 'bare', sizeName: 'hd' });
	assert.ok(css.length > 100000, `a palette with no import composed to ${css.length} bytes — the base is missing`);
});

test('a child palette is not given a second copy of the base', () => {
	const child = "@import 'indaco';\n:root{--accent:#123456}";
	const store = cliThemeStore(BASE, [{ name: 'indaco', css: INDACO }, { name: 'child', css: child }]);
	const one = cliDeckSheet(store, { theme: 'indaco', sizeName: 'hd' }).css.length;
	const two = cliDeckSheet(store, { theme: 'child', sizeName: 'hd' }).css.length;
	assert.ok(two < one * 1.2, `child sheet ${two} vs parent ${one}: the base was inlined twice`);
});

test('an unregistered theme is refused, not composed to an empty sheet', () => {
	assert.throws(() => cliDeckSheet(cliThemeStore(BASE, []), { theme: 'nope' }), /not registered/);
});

test("author CSS stays as written, plus its :root custom properties copied onto the slides", () => {
	const src = ':root{--a:1;color-scheme:dark} section{--b:2} h2, :root .k{color:red;--k:url("a;b")} section.x::after{content:"x"} @media print{:root{--c:1}} @keyframes k{from{opacity:0}}';
	const [asWritten, copy] = packAuthorCss(src).split('\n');
	assert.equal(asWritten, src, "the author's CSS is emitted untouched");
	assert.equal(
		copy,
		':where(section:not(section *)):not([\\20 root]), :root{--a:1}:where(section:not(section *)):not([\\20 root]) .k, :root .k{--k:url("a;b")}@media print{:where(section:not(section *)):not([\\20 root]), :root{--c:1}}',
		'only :root arms and --* declarations are copied, a quoted ; does not split a value, and the @media holding one is kept',
	);
	// `color-scheme` is not copied: a11y-base pins it at `:root:root` to outrank exactly this
	// override, and a slide-level copy turned its fixed white canvas black.
	assert.equal(packAuthorCss(':root{color-scheme:dark}'), ':root{color-scheme:dark}');
	assert.equal(packAuthorCss(''), '');
});

test('in-body styles: top-level ones get the copy, one inside an <svg> is left as written', () => {
	const html = '<p>a</p><style>:root{--a:1}</style><svg id="m"><style>:root{--m:1}</style><g/></svg><svg/><style>:root{--b:2}</style>';
	const out = packInlineStyles(html);
	assert.match(out, /<style>:root\{--a:1\}\n:where\(section:not\(section \*\)\):not\(\[\\20 root\]\), :root\{--a:1\}<\/style>/);
	assert.match(out, /<svg id="m"><style>:root\{--m:1\}<\/style>/, "Mermaid's own sheet is untouched");
	assert.match(out, /<svg\/><style>:root\{--b:2\}\n:where\(section:not\(section \*\)\):not\(\[\\20 root\]\), :root\{--b:2\}<\/style>/, 'a self-closing <svg/> does not open a scope');
});
