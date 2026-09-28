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
const { gestureOf } = require('../../../lib/core/gesture.js');
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

const SCENES = Object.fromEntries(loadAll().map((m) => [m.name, gestureOf(m)]));

test('every component declares a gesture, and the chart components name their own units', () => {
	// A component with no gesture has nothing a binding can name; a chart whose narrator binds and
	// whose manifest names no units of its own would bind sentences only the generic ones can find.
	const missing = Object.entries(SCENES).filter(([, g]) => !g).map(([n]) => n);
	assert.deepEqual(missing, [], 'these manifests declare no gesture (or an unknown archetype)');
	const own = loadAll().filter((m) => m.gesture?.units).map((m) => m.name);
	for (const n of ['bar', 'funnel', 'line', 'slope', 'heatmap', 'stacked-bar']) assert.ok(own.includes(n), `${n} names no units of its own`);
});

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
		if (!name) continue; // no gesture: the Guide reads this slide's words, as before binding
		const units = SCENES[name].units;
		// A binding written for another component is not this slide's: a chart narrator that reads a
		// prose slide as a board (kanban's docs, rendered as `content`) names units the slide's
		// component does not have, and the Guide reads its words instead (`scene()`, the same rule).
		if (!script.refs.some((r) => r.unit && Object.hasOwn(units, r.unit))) continue;
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

/**
 * THE STRUCTURE GATE (engineering/decisions/2026-09-27-guide-storyboards.md §5, §7). Archetypes are
 * assigned from what a component RENDERS, so the assignment is checked against the render: on
 * every slide of every component's own gallery, some unit of its gesture finds a drawn part; and
 * every unit a manifest declares for itself finds one on at least one of its gallery slides, so an
 * override cannot name a class that was renamed. The Guide can address every component, and no
 * manifest carries a selector that points at nothing.
 */
test('every component\'s gesture finds its structure on every gallery slide', () => {
	const problems = [];
	for (const m of loadAll()) {
		const g = SCENES[m.name];
		if (!g) continue; // the declaration test above reports it
		const dir = fs.readdirSync(path.join(ROOT, 'lib', 'components')).map((b) => path.join(ROOT, 'lib', 'components', b, m.name)).find((d) => fs.existsSync(d));
		const file = dir && path.join(dir, `${m.name}.gallery.md`);
		if (!file || !fs.existsSync(file)) {
			problems.push(`${m.name}: no gallery to check its structure against`);
			continue;
		}
		const src = fs.readFileSync(file, 'utf8');
		const fm = (src.match(/^---\n[\s\S]*?\n---\n/) || ['---\nmarp: true\n---\n'])[0];
		const slides = src.slice(fm.length).split(/\n---\n/).filter((s) => new RegExp(`_class:[^>]*\\b${m.name}\\b`).test(s));
		const found = new Set();
		slides.forEach((md, i) => {
			const root = new JSDOM(engine.render(fm + md, 'indaco', { preview: true }).html).window.document.querySelector('section');
			let any = false;
			for (const [unit, spec] of Object.entries(g.units)) {
				const n = [...root.querySelectorAll(anySelector(spec.select))].filter((el) => !el.closest('.chart-sr-only, template')).length;
				if (n) {
					any = true;
					found.add(unit);
				}
			}
			if (!any) problems.push(`${m.name}: gallery slide ${i + 1} renders none of the ${g.archetype} units (${Object.keys(g.units).join(', ')})`);
		});
		for (const unit of Object.keys(m.gesture.units || {})) if (!found.has(unit)) problems.push(`${m.name}: its own unit "${unit}" finds nothing on any gallery slide`);
	}
	assert.deepEqual(problems, []);
});
