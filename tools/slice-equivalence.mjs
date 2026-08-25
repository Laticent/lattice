#!/usr/bin/env node
/**
 * Slice/deck equivalence — the HEADLESS half of the diagnostic.
 *
 * THE QUESTION (shared with the author-facing half — see lib/diagnostics/slice-equivalence-core.mjs):
 * the preview shows one slide, so does that slide rendered ALONE come out the same as it does
 * rendered inside the whole deck? This sweeps every committed deck and answers it as a rate.
 *
 * READ THE PRELUDE COUNT, NOT JUST THE RATE. Each slice is rendered behind a synthesized prelude —
 * the running directives an earlier slide set and this one inherits. The header line prints the
 * count so the claim about it cannot quietly become false; it was stated three ways in the docs
 * before anyone counted, and it HAS since changed. It read "EMPTY for every single slide" until
 * 2026-08-25, when the count was measured at **9** (`deck-class-register.md` slides 3–7 and
 * `slide-class-forms.md` slides 4–7 — two decks that write a running `class:` global outside front
 * matter; every other committed deck still uses the `_` spot form, which sets nothing running). So
 * the rate is overwhelmingly still the residual left by the repairs that already ship, and the
 * prelude prototype is exercised on 9 of 1461 slides rather than 0 — barely, not never. Read the
 * count, do not quote a remembered zero.
 *
 * The author-facing twin is the Studio's PREVIEW FIDELITY overlay (Workspace → Diagnostics), which
 * asks the same question about the one slide in front of the author. Same core, two surfaces: this
 * one needs no browser, so it can be scripted, scheduled, and gated.
 *
 * IT NOW RUNS THE CODE THAT SHIPS — and that is a recent change worth understanding before you
 * quote the number. Until it did, this file imported `lib/diagnostics` and `lib/engine` only, while
 * the repair that actually fixes the preview lived in `docs/src/lib/single-slide-render.ts`. Every
 * slice was rendered with NO supplied position, so the sweep faithfully reproduced the pre-#1272
 * behavior on all 1201 slides: stubbing `positionIsTrustworthy` to `return false` restored the
 * originally reported bug in full and moved `equiv:check` by **0.0 points**. Two things fixed that,
 * and they only work together:
 *
 *   · `positionIsTrustworthy` / `deckSectionFor` / `supplyablePosition` moved into
 *     `lib/diagnostics/slice-equivalence-core.mjs`, so BOTH surfaces call one copy and the corpus
 *     walk below hands the engine the same `page` the Studio's slice route does;
 *   · `pagination` and `rail` left the neutralizer set. Hiding them was only defensible while
 *     nothing here could repair them; keeping them hidden after supplying the position would
 *     neutralize exactly the difference a broken repair produces.
 *
 * So a regression in the supply path now shows up as a rate COLLAPSE, not a rounding error. The
 * `positions` count in the header (and in the blessed baseline) is the direct readout: at 0, this
 * tool is measuring the pre-#1272 engine no matter how healthy the percentage looks. Re-derived
 * 2026-08-25 against the 96.6% baseline: stubbing `positionIsTrustworthy` to `return false` takes
 * the rate to 9.9%, and `deckSectionFor` to `undefined` takes it to 74.0%.
 *
 * `positions` is NOT the same count as `slides`, and a doc claiming it is by construction was
 * corrected on 2026-08-25. It is 1453 of 1461, and all 8 of the shortfall are `slide-class-forms.md`
 * — every slide of it. That deck is refused by `positionIsTrustworthy` but still satisfies the
 * section/chunk equality that decides skipping, so it stays in the measurement with no supplied
 * position and contributes 7 of the 49 residual slides. Two different tests, two different sets.
 *
 * WHAT IT STILL IS NOT.
 *
 * 1. NOT A GATE FOR EVERY DECK-DERIVED FACT. `DECK_DERIVED_FACTS` — the registry deciding which
 *    decks skip the slice route entirely — still lives in `docs/src` and is not consulted here.
 *    This sweep renders EVERY slide as a slice, including decks the Studio would render whole. That
 *    is deliberate (it is the residual, i.e. what a slice still cannot reproduce), but it means a
 *    hole in the registry shows up here as residual rather than as an alarm.
 * 2. NOT A SUBSTITUTE FOR THE REAL SURFACE. A rate is not a painted pixel (HARD RULE #23). The
 *    gates for user-visible behavior remain the unit tier (test/unit/diagnostics), the Studio e2e
 *    specs, and the author-facing overlay.
 *
 * What it IS: the residual for step 3 — how far a slice is from its deck section once the repairs
 * that already shipped have actually been applied to it.
 *
 * ON-DEMAND, NOT A CI GATE — the same shape as `bench` and `quality`. It could now produce a true
 * alarm, which the pre-supply version could not; what still argues against gating it is that its
 * subject is a diagnostic prototype rather than a shipped surface, and a corpus edit moves it. If
 * it is ever promoted, tighten the band with it:
 *   npm run equiv          report the current reconciliation rate + the biggest residual
 *   npm run equiv:bless    write test/benchmark/slice-equivalence.json
 *   npm run equiv:check    compare against it and fail on a real drop
 *
 * WHY IT IS COMMITTED AT ALL. The original measurement lived in `.scratch/` and was lost, so when
 * its numbers were later questioned nobody could re-examine the residual — it was restated three
 * times (~99%, 92.6%, 96.5%) as successive passes found bugs in the probe rather than the engine. A
 * measurement that can be wrong by tens of points and still look plausible is worth keeping and
 * worth cataloguing. A drop here now means one of two things and the header tells you which:
 * `positions` fell → the shipped supply path broke; `positions` held and the rate fell → the
 * residual grew, i.e. the prototype moved.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	classifyDivergence,
	frontMatterOf,
	normalizeSection,
	RESIDUAL_NEUTRALIZERS,
	sectionsOf,
	splitSlides,
	supplyablePosition,
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
	let positions = 0;
	let measured = 0;
	const skipped = [];
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
		// COUNTED, not just skipped: a deck leaving the measurement changes the DENOMINATOR, and
		// because the skipped decks tend to be the badly-matching ones, a change that makes the worst
		// deck unmeasurable reads as an improvement. Three decks / 13 slides drop out today.
		if (full.length !== chunks.length) {
			skipped.push(`${path.basename(file)} (${chunks.length} chunks, ${full.length} sections)`);
			continue;
		}

		measured += 1;
		chunks.forEach((chunk, k) => {
			const prelude = synthesizePrelude(chunks, k, VOCAB);
			if (prelude) preludes += 1;
			// THE SHIPPED REPAIR, executed. `supplyablePosition` is the same function the Studio's
			// slice route calls (lib/diagnostics/slice-equivalence-core.mjs), handed the same three
			// arguments: the whole deck, the shown slide's index, and the caller's slide count. Break
			// it and this sweep renders every slice back at "1 of 1", which — with `pagination` and
			// `rail` no longer neutralized — is a rate collapse rather than a 0.0-point no-op.
			const page = supplyablePosition(src, k, chunks.length);
			if (page) positions += 1;
			let got;
			try {
				got = sectionsOf(eng.render(`${fm}${prelude ? `${prelude}\n\n` : ''}${chunk}`, 'lattice', { page }).html)[0] ?? '';
			} catch {
				got = '';
			}
			slides += 1;
			const a = normalizeSection(got, RESIDUAL_NEUTRALIZERS);
			const b = normalizeSection(full[k], RESIDUAL_NEUTRALIZERS);
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
	return { slides, matched, preludes, positions, decks: measured, skipped, rate: +((matched / slides) * 100).toFixed(1), byDeck, byCause };
}

const r = measure();
const mode = process.argv[2] || process.argv.find((a) => a.startsWith('--'));

console.log(`\nslice/deck equivalence: ${r.matched}/${r.slides} slides (${r.rate}%)`);
console.log(`slides given a NON-EMPTY prelude: ${r.preludes}${r.preludes === 0 ? '  — the prelude prototype is UNEXERCISED by this corpus' : ''}`);
// The count of slides the SHIPPED repair actually ran on. Printed beside the prelude count, and
// blessed beside it, because it is the number that makes the rate mean something: at 0 this tool is
// measuring the pre-#1272 engine no matter how healthy the percentage looks. That was literally the
// case until this line existed.
console.log(`slides given a SUPPLIED deck position: ${r.positions}${r.positions === 0 ? '  — nothing here exercises the shipped repair' : ''}`);
// The active neutralizer set, printed for the same reason the counts above are: it is an ASSERTION
// ABOUT WHAT CANNOT BE REPAIRED YET, and nothing pins it to reality. It is now short — `pagination`
// and `rail` left it when the sweep started supplying the position that fixes them — and it should
// only ever get shorter — `pagination` and `rail` left it when the position started being supplied,
// and the generated-id counters left it when they became slide-scoped. What is left is `ids`, the
// positional `id="N"` on the section itself, which a supplied position does NOT repair.
console.log(`ignoring (no shipped repair): ${Object.keys(RESIDUAL_NEUTRALIZERS).join(', ')}`);
console.log(`decks measured: ${r.decks}${r.skipped.length ? `  ·  skipped ${r.skipped.length}: ${r.skipped.join(', ')}` : ''}\n`);
console.log('residual by cause:');
for (const [c, n] of [...r.byCause].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${c}`);
console.log('\nresidual by deck (top 8):');
for (const [d, n] of [...r.byDeck].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(n).padStart(4)}  ${d}`);

if (mode === '--bless') {
	fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
	fs.writeFileSync(
		BASELINE,
		`${JSON.stringify({ decks: r.decks, slides: r.slides, matched: r.matched, preludes: r.preludes, positions: r.positions, rate: r.rate }, null, 2)}\n`,
	);
	console.log(`\nblessed → ${path.relative(ROOT, BASELINE)}`);
} else if (mode === '--check') {
	if (!fs.existsSync(BASELINE)) {
		console.error('\nno baseline — run `npm run equiv:bless`');
		process.exit(1);
	}
	const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
	const delta = +(r.rate - base.rate).toFixed(1);
	console.log(`\nbaseline ${base.rate}%  ->  now ${r.rate}%  (${delta >= 0 ? '+' : ''}${delta})`);
	// THE DENOMINATOR IS PART OF THE CLAIM. Comparing the rate alone let three things through
	// silently: a deck dropping out of the measurement (which makes the rate go UP, because the
	// skipped decks are the badly-matching ones), the corpus growing or shrinking, and the prelude
	// count going 0 → 1201 (the synthesizer over-firing). `positions` joins them: it is the count of
	// slides the shipped repair ran on, so a change that stops the repair firing is caught by NAME
	// here as well as by the rate collapse below. Only `rate` gets a band, because only `rate` is
	// expected to drift.
	//
	// `base[k] !== undefined` keeps an OLDER baseline comparable rather than failing on a field it
	// predates — but a missing field is also un-checked, so re-bless after adding one.
	const exact = ['decks', 'slides', 'preludes', 'positions'].filter((k) => base[k] !== undefined && base[k] !== r[k]);
	if (exact.length) {
		for (const k of exact) console.error(`FAIL — ${k}: baseline ${base[k]}, now ${r[k]}. The measurement changed shape, so the rate is not comparable.`);
		process.exit(1);
	}
	if (delta < -BAND) {
		console.error(`FAIL — dropped more than ${BAND} points. Re-bless only with a reason.`);
		process.exit(1);
	}
	console.log('within band.');
}
