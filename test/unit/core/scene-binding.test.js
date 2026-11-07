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
 * Over every narrated slide in every tracked deck, not only the galleries (`corpusDecks`).
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
const { componentDir, loadAll } = require('../../../lib/components');
const { ARCHETYPES, gestureOf } = require('../../../lib/core/gesture.js');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');

// A WINDOW PER DECK, AND A TURN BETWEEN DECKS. A `new JSDOM` per slide kept ~0.9 MB alive even after
// `window.close()`, and the file peaked at 6.7 GB, which a CI runner killed (#2441). One window's
// `DOMParser` for the whole file was the fix then, but a window keeps every document it parsed and
// then queried: dom-selector's Finder adds 9 listeners per document to the window and never removes
// them. So each deck (each gallery, in the structure gate) gets its own window's `DOMParser`, closed
// with it, and the walk yields a macrotask turn after each, without which a closed window is not
// freed either (engineering/gotchas/ci.md, "A jsdom walk over many documents keeps them all").
async function eachWithParser(groups, fn) {
	for (const group of groups) {
		const { window } = new JSDOM('');
		const parser = new window.DOMParser();
		try {
			fn(group, (html) => parser.parseFromString(html, 'text/html'));
		} finally {
			window.close();
		}
		await new Promise((resolve) => setImmediate(resolve));
	}
}
const loose = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Every narrated slide in every tracked deck: the galleries and component docs, `examples/`, and the
 * baseline decks. The first version read only the galleries, and a checker then found 27 bindings
 * that resolved to nothing on example decks (a slope row with a status pill, a portrait journey, an
 * unmarked roadmap bet), each of which would have left its slide dark.
 */
function corpusDecks() {
	const files = execSync("git ls-files 'lib/components/**/*.md' 'lib/plugins/*/kinds/**/*.md' 'examples/*.md' 'test/integration/baseline-decks/*.md'", { cwd: ROOT }).toString().trim().split('\n');
	return files.map((file) => {
		const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
		const head = src.match(/^---\n[\s\S]*?\n---\n/);
		const fm = head ? head[0] : '---\nmarp: true\n---\n';
		return { file, fm, slides: (head ? src.slice(fm.length) : src).split(/\n---\n/) };
	});
}

let resolveUnit;
let anySelector;
test.before(async () => {
	({ resolveUnit, anySelector } = await import('../../../lib/core/scene-resolve.mjs'));
});

const manifests = Object.fromEntries(loadAll().map((m) => [m.name, m]));
const SCENES = Object.fromEntries(loadAll().map((m) => [m.name, gestureOf(m)]));

test('every component declares a gesture, and the chart components name their own units', () => {
	// A component with no gesture has nothing a binding can name; a chart whose narrator binds and
	// whose manifest names no units of its own would bind sentences only the generic ones can find.
	const missing = Object.entries(SCENES).filter(([, g]) => !g).map(([n]) => n);
	assert.deepEqual(missing, [], 'these manifests declare no gesture (or an unknown archetype)');
	const own = loadAll().filter((m) => m.gesture?.units).map((m) => m.name);
	for (const n of ['bar', 'funnel', 'line', 'slope', 'heatmap', 'stacked-bar']) assert.ok(own.includes(n), `${n} names no units of its own`);
});

test('every bound sentence in every deck names a drawn part, and leaves its peers to recede', async () => {
	const boundBy = {};
	let unrendered = 0;
	const problems = [];
	await eachWithParser(corpusDecks(), ({ file, fm, slides }, dom) => {
		for (const md of slides) {
			const script = narrateChartScript(md);
			if (!script?.refs.some((r) => r.unit)) continue;
			let html;
			try {
				html = engine.render(fm + md, 'indaco', { preview: true }).html;
			} catch {
				unrendered++;
				continue; // a deck that does not render is another gate's to report
			}
			const root = dom(html).querySelector('section');
			const name = root && [...root.classList].find((c) => SCENES[c]);
			if (!name) continue; // no gesture: the Guide reads this slide's words, as before binding
			const units = SCENES[name].units;
			// A binding written for another component is not this slide's: a chart narrator that reads a
			// prose slide as a board (kanban's docs, rendered as `content`) names units the slide's
			// component does not have, and the Guide reads its words instead (`scene()`, the same rule).
			// Only for a component that names no units of its own: a chart whose manifest does, and whose
			// narrator's units have all drifted from it, is reported below rather than skipped.
			if (!manifests[name]?.gesture?.units && !script.refs.some((r) => r.unit && Object.hasOwn(units, r.unit))) continue;
			for (const ref of script.refs) {
				if (!ref.unit) continue;
				boundBy[ref.unit] = (boundBy[ref.unit] ?? 0) + 1;
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
	});
	assert.deepEqual(problems, [], `${problems.length} binding(s) do not land`);
	// A slide that throws is skipped without a word, and its bindings go unchecked.
	assert.equal(unrendered, 0, `${unrendered} narrated slide(s) did not render, so their bindings were never checked`);
	// About 95% of each unit's count on 2026-11-07 (4,719 in all). One floor of 1,000 for the total let
	// a narrator that stopped binding most units pass.
	const floors = { band: 73, bet: 14, card: 95, category: 66, cell: 470, column: 95, entity: 73, event: 180, horizon: 5, lane: 76, layer: 57, mark: 818, measure: 68, point: 735, risk: 92, row: 249, section: 89, sector: 7, series: 318, stage: 151, state: 266, task: 444, word: 31 };
	for (const [unit, floor] of Object.entries(floors)) {
		assert.ok((boundBy[unit] ?? 0) >= floor, `only ${boundBy[unit] ?? 0} ${unit} bindings found, against a floor of ${floor}: the narrator stopped binding ${unit}s, or the walk stopped reading the decks`);
	}
});

test('a card named with snake_case code narrates with its underscores and binds to its drawn card', (t) => {
	// Narration used to strip every `_`, so "Retire `csv_v1` export" read "Retire csvv1 export" and named no card (#2960).
	const fm = '---\nmarp: true\n---\n';
	const md = [
		'<!-- _class: kanban -->',
		'',
		'## Cards carry code.',
		'',
		'- Backlog',
		'  - Retire `csv_v1` export',
		'  - Wire the `ingest` hook',
		'- Doing',
		'  - Dedupe on `source_id`',
		'  - Plain _stress_ and __strong__ words',
		'  - Ship ___now___',
		'  - _Wire the `hook_x` fast_',
		'',
	].join('\n');
	const script = narrateChartScript(md);
	assert.match(script.text, /csv_v1/, 'the narration keeps the underscore of an inline code name');
	assert.match(script.text, /source_id/);
	assert.doesNotMatch(script.text, /csvv1|sourceid/);
	assert.match(script.text, /Plain stress and strong words/, 'emphasis markers still go');
	assert.match(script.text, /Ship now\./, 'triple-underscore emphasis goes');
	assert.match(script.text, /Wire the hook_x fast\./, 'emphasis wrapping a code span goes, the code keeps its underscore');
	const { window } = new JSDOM('');
	t.after(() => window.close());
	const root = new window.DOMParser().parseFromString(engine.render(fm + md, 'indaco', { preview: true }).html, 'text/html').querySelector('section');
	const { units } = SCENES.kanban;
	const refs = script.refs.filter((r) => r.unit && /csv_v1|source_id/.test(r.label || ''));
	assert.ok(refs.length >= 2, `expected a binding for each snake_case card, got ${refs.length}`);
	for (const ref of refs) assert.ok(resolveUnit(root, units, ref), `"${ref.label}" resolves to a drawn card`);
});

/**
 * THE STRUCTURE GATE (engineering/decisions/2026-09-27-guide-storyboards.md §5, §7). Archetypes are
 * assigned from what a component RENDERS, so the assignment is checked against the render: on
 * every slide of every component's own gallery, some unit of its gesture finds a drawn part; and
 * every unit a manifest declares for itself finds one on at least one of its gallery slides, so an
 * override cannot name a class that was renamed. The Guide can address every component, and no
 * manifest carries a selector that points at nothing.
 */
test('every component\'s gesture finds its structure on every gallery slide', async () => {
	const problems = [];
	await eachWithParser(loadAll(), (m, dom) => {
		const g = SCENES[m.name];
		if (!g) return; // the declaration test above reports it
		const dir = componentDir(m);
		const file = dir && path.join(dir, `${m.name}.gallery.md`);
		if (!file || !fs.existsSync(file)) {
			problems.push(`${m.name}: no gallery to check its structure against`);
			return;
		}
		const src = fs.readFileSync(file, 'utf8');
		const fm = (src.match(/^---\n[\s\S]*?\n---\n/) || ['---\nmarp: true\n---\n'])[0];
		const slides = src.slice(fm.length).split(/\n---\n/).filter((s) => new RegExp(`_class:[^>]*\\b${m.name}\\b`).test(s));
		const found = new Set();
		slides.forEach((md, i) => {
			const root = dom(engine.render(fm + md, 'indaco', { preview: true }).html).querySelector('section');
			// Each slide draws its archetype's PRIMARY unit (its first) or one of the component's own
			// units (a variant may draw only its own: roadmap's horizons, statute-stack lane's rows).
			// "Any unit" was too weak: every slide has a heading, so every component passed as a
			// statement (checker, 2026-09-28). `statement` still asks only for a heading, since that
			// is all a statement is; it is the one archetype this cannot tell apart.
			const primary = Object.keys(ARCHETYPES[g.archetype].units)[0];
			const own = Object.keys(m.gesture.units || {});
			let ok = false;
			for (const [unit, spec] of Object.entries(g.units)) {
				const n = [...root.querySelectorAll(anySelector(spec.select))].filter((el) => !el.closest('.chart-sr-only, template')).length;
				if (!n) continue;
				found.add(unit);
				if (unit === primary || own.includes(unit)) ok = true;
			}
			if (!ok) problems.push(`${m.name}: gallery slide ${i + 1} draws neither its ${g.archetype} primary unit "${primary}" nor a unit of its own (${own.join(', ') || 'none'})`);
		});
		for (const unit of Object.keys(m.gesture.units || {})) if (!found.has(unit)) problems.push(`${m.name}: its own unit "${unit}" finds nothing on any gallery slide`);
	});
	assert.deepEqual(problems, []);
});

test('the manifest schema names exactly the archetypes the defaults define', () => {
	const schema = require('../../../lib/components/manifest.schema.json');
	const { ARCHETYPE_NAMES } = require('../../../lib/core/gesture.js');
	assert.deepEqual([...schema.properties.gesture.properties.archetype.enum].sort(), [...ARCHETYPE_NAMES].sort());
});

test('the structure units the narration builder binds by are the archetypes\' own', async () => {
	const { STRUCTURE_UNITS } = await import('../../../lib/core/scene-resolve.mjs');
	for (const [archetype, { units }] of Object.entries(ARCHETYPES)) {
		if (archetype.startsWith('$')) continue;
		for (const [name, spec] of Object.entries(STRUCTURE_UNITS)) {
			if (units[name]) assert.deepEqual(units[name].select, spec.select, `${archetype}.${name} and STRUCTURE_UNITS.${name} disagree`);
		}
	}
});
