// Fumetto spike harness: size, parity and speed of `place.mjs` against Floating UI, in a real browser.
//
//   node engineering/decisions/2026-11-16-fumetto-popover-library/spike/harness.mjs [--seed N] [--cases N] [--engine chromium|webkit|firefox]
//
// 1. SIZE   esbuild-minifies both engines with the SAME feature set (place + flip + shift + size +
//           arrow + offset + an auto-update tracker) and reports raw and gzip bytes.
// 2. PARITY runs both on the same seeded random anchors, sides, alignments and card sizes inside a
//           1280×720 page in Chromium or WebKit and counts cases where side or position differs by more than 0.5px.
// 3. SPEED  times N placements of each, back to back, on the same inputs (a measurement, printed,
//           never asserted — HARD RULE #32).
// Floating UI resolves from the docs workspace, where it is already a dependency.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
const docs = path.join(repo, 'docs');
const arg = (k, d) => {
	const i = process.argv.indexOf(k);
	return i > 0 ? Number(process.argv[i + 1]) : d;
};
const SEED = arg('--seed', 20261116);
const CASES = arg('--cases', 5000);
console.log(`seed ${SEED}, cases ${CASES}`);

const tmp = mkdtempSync(path.join(tmpdir(), 'fumetto-'));
const esbuild = (entry, out) =>
	execFileSync(
		path.join(docs, 'node_modules/.bin/esbuild'),
		[entry, '--bundle', '--minify', '--format=iife', `--outfile=${out}`, '--log-level=error'],
		{ cwd: docs },
	);

// ── 1. SIZE ─────────────────────────────────────────────────────────────────
const fuEntry = path.join(docs, '.fumetto-spike-fu.js');
writeFileSync(
	fuEntry,
	"import {computePosition,flip,shift,offset,size,arrow,autoUpdate} from '@floating-ui/dom';\n" +
		'window.FU={computePosition,flip,shift,offset,size,arrow,autoUpdate};\n',
);
const fuOut = path.join(tmp, 'fu.js');
try {
	esbuild(fuEntry, fuOut);
} finally {
	execFileSync('rm', ['-f', fuEntry]);
}
const fmEntry = path.join(tmp, 'fm-entry.js');
writeFileSync(fmEntry, `import {place,measure,track} from ${JSON.stringify(path.join(here, 'place.mjs'))};\nwindow.FM={place,measure,track};\n`);
const fmOut = path.join(tmp, 'fm.js');
esbuild(fmEntry, fmOut);
const fu = readFileSync(fuOut);
const fm = readFileSync(fmOut);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log('\nSIZE (minified · gzip -9)');
console.log(`  Floating UI  ${kb(fu.length)} · ${kb(gzipSync(fu, { level: 9 }).length)}`);
console.log(`  Fumetto      ${kb(fm.length)} · ${kb(gzipSync(fm, { level: 9 }).length)}`);

// ── 2 + 3. PARITY and SPEED, in Chromium ──────────────────────────────────────
// Playwright resolves from the docs workspace too (the e2e suite's copy). `--engine webkit` runs the
// same cases in WebKit; install it once with `cd docs && npx playwright install-deps webkit && npx playwright install webkit`.
const ENGINE = process.argv.includes('--engine') ? process.argv[process.argv.indexOf('--engine') + 1] : 'chromium';
const pw = createRequire(path.join(docs, 'package.json'))('playwright');
// The docs copy of Playwright pins a different Chromium build than the sandbox ships, so name that binary.
const browser =
	ENGINE === 'chromium' ? await pw.chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium' }) : await pw[ENGINE].launch();
console.log(`engine ${ENGINE} ${browser.version()}`);
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.setContent('<!doctype html><body style="margin:0"><div id="card" style="position:fixed;left:0;top:0"></div></body>');
await page.addScriptTag({ content: fu.toString() });
await page.addScriptTag({ content: fm.toString() });

const result = await page.evaluate(
	async ({ SEED, CASES }) => {
		// mulberry32: a seeded generator, so a failure replays from the printed seed.
		let s = SEED >>> 0;
		const rnd = () => {
			s = (s + 0x6d2b79f5) >>> 0;
			let t = s;
			t = Math.imul(t ^ (t >>> 15), t | 1);
			t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
		const SIDES = ['top', 'bottom', 'left', 'right'];
		const ALIGNS = ['start', 'center', 'end'];
		const card = document.getElementById('card');
		const cases = [];
		for (let i = 0; i < CASES; i++) {
			const point = rnd() < 0.5; // a cursor point (chart reveal) or a real box (a button)
			const w = point ? 0 : 8 + rnd() * 160;
			const h = point ? 0 : 8 + rnd() * 80;
			cases.push({
				a: { x: rnd() * (1280 - w), y: rnd() * (720 - h), width: w, height: h },
				card: { width: 120 + Math.round(rnd() * 240), height: 60 + Math.round(rnd() * 200) },
				side: SIDES[Math.floor(rnd() * 4)],
				align: ALIGNS[Math.floor(rnd() * 3)],
				gap: Math.round(rnd() * 16),
				pad: 8,
			});
		}
		const bounds = { x: 0, y: 0, width: 1280, height: 720 };
		const { computePosition, flip, shift, offset } = window.FU;
		const fuPlace = async (c) => {
			card.style.width = `${c.card.width}px`;
			card.style.height = `${c.card.height}px`;
			const ref = { getBoundingClientRect: () => ({ ...c.a, top: c.a.y, left: c.a.x, right: c.a.x + c.a.width, bottom: c.a.y + c.a.height }) };
			const placement = c.align === 'center' ? c.side : `${c.side}-${c.align}`;
			const r = await computePosition(ref, card, {
				strategy: 'fixed',
				placement,
				middleware: [offset(c.gap), flip({ padding: c.pad, crossAxis: false, flipAlignment: false, fallbackStrategy: 'bestFit' }), shift({ padding: c.pad })],
			});
			return { x: r.x, y: r.y, side: r.placement.split('-')[0] };
		};
		const fmPlace = (c) => window.FM.place(c.a, c.card, bounds, { side: c.side, align: c.align, gap: c.gap, pad: c.pad });

		// PARITY
		const diffs = [];
		for (const c of cases) {
			const f = await fuPlace(c);
			const m = fmPlace(c);
			if (f.side !== m.side || Math.abs(f.x - m.x) > 0.5 || Math.abs(f.y - m.y) > 0.5) diffs.push({ c, f, m: { x: m.x, y: m.y, side: m.side } });
		}

		// SPEED — Floating UI awaited one by one, as a caller must before showing the card.
		let t0 = performance.now();
		for (const c of cases) await fuPlace(c);
		const fuMs = performance.now() - t0;
		t0 = performance.now();
		for (const c of cases) {
			card.style.width = `${c.card.width}px`;
			card.style.height = `${c.card.height}px`;
			window.FM.place(c.a, { width: card.offsetWidth, height: card.offsetHeight }, bounds, { side: c.side, align: c.align, gap: c.gap, pad: c.pad });
		}
		const fmMs = performance.now() - t0;
		return { diffs: diffs.length, sample: diffs.slice(0, 3), fuMs, fmMs };
	},
	{ SEED, CASES },
);
await browser.close();

console.log(`\nPARITY  ${CASES - result.diffs}/${CASES} identical (side + position within 0.5px)`);
for (const d of result.sample) console.log('  differs:', JSON.stringify(d));
console.log(`\nSPEED (${CASES} placements, measuring the card each time)`);
console.log(`  Floating UI  ${result.fuMs.toFixed(1)} ms  (${((result.fuMs / CASES) * 1000).toFixed(1)} µs each)`);
console.log(`  Fumetto      ${result.fmMs.toFixed(1)} ms  (${((result.fmMs / CASES) * 1000).toFixed(1)} µs each)`);
