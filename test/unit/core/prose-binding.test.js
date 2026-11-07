/**
 * THE PROSE BINDING GATE, in its own file (and so its own process): it parses every slide of every
 * tracked deck. Beside the chart binding gate in one file, the pair peaked at 6.7 GB and a CI runner
 * killed it (#2441).
 *
 * A jsdom window keeps every document its DOMParser makes while it lives, so one window for the
 * whole corpus held ~2.0 GB live by the last deck, half a default heap; under a 1.5 GB limit the
 * file dies out of heap, which the dot reporter prints as a bare 'test failed' (#3059's followup).
 * Each deck gets its own window, closed when its test ends, and its own test, so a failure names
 * its deck (engineering/gotchas/ci.md, "A jsdom walk over many documents keeps them all").
 */
const { test, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { JSDOM } = require('jsdom');
const engine = require('../../../lib/engine');
const { loadAll } = require('../../../lib/components');
const { gestureOf } = require('../../../lib/core/gesture.js');
const { componentCorpusRoots } = require('../../../lib/packages/fs.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const loose = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const SCENES = Object.fromEntries(loadAll().map((m) => [m.name, gestureOf(m)]));

/** Every tracked deck, as its file and its slides: the galleries and component docs, `examples/`, the baselines. */
function corpusDecks() {
	// Every component root, the plugins' kinds (the chart kinds) included.
	const roots = componentCorpusRoots().map((r) => `${path.relative(ROOT, r).split(path.sep).join('/')}/**/*.md`);
	// Arguments, not a shell string: no path reaches a shell.
	const files = execFileSync('git', ['ls-files', ...roots, 'examples/*.md', 'test/integration/baseline-decks/*.md'], { cwd: ROOT }).toString().trim().split('\n');
	return files.map((file) => {
		const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
		const head = src.match(/^---\n[\s\S]*?\n---\n/);
		const fm = head ? head[0] : '---\nmarp: true\n---\n';
		return { file, fm, slides: (head ? src.slice(fm.length) : src).split(/\n---\n/) };
	});
}

let projectDeckToScript, speechText, STRUCTURE_UNITS, resolveUnit;
before(async () => {
	({ projectDeckToScript, speechText } = await import('../../../lib/transformers/prose-projection.mjs'));
	({ STRUCTURE_UNITS, resolveUnit } = await import('../../../lib/core/scene-resolve.mjs'));
});

// A dropped jsdom window stays alive until the event loop takes a macrotask turn, and node:test
// runs synchronous tests back to back without one, so without this every deck's window and
// documents stay until the walk ends: 858 MB live by the 150th deck, against 98 MB with it.
afterEach(() => new Promise((resolve) => setImmediate(resolve)));

let bound = 0;
let walked = 0;
const decks = corpusDecks();

/**
 * THE PROSE BINDING GATE (storyboards step 3, engineering/decisions/2026-09-27-guide-storyboards.md
 * §7). The narration builder records which heading, paragraph, list item or table row each span of
 * a slide's narration came from (`bindingRefsFor`). Over every slide of every tracked deck, each
 * ref must be well formed, and must resolve, by the resolver the Guide uses, to an element whose
 * text is the text it says it came from. A ref that points at the wrong item is worse than none: the
 * builder leaves an ambiguous sentence unbound, and this is what holds it to that.
 */
for (const { file, fm, slides } of decks) {
	test(`every prose binding in ${file} points back at the element it was spoken from`, () => {
		// One window per deck, its DOMParser making a document per slide (~0.04 MB against ~0.9 MB for
		// a window per slide), closed with the deck so its documents can go.
		const { window } = new JSDOM('');
		const parser = new window.DOMParser();
		const problems = [];
		try {
			for (const md of slides) {
				let doc;
				try {
					doc = parser.parseFromString(engine.render(fm + md, 'indaco', { preview: true }).html, 'text/html');
				} catch {
					continue; // a deck that does not render is another gate's to report
				}
				for (const section of doc.querySelectorAll('section')) problems.push(...sectionProblems(file, section));
			}
		} finally {
			window.close();
		}
		walked++;
		assert.deepEqual(problems, [], `${problems.length} prose binding(s) in ${file} do not land`);
	});
}

test('the prose binding walk read every deck and found its bindings', () => {
	// Here, not in `corpusDecks`: a throw while the file loads is a bare 'test failed' under the dot reporter.
	assert.ok(decks.some((d) => d.file === 'lib/plugins/chart-family/kinds/gantt/gantt.gallery.md'), 'the corpus walk misses the plugin kinds (gantt)');
	assert.equal(walked, decks.length, `${decks.length - walked} deck(s) never finished the walk`);
	assert.ok(bound > 2000, `only ${bound} prose bindings found: the corpus scan is not reading the decks`);
});

/** The problems with one rendered section's prose bindings, each naming the deck and the span. */
function sectionProblems(file, section) {
	const problems = [];
	const [{ text, refs }] = projectDeckToScript([section]);
	// Resolved the way the Guide resolves it: through the section's own component's gesture
	// (`sceneOf`, merged over its archetype and the structure units), not a generic table.
	const component = [...section.classList].find((c) => SCENES[c]);
	const units = component ? SCENES[component].units : STRUCTURE_UNITS;
	let last = 0;
	for (const ref of refs) {
		bound++;
		const where = `${file} · ${component ?? '(none)'} ${ref.unit}#${ref.id.i} "${text.slice(ref.start, ref.end).slice(0, 50)}"`;
		if (!(ref.start >= last && ref.end > ref.start && ref.end <= text.length)) problems.push(`malformed span: ${where}`);
		last = ref.end;
		if (!Object.hasOwn(units, ref.unit)) {
			problems.push(`names a unit its component's gesture lacks: ${where}`);
			continue;
		}
		const hit = resolveUnit(section, units, ref);
		if (!hit) {
			problems.push(`resolves to nothing: ${where}`);
			continue;
		}
		// The span is the element in its own words. The builder adds words ("key — header:
		// value", a state word, "and") and drops some (a table value that ends in a colon), so
		// the test is the element's FIRST word plus at least half of its words: an item bound to
		// its neighbor shares few of either.
		// Its words as the narration reads them (`speechText` skips KaTeX source and aria-hidden
		// initials). The builder adds words ("key — header: value", a state word, "and") and drops
		// some (a table value that ends in a colon), so the span holds MOST of the element's words,
		// always including its first:
		//   - more than three content words: the first, and at least half of them;
		//   - fewer (an item "Q1", a formula, a three-word card): the first token and two thirds of
		//     all of them, so "Q1" can never pass for "Q2".
		const said = speechText(hit.unit[0]).toLowerCase();
		const span = loose(text.slice(ref.start, ref.end));
		const tokens = said.match(/[a-z0-9]+/g) || [];
		const content = tokens.filter((w) => w.length >= 3);
		const [pool, need] = content.length > 3 ? [content, 0.5] : [tokens, 2 / 3];
		const share = pool.filter((w) => span.includes(w)).length / (pool.length || 1);
		const ok = !pool.length || (span.includes(pool[0]) && share >= need - 1e-9);
		if (tokens.length && !ok) problems.push(`points at the wrong element: ${where} → "${hit.unit[0].textContent.trim().slice(0, 50)}"`);
	}
	return problems;
}
