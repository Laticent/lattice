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

	const chrome = resolveChrome();
	if (!chrome) {
		console.error('sweep-guide-gestures: no Chromium (set CHROME_PATH) — SKIPPED, nothing measured.');
		process.exit(0);
	}
	fs.mkdirSync(OUT, { recursive: true });
	const guideJs = await bundleGuide();
	const puppeteer = require('puppeteer');
	const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });

	const tally = { cues: 0, resolved: 0, notable: 0, fellBack: 0, byKind: {}, gestures: 0, rests: 0, hides: 0, byGesture: {}, byRole: {}, spanned: 0, spanPartial: 0, spanRatio: [], gFellBack: 0, decks: 0, slidesNoCue: 0, slidesWithNarration: 0 };
	const perDeck = [];
	try {
		for (const md of decks().slice(0, limit)) {
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
				(cueEntries, halfParent, presentWidth) => {
					const G = window.LatticeGuide;
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
						const frame = { left: r.left, top: r.top, width: r.width, height: r.height };
						const half = halfParent / (presentWidth / (r.width || presentWidth));
						let any = false;
						// THE CADENCE, REPLAYED. Guide gestures on a BLOCK change and RESTS when a cue
						// resolves to the element the last one did, so a per-cue tally describes a
						// population no viewer sees. `prev` reproduces `PresentOverlay`'s rest guard.
						let prev = null;
						for (const text of cues) {
							const d = G.guideCueIn(sec, text, frame, half, half + 5);
							if (d) any = true;
							const rest = !!d && d.el === prev;
							prev = d ? d.el : null;
							const spanned = !hasBlock(sec, text);
							// ROUND TWO'S CROSS-CHECK, RESTORED. It measured that relaxing the matcher bought
							// reach by landing on elements holding a fraction of the sentence, and refused the
							// change. This branch relaxes the matcher, so it owes the same number: how much of
							// the spoken sentence the resolved element actually holds, and how often the climb
							// gave up and handed back a partial answer.
							const partial = spanned ? G.resetSpanPartial() > 0 : false;
							const ratio = spanned && d ? (d.el.textContent ?? '').replace(/\s+/g, ' ').trim().length / Math.max(1, text.length) : null;
							out.push(d ? { kind: d.kind, role: d.role, notable: d.strength === 'notable', fellBack: d.fellBack, rest, spanned, partial, ratio } : null);
						}
						out.push({ slideDone: true, any });
					}
					return out;
				},
				[...cuesBySlide.entries()],
				HALF_PARENT,
				PRESENT_WIDTH,
			);
			await page.close();

			const deckRow = { deck: path.relative(ROOT, md), cues: 0, resolved: 0, byKind: {} };
			for (const row of rows) {
				if (row?.slideDone) {
					tally.slidesWithNarration += 1;
					if (!row.any) tally.slidesNoCue += 1;
					continue;
				}
				tally.cues += 1;
				deckRow.cues += 1;
				if (!row) {
					tally.hides += 1;
					continue;
				}
				tally.resolved += 1;
				deckRow.resolved += 1;
				tally.byKind[row.kind] = (tally.byKind[row.kind] ?? 0) + 1;
				tally.byRole[row.role] = (tally.byRole[row.role] ?? 0) + 1;
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
				tally.gestures += 1;
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
	console.log(`  matched piecewise (a label joined to its body)  ${tally.spanned} (${pct(tally.spanned, tally.resolved)})`);
	console.log(`    of those, a PARTIAL answer (the climb gave up)  ${tally.spanPartial} (${pct(tally.spanPartial, tally.spanned)})`);
	console.log(`    resolved-element text / cue text — p10 ${q(0.1)} · median ${q(0.5)} · p90 ${q(0.9)}`);
	console.log(`  handle:  ${Object.entries(tally.byRole).map(([k, v]) => `${k} ${v} (${pct(v, tally.resolved)})`).join(' · ')}`);
	console.log(`\n  THE CADENCE — what a viewer actually sees:`);
	console.log(`    gestures ${tally.gestures} · rests ${tally.rests} (${pct(tally.rests, tally.resolved)} of resolved cues) · hides ${tally.hides}`);
	console.log(`    rest fell back, per GESTURE   ${tally.gFellBack} (${pct(tally.gFellBack, tally.gestures)})`);
	console.log('\n  vocabulary          per CUE            per GESTURE');
	const kinds = new Set([...Object.keys(tally.byKind), ...Object.keys(tally.byGesture)]);
	for (const k of [...kinds].sort((a, b) => (tally.byGesture[b] ?? 0) - (tally.byGesture[a] ?? 0))) {
		const c = tally.byKind[k] ?? 0;
		const g = tally.byGesture[k] ?? 0;
		console.log(`    ${k.padEnd(10)} ${String(c).padStart(5)} ${pct(c, tally.resolved).padStart(7)}     ${String(g).padStart(5)} ${pct(g, tally.gestures).padStart(7)}`);
	}
	if (jsonAt) fs.writeFileSync(jsonAt, `${JSON.stringify({ tally, perDeck }, null, 2)}\n`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
