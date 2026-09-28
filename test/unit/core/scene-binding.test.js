/**
 * THE SCENE BINDING GATE — every sentence a chart narrator binds names a part that is really drawn.
 *
 * The narrator binds each sentence to an act and a unit (`narrateChartScript`), and the component's
 * manifest says how that unit is found in its render (`scene.units`). Before this, the Guide found
 * the part by matching the sentence's words against the slide, and a matcher that found the wrong
 * part (a chart's hidden screen-reader table instead of its line) shipped silently. Here every
 * binding on every gallery slide of every chart with a scene is resolved against the real render,
 * with the same resolver the Studio and the exported player use (`lib/core/scene-resolve.mjs`):
 *
 *   1. it resolves to at least one drawn element (never the screen-reader table, never a template);
 *   2. what it resolved to carries the name the sentence said (its `data-label` or its text);
 *   3. it is a PART, not the whole figure: some other unit of its kind is left to recede.
 *
 * Over every narrated slide in every tracked deck, not only the galleries (`corpusSlides`).
 *
 * engineering/decisions/2026-09-27-delivery-styles-and-component-scenes.md §5.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const engine = require('../../../lib/engine');
const { narrateChartScript } = require('../../../lib/core/chart-narration.js');
const { loadAll } = require('../../../lib/components');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const loose = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Every narrated slide in every tracked deck: the galleries and component docs, `examples/`, and the
 * baseline decks. The first version read only the galleries, and a checker then found 27 bindings
 * that resolved to nothing on example decks (a slope row with a status pill, a portrait journey, an
 * unmarked roadmap bet), each of which would have left its slide dark.
 */
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

let resolveUnit;
let anySelector;
test.before(async () => {
	({ resolveUnit, anySelector } = await import('../../../lib/core/scene-resolve.mjs'));
});

const scened = loadAll().filter((m) => m.scene);

test('the chart components declare a scene', () => {
	// The components whose narrator binds its sentences. A chart added later with a narrator
	// and no scene would bind sentences nothing can resolve.
	const names = scened.map((m) => m.name);
	for (const n of ['bar', 'funnel', 'line', 'slope', 'heatmap', 'stacked-bar']) assert.ok(names.includes(n), `${n} has no scene`);
});

const SCENES = Object.fromEntries(scened.map((m) => [m.name, m.scene]));

test('every bound sentence in every deck names a drawn part, and leaves its peers to recede', () => {
	let bound = 0;
	const problems = [];
	for (const { file, md, fm } of corpusSlides()) {
		const script = narrateChartScript(md);
		if (!script?.refs.some((r) => r.unit)) continue;
		let html;
		try {
			html = engine.render(fm + md, 'indaco', { preview: true }).html;
		} catch {
			continue; // a deck that does not render is another gate's to report
		}
		const root = new JSDOM(html).window.document.querySelector('section');
		const name = root && [...root.classList].find((c) => SCENES[c]);
		if (!name) continue; // no scene: the Guide reads this slide's words, as before binding
		const units = SCENES[name].units;
		for (const ref of script.refs) {
			if (!ref.unit) continue;
			bound++;
			const said = script.text.slice(ref.start, ref.end).slice(0, 50);
			const where = `${file} · ${name} ${ref.unit} ${JSON.stringify(ref.id)} — "${said}"`;
			// 1. It resolves to a drawn part.
			const hit = resolveUnit(root, units, ref);
			if (!hit) {
				problems.push(`resolves to nothing: ${where}`);
				continue;
			}
			// 2. What it found carries the name the sentence said. A fallback shape (radar
			//    benchmark's envelope) stands for several units and names none.
			if (ref.label && !hit.fallback) {
				const names = [...hit.unit, ...hit.labels].flatMap((el) => [loose(el.getAttribute('data-label')), loose(el.textContent)]);
				if (!names.some((n) => n.includes(loose(ref.label)))) problems.push(`names the wrong part: ${where} said "${ref.label}"`);
			}
			// 3. It is a PART: some other unit of its kind is left to recede, unless it is the only one.
			if (!hit.peers.length && root.querySelectorAll(anySelector(units[ref.unit].select)).length > hit.unit.length) {
				problems.push(`recedes nothing: ${where}`);
			}
		}
	}
	assert.deepEqual(problems, [], `${problems.length} binding(s) do not land`);
	assert.ok(bound > 1000, `only ${bound} bound sentences found: the corpus scan is not reading the decks`);
});
