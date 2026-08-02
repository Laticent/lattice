#!/usr/bin/env node
/**
 * Slice/deck equivalence — the HEADLESS half of the diagnostic.
 *
 * THE QUESTION (shared with the author-facing half — see lib/diagnostics/slice-equivalence-core.mjs):
 * the preview shows one slide, so does that slide rendered ALONE come out the same as it does
 * rendered inside the whole deck? This sweeps every committed deck and answers it as a rate.
 *
 * READ THE PRELUDE COUNT, NOT JUST THE RATE. Each slice is rendered behind a synthesized prelude —
 * the running directives an earlier slide set and this one inherits. On the CURRENT corpus that
 * prelude is EMPTY for every single slide: no committed deck sets an in-vocabulary running global
 * outside front matter (which is prepended verbatim anyway), because real decks write directives in
 * the `_` spot form. So today's rate measures the residual left by the repairs that already ship —
 * NOT the prelude prototype's contribution, which this corpus does not exercise at all. The header
 * line prints the count so that claim cannot quietly become false again; it was stated three ways in
 * the docs before anyone counted.
 *
 * The author-facing twin is the Studio's PREVIEW FIDELITY overlay (Workspace → Diagnostics), which
 * asks the same question about the one slide in front of the author. Same core, two surfaces: this
 * one needs no browser, so it can be scripted, scheduled, and gated.
 *
 * ON-DEMAND, NOT A CI GATE — the same shape as `bench` and `quality`:
 *   npm run equiv          report the current reconciliation rate + the biggest residual
 *   npm run equiv:bless    write test/benchmark/slice-equivalence.json
 *   npm run equiv:check    compare against it and fail on a real drop
 *
 * WHY IT IS COMMITTED AT ALL. The original measurement lived in `.scratch/` and was lost, so when
 * its numbers were later questioned nobody could re-examine the residual — it was restated three
 * times (~99%, 92.6%, 96.5%) as successive passes found bugs in the probe rather than the engine. A
 * measurement that can be wrong by tens of points and still look plausible is worth keeping and
 * worth cataloguing, but it is NOT a test: it has no production consumer until the synthesizer
 * ships, so a drop here means "the prototype moved", not "a user broke".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	classifyDivergence,
	frontMatterOf,
	normalizeSection,
	PROTOTYPE_NEUTRALIZERS,
	sectionsOf,
	splitSlides,
	synthesizePrelude,
} from '../lib/diagnostics/slice-equivalence-core.mjs';
import directives from '../lib/engine/directives.js';
import engine from '../lib/engine/index.js';

const { createEngine } = engine;
// The engine's own directive vocabulary, injected into the (import-free) core — see its header.
const VOCAB = { known: directives.KNOWN_DIRECTIVES, flags: directives.FLAG_DIRECTIVES };
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = path.join(ROOT, 'test/benchmark/slice-equivalence.json');
/** How far the rate may fall before `--check` fails. Corpus edits move it a little. */
const BAND = 1.5;

function measure() {
	const eng = createEngine();
	// RECURSIVE. `examples/` has real decks in subfolders (token-contrast/, chart-theme-gallery/);
	// a flat read silently measured 111 of 125 and called the result "the corpus". Found in review.
	const walk = (d) =>
		fs.existsSync(d)
			? fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
					e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)],
				)
			: [];
	const files = [...walk(path.join(ROOT, 'examples')), ...walk(path.join(ROOT, 'test/integration/baseline-decks'))].filter((f) =>
		f.endsWith('.md'),
	);

	let slides = 0;
	let matched = 0;
	let preludes = 0;
	const byDeck = new Map();
	const byCause = new Map();

	for (const file of files) {
		const src = fs.readFileSync(file, 'utf8');
		const fm = frontMatterOf(src);
		const chunks = splitSlides(src.slice(fm.length));
		let full;
		try {
			full = sectionsOf(eng.render(src, 'lattice').html);
		} catch {
			continue;
		}
		// 1→N expanders (`_focusSteps`, `split: headings`) have no 1:1 slide↔section pairing.
		if (full.length !== chunks.length) continue;

		chunks.forEach((chunk, k) => {
			const prelude = synthesizePrelude(chunks, k, VOCAB);
			if (prelude) preludes += 1;
			let got;
			try {
				got = sectionsOf(eng.render(`${fm}${prelude ? `${prelude}\n\n` : ''}${chunk}`, 'lattice').html)[0] ?? '';
			} catch {
				got = '';
			}
			slides += 1;
			const a = normalizeSection(got, PROTOTYPE_NEUTRALIZERS);
			const b = normalizeSection(full[k], PROTOTYPE_NEUTRALIZERS);
			if (a === b) {
				matched += 1;
				return;
			}
			const name = path.basename(file);
			byDeck.set(name, (byDeck.get(name) || 0) + 1);
			const cause = classifyDivergence(a, b);
			byCause.set(cause, (byCause.get(cause) || 0) + 1);
		});
	}
	return { slides, matched, preludes, rate: +((matched / slides) * 100).toFixed(1), byDeck, byCause };
}

const r = measure();
const mode = process.argv[2] || process.argv.find((a) => a.startsWith('--'));

console.log(`\nslice/deck equivalence: ${r.matched}/${r.slides} slides (${r.rate}%)`);
console.log(`slides given a NON-EMPTY prelude: ${r.preludes}${r.preludes === 0 ? '  — the prelude prototype is UNEXERCISED by this corpus' : ''}\n`);
console.log('residual by cause:');
for (const [c, n] of [...r.byCause].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${c}`);
console.log('\nresidual by deck (top 8):');
for (const [d, n] of [...r.byDeck].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(n).padStart(4)}  ${d}`);

if (mode === '--bless') {
	fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
	fs.writeFileSync(BASELINE, `${JSON.stringify({ slides: r.slides, matched: r.matched, preludes: r.preludes, rate: r.rate }, null, 2)}\n`);
	console.log(`\nblessed → ${path.relative(ROOT, BASELINE)}`);
} else if (mode === '--check') {
	if (!fs.existsSync(BASELINE)) {
		console.error('\nno baseline — run `npm run equiv:bless`');
		process.exit(1);
	}
	const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
	const delta = +(r.rate - base.rate).toFixed(1);
	console.log(`\nbaseline ${base.rate}%  ->  now ${r.rate}%  (${delta >= 0 ? '+' : ''}${delta})`);
	if (delta < -BAND) {
		console.error(`FAIL — dropped more than ${BAND} points. Re-bless only with a reason.`);
		process.exit(1);
	}
	console.log('within band.');
}
