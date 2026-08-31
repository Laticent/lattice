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
 * THE BASELINE COMPARISON IS DIRECTIONAL, and that is the 2026-08-31 change — read this before
 * re-blessing anything. `decks`, `slides`, `preludes` and `positions` used to be compared for EXACT
 * equality, on the sound reasoning that the denominator is part of the claim: a deck dropping out
 * of the measurement makes the rate go UP, because the decks that drop out are the badly-matching
 * ones. What that got wrong is the DIRECTION. Adding an example deck is routine and also moves
 * every one of those counts, so `equiv:check` failed on ordinary corpus growth in a message
 * indistinguishable from a real regression — and, nothing having ever invoked it, it sat red and
 * unread from 154 decks to 158 while the rate it was guarding had not moved (96.6% -> 96.7%).
 *
 * A gate that cannot tell growth from decay is not measuring the thing it says it is. So:
 *
 *   · counts may GROW freely and may NOT SHRINK. Shrinkage is the flattering direction and the one
 *     the exact check existed to catch; growth is a corpus edit and says nothing about the engine.
 *   · the RATIOS are what get pinned, because they survive a corpus that changes size — the
 *     equivalence rate (a band, it genuinely drifts), and the refusal / prelude / skip rates as
 *     RATCHETS: each may fall, none may rise. That is the same alarm the exact counts were reaching
 *     for (the synthesizer over-firing, a deck becoming unrepairable, decks leaving the sweep),
 *     stated in the unit that does not move when someone writes an example.
 *   · `positions + refusals === slides` is an EXACT invariant with no band at all. It is the
 *     accounting identity: every measured slide either got a supplied deck position or was counted
 *     as a refusal. Nothing may fall out of the denominator unnamed, which is the property the
 *     exact counts were a proxy for.
 *
 * `refusals` is new with that contract and is the field #1442's Amendment 5 asks for. `positions`
 * alone cannot distinguish "the supply path broke" from "these decks were never eligible": the
 * refusals are the decks `positionIsTrustworthy` declines, i.e. exactly where a plausible-lie
 * regression would hide. They are now counted, rated, ratcheted and listed by deck.
 *
 * IT IS RUN BY THE UNIT TIER. `measure` and `compareToBaseline` below are exported, and
 * `test/unit/diagnostics/slice-equivalence-baseline.test.js` calls them — so `npm test` enforces
 * the contract on every run and the silent drift above cannot recur. The CLI stays for the
 * report, which is the half a test cannot give you:
 *   npm run equiv          report the current reconciliation rate + the biggest residual
 *   npm run equiv:bless    write test/benchmark/slice-equivalence.json
 *   npm run equiv:check    compare against it and fail on a real drop
 *
 * WHY IT IS COMMITTED AT ALL. The original measurement lived in `.scratch/` and was lost, so when
 * its numbers were later questioned nobody could re-examine the residual — it was restated three
 * times (~99%, 92.6%, 96.5%) as successive passes found bugs in the probe rather than the engine. A
 * measurement that can be wrong by tens of points and still look plausible is worth keeping and
 * worth cataloging. A drop here now means one of two things and the header tells you which:
 * `positions` fell → the shipped supply path broke; `positions` held and the rate fell → the
 * residual grew, i.e. the prototype moved.
 *
 * NO RESIDUAL IS UNATTRIBUTED, as of 2026-08-31, and keeping it that way is the point of the
 * `unclassified` assertion in the committed test. 27 of 49 residuals were `unclassified` when
 * #1442 was audited. 25 of those 27 turned out to be ONE real preview defect rather than a
 * measurement artifact — `logo-on: title` painting the deck logo on every slice, because a slice is
 * its own document's first section (fixed in `applyDeckLogoToHtml`). The other 2 are the fail-closed
 * guard declining, which is correct behavior and now reports under its own name. An unnamed bucket
 * is where a real defect sits looking like noise; that is what it cost here.
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
/** How far the equivalence rate may fall before `--check` fails. Corpus edits move it a little. */
const BAND = 1.5;
/**
 * How far a RATCHETED rate may rise before `--check` fails. Tighter than `BAND` because these are
 * not expected to drift at all — one deck of 158 arriving with a refusal is ~0.5 points of the
 * refusal rate, so the tolerance has to clear a single deck without clearing a class of them.
 */
const RATCHET = 1.0;
/** The ratchets: a rate that may fall but not rise, each with what a rise would MEAN. */
const RATCHETS = {
	refusalRate: 'more slides are being measured without a supplied deck position',
	preludeRate: 'the prelude synthesizer is firing on more slides — check it is not over-matching',
	skipRate: 'more decks are dropping out of the measurement, which flatters the rate',
};

export function measure() {
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
	// Where `positionIsTrustworthy` DECLINED, by deck. `positions` alone reads as a plain shortfall
	// and says nothing about which decks the sweep is measuring blind; these are exactly the decks a
	// plausible-lie regression would hide in (#1442, Amendment 5), so they are named, not subtracted.
	const refusalsByDeck = new Map();

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
			else refusalsByDeck.set(path.basename(file), (refusalsByDeck.get(path.basename(file)) || 0) + 1);
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
	const refusals = [...refusalsByDeck.values()].reduce((a, b) => a + b, 0);
	const pct = (n, d) => +((n / (d || 1)) * 100).toFixed(1);
	return {
		slides,
		matched,
		preludes,
		positions,
		refusals,
		decks: measured,
		skipped,
		rate: pct(matched, slides),
		// The RATED forms, which are what the baseline pins — see the contract in the header. Derived
		// here rather than at the comparison so the report and the gate read one number, not two
		// roundings of it.
		refusalRate: pct(refusals, slides),
		preludeRate: pct(preludes, slides),
		skipRate: pct(skipped.length, measured + skipped.length),
		refusalsByDeck,
		byDeck,
		byCause,
	};
}

/** The fields written to (and read back from) `test/benchmark/slice-equivalence.json`. */
export function baselineOf(r) {
	return {
		decks: r.decks,
		slides: r.slides,
		matched: r.matched,
		preludes: r.preludes,
		positions: r.positions,
		refusals: r.refusals,
		rate: r.rate,
		refusalRate: r.refusalRate,
		preludeRate: r.preludeRate,
		skipRate: r.skipRate,
	};
}

/**
 * The baseline contract, as a list of failures — empty means green. Exported so the committed test
 * and the CLI enforce ONE reading of it rather than two that agree by inspection (HARD RULE #1).
 *
 * `base[k] !== undefined` keeps an OLDER baseline comparable rather than failing on a field it
 * predates — but a missing field is also un-checked, so re-bless after adding one.
 */
export function compareToBaseline(base, r) {
	const fail = [];

	// THE ACCOUNTING IDENTITY, checked on the CURRENT run and needing no baseline at all: every
	// measured slide either got a supplied deck position or was counted as a refusal. This is the
	// one thing with no tolerance, because a slide falling out of the accounting is not a drift —
	// it is the measurement lying about its own denominator.
	if (r.positions + r.refusals !== r.slides) {
		fail.push(`positions (${r.positions}) + refusals (${r.refusals}) != slides (${r.slides}) — a measured slide fell out of the accounting.`);
	}

	// COUNTS: growth is a corpus edit, shrinkage is the flattering direction. Only shrinkage fails.
	for (const k of ['decks', 'slides']) {
		if (base[k] !== undefined && r[k] < base[k]) {
			fail.push(`${k}: baseline ${base[k]}, now ${r[k]} — the corpus SHRANK. Decks leaving the sweep raise the rate; re-bless only with a reason.`);
		}
	}

	// RATIOS: the rate gets a band because it genuinely drifts; the rest are ratchets.
	if (base.rate !== undefined) {
		const delta = +(r.rate - base.rate).toFixed(1);
		if (delta < -BAND) fail.push(`rate: baseline ${base.rate}%, now ${r.rate}% — dropped more than ${BAND} points. Re-bless only with a reason.`);
	}
	for (const [k, meaning] of Object.entries(RATCHETS)) {
		if (base[k] === undefined) continue;
		if (r[k] > base[k] + RATCHET) fail.push(`${k}: baseline ${base[k]}%, now ${r[k]}% — ${meaning}.`);
	}
	return fail;
}

/**
 * The CLI half. Guarded so importing this module (the committed test does) measures nothing and
 * prints nothing — the sweep is 2s of engine renders, and a module that runs it on import cannot be
 * imported twice for the price of once.
 */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	const r = measure();
	const mode = process.argv[2] || process.argv.find((a) => a.startsWith('--'));

	console.log(`\nslice/deck equivalence: ${r.matched}/${r.slides} slides (${r.rate}%)`);
	console.log(`slides given a NON-EMPTY prelude: ${r.preludes} (${r.preludeRate}%)${r.preludes === 0 ? '  — the prelude prototype is UNEXERCISED by this corpus' : ''}`);
	// The count of slides the SHIPPED repair actually ran on. Printed beside the prelude count, and
	// blessed beside it, because it is the number that makes the rate mean something: at 0 this tool is
	// measuring the pre-#1272 engine no matter how healthy the percentage looks. That was literally the
	// case until this line existed.
	console.log(`slides given a SUPPLIED deck position: ${r.positions}${r.positions === 0 ? '  — nothing here exercises the shipped repair' : ''}`);
	// THE REFUSALS, named and attributed. The shortfall between `positions` and `slides` is not noise
	// and it is not a bug: it is the fail-closed guard declining on decks whose slide index cannot be
	// trusted, which is exactly where a confidently-wrong page number would hide. Listing the decks
	// turns "8 slides short" into something a reader can go and look at.
	console.log(
		`slides where the position guard REFUSED: ${r.refusals} (${r.refusalRate}%)${r.refusals ? `  — ${[...r.refusalsByDeck].map(([d, n]) => `${d} x${n}`).join(', ')}` : ''}`,
	);
	// The active neutralizer set, printed for the same reason the counts above are: it is an ASSERTION
	// ABOUT WHAT CANNOT BE REPAIRED YET, and nothing pins it to reality. It is now down to one —
	// `pagination` and `rail` left it when the sweep started supplying the position that fixes them,
	// the generated-id counters left it when they became slide-scoped, and `whitespace` left it in
	// 2026-08-31 on the measurement that it was hiding nothing. What is left is `ids`, the positional
	// `id="N"` on the section itself, which a supplied position does NOT repair.
	console.log(`ignoring (no shipped repair): ${Object.keys(RESIDUAL_NEUTRALIZERS).join(', ')}`);
	console.log(
		`decks measured: ${r.decks}${r.skipped.length ? `  ·  skipped ${r.skipped.length} (${r.skipRate}%): ${r.skipped.join(', ')}` : ''}\n`,
	);
	console.log('residual by cause:');
	for (const [c, n] of [...r.byCause].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${c}`);
	console.log('\nresidual by deck (top 8):');
	for (const [d, n] of [...r.byDeck].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`  ${String(n).padStart(4)}  ${d}`);

	if (mode === '--bless') {
		fs.mkdirSync(path.dirname(BASELINE), { recursive: true });
		fs.writeFileSync(BASELINE, `${JSON.stringify(baselineOf(r), null, 2)}\n`);
		console.log(`\nblessed → ${path.relative(ROOT, BASELINE)}`);
	} else if (mode === '--check') {
		if (!fs.existsSync(BASELINE)) {
			console.error('\nno baseline — run `npm run equiv:bless`');
			process.exit(1);
		}
		const base = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
		console.log(`\nbaseline ${base.rate}%  ->  now ${r.rate}%  (${r.rate - base.rate >= 0 ? '+' : ''}${+(r.rate - base.rate).toFixed(1)})`);
		console.log(`refusal rate ${base.refusalRate ?? '?'}% -> ${r.refusalRate}%  ·  prelude ${base.preludeRate ?? '?'}% -> ${r.preludeRate}%  ·  skipped ${base.skipRate ?? '?'}% -> ${r.skipRate}%`);
		const failures = compareToBaseline(base, r);
		if (failures.length) {
			for (const f of failures) console.error(`FAIL — ${f}`);
			process.exit(1);
		}
		console.log('within contract.');
	}
}
