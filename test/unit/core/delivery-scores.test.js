/**
 * THE DELIVERY SCORES — what each delivery does with each chart, pinned as golden files.
 *
 * A score is the executed script for one slide under one delivery (`lib/core/delivery-score.mjs`):
 * every bound sentence, its act, the unit it names, and what the delivery's style asks. One golden
 * file per chart component, holding all three deliveries side by side, from the first slide of the
 * component's gallery.
 *
 * WHY. Three rounds of Guide fixes each broke a delivery or a chart the fix was not about, and
 * nothing caught it before a person played the deck. With the scores committed, every such change
 * is a diff a reviewer sees: a change to one delivery's style file moves only that delivery's
 * column, a change to one component's scene moves only that component's file.
 *
 * Re-bless deliberately, in the same PR as the change it records:
 *   UPDATE_DELIVERY_SCORES=1 node --test test/unit/core/delivery-scores.test.js
 *
 * engineering/decisions/2026-09-27-delivery-styles-and-component-scenes.md §8.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { narrateChartScript } = require('../../../lib/core/chart-narration.js');
const { loadAll } = require('../../../lib/components');
const { gestureOf } = require('../../../lib/core/gesture.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const GOLDEN_DIR = path.join(ROOT, 'test', 'fixtures', 'delivery-scores');
const DELIVERIES = ['restrained', 'expressive', 'somber'];
const bless = process.env.UPDATE_DELIVERY_SCORES === '1';

function firstBoundSlide(m) {
	// Found by folder: a third of the manifests declare no `bucket`.
	const buckets = path.join(ROOT, 'lib', 'components');
	const file = fs.readdirSync(buckets).map((b) => path.join(buckets, b, m.name, `${m.name}.gallery.md`)).find((f) => fs.existsSync(f));
	if (!file) return null;
	const src = fs.readFileSync(file, 'utf8');
	const fm = src.match(/^---\n[\s\S]*?\n---\n/)[0];
	for (const md of src.slice(fm.length).split(/\n---\n/)) {
		if (!new RegExp(`_class:[^>]*\\b${m.name}\\b`).test(md)) continue;
		const script = narrateChartScript(md);
		if (script?.refs.some((r) => r.unit)) return script;
	}
	return null;
}

let score;
test.before(async () => {
	({ score } = await import('../../../lib/core/delivery-score.mjs'));
});

// Every component whose own gallery binds a sentence is scored. One that binds nothing yet (a
// list, a statement: step 3 of the storyboards note binds them) must not carry a golden, so a
// narrator that stops binding cannot leave a stale score passing.
for (const m of loadAll()) {
	test(`${m.name}: each delivery plays its gallery slide as scored`, () => {
		const script = firstBoundSlide(m);
		const file = path.join(GOLDEN_DIR, `${m.name}.json`);
		if (!script) {
			assert.ok(!fs.existsSync(file), `${m.name}: a golden score exists, but no gallery slide binds a sentence`);
			return;
		}
		const actual = Object.fromEntries(DELIVERIES.map((d) => [d, score(script, gestureOf(m), d)]));
		if (bless) {
			fs.mkdirSync(GOLDEN_DIR, { recursive: true });
			fs.writeFileSync(file, `${JSON.stringify(actual, null, '\t')}\n`);
			return;
		}
		assert.ok(fs.existsSync(file), `${m.name}: no golden score — bless with UPDATE_DELIVERY_SCORES=1`);
		assert.deepEqual(actual, JSON.parse(fs.readFileSync(file, 'utf8')), `${m.name}: the score changed — re-bless only if the change is intended`);
	});
}

// THE ARCHETYPE SCORES (storyboards step 4, engineering/decisions/2026-09-27-guide-storyboards.md
// §9): one golden per archetype, all three deliveries side by side, so the storyboard of every
// structure is pinned, prose included. Each is played by the archetype's first component (by name)
// whose gallery binds a slide: through its chart narrator when it has one, else through the
// narration builder's bindings over the rendered slide (`bindingRefsFor`), which is what Present
// and the export play on a prose, list or table slide.
const { ARCHETYPE_NAMES } = require('../../../lib/core/gesture.js');
const engine = require('../../../lib/engine');
const { JSDOM } = require('jsdom');
const parser = new new JSDOM('').window.DOMParser();

function galleryOf(m) {
	const buckets = path.join(ROOT, 'lib', 'components');
	const file = fs.readdirSync(buckets).map((b) => path.join(buckets, b, m.name, `${m.name}.gallery.md`)).find((f) => fs.existsSync(f));
	return file ? fs.readFileSync(file, 'utf8') : null;
}

async function firstProseBoundSlide(m) {
	const { projectDeckToScript } = await import('../../../lib/transformers/prose-projection.mjs');
	const src = galleryOf(m);
	if (!src) return null;
	const fm = src.match(/^---\n[\s\S]*?\n---\n/)[0];
	for (const md of src.slice(fm.length).split(/\n---\n/)) {
		if (!new RegExp(`_class:[^>]*\\b${m.name}\\b`).test(md)) continue;
		const section = parser.parseFromString(engine.render(fm + md, 'indaco', { preview: true }).html, 'text/html').querySelector('section');
		if (!section) continue;
		const [script] = projectDeckToScript([section]);
		// A slide worth pinning names at least two units beyond its heading.
		if (script?.refs.filter((r) => r.unit !== 'heading').length >= 2) return script;
	}
	return null;
}

for (const archetype of ARCHETYPE_NAMES) {
	test(`archetype ${archetype}: each delivery plays its storyboard as scored`, async () => {
		// A HOST (`columns`, `rows`) never stands for an archetype: its slide is its panes', so it
		// would play whatever its gallery's panes happen to hold rather than the archetype's own shape.
		const members = loadAll()
			.filter((m) => m.gesture?.archetype === archetype && !m.hosts)
			.sort((a, b) => a.name.localeCompare(b.name));
		let played = null;
		for (const m of members) {
			const script = firstBoundSlide(m) ?? (await firstProseBoundSlide(m));
			if (script) {
				played = { m, script };
				break;
			}
		}
		assert.ok(played, `archetype ${archetype}: no component's gallery binds a slide`);
		const { m, script } = played;
		const actual = { component: m.name, ...Object.fromEntries(DELIVERIES.map((d) => [d, score(script, gestureOf(m), d)])) };
		const file = path.join(GOLDEN_DIR, 'archetypes', `${archetype}.json`);
		if (bless) {
			fs.mkdirSync(path.dirname(file), { recursive: true });
			fs.writeFileSync(file, `${JSON.stringify(actual, null, '\t')}\n`);
			return;
		}
		assert.ok(fs.existsSync(file), `archetype ${archetype}: no golden score — bless with UPDATE_DELIVERY_SCORES=1`);
		assert.deepEqual(actual, JSON.parse(fs.readFileSync(file, 'utf8')), `archetype ${archetype}: the score changed — re-bless only if the change is intended`);
	});
}

test('the deliveries are three characters, not three loudness levels', async () => {
	// Measured on the line gallery slide: the act that tells them apart is a `visit`. Restrained
	// focuses it and draws nothing; expressive focuses it and taps it with the cursor on; somber
	// does nothing unless it is the key beat.
	const line = loadAll().find((c) => c.name === 'line');
	const script = firstBoundSlide(line);
	const rows = Object.fromEntries(DELIVERIES.map((d) => [d, score(script, gestureOf(line), d)]));
	const visit = rows.restrained.findIndex((r) => r.act === 'visit' && !r.key);
	assert.deepEqual([rows.restrained[visit].focus, rows.restrained[visit].ink, rows.restrained[visit].cursor], ['unit', null, 'hide']);
	assert.deepEqual([rows.expressive[visit].focus, rows.expressive[visit].ink, rows.expressive[visit].cursor], ['unit', 'tap unit quiet', 'point']);
	assert.ok(['none', 'hold'].includes(rows.somber[visit].focus), 'somber does not walk');
	// Somber gestures exactly once: on the key beat.
	assert.equal(rows.somber.filter((r) => r.focus === 'unit').length, 1);
	// Restrained never goes dark on a sentence that names a part.
	assert.ok(rows.restrained.filter((r) => r.unit).every((r) => ['unit', 'group', 'hold'].includes(r.focus)));
});
