#!/usr/bin/env node
/**
 * sweep-guide-gestures — what does the Guide vocabulary ACTUALLY do to our decks?
 *
 * THE GAP THIS CLOSES. `chooseGesture` encodes five thresholds — how many lines make a
 * block, how narrow is "small", what aspect ratio is still compact, how much of a block a
 * sentence has to be to count as a phrase. Every one of them is a design constant, and a
 * design constant reasoned about rather than measured is how #1386 shipped an
 * "optimization" that was 7x slower on the state every new user is in. So the thresholds
 * were set from this sweep's output, not the other way round.
 *
 * It also answers the question nobody can eyeball: does the vocabulary VARY? A rule set
 * that resolves 96% of cues to `underline` is a karaoke follower with extra steps.
 *
 * IT DRIVES THE CODE THAT SHIPS. `docs/src/components/studio/present-guide.ts` is bundled
 * and injected, and this calls its `guideCueIn` per cue — not a re-implementation of the
 * rules that agrees today and drifts next month. Three separate amendments to the
 * narration decision record are about a harness that measured something other than the
 * shipping path; this one keeps the mechanism in the path by construction.
 *
 * THE CORPUS is every committed deck: `examples/` + `test/integration/baseline-decks/`.
 * The cues are the deck's REAL narration, read out of the read-along WebVTT the emulator
 * writes with `--captions` — the same `buildTrack` segmentation Present narrates from,
 * so a cue here is a cue there.
 *
 * Usage:
 *   node tools/sweep-guide-gestures.mjs              # the whole corpus
 *   node tools/sweep-guide-gestures.mjs --limit 8    # a fast sample while iterating
 *   node tools/sweep-guide-gestures.mjs --json out.json
 *   node tools/sweep-guide-gestures.mjs --deck a.md --deck b.md --misses
 *                                                    # measure named decks only, and print
 *                                                    # every cue that resolved to nothing
 *   node tools/sweep-guide-gestures.mjs --paraphrases # print every cue the paraphrase tier
 *                                                    # answered, beside the text it named
 *   node tools/sweep-guide-gestures.mjs --delivery restrained --plan
 *                                                    # replay a preset's salience budget, and
 *                                                    # print every cue that still gestures
 *
 * Needs a Chromium (CHROME_PATH or the puppeteer cache) — shape is layout, and layout
 * needs a browser. With none it SKIPS loudly and exits 0, never a false green (#23).
 * On-demand: it is ~124 full deck renders, so it is not in `build:check`.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const require = createRequire(import.meta.url);
const { resolveChrome } = require('./lib/resolve-chrome');

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const OUT = path.join(ROOT, '.scratch', 'guide-sweep');
/** The cursor's half-footprint in PARENT pixels (`POINTER_BOX / 2`), and the width Present shows
 *  a slide at. The footprint does NOT scale with the preview, so inside a 3840-wide deck shown in
 *  a ~1440 card it covers `14 / (1440/3840)` ≈ 37 slide px — and a check run at 14 understates how
 *  often the geometric rest is occupied. Modeled here rather than assumed at 1:1. */
const HALF_PARENT = 14;
const PRESENT_WIDTH = 1440;

const decks = () => [
	...fs
		.readdirSync(path.join(ROOT, 'examples'))
		.filter((f) => f.endsWith('.md'))
		.map((f) => path.join(ROOT, 'examples', f)),
	...fs
		.readdirSync(path.join(ROOT, 'test', 'integration', 'baseline-decks'))
		.filter((f) => f.endsWith('.md'))
		.map((f) => path.join(ROOT, 'test', 'integration', 'baseline-decks', f)),
];

/**
 * THE COMPONENT NAMES, from the generated catalog.
 *
 * A slide's `<!-- _class: X -->` lands as classes on its `<section>`, mixed in with every
 * modifier (`accent`, `dark`, `insight-verdict`, a form name). Only the catalog can say which
 * of those tokens is a COMPONENT, so the attribution below intersects the section's classList
 * with this set rather than guessing at the first class or a naming convention.
 *
 * Read from `dist/` deliberately: that is the same machine surface the picker and every
 * exported deck consume, so a component this sweep cannot name is one the catalog does not
 * ship, which is itself worth reporting.
 */
const componentNames = () => {
	try {
		const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'docs', 'components.json'), 'utf8'));
		return (raw.components ?? []).map((c) => c.name).filter(Boolean);
	} catch {
		return [];
	}
};

/**
 * One VTT cue payload reduced to the words Present speaks.
 *
 * A cue line carries word-level timestamps (`<00:00:01.234>`) and voice/class spans
 * (`<v Name>`, `<c.loud>`), and the writer escapes the deck's own angle brackets. Both have to
 * go before the text can be compared with the DOM's.
 *
 * TO A FIXPOINT, and that is the whole reason this is a function. A single pass that removes a
 * tag-shaped span can CREATE one out of what surrounds it — `<<c>i>` leaves `<i>` — so a
 * one-pass strip is an incomplete sanitizer even when, as here, the output is only ever compared
 * as a string and never becomes HTML. Looping until nothing changes has no such hole, and the
 * cost is one extra scan of a line. Entities are decoded LAST, so decoding cannot introduce a
 * bracket the strip has already run past.
 */
function stripCueTags(line) {
	let out = line;
	for (let prev = ''; prev !== out; ) {
		prev = out;
		out = out.replace(/<[^<>]*>/g, '');
	}
	return out
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
		.replace(/\s+/g, ' ')
		.trim();
}

/** The cue TEXTS of one read-along VTT, in order — the sentences Present speaks. */
function vttCues(file) {
	const out = [];
	let buf = [];
	for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		if (line.includes('-->')) {
			buf = [];
			continue;
		}
		if (!line.trim()) {
			if (buf.length) out.push(buf.join(' '));
			buf = [];
			continue;
		}
		if (line.startsWith('WEBVTT') || /^\s*(NOTE|STYLE)\b/.test(line)) continue;
		buf.push(stripCueTags(line));
	}
	if (buf.length) out.push(buf.join(' '));
	return out.filter(Boolean);
}

/** The shipping decision module, bundled for the page. */
async function bundleGuide() {
	const r = await esbuild.build({
		entryPoints: [path.join(ROOT, 'docs', 'src', 'components', 'studio', 'present-guide.ts')],
		bundle: true,
		format: 'iife',
		globalName: 'LatticeGuide',
		write: false,
		platform: 'browser',
		alias: { '@': path.join(ROOT, 'docs', 'src') },
		logLevel: 'silent',
	});
	return r.outputFiles[0].text;
}

async function main() {
	const argv = process.argv.slice(2);
	const limit = argv.includes('--limit') ? Number(argv[argv.indexOf('--limit') + 1]) : Infinity;
	const jsonAt = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null;
	const reuse = argv.includes('--reuse');
	// `--deck <file>` (repeatable) replaces the corpus, so one component family's own galleries
	// can be measured without paying for ~124 renders. `--misses` prints each unresolved cue with
	// its slide, which is the list a component owner fixes from; the rate alone names no cue.
	const named = argv.flatMap((a, i) => (a === '--deck' && argv[i + 1] ? [path.resolve(argv[i + 1])] : []));
	const showMisses = argv.includes('--misses');
	const showParaphrases = argv.includes('--paraphrases');
	const showPlan = argv.includes('--plan');
	// `--delivery <name>` replays the salience plan under that preset's budget, the way Present
	// does (lib/core/resolve-delivery.mjs). Without it the sweep measures the unbudgeted cadence.
	const deliveryName = argv.includes('--delivery') ? argv[argv.indexOf('--delivery') + 1] : null;
	const preset = deliveryName ? (await import('../lib/core/resolve-delivery.mjs')).resolveDelivery(deliveryName) : null;
	const budget = preset?.budget ?? 0;
	const floor = preset?.floor ?? 0;

	const chrome = resolveChrome();
	if (!chrome) {
		console.error('sweep-guide-gestures: no Chromium (set CHROME_PATH) — SKIPPED, nothing measured.');
		process.exit(0);
	}
	fs.mkdirSync(OUT, { recursive: true });
	const guideJs = await bundleGuide();
	const puppeteer = require('puppeteer');
	const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });

	// Gestures per narrated slide, which is the number a preset's budget caps.
	const perSlide = new Map();
	const tally = { byComponent: {}, marked: 0, parted: 0, figured: 0, paraphrased: 0, cues: 0, resolved: 0, notable: 0, fellBack: 0, byKind: {}, gestures: 0, rests: 0, holds: 0, skipped: 0, hides: 0, byGesture: {}, byRole: {}, spanned: 0, spanPartial: 0, spanRatio: [], gFellBack: 0, decks: 0, slidesNoCue: 0, slidesWithNarration: 0 };
	const perDeck = [];
	const comps = componentNames();
	if (!comps.length) console.error('  note: dist/docs/components.json is missing — per-component attribution will report everything as (none). Run `npm run build`.');
	try {
		for (const md of (named.length ? named : decks()).slice(0, limit)) {
			const stem = path.basename(md, '.md').replace(/[^\w.-]/g, '_');
			const base = path.join(OUT, stem);
			// `--reuse` skips the render when the sidecar is already on disk. A full pass is ~124
			// deck renders; iterating on the MEASUREMENT should not re-pay for the corpus.
			if (!(reuse && fs.existsSync(`${base}.html`))) {
				try {
					execFileSync(process.execPath, [EMULATOR, md, `${base}.pdf`, 'indaco', '--captions', '-q'], {
						cwd: ROOT,
						stdio: ['ignore', 'ignore', 'ignore'],
						timeout: 10 * 60_000,
					});
				} catch {
					console.error(`  skipped (render failed): ${path.relative(ROOT, md)}`);
					continue;
				}
			}
			if (!fs.existsSync(`${base}.html`)) continue;

			// Per-slide cue lists, keyed by the 1-based slide number in the sidecar's filename.
			const cuesBySlide = new Map();
			for (const f of fs.readdirSync(OUT)) {
				const m = new RegExp(`^${stem.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\.(\\d+)\\.vtt$`).exec(f);
				if (m) cuesBySlide.set(Number(m[1]), vttCues(path.join(OUT, f)));
			}
			if (!cuesBySlide.size) continue;

			const page = await browser.newPage();
			await page.setViewport({ width: 1920, height: 1080 });
			await page.goto(`file://${base}.html`, { waitUntil: 'networkidle0', timeout: 120_000 });
			// `Runtime.evaluate`, NOT a `<script>` node: an exported deck can carry a
			// Content-Security-Policy, and a blocked script tag leaves `window.LatticeGuide`
			// undefined — which killed a whole run 42 decks in. Asserted, not assumed, because a
			// harness that silently measures nothing is worse than one that stops.
			await page.evaluate(guideJs);
			if (!(await page.evaluate(() => typeof window.LatticeGuide?.guideCueIn === 'function'))) {
				await page.close();
				console.error(`  skipped (the classifier would not load): ${path.relative(ROOT, md)}`);
				continue;
			}
			const rows = await page.evaluate(
				(cueEntries, halfParent, presentWidth, compNames, budget, floor) => {
					const G = window.LatticeGuide;
					const known = new Set(compNames);
					// WHICH COMPONENT IS THIS SLIDE? The `_class:` directive lands as classes on the
					// section alongside every modifier and form name, so the only sound answer is the
					// intersection with the catalog. A slide that names none (a plain Markdown slide
					// with no directive) is attributed to `(none)` rather than dropped — those slides
					// are cues too, and a component sweep that hides them flatters itself.
					const compOf = (sec) => [...sec.classList].find((c) => known.has(c)) ?? '(none)';
					// Did this cue need the piecewise (label + body) matcher? Asked by checking
					// whether any single BLOCK contains it, which is the condition that fallback
					// exists for — not by re-implementing the matcher.
					const hasBlock = (root, text) => {
						const n = text
							.toLowerCase()
							.replace(/\s+/g, ' ')
							.trim()
							.replace(/[\u2018\u2019\u201c\u201d]/g, "'")
							.replace(/[\u2013\u2014]/g, '-')
							.replace(/[^\p{L}\p{N}' -]+/gu, '');
						if (n.length < 3) return true;
						for (const el of root.querySelectorAll('p, li, dd, dt, blockquote, figcaption, h1, h2, h3, h4, th, td, code')) {
							const hay = (el.textContent ?? '')
								.toLowerCase()
								.replace(/\s+/g, ' ')
								.trim()
								.replace(/[\u2018\u2019\u201c\u201d]/g, "'")
								.replace(/[\u2013\u2014]/g, '-')
								.replace(/[^\p{L}\p{N}' -]+/gu, '');
							if (hay.includes(n)) return true;
						}
						return false;
					};
					const sections = [...document.querySelectorAll('section[data-lattice-slide]')];
					const out = [];
					for (const [n, cues] of cueEntries) {
						const sec = sections[n - 1];
						if (!sec) continue;
						const r = sec.getBoundingClientRect();
						const comp = compOf(sec);
						const frame = { left: r.left, top: r.top, width: r.width, height: r.height };
						const half = halfParent / (presentWidth / (r.width || presentWidth));
						let any = false;
						// THE CADENCE, REPLAYED. Guide gestures on a BLOCK change and RESTS when a cue
						// resolves to the element the last one did, so a per-cue tally describes a
						// population no viewer sees. `prev` reproduces `PresentOverlay`'s rest guard.
						let prev = null;
						// THE PLAN, replayed: only the first cue naming each of the slide's top `budget`
						// targets gestures; the rest hold (PresentOverlay's THE PLAN).
						const plan = budget ? G.planSlide(cues, (t) => { const b = G.findCueTarget(sec, t); return b ? G.aimTarget(b, t).el : null; }, budget, floor) : null;
						for (const [ci, text] of cues.entries()) {
							const d = G.guideCueIn(sec, text, frame, half, half + 5);
							const held = !d && prev !== null && G.isAside(text);
							const skipped = !!d && d.el !== prev && !!plan && !plan.gesture.has(ci);
							if (d) any = true;
							const rest = !!d && d.el === prev;
							// A cue that names nothing HOLDS the hand where it was (PresentOverlay's hold), so
							// the next cue naming the same element is still a rest, not a fresh gesture. So does
							// a cue the plan skipped.
							prev = d && !skipped ? d.el : prev;
							const spanned = !hasBlock(sec, text);
							// ROUND TWO'S CROSS-CHECK, RESTORED. It measured that relaxing the matcher bought
							// reach by landing on elements holding a fraction of the sentence, and refused the
							// change. This branch relaxes the matcher, so it owes the same number: how much of
							// the spoken sentence the resolved element actually holds, and how often the climb
							// gave up and handed back a partial answer.
							// WHICH TIER ANSWERED, asked rather than inferred. `spanned` is "no single block
							// holds this cue", which was a sound proxy for the piecewise matcher while it
							// was the only tier that could answer such a cue. The MARK tier answers them
							// too, so the proxy now books every mark hit as piecewise and voids that row's
							// wrong-element ratio (a mark has no text, so the ratio reads 0).
							const marked = G.resetMarkHit() > 0;
							// AND THE SAME AGAIN FOR THE DECLARED-PART TIER. It answers cues no block holds
							// too, so without its own counter every one of its hits lands in the piecewise
							// row — the exact mis-attribution the mark tier had to fix. A tier the instrument
							// cannot tell apart cannot be measured.
							const parted = G.resetPartHit?.() > 0;
							// AND THE CHART TIERS (detail · chart text · figure), for the same reason.
							const figured = G.resetFigureHit?.() > 0;
							// AND THE PARAPHRASE TIER: an authored caption that says the slide in other words.
							const paraphrased = G.resetParaphraseHit?.() > 0;
							const piecewise = spanned && !marked && !parted && !figured && !paraphrased;
							// RESET UNCONDITIONALLY, READ CONDITIONALLY. `findSpanningTarget` bumps
							// `spanPartial` on every entry to its partial branch — including the ones that
							// return null and fall through to a later tier — so reading it only on a
							// piecewise cue leaves the flag set and books it against the NEXT piecewise cue.
							// Measured: 190 true partials reported as 193. The counter is per-cue state, so
							// draining it per cue is what makes it mean what its name says.
							const spanPartialHit = G.resetSpanPartial() > 0;
							const partial = piecewise && spanPartialHit;
							const ratio = piecewise && d ? (d.el.textContent ?? '').replace(/\s+/g, ' ').trim().length / Math.max(1, text.length) : null;
							// A MISS CARRIES ITS COMPONENT TOO. `null` was enough while the question was
							// "how often does the corpus resolve"; it cannot answer "which component goes
							// dark", which is the question a component owner actually has.
							out.push(d ? { comp, kind: d.kind, role: d.role, notable: d.strength === 'notable', fellBack: d.fellBack, rest, skipped, spanned: piecewise, marked, parted, figured, paraphrased, said: paraphrased ? (d.el.getAttribute?.('data-label') ?? d.el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 90) : undefined, whole: !!d.el.classList?.contains('chart-body'), slide: n, text, partial, ratio } : { comp, miss: true, held, slide: n, text });
						}
						out.push({ slideDone: true, any, comp, planned: plan ? plan.gesture.size : null });
					}
					return out;
				},
				[...cuesBySlide.entries()],
				HALF_PARENT,
				PRESENT_WIDTH,
				comps,
				budget,
				floor,
			);
			await page.close();

			const deckRow = { deck: path.relative(ROOT, md), cues: 0, resolved: 0, byKind: {} };
			// One bucket per component, created on first sight so a component absent from the
			// corpus stays absent from the table rather than showing a flattering 0/0.
			const comp = (name) => (tally.byComponent[name] ??= { cues: 0, resolved: 0, slides: 0, byKind: {}, byRole: {} });
			for (const row of rows) {
				if (row?.slideDone) {
					tally.slidesWithNarration += 1;
					comp(row.comp).slides += 1;
					if (!row.any) tally.slidesNoCue += 1;
					continue;
				}
				tally.cues += 1;
				deckRow.cues += 1;
				const c = comp(row.comp);
				c.cues += 1;
				if (row.miss) {
					if (row.held) tally.holds += 1;
					else tally.hides += 1;
					if (showMisses) process.stderr.write(`    miss  ${stem} #${row.slide} [${row.comp}]  ${row.text}\n`);
					continue;
				}
				c.resolved += 1;
				c.byKind[row.kind] = (c.byKind[row.kind] ?? 0) + 1;
				c.byRole[row.role] = (c.byRole[row.role] ?? 0) + 1;
				tally.resolved += 1;
				deckRow.resolved += 1;
				tally.byKind[row.kind] = (tally.byKind[row.kind] ?? 0) + 1;
				tally.byRole[row.role] = (tally.byRole[row.role] ?? 0) + 1;
				if (row.marked) tally.marked += 1;
				if (row.parted) tally.parted += 1;
				if (row.figured) tally.figured += 1;
				if (row.paraphrased) tally.paraphrased += 1;
				// A cue the WHOLE-FIGURE tier answered is resolved, but only honestly so when the
				// sentence is about the whole chart. Listed with the misses so that is checkable.
				if (row.paraphrased && showParaphrases) process.stderr.write(`    para  ${stem} #${row.slide} [${row.comp}]  ${row.text}\n          -> ${row.said}\n`);
				if (row.whole && showMisses) process.stderr.write(`    whole ${stem} #${row.slide} [${row.comp}]  ${row.text}\n`);
				if (row.spanned) {
					tally.spanned += 1;
					if (row.partial) tally.spanPartial += 1;
					if (row.ratio != null) tally.spanRatio.push(row.ratio);
				}
				deckRow.byKind[row.kind] = (deckRow.byKind[row.kind] ?? 0) + 1;
				if (row.notable) tally.notable += 1;
				if (row.fellBack) tally.fellBack += 1;
				if (row.rest) {
					tally.rests += 1;
					continue;
				}
				if (row.skipped) {
					tally.skipped += 1;
					continue;
				}
				if (showPlan) process.stderr.write(`    gest  ${stem} #${row.slide} [${row.comp}] ${row.kind}${row.notable ? '!' : ''}  ${row.text}\n`);
				tally.gestures += 1;
				perSlide.set(`${stem}#${row.slide}`, (perSlide.get(`${stem}#${row.slide}`) ?? 0) + 1);
				tally.byGesture[row.kind] = (tally.byGesture[row.kind] ?? 0) + 1;
				if (row.fellBack) tally.gFellBack += 1;
			}
			tally.decks += 1;
			perDeck.push(deckRow);
			process.stderr.write(`  ${deckRow.deck}: ${deckRow.resolved}/${deckRow.cues}\n`);
		}
	} finally {
		await browser.close();
	}

	const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
	console.log(`\n── Guide gesture sweep — ${tally.decks} decks, ${tally.cues} cues ──`);
	console.log(`  resolved to a target   ${tally.resolved} (${pct(tally.resolved, tally.cues)})`);
	console.log(`  slides with narration  ${tally.slidesWithNarration}, of which ${tally.slidesNoCue} resolve nothing at all`);
	console.log(`  notable (a \`_focus:\` element) ${tally.notable} (${pct(tally.notable, tally.resolved)})`);
	console.log(`  rest fell back to the search  ${tally.fellBack} (${pct(tally.fellBack, tally.resolved)})`);
	const ratios = tally.spanRatio.slice().sort((a, b) => a - b);
	const q = (f) => (ratios.length ? ratios[Math.min(ratios.length - 1, Math.floor(f * ratios.length))].toFixed(2) : 'n/a');
	console.log(`  answered by a MARK (data-label / data-value)   ${tally.marked} (${pct(tally.marked, tally.resolved)})`);
	console.log(`  answered by a DECLARED PART (manifest \`handles\`)     ${tally.parted} (${pct(tally.parted, tally.resolved)})`);
	console.log(`  answered by a CHART tier (detail · chart text · whole figure)  ${tally.figured} (${pct(tally.figured, tally.resolved)})`);
	console.log(`  answered by a PARAPHRASE (an authored caption in other words)  ${tally.paraphrased} (${pct(tally.paraphrased, tally.resolved)})`);
	console.log(`  matched piecewise (a label joined to its body)  ${tally.spanned} (${pct(tally.spanned, tally.resolved)})`);
	console.log(`    of those, a PARTIAL answer (the climb gave up)  ${tally.spanPartial} (${pct(tally.spanPartial, tally.spanned)})`);
	console.log(`    resolved-element text / cue text — p10 ${q(0.1)} · median ${q(0.5)} · p90 ${q(0.9)}`);
	console.log(`  handle:  ${Object.entries(tally.byRole).map(([k, v]) => `${k} ${v} (${pct(v, tally.resolved)})`).join(' · ')}`);
	console.log(`\n  THE CADENCE — what a viewer actually sees:`);
	console.log(`    gestures ${tally.gestures} · rests ${tally.rests} (${pct(tally.rests, tally.resolved)} of resolved cues) · holds ${tally.holds} (an aside naming nothing; the hand stays) · hides ${tally.hides}`);
	{
		const counts = [...perSlide.values()].sort((a, b) => a - b);
		const at = (q) => counts[Math.min(counts.length - 1, Math.floor(q * counts.length))] ?? 0;
		const mean = counts.length ? (counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(2) : '0';
		console.log(`    gestures per gesturing slide — mean ${mean} · median ${at(0.5)} · p90 ${at(0.9)} · max ${counts.at(-1) ?? 0}`);
	}
	if (budget) console.log(`    under delivery: ${deliveryName} (budget ${budget}) — ${tally.skipped} resolved cues held because the plan spent the slide's budget elsewhere`);
	console.log(`    rest fell back, per GESTURE   ${tally.gFellBack} (${pct(tally.gFellBack, tally.gestures)})`);
	console.log('\n  vocabulary          per CUE            per GESTURE');
	const kinds = new Set([...Object.keys(tally.byKind), ...Object.keys(tally.byGesture)]);
	for (const k of [...kinds].sort((a, b) => (tally.byGesture[b] ?? 0) - (tally.byGesture[a] ?? 0))) {
		const c = tally.byKind[k] ?? 0;
		const g = tally.byGesture[k] ?? 0;
		console.log(`    ${k.padEnd(10)} ${String(c).padStart(5)} ${pct(c, tally.resolved).padStart(7)}     ${String(g).padStart(5)} ${pct(g, tally.gestures).padStart(7)}`);
	}
	// ── PER COMPONENT ────────────────────────────────────────────────────────────
	// The deck rows above answer "does the corpus resolve"; this answers the question a
	// component owner has, which is "does MY component self-present". They are not the same
	// question and the deck view cannot be reduced to this one: a deck mixes components, so a
	// deck at 90% can hide one component at 0%.
	//
	// MIN_CUES exists because a resolve rate over four cues is noise. Components below it are
	// reported as a count, not ranked, so a thin sample cannot top the table.
	const MIN_CUES = 12;
	const compRows = Object.entries(tally.byComponent).map(([name, c]) => ({ name, ...c, rate: c.cues ? c.resolved / c.cues : 0 }));
	const ranked = compRows.filter((r) => r.cues >= MIN_CUES).sort((a, b) => a.rate - b.rate);
	const thin = compRows.filter((r) => r.cues > 0 && r.cues < MIN_CUES);
	const unseen = comps.filter((n) => !(tally.byComponent[n]?.cues > 0));
	console.log(`\n  PER COMPONENT — ${compRows.length} seen, ${ranked.length} with >=${MIN_CUES} cues, ${thin.length} thinner, ${unseen.length} of ${comps.length} never cued`);
	console.log('    worst 15 by resolve rate:');
	console.log(`    ${'component'.padEnd(22)} ${'cues'.padStart(5)} ${'resolved'.padStart(9)}   handle mix`);
	for (const r of ranked.slice(0, 15)) {
		const handles = Object.entries(r.byRole)
			.sort((a, b) => b[1] - a[1])
			.map(([k, v]) => `${k} ${pct(v, r.resolved)}`)
			.join(' · ');
		console.log(`    ${r.name.padEnd(22)} ${String(r.cues).padStart(5)} ${pct(r.resolved, r.cues).padStart(9)}   ${handles || '—'}`);
	}
	if (unseen.length) console.log(`\n    never cued by the corpus (no gesture evidence at all): ${unseen.join(', ')}`);

	// ── THE HANDLE ROSTER ────────────────────────────────────────────────────────
	// A component every one of whose cues lands on `body` never gets a HANDLE: the ink is on the
	// element's own words, so the "name the handle, not the container" model never fires for it.
	// That roster is what #2251 is measured against, and the worst-15 table above cannot show it —
	// a component can resolve 100% of its cues and still never once point at a part.
	//
	// IT IS NOT A DEFECT LIST, and reading it as one is the mistake this comment exists to stop.
	// `body` is the RIGHT answer for two whole classes of target: a chart mark carries no text, so
	// the mark IS the handle; and an `<h2>` or a `<p>` is just words, so its own words are the
	// handle. The `textless` column separates the first; the second is why a component whose only
	// cues are its chart header sits here permanently and correctly.
	const bodyOnly = compRows.filter((r) => r.resolved > 0 && (r.byRole.body ?? 0) === r.resolved).sort((a, b) => b.cues - a.cues);
	console.log(`\n  HANDLE ROSTER — ${bodyOnly.length} components resolve every cue to \`body\` (never a handle):`);
	console.log(`    ${bodyOnly.map((r) => `${r.name}(${r.cues})`).join(' · ') || '—'}`);
	const withHandle = compRows.filter((r) => r.resolved > 0 && (r.byRole.body ?? 0) < r.resolved);
	console.log(`    ${withHandle.length} do get one. Handle mix for the components carrying a declared part:`);
	for (const r of withHandle.filter((x) => x.byRole.part).sort((a, b) => b.byRole.part - a.byRole.part)) {
		const mix = Object.entries(r.byRole).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v, r.resolved)}`).join(' · ');
		console.log(`      ${r.name.padEnd(22)} ${String(r.cues).padStart(5)} cues   ${mix}`);
	}

	if (jsonAt) fs.writeFileSync(jsonAt, `${JSON.stringify({ tally, perDeck }, null, 2)}\n`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
