/**
 * THE CHART ACCESSIBILITY CONTRACT — every chart, every gallery slide, three consumers.
 *
 * A chart is read by three things that cannot see it:
 *
 *   1. A SCREEN READER reads the accessibility tree: an SVG's `<title>`/`<desc>`, a hidden data
 *      table, list and table semantics, and any visible text outside `aria-hidden` decoration.
 *   2. CADENZA (captions and read-aloud) speaks the slide: a chart narrator
 *      (lib/core/chart-narration.js `narrateChart`) or, when none claims the slide, the rendered
 *      projection (lib/transformers/prose-projection.mjs) — the same ladder the export and the
 *      live Present use.
 *   3. The PRESENT GUIDE (Vetrina's pointer riding the captions) finds what a sentence is about
 *      by a mark's `data-label`, which must LEAD that sentence as whole words
 *      (docs/src/components/studio/present-guide.ts `findMarkTarget`).
 *
 * The contract below is one assertion per consumer, stated over the thing every chart already
 * declares — the `data-label` on each of its marks — so it covers a chart added tomorrow with no
 * edit here:
 *
 *   · every labeled mark's name reaches the accessibility tree;
 *   · every labeled mark's name is spoken;
 *   · every labeled mark's name leads a sentence, so the pointer can land on it —
 *     except where the chart's reading is, by design, not one sentence per mark. Those are the
 *     rows of `NOT_PER_MARK`, each with its reason; a row the chart no longer needs fails.
 *
 * WHY THIS EXISTS. On 2026-09-24 an audit of the real export found four charts (gantt, kanban,
 * progress, timeline-list) whose captions said the heading and nothing else, a radar variant that
 * did the same, heatmap and line data unreachable by a screen reader past a one-line summary, and
 * the Guide hiding on roughly half of every chart's sentences. No test went red for any of it,
 * because each chart was tested alone and none was tested against its readers.
 *
 * The browser half — does the Guide actually resolve each spoken cue on the rendered slide — is
 * `node tools/sweep-guide-gestures.mjs --deck <gallery> --misses` (needs Chromium).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const engine = require('../../../lib/engine');
const { narrateChart } = require('../../../lib/core/chart-narration.js');

const CHART_DIR = path.join(__dirname, '..', '..', '..', 'lib', 'components', 'chart');
const COMPONENTS = fs
	.readdirSync(CHART_DIR)
	.filter((d) => !d.startsWith('_') && fs.existsSync(path.join(CHART_DIR, d, `${d}.manifest.json`)))
	.sort();

/** `present-guide.ts`'s `loose`, less its quote folding: what "the same words" means. */
const loose = (s) =>
	String(s)
		.toLowerCase()
		.replace(/[‘’“”]/g, "'")
		.replace(/[–—]/g, '-')
		.replace(/[^\p{L}\p{N}' -]+/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();

/**
 * Where a chart's reading is NOT one sentence per labeled mark, by design. The key is a CSS
 * selector for the marks exempt from the LEAD rule only — they must still be spoken and still
 * reach the accessibility tree.
 */
const NOT_PER_MARK = {
	// A quadrant is read a QUADRANT (or cohort) at a time — "Quick Wins: Weekly signal digest at
	// two, eighty-two; Slack intake bot at …" — so the region leads and its items follow it.
	quadrant: { skip: '.quadrant-dot, .quadrant-bubble, .quadrant-trail-after', why: 'read a region at a time; the region label leads' },
	// A cell is a crossing of a row and a column; the row leads ("Jan 2026: M0, one hundred; …").
	heatmap: { skip: '.heatmap-cell, .heatmap-col-label', why: 'read a row at a time; the row label leads' },
	// A segment is a part of a category's total; the category leads ("FY23: Licenses, …").
	'stacked-bar': { skip: '.sbar-seg', why: 'read a category at a time; the category label leads' },
	// A cloud is read as a ranking — the leader by name, the tail as a range — not word by word.
	'word-cloud': { skip: '.wc-word:not([data-rank="1"])', why: 'read as a ranking; only the leader opens a sentence' },
	// A scatter's points lead their own sentences; its category axis is numeric and unlabeled.
	// A slope's series lead; its two column heads are the before/after, said inside each sentence.
	slope: { skip: '.cart-cat', why: 'the two columns are the before/after inside every sentence' },
	// A state chart is read as its SHAPE and its transitions ("From Approved, publish goes to
	// Published."); the Guide reaches each state through the manifest's declared handle.
	'state-chart': { skip: '.state-node', why: 'transitions lead with "From <state>"; the handle tier matches it' },
	// A benchmark radar folds its comparison set into one band, which carries no single name.
	radar: { skip: '.radar-poly--target, .radar-poly--before', why: 'the reference polygon is named inside the lead series sentence' },
};

/** Every gallery slide of `component`, as `{ md, doc }` with the rendered section's DOM. */
function gallerySlides(component) {
	const src = fs.readFileSync(path.join(CHART_DIR, component, `${component}.gallery.md`), 'utf8');
	const fm = (src.match(/^---\n[\s\S]*?\n---\n/) || [''])[0];
	const out = [];
	for (const body of src.slice(fm.length).split(/\n---\n/)) {
		const cls = body.match(/<!--\s*_class:\s*([^>]*?)\s*-->/);
		if (!cls || cls[1].split(/\s+/)[0] !== component) continue;
		const html = engine.render(fm + body, 'indaco', { preview: true }).html;
		out.push({ md: body, cls: cls[1], doc: new JSDOM(html).window.document });
	}
	return out;
}

/** The text a screen reader can reach inside one chart body. */
function accessibleText(body, doc) {
	const parts = [];
	for (const svg of body.querySelectorAll('svg[role="img"]')) {
		if (svg.closest('[aria-hidden="true"]')) continue;
		for (const attr of ['aria-labelledby', 'aria-describedby']) {
			for (const id of (svg.getAttribute(attr) || '').split(/\s+/).filter(Boolean)) parts.push(doc.getElementById(id)?.textContent || '');
		}
		parts.push(svg.getAttribute('aria-label') || '');
	}
	const walk = (el) => {
		for (const k of el.childNodes) {
			if (k.nodeType === 3) parts.push(k.nodeValue);
			else if (k.nodeType === 1) {
				const tag = k.tagName.toLowerCase();
				if (k.getAttribute('aria-hidden') === 'true' || tag === 'svg' || tag === 'template' || k.hasAttribute('hidden')) continue;
				walk(k);
			}
		}
	};
	walk(body);
	return loose(parts.join(' '));
}

let projectDeckToSpeech;
test.before(async () => {
	({ projectDeckToSpeech } = await import('../../../lib/transformers/prose-projection.mjs'));
});

/** What Cadenza says for the slide: the chart narrator, else the rendered projection. */
function spoken(slide) {
	const section = slide.doc.querySelector('section');
	return narrateChart(slide.md) ?? projectDeckToSpeech([section])[0] ?? '';
}

const labelsOf = (root) => [...root.querySelectorAll('[data-label]')].filter((el) => !el.closest('template'));
const parts = (label) => label.split('·').map(loose).filter(Boolean);

for (const component of COMPONENTS) {
	const slides = gallerySlides(component);

	test(`${component}: the gallery has chart slides to check`, () => {
		assert.ok(slides.length > 0, `${component}.gallery.md has no \`_class: ${component}\` slide`);
	});

	test(`${component}: every chart graphic is named and described for a screen reader`, () => {
		for (const s of slides) {
			for (const svg of s.doc.querySelectorAll('.chart-body svg[role="img"]')) {
				if (svg.closest('[aria-hidden="true"]')) continue;
				const named = (svg.getAttribute('aria-labelledby') || svg.getAttribute('aria-label') || '').trim();
				assert.ok(named, `${s.cls}: a chart <svg role="img"> has no accessible name`);
				const desc = (svg.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).map((id) => s.doc.getElementById(id)?.textContent || '').join(' ');
				assert.ok(desc.trim() || svg.getAttribute('aria-label'), `${s.cls}: a chart <svg role="img"> has no description`);
			}
		}
	});

	test(`${component}: every labeled mark's name reaches the accessibility tree`, () => {
		for (const s of slides) {
			for (const body of s.doc.querySelectorAll('.chart-body')) {
				const at = accessibleText(body, s.doc);
				for (const el of labelsOf(body)) {
					for (const p of parts(el.getAttribute('data-label'))) {
						assert.ok(at.includes(p), `${s.cls}: "${el.getAttribute('data-label')}" is drawn but a screen reader cannot reach it`);
					}
				}
			}
		}
	});

	test(`${component}: Cadenza speaks every labeled mark's name`, () => {
		for (const s of slides) {
			const said = loose(spoken(s));
			assert.ok(said, `${s.cls}: the slide narrates nothing`);
			for (const el of labelsOf(s.doc)) {
				const label = el.getAttribute('data-label');
				// A cloud is read as a ranking, and its tail as a RANGE ("the rest follow, down to
				// contracts and residency"): the middle of the ranking is not said by name, by design.
				if (component === 'word-cloud' && el.getAttribute('data-rank') !== '1') continue;
				for (const p of parts(label)) assert.ok(said.includes(p), `${s.cls}: "${label}" is on the chart and never said`);
			}
		}
	});

	test(`${component}: every per-mark name leads a sentence, so the Guide can point at it`, () => {
		const rule = NOT_PER_MARK[component];
		for (const s of slides) {
			const sentences = spoken(s)
				.split(/(?<=[.;!?])\s+/)
				.map(loose)
				.filter(Boolean);
			for (const el of labelsOf(s.doc)) {
				if (rule && el.matches(rule.skip)) continue;
				const label = el.getAttribute('data-label');
				if (label.includes('·')) continue; // a compound crossing — see NOT_PER_MARK.heatmap
				const l = loose(label);
				if (l.length < 2) continue; // the Guide ignores a one-character label too
				const leads = sentences.some((se) => se === l || se.startsWith(`${l} `) || se.startsWith(`from ${l} `));
				assert.ok(leads, `${s.cls}: no sentence opens with "${label}" — the pointer cannot land on it`);
			}
		}
	});
}

test('NOT_PER_MARK carries no stale row — each names a component and skips a mark it draws', () => {
	for (const [component, rule] of Object.entries(NOT_PER_MARK)) {
		assert.ok(COMPONENTS.includes(component), `NOT_PER_MARK.${component}: no such chart`);
		const hits = gallerySlides(component).reduce((n, s) => n + labelsOf(s.doc).filter((el) => el.matches(rule.skip)).length, 0);
		assert.ok(hits > 0, `NOT_PER_MARK.${component} skips "${rule.skip}", which matches no labeled mark — delete the row`);
	}
});
