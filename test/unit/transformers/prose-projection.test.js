const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

// The component-aware prose projection (lib/transformers/prose-projection.mjs, P4).
// Synthetic sections mirror the real rendered structure (a `.cell-stage` body with
// `.masthead-lede` heading/eyebrow) so these stay fast + focused. ESM kernel reached
// via dynamic import from this CJS test.

let project;
test.before(async () => {
	({ projectDeckToProse: project } = await import('../../../lib/transformers/prose-projection.mjs'));
});

/** Build DOM sections from HTML fragments. */
function sections(...frags) {
	const dom = new JSDOM(`<body>${frags.join('')}</body>`);
	return [...dom.window.document.querySelectorAll('section')];
}

test('per-slide TOC granularity: every slide contributes an entry (not just dividers)', () => {
	const secs = sections(
		'<section data-lattice-slide class="title"><h1>Cover</h1></section>',
		'<section data-lattice-slide class="content form"><div class="cell-stage"><div class="masthead-lede"><h2>First point</h2></div><p>Body.</p></div></section>',
		'<section data-lattice-slide class="content form"><div class="cell-stage"><div class="masthead-lede"><h2>Second point</h2></div><p>Body.</p></div></section>',
	);
	const { toc } = project(secs);
	assert.equal(toc.length, 3);
	assert.equal(toc[0].level, 1, 'anchor cover is h1');
	assert.equal(toc[1].level, 2, 'content slides are h2');
	assert.deepEqual(toc.map((t) => t.text), ['Cover', 'First point', 'Second point']);
});

test('evidence (kpi/stats): strong+label list → a <dl> of value → label, not bullets', () => {
	const secs = sections(
		`<section data-lattice-slide class="stats form"><div class="cell-stage">
			<ol><li><strong>73%</strong><ul><li>faster close</li></ul></li>
			    <li><strong>$1.2M</strong><ul><li>prevented losses</li></ul></li></ol>
		</div></section>`,
	);
	const { articleHtml } = project(secs);
	assert.match(articleHtml, /<dl class="lp-stats">/);
	assert.match(articleHtml, /<dt>73%<\/dt><dd>faster close<\/dd>/);
	assert.match(articleHtml, /<dt>\$1\.2M<\/dt><dd>prevented losses<\/dd>/);
	assert.doesNotMatch(articleHtml, /<ol>/, 'the raw stat list is not emitted as bullets');
});

test('statement quote: blockquote kept + attribution lifted to <cite>', () => {
	const secs = sections(
		`<section data-lattice-slide class="quote form"><div class="cell-stage">
			<blockquote><p>The signal was always there.</p></blockquote><p>— Head of Product</p>
		</div></section>`,
	);
	const { articleHtml } = project(secs);
	assert.match(articleHtml, /<blockquote><p>The signal was always there\.<\/p><\/blockquote>/);
	assert.match(articleHtml, /<cite class="lp-cite">Head of Product<\/cite>/);
});

test('comparison table re-hosts the <table> intact (generic path)', () => {
	const secs = sections(
		`<section data-lattice-slide class="compare-table form"><div class="cell-stage">
			<table><thead><tr><th>Criterion</th><th>A</th></tr></thead><tbody><tr><td>Speed</td><td>✓</td></tr></tbody></table>
		</div></section>`,
	);
	const { articleHtml } = project(secs);
	assert.match(articleHtml, /<table>[\s\S]*<th>Criterion<\/th>[\s\S]*<td>Speed<\/td>[\s\S]*<\/table>/);
});

test('media component (chart) re-hosts the SVG as a captioned <figure>', () => {
	const secs = sections(
		`<section data-lattice-slide class="piechart form"><div class="cell-stage">
			<div class="masthead-lede"><h2>Revenue mix</h2></div><svg class="lattice-chart"><circle/></svg>
		</div></section>`,
	);
	const { articleHtml } = project(secs);
	assert.match(articleHtml, /<figure class="lp-figure"><svg[\s\S]*<figcaption>Revenue mix<\/figcaption><\/figure>/);
});

test('nesting is preserved (no flatten-to-textContent) and chrome is skipped', () => {
	const secs = sections(
		`<section data-lattice-slide class="inventory form"><div class="cell-stage">
			<ul><li>Parent<ul><li>Child</li></ul></li></ul>
		</div><footer>PAGE CHROME</footer><span class="lat-pagination">2</span>
		<aside class="lattice-notes">secret speaker note</aside></section>`,
	);
	const { articleHtml } = project(secs);
	assert.match(articleHtml, /<ul><li>Parent<ul><li>Child<\/li><\/ul><\/li><\/ul>/, 'nested list kept intact');
	assert.doesNotMatch(articleHtml, /PAGE CHROME/, 'footer chrome skipped');
	assert.doesNotMatch(articleHtml, /pagination|secret speaker note/, 'pagination + notes skipped');
});

test('the sr-only accessible description is skipped, not duplicated as visible prose', () => {
	const secs = sections(
		`<section data-lattice-slide class="title" aria-describedby="lat-desc-1">
			<p class="lattice-description" id="lat-desc-1">A dark title slide reading "Deck title".</p>
			<h1>Deck title</h1><p>Subtitle line.</p></section>`,
	);
	const { articleHtml } = project(secs);
	assert.doesNotMatch(articleHtml, /dark title slide reading/, 'the a11y description text is not re-emitted as prose');
	assert.match(articleHtml, /<h1[^>]*>Deck title<\/h1>/);
	assert.match(articleHtml, /<p>Subtitle line\.<\/p>/);
});

test('deeper walk recovers content nested in wrapper divs (compare-code / split-panel)', () => {
	const secs = sections(
		`<section data-lattice-slide data-class="split-panel" class="split-panel form"><div class="masthead-lede"><h2>Deep dive</h2></div>
			<div class="panel-left"><p>Intro line.</p></div>
			<div class="panel-right"><ol><li>Step one</li><li>Step two</li></ol></div></section>`,
	);
	const { articleHtml } = project(secs);
	assert.match(articleHtml, /Intro line\./, 'the intro in a wrapper div is recovered');
	assert.match(articleHtml, /<ol><li>Step one<\/li><li>Step two<\/li><\/ol>/, 'the nested ordered list is recovered');
});

test('a pure-visual component with no prose gets an honest placeholder, never an empty heading', () => {
	// gantt/kanban render as CSS-grid divs (no svg/img/prose) → must not be blank.
	const secs = sections(
		`<section data-lattice-slide data-class="gantt" class="gantt form chart-frame"><div class="masthead-lede"><h2>Schedule</h2></div>
			<div class="gantt-chart"><div class="gantt-bar"></div></div></section>`,
	);
	const { articleHtml } = project(secs);
	assert.match(articleHtml, /<h2 id="lp-sec-0">Schedule<\/h2>/);
	assert.match(articleHtml, /lp-visual-note/, 'an honest visual-layout note stands in for the empty body');
	assert.match(articleHtml, /Present|Read · Slides/, 'it points to the views where the visual reads');
});

test('divider is an h2 sub-entry, not an h1 competing with the cover (§A2)', () => {
	const secs = sections(
		'<section data-lattice-slide data-class="title" class="title"><h1>Cover</h1></section>',
		'<section data-lattice-slide data-class="divider" class="divider"><h2>Part Two</h2></section>',
	);
	const { toc } = project(secs);
	assert.equal(toc[0].level, 1, 'cover is h1');
	assert.equal(toc[1].level, 2, 'divider is h2');
});

test('a slide with no heading still gets a stable TOC entry (never blank)', () => {
	const secs = sections('<section data-lattice-slide class="content form"><div class="cell-stage"><p>Just body.</p></div></section>');
	const { toc, articleHtml } = project(secs);
	assert.equal(toc.length, 1);
	assert.match(toc[0].text, /Slide 1/);
	assert.match(articleHtml, /Just body\./);
});
