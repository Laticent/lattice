const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

// The component-aware prose projection (lib/transformers/prose-projection.mjs, P4).
// Synthetic sections mirror the real rendered structure (a `.cell-stage` body with
// `.masthead-lede` heading/eyebrow) so these stay fast + focused. ESM kernel reached
// via dynamic import from this CJS test.

let project;
let speak;
test.before(async () => {
	const mod = await import('../../../lib/transformers/prose-projection.mjs');
	project = mod.projectDeckToProse;
	speak = mod.projectDeckToSpeech;
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

// ── projectDeckToSpeech (Phase 2, 2026-07-11-manifest-speech-contract §6) ──────
// Emits per-slide natural DISPLAY narration; the downstream buildTrack (Cadenza
// Phase 1) expands tokens to spoken form. These pin the reorder/verbatim/skip
// primitives and the natural ordering.

test('speech kpi/stats: value-lead tiles REORDER to "label: value" (the motivating example)', () => {
	const secs = sections(
		`<section data-lattice-slide data-class="kpi" class="kpi form"><div class="cell-stage"><div class="masthead-lede"><p>Financial</p><h2>Q4 in review</h2></div>
			<ol><li><strong>$2.4B</strong><ul><li>Total revenue</li></ul></li>
			    <li><strong>42%</strong><ul><li>Gross margin</li></ul></li></ol>
		</div></section>`,
	);
	const [text] = speak(secs);
	assert.match(text, /Total revenue: \$2\.4B\./, 'label fronted, value focal — not value-first');
	assert.match(text, /Gross margin: 42%\./);
	assert.match(text, /^Financial\. Q4 in review\./, 'eyebrow then heading lead');
	assert.doesNotMatch(text, /\$2\.4B\. Total revenue/, 'never value-before-label');
});

test('speech quote: verbatim guard — quote as-is then attribution as a clause', () => {
	const secs = sections(
		`<section data-lattice-slide data-class="quote" class="quote form"><div class="cell-stage">
			<blockquote><p>The signal was always there.</p></blockquote><p>— Head of Product</p>
		</div></section>`,
	);
	const [text] = speak(secs);
	assert.match(text, /The signal was always there\. Head of Product\./);
});

test('speech generic: nested "- Title / body" reads "Title: body", siblings coordinated', () => {
	const secs = sections(
		`<section data-lattice-slide data-class="list" class="list form"><div class="cell-stage"><div class="masthead-lede"><h2>Risks</h2></div>
			<ul><li>Supply chain<ul><li>fragile in Q3</li></ul></li><li>Regulatory exposure</li></ul>
		</div></section>`,
	);
	const [text] = speak(secs);
	assert.match(text, /Supply chain: fragile in Q3\./);
	assert.match(text, /Regulatory exposure\./);
});

test('speech table: header-bound row read, never pipe/dash glyphs', () => {
	const secs = sections(
		`<section data-lattice-slide data-class="compare-table" class="compare-table form"><div class="cell-stage"><div class="masthead-lede"><h2>Options</h2></div>
			<table><thead><tr><th>Option</th><th>Cost</th></tr></thead><tbody><tr><td>Plan A</td><td>$10</td></tr><tr><td>Plan B</td><td>$20</td></tr></tbody></table>
		</div></section>`,
	);
	const [text] = speak(secs);
	assert.match(text, /Plan A — Cost: \$10\./);
	assert.match(text, /Plan B — Cost: \$20\./);
	assert.doesNotMatch(text, /---|\|/, 'no table chrome glyphs');
});

test('speech media (chart/diagram): the visual is SKIPPED — heading + eyebrow only, no SVG', () => {
	const secs = sections(
		`<section data-lattice-slide data-class="funnel" class="funnel form"><div class="cell-stage"><div class="masthead-lede"><p>Pipeline</p><h2>Conversion</h2></div>
			<svg><text>90</text></svg>
		</div></section>`,
	);
	const [text] = speak(secs);
	assert.match(text, /Pipeline\. Conversion\./);
	assert.doesNotMatch(text, /90|svg|<text>/, 'the SVG is never read');
});

test('speech is 1:1 with sections; an empty slide projects to ""', () => {
	const secs = sections('<section data-lattice-slide data-class="content" class="content form"><div class="cell-stage"></div></section>');
	const out = speak(secs);
	assert.equal(out.length, 1);
	assert.equal(out[0], '');
});

// ── projectDeckToSpeech: adversarial-review regressions (Phase 2 trio) ─────────

test('speech kpi: a delta-first tile fronts the NAME, not the delta', () => {
	const [t] = speak(sections(
		`<section data-lattice-slide data-class="kpi" class="kpi"><div class="cell-stage"><ol><li><strong>$2.4B</strong><ul><li>+9%</li><li>Total revenue</li></ul></li></ol></div></section>`,
	));
	assert.match(t, /Total revenue: \$2\.4B/, 'name fronted');
	assert.doesNotMatch(t, /\+9%: \$2\.4B/, 'never binds the value to the delta');
});

test('speech kpi: value wrapped in a div still reorders label-first (not value-first)', () => {
	const [t] = speak(sections(
		`<section data-lattice-slide data-class="kpi" class="kpi"><div class="cell-stage"><ol><li><div><strong>$5M</strong></div><ul><li>ARR</li></ul></li></ol></div></section>`,
	));
	assert.match(t, /ARR: \$5M/);
	assert.doesNotMatch(t, /\$5M: ARR/, 'never value-first');
});

test('speech kpi/stats: intro prose before the tiles is kept, not dropped', () => {
	const [t] = speak(sections(
		`<section data-lattice-slide data-class="stats" class="stats"><div class="cell-stage"><div class="masthead-lede"><h2>Metrics</h2></div><p>Our headline numbers this quarter.</p><ol><li><strong>73%</strong><ul><li>faster close</li></ul></li><li><strong>4.2×</strong><ul><li>recall</li></ul></li></ol></div></section>`,
	));
	assert.match(t, /Our headline numbers this quarter\./, 'intro sentence kept');
	assert.match(t, /faster close: 73%/);
});

test('speech table: a headerless table keeps every row and fabricates NO header binding', () => {
	const [t] = speak(sections(
		`<section data-lattice-slide data-class="x" class="x"><div class="cell-stage"><table><tr><td>Plan A</td><td>10</td></tr><tr><td>Plan B</td><td>20</td></tr></table></div></section>`,
	));
	assert.match(t, /Plan A — 10\./, 'first row kept, read linearly');
	assert.match(t, /Plan B — 20\./);
	assert.doesNotMatch(t, /10: 20/, 'no fabricated column binding');
});

test('speech generic: a <dl> ledger (wifi/contact) reads term: definition, not dropped', () => {
	const [t] = speak(sections(
		`<section data-lattice-slide data-class="wifi" class="wifi"><div class="cell-stage"><dl><dt>Network</dt><dd>ACME-Guest</dd><dt>Password</dt><dd>sunflower-42</dd></dl></div></section>`,
	));
	assert.match(t, /Network: ACME-Guest\./);
	assert.match(t, /Password: sunflower-42\./);
});

test('speech media: the figcaption (the one prose slot) IS read, the SVG is not', () => {
	const [t] = speak(sections(
		`<section data-lattice-slide data-class="funnel" class="funnel"><div class="cell-stage"><div class="masthead-lede"><h2>Q4 Chart</h2></div><figure><svg><text>90</text></svg><figcaption>Revenue rose thirty percent.</figcaption></figure></div></section>`,
	));
	assert.match(t, /Q4 Chart\. Revenue rose thirty percent\./);
	assert.doesNotMatch(t, /90|<text>|svg/, 'the SVG is never read');
});

test('speech generic: three-level nesting never mashes words together', () => {
	const [t] = speak(sections(
		`<section data-lattice-slide data-class="list" class="list"><div class="cell-stage"><ul><li>Phase one<ul><li>Design<ul><li>wireframes</li></ul></li><li>Build</li></ul></li></ul></div></section>`,
	));
	assert.doesNotMatch(t, /Designwireframes/, 'no run-together text across levels');
	assert.match(t, /Phase one:/);
});

// ── projectDeckToSpeech: state-marker reading (Phase 3), from REAL engine renders ──
// [x]/[-]/[ ]/[/] render with the glyph STRIPPED, meaning surviving only in a CSS
// class; the projection recovers it. These render authored Markdown through the
// REAL engine (not hand-written classes) so a renderer class rename fails a test
// instead of silently muting narration — and so the COMPONENT-KEYED word register
// (checklist "to do" vs obligation-matrix "exempt" for the same [ ]→todo class) is
// pinned against reality.
const engine = require('../../../lib/engine/index.js');
function renderSpeech(md) {
	const { html } = engine.render(md, 'indaco', {});
	const dom = new JSDOM(`<body>${html}</body>`);
	return speak([...dom.window.document.querySelectorAll('section[data-class]')]);
}

test('checklist: completion register — [x]→done, [ ]→to do, [-]→partial', () => {
	const [t] = renderSpeech('<!-- _class: checklist -->\n\n## Gate\n\n- [x] Encryption at rest\n- [ ] SOC 2 audit\n- [-] DR drills\n');
	assert.match(t, /Encryption at rest: done\./);
	assert.match(t, /SOC 2 audit: to do\./);
	assert.match(t, /DR drills: partial\./);
});

test('verdict-grid: inclusion register — [x]→yes, [ ]→no, [-]→partial (badge span)', () => {
	const [t] = renderSpeech('<!-- _class: verdict-grid -->\n\n## Options\n\n- Path A\n  - [x] Speed\n  - [ ] Cost\n  - [-] Adoption\n');
	assert.match(t, /Speed: yes/);
	assert.match(t, /Cost: no/);
	assert.match(t, /Adoption: partial/);
});

test('obligation-matrix: obligation register — [x]→applies, [ ]→EXEMPT (not "pending"), header-bound', () => {
	const [t] = renderSpeech('<!-- _class: obligation-matrix -->\n\n## Duties\n\n| Regime | Delete | Portability |\n| --- | --- | --- |\n| GDPR | [x] | [ ] |\n| CCPA | [-] | [x] |\n');
	assert.match(t, /GDPR — Delete: applies; Portability: exempt\./);
	assert.match(t, /CCPA — Delete: partial; Portability: applies\./);
	assert.doesNotMatch(t, /pending|: yes|: no/, 'exempt is never narrated as "pending"/"no"');
});

test('obligation-matrix HEAT: same marker meanings as default (only recolored)', () => {
	const [t] = renderSpeech('<!-- _class: obligation-matrix heat -->\n\n## Exposure\n\n| Regime | Delete |\n| --- | --- |\n| GDPR | [x] |\n| CCPA | [ ] |\n');
	assert.match(t, /GDPR — Delete: applies\./);
	assert.match(t, /CCPA — Delete: exempt\./);
});

test('speech: a plain nested list never invents a state word from a descendant', () => {
	const [t] = speak(sections(
		`<section data-lattice-slide data-class="list" class="list"><div class="cell-stage"><ul><li>Roadmap<ul><li>Q1 launch</li></ul></li></ul></div></section>`,
	));
	assert.equal(t, 'Roadmap: Q1 launch.');
});
