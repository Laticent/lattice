#!/usr/bin/env node
/**
 * tools/audit-svg-baselines.mjs — how far an SVG chart label drifts between WebKit
 * and Chromium, measured element for element on a real export.
 *
 * WHY THIS EXISTS. `dominant-baseline` on a `<text>` does NOT reach a positioned
 * `<tspan>` in WebKit: it resolves the tspan's own `auto` to `alphabetic` instead
 * of to the parent's computed value, so `y` becomes the glyph baseline and the
 * whole label paints roughly one font-size too high. Chromium inherits, so every
 * gate in this repo — all of which render through headless Chromium — is blind to
 * it (`engineering/gotchas/studio-playground.md`). Issue #2297 measured 107 of 256
 * gallery labels shifting more than 4px on a 1280x720 slide.
 *
 * WHAT IT MEASURES. One deck, rendered once by the real CLI, loaded in both
 * engines. For every `<text>` inside an `<svg>`, the vertical center of its box,
 * expressed in SLIDE px (the section's own 720-unit space, so the two engines'
 * page scales cancel). The reported number is WebKit minus Chromium: negative
 * means WebKit paints it higher.
 *
 * WHAT IT IS NOT. Not a gate, and not a CI arm — CI runs no WebKit, and adding one
 * is a CI-contract decision (#2297 "The gap this leaves open"). This is the
 * on-demand instrument that says whether the drift is back.
 *
 * Prerequisite: `npx playwright install webkit && npx playwright install-deps webkit`
 * — neither ships in the sandbox by default. Chromium is preinstalled.
 *
 * Usage
 *   node tools/audit-svg-baselines.mjs
 *   node tools/audit-svg-baselines.mjs --deck lib/components/chart/chart.gallery.md
 *   node tools/audit-svg-baselines.mjs --html .scratch/gal.html --tolerance 2
 *   node tools/audit-svg-baselines.mjs --json .scratch/drift.json
 *
 * Flags
 *   --deck <path>        deck to render (default lib/components/chart/chart.gallery.md)
 *   --theme <name>       theme for the render (default indaco)
 *   --html <path>        skip the render; measure this export instead
 *   --tolerance <px>     slide-px drift that counts as a failure (default 3)
 *   --json <path>        write the per-element table
 *
 * Exit 1 when any label drifts past the tolerance, so a fix can be proved.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium, webkit } = await import(join(ROOT, 'docs/node_modules/@playwright/test/index.mjs'));

function flag(name, fallback) {
	const i = process.argv.indexOf(`--${name}`);
	return i === -1 ? fallback : (process.argv[i + 1] ?? true);
}
const DECK = String(flag('deck', 'lib/components/chart/chart.gallery.md'));
const THEME = String(flag('theme', 'indaco'));
const TOLERANCE = Number(flag('tolerance', 3));
const JSON_OUT = flag('json', null);

let html = flag('html', null);
if (!html) {
	const out = join(ROOT, '.scratch/svg-baselines');
	mkdirSync(out, { recursive: true });
	html = join(out, 'deck.html');
	execFileSync('node', [join(ROOT, 'dist/lattice-emulator.js'), join(ROOT, DECK), html, THEME],
		{ cwd: ROOT, stdio: 'pipe' });
}

// Runs INSIDE the page. Every `<text>` under an `<svg>`, in document order, with
// the one number that survives a page-scale difference: the box center as a
// fraction of its slide, multiplied back up to the 720px slide height.
const probe = () => {
	const rows = [];
	for (const t of document.querySelectorAll('svg text')) {
		const sec = t.closest('section');
		const r = t.getBoundingClientRect();
		const sr = sec ? sec.getBoundingClientRect() : null;
		if (!sr?.height || !r.height) continue;
		const cs = getComputedStyle(t);
		const tsp = t.querySelector('tspan');
		rows.push({
			cls: t.getAttribute('class') || '',
			// The text itself keeps the two engines' element lists aligned: a label
			// the browser wrapped differently must not be compared to its neighbor.
			txt: (t.textContent || '').trim().slice(0, 40),
			baseline: cs.dominantBaseline || 'auto',
			// Where the baseline came from, which is the whole point of the audit:
			// an attribute on the <text>, a CSS rule, or nothing at all.
			src: t.hasAttribute('dominant-baseline') ? 'attr'
				: (cs.dominantBaseline && cs.dominantBaseline !== 'auto') ? 'css' : 'none',
			tspanDb: tsp ? (tsp.hasAttribute('dominant-baseline') ? 'attr'
				: (getComputedStyle(tsp).dominantBaseline || 'auto') !== 'auto' ? 'css' : 'none') : null,
			cy: ((r.top + r.height / 2) - sr.top) / sr.height * 720,
		});
	}
	return rows;
};

async function measure(engine) {
	const b = await engine.launch();
	const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
	await p.goto('file://' + html, { waitUntil: 'load' });
	// The export's own runtime lays slides out after load; give it a frame budget
	// rather than a fixed sleep, then one more settle for font swap-in.
	await p.evaluate(() => document.fonts?.ready);
	await p.waitForTimeout(1500);
	const rows = await p.evaluate(probe);
	await b.close();
	return rows;
}

const [cr, wk] = [await measure(chromium), await measure(webkit)];

if (cr.length !== wk.length) {
	console.error(`element counts differ: chromium ${cr.length}, webkit ${wk.length} — ` +
		'the two engines did not produce the same DOM, so no comparison is meaningful.');
	process.exit(2);
}

const rows = [];
let skipped = 0;
for (let i = 0; i < cr.length; i++) {
	if (cr[i].cls !== wk[i].cls || cr[i].txt !== wk[i].txt) { skipped++; continue; }
	rows.push({ ...cr[i], shift: wk[i].cy - cr[i].cy, wkTspanDb: wk[i].tspanDb });
}

// Group the way the defect groups: one row per (class, baseline, where it came
// from), because the fix is per emitter and an emitter owns a class.
const groups = new Map();
for (const r of rows) {
	const k = `${r.cls}\u0000${r.baseline}\u0000${r.src}`;
	if (!groups.has(k)) groups.set(k, []);
	groups.get(k).push(r.shift);
}
const table = [...groups.entries()].map(([k, shifts]) => {
	const [cls, baseline, src] = k.split('\u0000');
	const mean = shifts.reduce((a, b) => a + b, 0) / shifts.length;
	return { cls, baseline, src, n: shifts.length, mean, worst: shifts.reduce((a, b) => Math.abs(b) > Math.abs(a) ? b : a, 0) };
}).sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean));

const over = rows.filter((r) => Math.abs(r.shift) > TOLERANCE);
console.log(`\n${rows.length} <text> nodes compared (${skipped} skipped: the engines disagreed about the label)`);
console.log(`tolerance ${TOLERANCE}px of a 1280x720 slide — negative = WebKit paints it HIGHER\n`);
console.log('    n      mean     worst  baseline   from  class');
for (const g of table) {
	const mark = Math.abs(g.mean) > TOLERANCE ? '!' : ' ';
	console.log(`${mark} ${String(g.n).padStart(4)}  ${g.mean.toFixed(2).padStart(8)}  ${g.worst.toFixed(2).padStart(8)}  ${g.baseline.padEnd(10)} ${g.src.padEnd(5)} ${g.cls}`);
}
console.log(`\n${over.length} of ${rows.length} labels drift more than ${TOLERANCE}px.`);

if (JSON_OUT) {
	writeFileSync(JSON_OUT, JSON.stringify({ deck: DECK, theme: THEME, tolerance: TOLERANCE, table, rows }, null, 2));
	console.log(`wrote ${JSON_OUT}`);
}
process.exit(over.length ? 1 : 0);
