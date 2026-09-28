/**
 * THE PROSE BINDING GATE, in its own file (and so its own process): it parses every slide of every
 * tracked deck, and jsdom keeps each parsed document alive until the process ends. Beside the chart
 * binding gate in one file, the pair peaked at 6.7 GB and a CI runner killed it (#2441).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { JSDOM } = require('jsdom');
const engine = require('../../../lib/engine');
const { loadAll } = require('../../../lib/components');
const { gestureOf } = require('../../../lib/core/gesture.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const loose = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const SCENES = Object.fromEntries(loadAll().map((m) => [m.name, gestureOf(m)]));

// One window's DOMParser: a document per slide, not a window per slide (~0.04 MB against ~0.9 MB).
const parser = new new JSDOM('').window.DOMParser();
const dom = (html) => parser.parseFromString(html, 'text/html');

/** Every slide of every tracked deck: the galleries and component docs, `examples/`, the baselines. */
function corpusSlides() {
	const files = execSync("git ls-files 'lib/components/**/*.md' 'examples/*.md' 'test/integration/baseline-decks/*.md'", { cwd: ROOT }).toString().trim().split('\n');
	const out = [];
	for (const f of files) {
		const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
		const head = src.match(/^---\n[\s\S]*?\n---\n/);
		const fm = head ? head[0] : '---\nmarp: true\n---\n';
		for (const md of (head ? src.slice(fm.length) : src).split(/\n---\n/)) out.push({ file: f, md, fm });
	}
	return out;
}

/**
 * THE PROSE BINDING GATE (storyboards step 3, engineering/decisions/2026-09-27-guide-storyboards.md
 * §7). The narration builder records which heading, paragraph, list item or table row each span of
 * a slide's narration came from (`bindingRefsFor`). Over every slide of every tracked deck, each
 * ref must be well formed, and must resolve, by the resolver the Guide uses, to an element whose
 * text is the text it says it came from. A ref that points at the wrong item is worse than none: the
 * builder leaves an ambiguous sentence unbound, and this is what holds it to that.
 */
test('every prose binding in every deck points back at the element it was spoken from', async () => {
	const { projectDeckToScript, speechText } = await import('../../../lib/transformers/prose-projection.mjs');
	const { STRUCTURE_UNITS, resolveUnit } = await import('../../../lib/core/scene-resolve.mjs');
	const problems = [];
	let bound = 0;
	for (const { file, md, fm } of corpusSlides()) {
		let doc;
		try {
			doc = dom(engine.render(fm + md, 'indaco', { preview: true }).html);
		} catch {
			continue; // a deck that does not render is another gate's to report
		}
		for (const section of doc.querySelectorAll('section')) {
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
		}
	}
	assert.deepEqual(problems, [], `${problems.length} prose binding(s) do not land`);
	assert.ok(bound > 2000, `only ${bound} prose bindings found: the corpus scan is not reading the decks`);
});

