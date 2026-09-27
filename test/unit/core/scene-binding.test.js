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

const ROOT = path.join(__dirname, '..', '..', '..');
const loose = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

function gallerySlides(m) {
	const file = path.join(ROOT, 'lib', 'components', m.bucket, m.name, `${m.name}.gallery.md`);
	if (!fs.existsSync(file)) return [];
	const src = fs.readFileSync(file, 'utf8');
	const fm = src.match(/^---\n[\s\S]*?\n---\n/)[0];
	return src
		.slice(fm.length)
		.split(/\n---\n/)
		.filter((s) => new RegExp(`_class:[^>]*\\b${m.name}\\b`).test(s))
		.map((md) => ({ md, fm }));
}

let resolveUnit;
test.before(async () => {
	({ resolveUnit } = await import('../../../lib/core/scene-resolve.mjs'));
});

const scened = loadAll().filter((m) => m.scene);

test('the chart components declare a scene', () => {
	// The components whose narrator binds its sentences. A chart added later with a narrator
	// and no scene would bind sentences nothing can resolve.
	const names = scened.map((m) => m.name);
	for (const n of ['bar', 'funnel', 'line', 'slope', 'heatmap', 'stacked-bar']) assert.ok(names.includes(n), `${n} has no scene`);
});

for (const m of scened) {
	test(`${m.name}: every bound sentence names a drawn part`, () => {
		let bound = 0;
		const problems = [];
		for (const { md, fm } of gallerySlides(m)) {
			const script = narrateChartScript(md);
			if (!script) continue;
			const doc = new JSDOM(engine.render(fm + md, 'indaco', { preview: true }).html).window.document;
			const root = doc.querySelector('section') || doc.body;
			for (const ref of script.refs) {
				if (!ref.unit) continue;
				bound++;
				const said = script.text.slice(ref.start, ref.end).slice(0, 60);
				const hit = resolveUnit(root, m.scene.units, ref);
				if (!hit) {
					problems.push(`resolves to nothing: ${ref.unit} ${JSON.stringify(ref.id)} — "${said}"`);
					continue;
				}
				// A fallback shape (radar benchmark's envelope) stands for several units and names none.
				if (ref.label && !hit.fallback) {
					const names = [...hit.unit, ...hit.labels].flatMap((el) => [loose(el.getAttribute('data-label')), loose(el.textContent)]);
					if (!names.some((n) => n.includes(loose(ref.label)))) {
						problems.push(`names the wrong part: ${ref.unit} ${JSON.stringify(ref.id)} says "${ref.label}", found [${names.slice(0, 3).join(', ')}] — "${said}"`);
					}
				}
			}
		}
		assert.deepEqual(problems, [], `${m.name}: ${problems.length} binding(s) do not land`);
		assert.ok(bound > 0, `${m.name}: its gallery binds no sentence, so this cell proves nothing`);
	});
}
