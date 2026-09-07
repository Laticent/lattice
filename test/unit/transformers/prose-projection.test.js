const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

// The component-aware prose projection (lib/transformers/prose-projection.mjs, P4).
// Synthetic sections mirror the real rendered structure (a `.cell-stage` body with
// `.masthead-lede` heading/eyebrow) so these stay fast + focused. ESM kernel reached
// via dynamic import from this CJS test.

let project;
let speak;
let script;
let spansFor;
test.before(async () => {
	const mod = await import('../../../lib/transformers/prose-projection.mjs');
	project = mod.projectDeckToProse;
	speak = mod.projectDeckToSpeech;
	script = mod.projectDeckToScript;
	spansFor = mod.emphasisSpansFor;
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
	// A chart component carries the `chart-frame` class so the re-hosted SVG's
	// `--chart-cat-*` scoped colors resolve outside `section.chart-frame`.
	assert.match(
		articleHtml,
		/<figure class="lp-figure chart-frame"><svg[\s\S]*<figcaption>Revenue mix<\/figcaption><\/figure>/,
	);
});

// ── reidClone: the cloned chart must not duplicate an id, or dangle a reference ──────────
// The Read·Article view re-hosts each chart by cloning it into a SECOND copy in the SAME document.
// Every id in that copy has to move, and every reference to it has to move with it.

test('a cloned chart suffixes EVERY id it defines, whatever the id looks like', () => {
	// SHAPE-AGNOSTIC IS THE POINT. The first cut matched the id shape
	// (`/lat-(?:x\d+-)?svg[td]-\d+/`), and the shapes moved out from under it when ids became
	// slide-scoped — `lat-svgt-80-1`. Its two halves then disagreed: the anchored `id="…"` pattern
	// no longer matched so the id stayed put, while the UNANCHORED reference test still matched
	// `lat-svgt-80` inside it and suffixed the reference. Result: a duplicate `<title id>` AND an
	// `aria-labelledby` pointing at nothing — a chart with no accessible name, worse than the
	// duplicate this exists to prevent. So the ids below are deliberately three different shapes.
	const secs = sections(
		`<section data-lattice-slide class="piechart"><div class="cell-stage">
			<div class="masthead-lede"><h2>Revenue mix</h2></div>
			<svg class="lattice-chart" role="img" aria-labelledby="lat-svgt-80-1" aria-describedby="lat-x0-svgd-3">
				<title id="lat-svgt-80-1">Pie chart</title><desc id="lat-x0-svgd-3">Key</desc>
				<defs><linearGradient id="pie-wedge-80-2"/></defs>
				<circle fill="url(#pie-wedge-80-2)" style="stroke:url(#pie-wedge-80-2)"/>
			</svg>
		</div></section>`,
	);
	const { articleHtml } = project(secs);
	for (const id of ['lat-svgt-80-1', 'lat-x0-svgd-3', 'pie-wedge-80-2']) {
		assert.match(articleHtml, new RegExp(`id="${id}-a"`), `${id} was not suffixed in the clone`);
		assert.doesNotMatch(articleHtml, new RegExp(`id="${id}"`), `${id} is duplicated by the clone`);
	}
	// And every reference follows the id — an aria ref, a `fill="url(#…)"`, and one inside `style`.
	assert.match(articleHtml, /aria-labelledby="lat-svgt-80-1-a"/);
	assert.match(articleHtml, /aria-describedby="lat-x0-svgd-3-a"/);
	assert.equal((articleHtml.match(/url\(#pie-wedge-80-2-a\)/g) || []).length, 2, 'both url(#…) forms follow the id');
});

test('a cloned chart moves EVERY reference form, not just the two the first cut knew', () => {
  // The first "shape-agnostic" cut claimed "a new reference form cannot be missed" and missed seven.
  // Each row below had its DEFINITION renamed and its REFERENCE left behind — which is worse than
  // the duplicate this function exists to prevent, because the reference then resolves to the
  // slide's copy (or to nothing). `url('#g')` was confirmed dangling on a real `--player` export.
  const rows = [
    ["url('#g')", `<defs><linearGradient id="g1"/></defs><rect style="fill:url('#g1')"/>`, 'g1'],
    ['use href', `<path id="p1"/><use href="#p1"/>`, 'p1'],
    ['xlink:href', `<path id="p2"/><use xlink:href="#p2"/>`, 'p2'],
    ['id with parens', `<defs><linearGradient id="a.b(c)"/></defs><rect fill="url(#a.b(c))"/>`, 'a.b(c)'],
  ];
  for (const [label, inner, id] of rows) {
    const secs = sections(`<section data-lattice-slide class="piechart"><div class="cell-stage"><div class="masthead-lede"><h2>H</h2></div><svg class="lattice-chart" role="img"><title>T</title>${inner}</svg></div></section>`);
    const { articleHtml } = project(secs);
    const fig = articleHtml.slice(articleHtml.indexOf('<figure'), articleHtml.indexOf('</figure>'));
    assert.ok(fig.includes(`id="${id}-a"`), `${label}: the definition did not move`);
    assert.ok(!new RegExp(`[#"']${id.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&')}["')\\s]`).test(fig.replace(`id="${id}-a"`, '')), `${label}: a reference was left behind`);
  }
});

test('a cloned chart leaves a reference to an id it does NOT define alone', () => {
	// A document-level `<defs>` lives outside the clone, so its id does not move and neither may
	// the reference — suffixing it would dangle.
	const secs = sections(
		`<section data-lattice-slide class="piechart"><div class="cell-stage">
			<div class="masthead-lede"><h2>Shared</h2></div>
			<svg class="lattice-chart" role="img"><circle fill="url(#deck-level-gradient)"/></svg>
		</div></section>`,
	);
	const { articleHtml } = project(secs);
	assert.match(articleHtml, /url\(#deck-level-gradient\)/, 'an outside reference must not be rewritten');
});

test('a SPATIAL chart (state-chart) goes to the placeholder, NOT a broken SVG re-host', () => {
	// state-chart is a node-and-edge graph: its only SVG is the edge layer (arrows to
	// absolutely-positioned HTML nodes), and its node list is raw layout noise. It must
	// project to the honest "best seen in Present / Read·Slides" placeholder, never the
	// orphan edge SVG.
	const secs = sections(
		`<section data-lattice-slide class="state-chart"><div class="cell-stage">
			<div class="masthead-lede"><h2>Deal stages</h2></div>
			<svg class="state-chart-edges" aria-hidden="true"><path/></svg>
			<ol class="state-nodes"><li class="state-node"><span class="state-label">Lead</span></li></ol>
		</div></section>`,
	);
	const { articleHtml } = project(secs);
	assert.doesNotMatch(articleHtml, /state-chart-edges/, 'the orphan edge SVG is not projected');
	assert.match(articleHtml, /lp-figure-note[\s\S]*best seen/, 'projects to the visual-layout placeholder');
});

test('a SPATIAL-BOUNDED chart (word-cloud) re-hosts its .chart-body into a bounded .lp-spatial box', () => {
	// word-cloud lays out in cqi/%, so it can't re-host as a bare SVG (no container context) —
	// but its whole .chart-body renders cleanly inside a bounded container-type:size box. The
	// figure carries `lp-spatial` + the component class (+ chart-frame for the color scope).
	const secs = sections(
		`<section data-lattice-slide class="word-cloud"><div class="cell-stage">
			<div class="masthead-lede"><h2>Themes</h2></div>
			<div class="chart-body"><svg class="wc-svg"><text class="wc-word">growth</text></svg></div>
		</div></section>`,
	);
	const { articleHtml } = project(secs);
	assert.match(
		articleHtml,
		/<figure class="lp-figure lp-spatial chart-frame word-cloud"><div class="chart-body">/,
		'the word-cloud re-hosts its .chart-body in a bounded lp-spatial figure',
	);
	assert.match(articleHtml, /wc-word">growth/, 'the cloud content is preserved');
});

test('a FLOW-HEIGHT chart (roadmap) re-hosts its .chart-body into a width-container .lp-chart figure', () => {
	// roadmap is a pure HTML+CSS table (no SVG). A raw re-host of its <table> drops the
	// section.roadmap-scoped styling (state markers collapse) and overflows a narrow column.
	// Re-hosting the whole .chart-body into a `.lp-chart` width container (container-type:
	// inline-size, height:auto) re-establishes the cqi context; the figure carries the authored
	// class list (component + modifiers) + chart-frame so variant CSS + `--chart-cat-*` resolve.
	const secs = sections(
		`<section data-lattice-slide data-class="roadmap status" class="roadmap status chart-frame"><div class="cell-stage">
			<div class="masthead-lede"><h2>Rollout</h2></div>
			<div class="chart-body"><div class="roadmap-figure"><table><tr><td class="cell-state state-shipped">Ship</td></tr></table></div></div>
		</div></section>`,
	);
	const { articleHtml } = project(secs);
	assert.match(
		articleHtml,
		/<figure class="lp-figure lp-chart chart-frame roadmap status"><div class="chart-body">/,
		'roadmap re-hosts its .chart-body in a width-container lp-chart figure carrying the authored classes',
	);
	assert.match(articleHtml, /roadmap-figure[\s\S]*state-shipped/, 'the roadmap board content + state markers survive');
	assert.doesNotMatch(articleHtml, /lp-figure-note/, 'roadmap is NOT a placeholder any more');
});

test('flow-height figure class tokens are whitelisted (no attribute break-out)', () => {
	// The authored class list enters the figure `class="…"` attribute; esc() does not escape the
	// double-quote, so a stray quote in a class token must be stripped ([a-z0-9-] whitelist).
	const secs = sections(
		`<section data-lattice-slide data-class='progress "&gt;evil' class="progress"><div class="cell-stage">
			<div class="masthead-lede"><h2>Readiness</h2></div>
			<div class="chart-body"><div class="progress-bars">bars</div></div>
		</div></section>`,
	);
	const { articleHtml } = project(secs);
	assert.doesNotMatch(articleHtml, /class="lp-figure lp-chart chart-frame [^"]*"[^>]*evil/, 'no quote break-out');
	assert.match(articleHtml, /lp-figure lp-chart chart-frame progress/, 'the clean component token survives');
});

test('flow-height re-host drops the authored color-scheme modifier (article owns scheme)', () => {
	// A slide hard-marked `.dark` must NOT force a dark-tuned chart treatment into a LIGHT article;
	// Read·Article owns its scheme via data-lp-scheme + light-dark(). The chart VARIANT (`tinted`)
	// is kept; only `dark`/`light` are dropped.
	const secs = sections(
		`<section data-lattice-slide data-class="kanban tinted dark" class="kanban tinted dark"><div class="cell-stage">
			<div class="masthead-lede"><h2>Board</h2></div>
			<div class="chart-body"><div class="kanban-board">cards</div></div>
		</div></section>`,
	);
	const { articleHtml } = project(secs);
	assert.match(articleHtml, /class="lp-figure lp-chart chart-frame kanban tinted"/, 'kanban + tinted variant kept, dark dropped');
	assert.doesNotMatch(articleHtml, /chart-frame kanban tinted dark/, 'the dark scheme modifier is not carried');
});

test('a component whose PRIMARY chart SVG is aria-hidden (funnel) still re-hosts in color', () => {
	// funnel / map / quadrant / radar mark their MAIN chart svg aria-hidden (the data
	// rides the label / mark-detail channel). aria-hidden must NOT gate re-hosting — these
	// are self-contained data charts that re-host cleanly, carrying `chart-frame` so their
	// scoped `--chart-cat-*` colors resolve.
	const secs = sections(
		`<section data-lattice-slide class="funnel"><div class="cell-stage">
			<div class="masthead-lede"><h2>Deal funnel</h2></div>
			<svg class="funnel-svg" aria-hidden="true"><polygon class="funnel-band"/></svg>
		</div></section>`,
	);
	const { articleHtml } = project(secs);
	assert.match(
		articleHtml,
		/<figure class="lp-figure chart-frame"><svg class="funnel-svg"/,
		'the aria-hidden funnel chart svg re-hosts as a chart-frame figure',
	);
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

test('speech big-number: figure reads INTO its caption ("0 boxes"), never a colon hard-stop ("0:")', () => {
	// A big-number is a bare list lead (- value / - caption), NOT a `<strong>` kpi tile,
	// so it fell through the generic nested-list "head: body" join and fronted the number
	// with a COLON — "0: boxes to drag". A TTS voice treats a colon after a tiny token as
	// a hard stop and speaks ONLY the number ("zero"), skipping the caption (the live
	// lattice.style bug: "only zero is read"). It must read as one phrase, colon-free.
	// The REAL rendered structure: the eyebrow is a bare `<p><code>` in the stage (NOT a
	// `.masthead-lede`), so eyebrowOf misses it and the dedicated walker's `pre` capture is
	// what keeps it — this fragment mirrors `render()`'s output for a big-number slide.
	const secs = sections(
		`<section data-lattice-slide data-class="big-number" class="big-number form"><div class="cell-stage"><p><code>The whole idea</code></p>
			<ul><li>0<ul><li>boxes to drag — you write Markdown, the engine designs the slide.</li></ul></li></ul>
		</div></section>`,
	);
	const [text] = speak(secs);
	assert.match(text, /0 boxes to drag/, 'number reads straight into its caption, no colon');
	assert.doesNotMatch(text, /0:\s/, 'never a colon hard-stop after the figure');
	assert.match(text, /^The whole idea\./, 'the eyebrow is kept, not dropped by the dedicated walker');
	assert.equal(text.match(/The whole idea/g).length, 1, 'the eyebrow is spoken exactly once, never doubled');
});

test('speech big-number: the canonical percent example reads "92% of the audience…", not "92%:"', () => {
	const [text] = speak(sections(
		`<section data-lattice-slide data-class="big-number" class="big-number"><div class="cell-stage">
			<ul><li>92%<ul><li>of the audience remembers a single number from a deck.</li></ul></li></ul>
		</div></section>`,
	));
	assert.match(text, /92% of the audience remembers a single number from a deck\./);
	assert.doesNotMatch(text, /92%:/, 'no colon between the figure and its caption');
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
	// Heading (lead) → figcaption (body) now cross a PARAGRAPH beat (blank line), not a space.
	assert.match(t, /Q4 Chart\.\n\nRevenue rose thirty percent\./);
	assert.doesNotMatch(t, /90|<text>|svg/, 'the SVG is never read');
});

test('speech: ONE paragraph beat between the lead (title) and the body; body blocks flow', () => {
	// The single paragraph beat on a slide is the lead→body topic shift (buildTrack reads the blank
	// line as a PARAGRAPH_PAUSE_MS beat). Body blocks — a paragraph, a list — stay space-joined (a beat
	// between EVERY block was too much on-device). See the paragraph-pauses ADR.
	const [t] = speak(sections(
		`<section data-lattice-slide data-class="list" class="list"><div class="cell-stage"><h2>Roadmap</h2><p>We ship in three phases.</p><ul><li>Design.</li><li>Build.</li></ul></div></section>`,
	));
	// One beat after the title…
	assert.match(t, /Roadmap\.\n\nWe ship in three phases\. Design\. Build\./);
	// …and NO beat between the body blocks (they read as one flowing run).
	assert.doesNotMatch(t, /phases\.\n\nDesign/, 'body blocks flow — no beat between paragraph and list');
	assert.doesNotMatch(t, /Design\.\n\nBuild\./, 'list items flow within their block');
});

test('speech generic: three-level nesting never mashes words together', () => {
	const [t] = speak(sections(
		`<section data-lattice-slide data-class="list" class="list"><div class="cell-stage"><ul><li>Phase one<ul><li>Design<ul><li>wireframes</li></ul></li><li>Build</li></ul></li></ul></div></section>`,
	));
	assert.doesNotMatch(t, /Designwireframes/, 'no run-together text across levels');
	assert.match(t, /Phase one:/);
});

test('speech generic: a card title ending in a period drops it before the colon (no "Write.:")', () => {
	const [t] = speak(sections(
		`<section data-lattice-slide data-class="cards-grid" class="cards-grid"><div class="cell-stage"><ul><li>Write.<ul><li>Plain Markdown.</li></ul></li><li>Choose a component.<ul><li>Tag a slide.</li></ul></li></ul></div></section>`,
	));
	assert.doesNotMatch(t, /Write\.:/, 'authored period is not doubled with the composed colon');
	assert.match(t, /Write: Plain Markdown\./);
	assert.match(t, /Choose a component: Tag a slide\./);
});

test('speech generic: a question lead (q-and-a) KEEPS its "?" and is not fronted with a colon', () => {
	const [t] = speak(sections(
		`<section data-lattice-slide data-class="q-and-a" class="q-and-a"><div class="cell-stage"><ul><li>Will the board raise cost?<ul><li>Yes, and here is the plan.</li></ul></li></ul></div></section>`,
	));
	assert.match(t, /raise cost\? Yes, and here is the plan\./, 'question mark kept, answer follows as its own sentence');
	assert.doesNotMatch(t, /raise cost[?:]*:/, 'no colon fronting (and no "?:" doubling) after a question');
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

test('stats: the label-first KPI reorder holds on a REAL engine render, not just synthetic DOM', () => {
	// The flagship reorder (label fronted, value focal) is otherwise pinned only on
	// hand-built `.cell-stage` sections; this proves the engine actually emits the
	// structure `speakStats` reorders, so a renderer change that broke it would fail
	// a test. It is also the contract the live Studio Present path now shares (both
	// surfaces run this same projection on the rendered DOM).
	const [t] = renderSpeech('<!-- _class: stats -->\n\n## Quarter\n\n1. $2.4B\n   - Total revenue\n2. 4.2×\n   - Signal recall\n');
	assert.match(t, /Total revenue: \$2\.4B/, 'metric name fronted, value focal');
	assert.doesNotMatch(t, /\$2\.4B\. Total revenue/, 'never value-before-label');
});

test('split-compare: each column\'s <strong> header labels its bullets (not dropped)', () => {
	// split-compare renders a column as `.option > <strong>header</strong> + <ul>`; a bare
	// <strong> is not a block the generic walker selects, so the header was silently dropped
	// and the bullets read unattributed. It must read "header: bullets".
	const [t] = renderSpeech(
		'<!-- _class: split-compare -->\n\n## Old vs new.\n\n- Slide editors\n  - You place every box by hand\n- Lattice\n  - You write the content\n',
	);
	assert.match(t, /Slide editors: You place every box by hand/);
	assert.match(t, /Lattice: You write the content/);
});

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


// ── THE CODA IS SPOKEN ────────────────────────────────────────────────────────────────────────
// `stageOf` returns `.cell-stage` and the coda is that cell's SIBLING, so every stage-scoped body
// walker missed it and a slide's closing "so what" was silent. These pin that it is said, said
// once, and said last.
const CODA_SLIDE = `<section data-lattice-slide data-class="content">
  <div class="cell-stage"><ul><li>Coverage sits at 2.9x.</li></ul></div>
  <div class="cell-coda" data-dock="column"><blockquote><p>The year is made on retention.</p></blockquote></div>
</section>`;

test('speech: the coda is narrated', () => {
	const [text] = speak(sections(CODA_SLIDE));
	assert.match(text, /The year is made on retention\./);
});

test('speech: the coda is narrated LAST — it is a closing beat', () => {
	const [text] = speak(sections(CODA_SLIDE));
	assert.ok(text.indexOf('Coverage sits') < text.indexOf('The year is made'), text);
	assert.ok(text.trimEnd().endsWith('The year is made on retention.'), text);
});

test('speech: the coda gets its own PARAGRAPH beat, not a sentence pause', () => {
	// A blank line is what normalizeProjected turns into the paragraph tier downstream; without it
	// the insight would run on from the last bullet.
	const [text] = speak(sections(CODA_SLIDE));
	assert.match(text, /Coverage sits at 2\.9x\.\n\nThe year is made on retention\./);
});

test('speech: a coda INSIDE the stage is not spoken twice', () => {
	// A layout that CLAIMS its trailing block (coda.claims) keeps it in the stage, where the body
	// walker already says it. The guard asks whether the BODY already says it; without it that
	// slide stutters.
	const claimed = `<section data-lattice-slide data-class="content">
	  <div class="cell-stage"><ul><li>Coverage sits at 2.9x.</li></ul>
	    <div class="cell-coda"><blockquote><p>Retention carries the year.</p></blockquote></div></div>
	</section>`;
	const [text] = speak(sections(claimed));
	assert.equal(text.match(/Retention carries the year/g)?.length, 1, text);
});

test('speech: both coda blocks are spoken, each its own beat', () => {
	const two = `<section data-lattice-slide data-class="content">
	  <div class="cell-stage"><p>Body.</p></div>
	  <div class="cell-coda"><blockquote><p>The insight.</p></blockquote><p>The footnote.</p></div>
	</section>`;
	const [text] = speak(sections(two));
	assert.match(text, /The insight\.\n\nThe footnote\./, text);
});

test('speech: a slide with no coda is unchanged', () => {
	const plain = `<section data-lattice-slide data-class="content"><div class="cell-stage"><p>Only this.</p></div></section>`;
	assert.equal(speak(sections(plain))[0], 'Only this.');
});

// ── EMPHASIS SPANS ───────────────────────────────────────────────────────────────────────────
const BOLD_SLIDE = `<section data-lattice-slide data-class="content">
  <div class="cell-stage"><p>Retention reached <strong>one hundred and eighteen percent</strong> this year.</p></div>
</section>`;

test('emphasis: a <strong> becomes a span over exactly its own words', () => {
	const [s] = script(sections(BOLD_SLIDE));
	assert.equal(s.emphasis.length, 1);
	assert.equal(s.text.slice(s.emphasis[0].start, s.emphasis[0].end), 'one hundred and eighteen percent');
	assert.equal(s.emphasis[0].weight, 2);
});

test('emphasis: the coda is spoken AND weighted', () => {
	// Its hold lands in the exported player, which holds the gap on every cue including the last,
	// not in the .vtt, whose duration is the final cue's END and so cannot carry a trailing pause.
	// This source was briefly removed because the .vtt was the artifact checked — see the docblock
	// on EMPHASIS_SOURCES.
	const [s] = script(sections(CODA_SLIDE));
	assert.match(s.text, /The year is made on retention\./);
	const marked = s.emphasis.map((sp) => s.text.slice(sp.start, sp.end));
	assert.ok(marked.includes('The year is made on retention.'), JSON.stringify(marked));
});

test('emphasis: a phrase appearing TWICE is skipped rather than guessed', () => {
	// The unique-substring rule. A missed emphasis paces like today (safe); a misplaced one would
	// put a beat mid-sentence (a defect). This pins the safe direction.
	const dupe = `<section data-lattice-slide data-class="content">
	  <div class="cell-stage"><p>Margin held. <strong>Margin held</strong> again.</p></div>
	</section>`;
	const [s] = script(sections(dupe));
	assert.deepEqual(s.emphasis, []);
});

test('emphasis: a phrase the projection dropped or rewrote yields no span', () => {
	const hidden = `<section data-lattice-slide data-class="content">
	  <div class="cell-stage"><p>Visible.</p></div>
	  <aside><strong>Never narrated</strong></aside>
	</section>`;
	const [s] = script(sections(hidden));
	assert.deepEqual(s.emphasis, []);
});

test('emphasis: a <strong> inside a SKIPPED region is not an emphasis source', () => {
	// The discriminating case for the SKIP_SELECTOR guard, which the test above does NOT reach:
	// there the phrase was absent from the narration, so it passed for the wrong reason. Here the
	// words ARE narrated (from the visible body) while the only <strong> sits in the speaker-note
	// channel — chrome, not the author emphasizing the line the room hears. Deleting the guard
	// marks this; keeping it does not.
	const noteOnly = `<section data-lattice-slide data-class="content">
	  <div class="cell-stage"><p>Margin held through the quarter.</p></div>
	  <div class="lattice-notes"><strong>Margin held through the quarter</strong></div>
	</section>`;
	const [s] = script(sections(noteOnly));
	assert.deepEqual(s.emphasis, [], JSON.stringify(s));
});

test('speech: a coda block the component walker ALREADY spoke is not repeated', () => {
	// The guard is "is this already in the body", not "where does this sit in the DOM". The first
	// version asked `stage.contains(coda)`, which is equivalent only while the walker happens to be
	// speakGeneric — kpi/stats/big-number/quote do not walk the coda, so a stage-less slide of those
	// would have gone silent while the guard looked like it worked.
	const stageless = `<section data-lattice-slide data-class="content">
	  <p>Coverage sits at 2.9x.</p>
	  <div class="cell-coda"><blockquote><p>Retention carries the year.</p></blockquote></div>
	</section>`;
	const [text] = speak(sections(stageless));
	assert.equal(text.match(/Retention carries the year/g)?.length, 1, text);
});

test('speech: chrome nested INSIDE a coda block is not narrated', () => {
	// speechText reads textContent, so a docked chrome node inside a coda block would otherwise be
	// spoken. Every other walker in the module strips SKIP_SELECTOR descendants; this one now does.
	const withChrome = `<section data-lattice-slide data-class="content">
	  <div class="cell-stage"><p>Body.</p></div>
	  <div class="cell-coda"><blockquote><p>The insight.<span class="lattice-description">SLIDE 4 OF 9</span></p></blockquote></div>
	</section>`;
	const [text] = speak(sections(withChrome));
	assert.match(text, /The insight\./);
	assert.doesNotMatch(text, /SLIDE 4 OF 9/, text);
});

test('emphasis: a very short <strong> is not marked', () => {
	const tiny = `<section data-lattice-slide data-class="content">
	  <div class="cell-stage"><p>Grade <strong>A</strong> overall.</p></div>
	</section>`;
	const [s] = script(sections(tiny));
	assert.deepEqual(s.emphasis, []);
});

test('emphasis: every span indexes the phrase its source element actually carries', () => {
	// NOT `slice(a,b).length === b - a`, which is true of any in-bounds pair and cannot fail. The
	// claim worth pinning is that the span lands on the SOURCE ELEMENT'S OWN WORDS — an off-by-one
	// or a stale offset survives a bounds check and is exactly the defect that shipped once.
	const [bold] = script(sections(BOLD_SLIDE));
	assert.ok(bold.emphasis.length > 0, bold.text);
	for (const sp of bold.emphasis) {
		assert.ok(sp.start >= 0 && sp.end <= bold.text.length && sp.end > sp.start);
		assert.equal(
			bold.text.slice(sp.start, sp.end),
			'one hundred and eighteen percent',
			`span landed on ${JSON.stringify(bold.text.slice(sp.start, sp.end))}`,
		);
	}
});

test('emphasisSpansFor: returns [] for junk input instead of throwing', () => {
	assert.deepEqual(spansFor(null, 'text'), []);
	assert.deepEqual(spansFor(sections(BOLD_SLIDE)[0], ''), []);
	assert.deepEqual(spansFor(sections(BOLD_SLIDE)[0], null), []);
});

// ── THE TWO PROJECTIONS CANNOT DRIFT ─────────────────────────────────────────────────────────
test('projectDeckToSpeech is exactly projectDeckToScript mapped to its text', () => {
	// HARD RULE #1: one source of truth. Speech is a projection of Script, so a caller of either
	// gets the same string built once.
	const secs = sections(BOLD_SLIDE, CODA_SLIDE);
	assert.deepEqual(speak(secs), script(secs).map((s) => s.text));
});


test('speech: a coda that ECHOES a phrase from the body is still spoken', () => {
	// The defect a second checker found in the first fix pass. The guard was `body.includes(text)` —
	// a SUBSTRING test — so a coda restating words that also appear mid-sentence in the body was
	// silently dropped. A punchline restating a phrase from the body IS the ordinary shape of a
	// punchline, so this is the common case, not a corner one.
	const echo = `<section data-lattice-slide data-class="content">
	  <div class="cell-stage"><p>We must decide now, before the window closes and the option lapses.</p></div>
	  <div class="cell-coda"><blockquote><p>We must decide now</p></blockquote></div>
	</section>`;
	const [text] = speak(sections(echo));
	assert.match(text, /We must decide now\.$/, text);
	assert.equal(text.match(/We must decide now/g)?.length, 2, text); // body's mention + the coda
});

test('speech: a coda already spoken as its own SENTENCE mid-block is not repeated', () => {
	// The other direction, and why block equality is not the answer either: speakGeneric emits a
	// claimed coda in sentence flow with the block before it, one paragraph rather than two.
	const claimed = `<section data-lattice-slide data-class="content">
	  <div class="cell-stage"><ul><li>Coverage sits at 2.9x.</li></ul>
	    <div class="cell-coda"><blockquote><p>Retention carries the year.</p></blockquote></div></div>
	</section>`;
	const [text] = speak(sections(claimed));
	assert.equal(text.match(/Retention carries the year/g)?.length, 1, text);
});
// ── team-profile: a roster of PEOPLE, not a run of concatenated spans ────────────
// Both defects below were live on a shipped surface (read-along, Read·Article, the
// self-contained `.html` player) and no gate could see either, because the generic
// walker's `speechText` is bare `textContent`. They render through the REAL engine
// for the same reason the state-marker tests above do: a class rename in the
// component's transform must fail a test rather than silently mute or mangle speech.

test('team-profile: the card\'s spans are separated, not concatenated', () => {
	// `.person-name` / `.person-role` / `.person-note` are adjacent SPANS with no
	// whitespace between them — they are spaced by flex, not by markup. textContent
	// therefore ran them together: "Ada OkaforExecutive SponsorClears blockers".
	const [t] = renderSpeech('<!-- _class: team-profile -->\n\n## Team\n\n- Ada Okafor\n  - ![](a.svg)\n  - `Executive Sponsor`\n  - Clears blockers above the program.\n');
	assert.match(t, /Ada Okafor, Executive Sponsor: Clears blockers above the program\./);
	assert.doesNotMatch(t, /OkaforExecutive|SponsorClears/, 'no two spans may run together');
});

test('team-profile: the aria-hidden monogram is never spoken', () => {
	// A person with no headshot gets initials in the portrait cell, marked
	// `aria-hidden="true"` because the name is read beside it. `textContent` does not
	// honor aria-hidden, so the roster used to narrate "AOAda Okafor…". The speaker
	// reads the three named spans directly, which skips the monogram structurally.
	const [t] = renderSpeech('<!-- _class: team-profile -->\n\n## Team\n\n- Ada Okafor\n  - `Executive Sponsor`\n- Marcus Vale\n  - `Program Director`\n');
	assert.doesNotMatch(t, /\bAO\b|\bMV\b/, 'initials are decoration, not narration');
	assert.match(t, /Ada Okafor, Executive Sponsor\./);
});

test('team-profile sides: each roster keeps its own label', () => {
	// Two rosters under two `###` labels. Querying the rosters alone would drop the
	// labels and read six people as one undifferentiated list, so blocks are walked
	// in document order.
	const [t] = renderSpeech('<!-- _class: team-profile sides -->\n\n## Two teams\n\n### Your team\n\n- Ada Okafor\n  - `VP Operations`\n\n### Our team\n\n- Marcus Vale\n  - `Account Director`\n');
	assert.match(t, /Your team\.[\s\S]*Ada Okafor, VP Operations\./);
	assert.match(t, /Our team\.[\s\S]*Marcus Vale, Account Director\./);
	assert.ok(t.indexOf('Your team') < t.indexOf('Our team'), 'labels keep document order');
});

test('team-profile: a person with no role or no note reads without an empty clause', () => {
	// An author may give only a name. That must not produce a stray colon or a
	// dangling comma. NOTE: `bench` hides the note with `display: none` in CSS, which
	// is a PAINT decision — the note is still in the DOM and is still narrated, on
	// `main` as well as here. A checker flagged an earlier version of this comment
	// for claiming `bench` "drops the note", which is true of the stylesheet and
	// false of the speaker.
	const [t] = renderSpeech('<!-- _class: team-profile bench -->\n\n## Bench\n\n- Ada Okafor\n  - `Executive Sponsor`\n- Marcus Vale\n');
	assert.match(t, /Ada Okafor, Executive Sponsor\./);
	assert.match(t, /Marcus Vale\./);
	assert.doesNotMatch(t, /:\s*\.|,\s*\./, 'no empty clause, no dangling separator');
});

// ── the two surfaces are DIFFERENT functions, and only one was fixed the first time ──
// `projectDeckToSpeech` drives captions and Studio Present; `projectDeckToProse`
// drives Read·Article in the self-contained player. The first fix touched only the
// former while its commit claimed both, so Read·Article kept rendering the raw span
// run. These pin each surface separately, because that is how they broke.

test('team-profile: EVERY note line is spoken, not just the first', () => {
	// One `.person-note` span per note line. An author who writes the role as plain
	// text instead of backticks gets two — the component's own commonMistakes list
	// names that shape — and reading only the first silently dropped an authored
	// line. That is worse than the concatenation it replaced: ugly but complete
	// became quiet and lossy, against a deck `lint:deck` calls clean.
	const [t] = renderSpeech('<!-- _class: team-profile -->\n\n## The team\n\n- Ada Okafor\n  - Executive Sponsor\n  - Clears blockers above the program.\n');
	assert.match(t, /Executive Sponsor/);
	assert.match(t, /Clears blockers above the program/, 'the second note line must survive');
});

test('team-profile: Read·Article renders people, not the raw span run', () => {
	const { html } = engine.render('<!-- _class: team-profile -->\n\n## The team\n\n- Ada Okafor\n  - `Executive Sponsor`\n  - Clears blockers.\n', 'indaco', {});
	const dom = new JSDOM(`<body>${html}</body>`);
	const { articleHtml } = project([...dom.window.document.querySelectorAll('section[data-class]')]);
	assert.match(articleHtml, /<strong>Ada Okafor<\/strong>/, 'the name leads the entry');
	assert.match(articleHtml, /Clears blockers/);
	assert.doesNotMatch(articleHtml, /AOAda|person-initials/, 'no monogram, no raw span run');
});

test('team-profile: a roster behind a wrapper still gets the people treatment', () => {
	// Walking only `stage.children` returned null whenever anything sat between the
	// stage and the roster — a second component class puts a wrapper there — and the
	// `|| speakGeneric` fallback then re-ran the very bug this speaker fixes.
	const [t] = renderSpeech('<!-- _class: team-profile image -->\n\n## Team\n\n- Ada Okafor\n  - `Sponsor`\n  - Owns it.\n');
	assert.doesNotMatch(t, /OkaforSponsor/, 'the fallback must not re-introduce the concatenation');
	assert.match(t, /Ada Okafor, Sponsor: Owns it\./);
});

test('team-profile: a mid-stage blockquote is not swallowed by the roster walk', () => {
	// `speakGeneric` speaks blockquote/table; an earlier version of this speaker
	// listed only rosters, h3, h4 and p, so a quote between two rosters vanished.
	const [t] = renderSpeech('<!-- _class: team-profile -->\n\n## Team\n\n- Ada Okafor\n  - `Sponsor`\n\n> A quoted line in the middle.\n\n- Marcus Vale\n  - `Director`\n');
	assert.match(t, /A quoted line in the middle/);
	assert.match(t, /Ada Okafor, Sponsor\./);
	assert.match(t, /Marcus Vale, Director\./);
});

// ── team-profile: the person card is special; EVERYTHING else is delegated ────────
// Two earlier versions re-implemented the block walk with a hand-copied subset of the
// generic walkers' selectors and none of their per-tag walkers. Four content-loss
// defects came out of that one decision, and the two below are the sharpest: a `<dl>`
// matched the selector, found no handler, fell through to `textContent` and
// RE-CREATED the concatenation bug the function exists to remove — in exported .vtt
// captions. These pin the delegation itself, so a future selector list cannot drift
// out of sync with the generic walker again.

test('team-profile: a <dl> beside a roster keeps its term/definition reading', () => {
	// Was "NetworkACME-GuestRoom4B." in a shipped caption sidecar.
	const [t] = renderSpeech('<!-- _class: team-profile -->\n\n## T\n\n- Ada Okafor\n  - `Sponsor`\n\n<dl><dt>Network</dt><dd>ACME-Guest</dd><dt>Room</dt><dd>4B</dd></dl>\n');
	assert.match(t, /Network: ACME-Guest\./);
	assert.match(t, /Room: 4B\./);
	assert.doesNotMatch(t, /NetworkACME|GuestRoom/, 'the concatenation bug must not return on another element');
});

test('team-profile: a plain <ul> beside a roster is not swallowed', () => {
	const [t] = renderSpeech('<!-- _class: team-profile -->\n\n## T\n\n- Ada Okafor\n  - `Sponsor`\n\n<div class="x"><ul><li>MUST SURVIVE</li></ul></div>\n');
	assert.match(t, /MUST SURVIVE/);
});

test('team-profile: a ul.team-roster carrying no person flows on as an ordinary list', () => {
	// The transform's idempotency guard lets an author-written `ul.team-roster` reach
	// the projection untouched. Treating it as a roster emitted nothing AND suppressed
	// the fallback, so its content vanished — but only when another block on the slide
	// had already produced output, which is the worst way for it to fail.
	const [t] = renderSpeech('<!-- _class: team-profile -->\n\n## T\n\nAn intro paragraph.\n\n<ul class="team-roster"><li>MUST SURVIVE</li></ul>\n');
	assert.match(t, /An intro paragraph\./);
	assert.match(t, /MUST SURVIVE/);
});

test('team-profile: body blocks keep the sentence seam, not a paragraph beat', () => {
	// Joining blocks with "\n\n" reversed 2026-07-14-paragraph-level-pauses.md, whose
	// fix was "beat only lead->body, not every block": a paragraph seam widens to
	// PARAGRAPH_PAUSE_MS, and a `sides` slide gained four of them.
	const [t] = renderSpeech('<!-- _class: team-profile sides -->\n\n## T\n\n### Your team\n\n- Ada Okafor\n  - `VP Ops`\n\n### Our team\n\n- Marcus Vale\n  - `Director`\n');
	const [lead, ...body] = t.split('\n\n');
	assert.match(lead, /^T\./, 'the lead is its own paragraph');
	assert.equal(body.length, 1, `body must be ONE block, got ${body.length}: ${JSON.stringify(t)}`);
	assert.match(body[0], /Your team\.[\s\S]*Our team\./, 'both labels still read, in order');
});

test('team-profile: Read·Article keeps the portrait', () => {
	// The component's first line is "a roster of named people, each under a portrait";
	// an earlier version read only the three text spans and dropped every headshot.
	const { html } = engine.render('<!-- _class: team-profile -->\n\n## T\n\n- Ada Okafor\n  - ![](ada.svg)\n  - `Sponsor`\n', 'indaco', {});
	const dom = new JSDOM(`<body>${html}</body>`);
	const { articleHtml } = project([...dom.window.document.querySelectorAll('section[data-class]')]);
	assert.match(articleHtml, /<img class="person-photo"[^>]*src="ada\.svg"/, 'the portrait rides into the article');
	assert.match(articleHtml, /<strong>Ada Okafor<\/strong>/);
});

test('team-profile: a mixed roster keeps its non-person items on both surfaces', () => {
	// `withRostersSwapped` decided WHETHER to swap on "does this ul hold a person",
	// but then handed `make` only the people — so every plain <li> beside them was
	// dropped with the <ul> it lived in. That is the same content-loss the roster-with-
	// no-person case above pins, with its boundary moved rather than closed.
	const md = '<!-- _class: team-profile -->\n\n## T\n\n<ul class="team-roster"><li class="person"><span class="person-text"><span class="person-name">Ada</span></span></li><li>PLAIN ITEM</li></ul>\n';
	const [t] = renderSpeech(md);
	assert.match(t, /Ada/);
	assert.match(t, /PLAIN ITEM/, 'a non-person item is read, not discarded');
	const { html } = engine.render(md, 'indaco', {});
	const dom = new JSDOM(`<body>${html}</body>`);
	const { articleHtml } = project([...dom.window.document.querySelectorAll('section[data-class]')]);
	assert.match(articleHtml, /PLAIN ITEM/, 'and it reaches Read·Article too');
});

test('team-profile: a roster row wraps its words, so nested note markup lays out', () => {
	// The row is a flex box (portrait, then the line). A note re-emits the author's own
	// markup, so a list nested under a person was a SIBLING of the text and therefore a
	// flex ITEM of the row — it rendered beside the sentence rather than under it. Scoping
	// the CSS to direct children brought its markers back but left it in that position;
	// the wrapper is what makes the row exactly two items. Driving the real exported player
	// is what separated those two halves, so this pins the emitted SHAPE, not the styling.
	const md = '<!-- _class: team-profile -->\n\n## T\n\n- Ada Okafor\n  - `Sponsor`\n  - Owns three things:\n    - staffing\n    - budget\n';
	const { html } = engine.render(md, 'indaco', {});
	const dom = new JSDOM(`<body>${html}</body>`);
	const { articleHtml } = project([...dom.window.document.querySelectorAll('section[data-class]')]);
	const doc = new JSDOM(`<body>${articleHtml}</body>`).window.document;
	const row = doc.querySelector('ul.lp-roster > li');
	assert.ok(row, 'the roster row is emitted');
	const kids = [...row.children].map((el) => el.tagName);
	assert.ok(kids.includes('DIV'), `the words are wrapped, got children ${JSON.stringify(kids)}`);
	assert.equal(row.querySelectorAll(':scope > div').length, 1, 'exactly one wrapper');
	assert.equal(row.querySelectorAll(':scope > strong, :scope > em').length, 0,
		'the name and role live INSIDE the wrapper, never as bare flex items of the row');
});

test('team-profile: an image-only name still ships into Read·Article', () => {
	// The `<strong>` wrap is gated on the name having TEXT, so an image does not end up
	// inside a `<strong>`. Gating the whole name on that dropped an author's
	// `- ![Acme](logo.svg)` lead outright — the generic path had kept it. The image now
	// rides unwrapped: ugly is a design call, absent is a content loss.
	const md = '<!-- _class: team-profile -->\n\n## T\n\n- ![Acme Logo](logo.svg)\n  - `Sponsor`\n';
	const { html } = engine.render(md, 'indaco', {});
	const dom = new JSDOM(`<body>${html}</body>`);
	const { articleHtml } = project([...dom.window.document.querySelectorAll('section[data-class]')]);
	assert.match(articleHtml, /logo\.svg/, 'the image survives');
	assert.doesNotMatch(articleHtml, /<strong>\s*<img/, 'but never inside a <strong>');
});

test('team-profile: a roster that composes to nothing degrades to the generic reading', () => {
	// When every person yielded no sentence the roster was REMOVED, the clone came back
	// empty, and the caller re-ran the generic walker on the ORIGINAL stage — bringing
	// back both defects this path exists to fix. Leaving the roster in place means the
	// clone degrades to exactly what generic would have produced anyway.
	const md = '<!-- _class: team-profile -->\n\n## T\n\n<ul class="team-roster"><li class="person"><span class="person-figure person-figure--monogram" aria-hidden="true"><span class="person-initials">XX</span></span></li></ul>\n';
	const [t] = renderSpeech(md);
	assert.doesNotMatch(t, /XX/, 'the aria-hidden monogram must not leak back in via the fallback');
});

test('team-profile: a <pre> block survives into Read·Article', () => {
	const { html } = engine.render('<!-- _class: team-profile -->\n\n## T\n\n- Ada Okafor\n  - `Sponsor`\n\n```\nrun the thing\n```\n', 'indaco', {});
	const dom = new JSDOM(`<body>${html}</body>`);
	const { articleHtml } = project([...dom.window.document.querySelectorAll('section[data-class]')]);
	assert.match(articleHtml, /<pre>[\s\S]*run the thing/);
});

test('team-profile: neither projection mutates the DOM it is handed', () => {
	// The live Studio Present path re-projects the same nodes on every slide change.
	const { html } = engine.render('<!-- _class: team-profile -->\n\n## T\n\n- Ada Okafor\n  - `Sponsor`\n  - Owns it.\n', 'indaco', {});
	const dom = new JSDOM(`<body>${html}</body>`);
	const secs = [...dom.window.document.querySelectorAll('section[data-class]')];
	const before = dom.window.document.body.innerHTML;
	speak(secs); project(secs); speak(secs);
	assert.equal(dom.window.document.body.innerHTML, before, 'projection must be read-only');
});
