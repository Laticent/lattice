import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, gotoStudio, livePreview, railButtons, setEditorContent, test } from './studio-fixture';

// Preview RENDER-PATH perf, measured on the real built Studio — the instrument HARD RULE #19
// wants for any claim about the preview's cost, and the one HARD RULE #23 accepts (a real
// browser driving the real app, not a Node timing of the engine in isolation).
//
// WHY IT LIVES HERE rather than in a scratch script: `docs/scripts/frame-bench.mjs` reports
// LCP + the patch/write FRAME regimes, but it drives an edit by focusing `.cm-content` and
// typing — which silently does NOTHING in the shipped default posture, where the editor is not
// on screen. This suite's fixture already solves that (`gotoStudio` seeds `posture: 'build'`
// before hydration; `focusEditor` targets the "Deck source" label and FAILS LOUDLY on a hidden
// element; `setEditorContent` uses insertText so a multi-line deck's `---` separators survive
// the editor's markdown auto-continuation). Reusing it is the difference between a measurement
// and a plausible-looking zero.
//
// TAGGED @perf and NOT ON THE PR GATE — these are wall-clock numbers and would be flaky as a merge
// blocker. What blocks a merge is the WORK COUNTER (docs/src/lib/preview-work-budget.test.ts),
// which counts renders instead of timing them. Run this one deliberately:
//   npx playwright test --project=desktop --grep @perf
//
// WHERE IT RUNS, precisely — an earlier version of this note said "not in any project's grep",
// which was wrong. The `desktop` project's only filter is `grepInvert: /@mobile|@webkit/`, so
// @perf IS in its default selection and any bare `test:e2e` picks it up. Since these assertions
// became real ceilings, `studio-e2e-nightly.yml` excludes @perf explicitly (`--grep-invert @perf`)
// so the suite runs ONCE a night, in perf-nightly.yml's engine-perf job, which is the workflow that
// can actually file an issue about a breach.
//
// WHAT IT MEASURES. Both interactions that drive a preview render, separately, because the
// deck-context render made them diverge sharply:
//   · NAVIGATION — click a rail slide. Only the shown index changes, so the whole-deck memo in
//     single-slide-render.ts hits and the engine does no work.
//   · TYPING — real keystrokes into the shown slide. The markdown changed, so the memo misses
//     by construction and the whole deck is re-parsed. This is the expensive case.
// Samples come from `window.__latticeRenderMetrics` (the tooling hook in render-metrics.ts),
// raw per-render rather than the overlay's EMA.

// TWO decks, because the cost axis is CONTENT, not slide count — the single most misleading
// thing about an early version of these numbers. A 40-slide prose deck and 40 slides of the
// GALLERY (every chart, map, diagram and math block in the library) differ by ~4x on the same
// render path, so one figure alone invites the wrong conclusion about which decks are affected.
function proseSlides(n: number): string {
	return Array.from({ length: n }, (_, i) => `## Slide ${i + 1}\n\nBody text for slide ${i + 1}, with enough prose to be a real section.`).join('\n\n---\n\n');
}
/** Pagination ON — the case that needs a deck-context render. */
function proseDeck(n: number): string {
	return `---\npaginate: true\n---\n\n${proseSlides(n)}\n`;
}
/**
 * THE PRODUCT'S DEFAULT SHAPE: no `paginate`, no running-global directive comment, no divider — so
 * nothing the deck could contribute to the shown slide. `paginate` is a default-OFF toggle in Deck
 * Setup and none of the three shipped Studio decks sets it, so this is the common case, not an edge
 * one. It exists as its own variant because the two decks above both opt IN to pagination, which
 * meant an earlier version of this spec measured only the expensive path and could not see whether
 * gating the deck render helped at all.
 */
function defaultDeck(n: number): string {
	return `---\ntheme: indaco\n---\n\n${proseSlides(n)}\n`;
}
/** The first `n` slides of the real gallery — the heavy end of what authors actually write. */
function galleryDeck(n: number): string {
	// ESM: no __dirname. Resolve from this module's own URL.
	const here = path.dirname(fileURLToPath(import.meta.url));
	const src = fs.readFileSync(path.join(here, '../../test/integration/baseline-decks/gallery.md'), 'utf8');
	const fm = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n/.exec(src)?.[0] ?? '';
	// Fence-aware split: a bare /\n---\n/ cuts inside a mermaid block's own front matter.
	const chunks: string[][] = [[]];
	let fence = false;
	for (const line of src.slice(fm.length).split('\n')) {
		if (/^\s*(```|~~~)/.test(line)) fence = !fence;
		if (!fence && /^-{3,}\s*$/.test(line)) { chunks.push([]); continue; }
		chunks[chunks.length - 1].push(line);
	}
	const slides = chunks.map((c) => c.join('\n').trim()).filter(Boolean).slice(0, n);
	return `${fm.replace(/\n---[ \t]*\n$/, '\npaginate: true\n---\n')}${slides.join('\n\n---\n\n')}\n`;
}

type Sample = { engineMs: number; frameMs: number; totalMs: number; writePath?: string };

/** Subscribe to raw render samples and reset the buffer. */
async function collectFrom(page: import('@playwright/test').Page): Promise<void> {
	await page.waitForFunction(() => !!(window as unknown as { __latticeRenderMetrics?: unknown }).__latticeRenderMetrics);
	await page.evaluate(() => {
		const w = window as unknown as { __bench: Sample[]; __latticeRenderMetrics: { on: (cb: (s: Record<string, unknown>) => void) => void } };
		w.__bench = [];
		w.__latticeRenderMetrics.on((s) => {
			const r = (s.raw as Record<string, number>) ?? (s as unknown as Record<string, number>);
			w.__bench.push({ engineMs: r.engineMs, frameMs: r.frameMs, totalMs: r.totalMs, writePath: s.writePath as string });
		});
	});
}
const drain = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __bench: Sample[] }).__bench);
const reset = (page: import('@playwright/test').Page) => page.evaluate(() => { (window as unknown as { __bench: Sample[] }).__bench = []; });

/**
 * CEILINGS, from test/benchmark/preview-budget.json — budgets, not a measured baseline.
 *
 * The earlier stance here was "printed, not asserted, because a wall-clock assertion would be a
 * flaky gate". Half right: a wall-clock assertion that tries to resolve a PERCENTAGE is flaky —
 * this repo's own `bench:check` read 93.9ms and 43.1ms for identical code in one session. But the
 * regression worth catching is 13x (gallery typing 4.4ms healthy, 63.2ms before #1280), and a
 * ceiling several times healthy catches that while staying well clear of drift. So this asserts a
 * cliff, and only a cliff. Ceilings are keyed on INTERACTION, not deck, so one cap covers both a
 * cheap prose deck and the gallery — which is why they are set against the WORST healthy reading
 * across three runs rather than a representative one. An earlier cut sized them off a single run
 * and left gallery navigation only 2.2x of headroom, a false alarm waiting for a slow runner.
 *
 * Ceilings never need re-blessing per machine — that is the point of a budget over a baseline.
 *
 * A MACHINE TOKEN (`BREACH_TOKEN` below) is how the nightly tells a real breach from a broken
 * harness. It used to grep the failure log for the word "ceiling" — which also appears in the
 * NO-PATCH-RENDERS assertion below and in prose like this, so any harness failure that printed a
 * code frame was filed as "a per-keystroke p50 went past its budget" about a p50 nothing measured.
 *
 * The token is BUILT, not written literally, and this comment does not spell it — because a comment
 * containing it would be matched by the very grep it explains, which is the same class of bug one
 * level up. Only the three ceiling assertions may emit it.
 */
/** Assembled, so the literal never appears anywhere a code frame or grep could pick it up. */
const BREACH_TOKEN = `::perf-${'ceiling'}-breach::`;
const HERE = path.dirname(fileURLToPath(import.meta.url)); // ESM: no __dirname
type InteractionCap = { renderP50: number; totalP50: number; frameP50: number };
const BUDGET = JSON.parse(fs.readFileSync(path.join(HERE, '../../test/benchmark/preview-budget.json'), 'utf8')) as {
	// `firstPaint` is a different SHAPE, not another interaction: boot is one elapsed span,
	// not an engine/frame/total split, so it carries a single `p50` (see the cold-paint test).
	ceilings: Record<'navigation' | 'typing', InteractionCap> & { firstPaint: { p50: number } };
};

function report(label: string, samples: Sample[], interaction?: 'navigation' | 'typing', deck?: string): void {
	const patch = samples.filter((s) => s.writePath === 'patch');
	const p50 = (a: number[]) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : Number.NaN);
	const f = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '--');
	console.log(`\n${label}`);
	const regimes: Record<string, number> = {};
	for (const s of samples) regimes[s.writePath ?? '?'] = (regimes[s.writePath ?? '?'] ?? 0) + 1;
	console.log(`  regimes: ${JSON.stringify(regimes)}`);
	for (const [i, s] of patch.entries()) console.log(`    #${String(i + 1).padStart(2)}  RENDER ${f(s.engineMs).padStart(6)}  FRAME ${f(s.frameMs).padStart(5)}  TOTAL ${f(s.totalMs).padStart(6)}`);
	console.log(`  n=${patch.length}  RENDER p50 ${f(p50(patch.map((s) => s.engineMs)))}  FRAME p50 ${f(p50(patch.map((s) => s.frameMs)))}  TOTAL p50 ${f(p50(patch.map((s) => s.totalMs)))}  TOTAL max ${f(Math.max(...patch.map((s) => s.totalMs)))}`);

	// THE CLIFF. Asserted on p50, not max: one slow sample is a GC pause or a scheduler hiccup, and
	// gating on it would be the flaky gate the old note rightly feared. A p50 past the ceiling means
	// the typical keystroke got an order of magnitude more expensive, which is a code change.
	if (!interaction) return;
	// THE GUARD IS QUIETEST WHEN THE REGRESSION IS WORST, unless this line exists. Every ceiling
	// below is computed over the PATCH samples only, and a change that pushes renders onto the
	// WRITE path (a deck-memo key that always misses, a size/mermaid recompute forcing a full
	// srcdoc rebuild — "tens to hundreds of ms" per render-metrics.ts) makes every interaction
	// 10-50x slower AND shrinks `patch` toward zero. The early version returned before asserting
	// anything in that case, so the worst possible outcome reported green. Typing had this
	// backstop; navigation did not.
	expect(patch.length, `${deck} ${interaction}: no patch renders at all — every render took the full-rebuild WRITE path, which is a far bigger regression than any ceiling here`).toBeGreaterThan(0);
	const cap = BUDGET.ceilings[interaction];
	const renderP50 = p50(patch.map((s) => s.engineMs));
	const totalP50 = p50(patch.map((s) => s.totalMs));
	expect(renderP50, `${BREACH_TOKEN} ${deck} ${interaction}: RENDER p50 ${f(renderP50)}ms is past the ${cap.renderP50}ms ceiling — an order-of-magnitude regression, not drift`).toBeLessThan(cap.renderP50);
	expect(totalP50, `${BREACH_TOKEN} ${deck} ${interaction}: TOTAL p50 ${f(totalP50)}ms is past the ${cap.totalP50}ms ceiling`).toBeLessThan(cap.totalP50);
	// FRAME is the DOM-WRITE cost inside the preview iframe: on the patch path it spans the
	// innerHTML swap plus `scaleFrame`, taken synchronously (single-slide-render.ts). It is NOT the
	// resident runtime's full pass — the fit spine, chart paint and overflow watcher run off a
	// MutationObserver microtask that is delivered AFTER this span closes, so they land in TOTAL,
	// not here. An earlier version of this comment claimed FRAME covered them; it does not, and the
	// numbers say so (1.4-1.9ms at 4x CPU throttle is an innerHTML assignment, not a gallery
	// slide's chart paint). What it does guard is real and was guarded by nothing: a change that
	// makes the swap itself expensive — a heavier scaleFrame, a synchronous measure per write —
	// shows up here and nowhere else, since RENDER stops at the engine boundary.
	const frameP50 = p50(patch.map((s) => s.frameMs));
	expect(frameP50, `${BREACH_TOKEN} ${deck} ${interaction}: FRAME p50 ${f(frameP50)}ms is past the ${cap.frameP50}ms ceiling — the in-frame runtime got materially more expensive`).toBeLessThan(cap.frameP50);
}

// SERIAL, and not negotiable for this file: these cases each throttle their browser to 4x CPU, so
// running them in parallel workers puts three throttled Chromiums in contention and every number
// comes out inflated and unstable (it also produced an intermittent failure). A perf measurement
// that competes with itself measures the harness, not the code.
test.describe.configure({ mode: 'serial' });

for (const kind of ['default', 'prose', 'gallery'] as const) {
test(`@perf preview render path — navigation vs typing (${kind} deck)`, async ({ page, context }) => {
	test.setTimeout(300_000);
	const SLIDES = 40;
	const CPU = 4; // the throttle the perf-diagnosis doc reasons about (a mid-range phone)

	await gotoStudio(page);
	await setEditorContent(page, kind === 'default' ? defaultDeck(SLIDES) : kind === 'prose' ? proseDeck(SLIDES) : galleryDeck(SLIDES));
	// The rail is the oracle that the deck actually landed — 40 slides, not one mangled blob.
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(SLIDES);
	await expect(livePreview(page).locator('.lattice section').first()).toBeVisible();

	await collectFrom(page);
	const cdp = await context.newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });

	// ── NAVIGATION: only the shown index changes → the whole-deck memo should hit ──
	await reset(page);
	const rail = railButtons(page);
	for (let pass = 0; pass < 2; pass++) {
		for (let i = 0; i < 10; i++) {
			await rail.nth(i).click();
			await page.waitForTimeout(700);
		}
	}
	report(`NAVIGATION — ${SLIDES} ${kind} slides, CPU ${CPU}x`, await drain(page), 'navigation', kind);

	// ── TYPING: the markdown changes → the memo misses, the whole deck is re-parsed ──
	// Put the caret in the SHOWN slide, so the edit is one the preview must reflect. (Typing
	// into a slide the preview is not showing is a separate case: before deck context it cost
	// nothing at all, because the render sample was only the shown slide.)
	// Show the LAST slide, so `ControlOrMeta+End` (the document's end) is guaranteed to sit inside
	// it whatever the deck's shape. Counting ArrowDowns from the top is deck-shape dependent and
	// overshoots a short slide — which reads as "zero renders" on the baseline and looks like a
	// finding rather than a broken harness.
	const last = (await rail.count()) - 1;
	await rail.nth(last).click();
	await page.waitForTimeout(800);
	// Focus and position the caret ONCE, then type with raw keystrokes. `typeInEditor` re-clicks
	// the editor on every call, which re-seats the caret wherever the click lands — and that
	// silently invalidates the comparison: before deck context the preview re-rendered ONLY when
	// the shown slide's own text changed, so an uncontrolled caret makes the baseline read as
	// zero renders rather than as its real cost.
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.waitForTimeout(500);
	await reset(page);
	for (let i = 0; i < 14; i++) {
		await page.keyboard.type('x');
		await page.waitForTimeout(700);
	}
	const typed = await drain(page);
	report(`TYPING (shown slide) — ${SLIDES} ${kind} slides, CPU ${CPU}x`, typed, 'typing', kind);
	// A zero here means the caret was not in the shown slide, not that typing is free.
	expect(typed.filter((s) => s.writePath === 'patch').length, 'typing produced no patch renders — caret not in the shown slide?').toBeGreaterThan(0);

	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
	// The only hard assertion: renders actually happened. A silently-zero harness is the
	// failure mode this spec exists to prevent (see the header note).
	expect((await drain(page)).length).toBeGreaterThan(0);
});
}

// ── COLD FIRST PAINT — the boot cost nothing else guards (#1586) ────────────────
//
// Everything above measures a render that happens AFTER the app is up. Nothing in the
// repo asserted how long it takes to GET up: `studio-instant-shell.spec.ts` waits 45s on
// the preview iframe but asserts layout, Lighthouse's LCP is the parent document (the
// engine paints inside the `iframe.live` srcdoc and never contributes), and `script-size`
// / TBT catch bundle bloat rather than a slower render — both against 24h-ago `main`, so
// a few percent a day never trips them. The only thing that had ever failed on a slow
// cold paint was `gotoStudio`'s fixture wait, which #1583 raised from 15s to 45s for
// reasons about worker starvation and not about the app.
//
// IN THIS FILE, not its own, and that is load-bearing: `--grep @perf` is how the nightly
// selects this tier (perf-nightly.yml), and a second @perf FILE would run concurrently
// with this one at `workers: 2`. Boot timings taken beside three CPU-throttled render
// tests measure the contention, and cold context launches beside them would inflate their
// keystroke p50s in return. One file is `mode: 'serial'` (configured above), so neither
// happens. LAST in the file for the same reason stated once: serial mode skips what
// follows a failure, so a boot breach must not be able to skip the render ceilings.
//
// NO CPU THROTTLE, unlike everything above. The render tests model a mid-range phone
// because that is where a slow keystroke is felt. Boot is the number a user waits on with
// whatever machine they have, and the regression worth catching here — a chunk that stops
// being preloaded, a blocking script on the boot path, an island that hydrates later — is
// a multiple, not a percentage. Throttling would add variance without adding sensitivity.
//
// MEASURED THROUGH THE FIXTURE'S OWN ANNOTATION rather than a stopwatch in this spec:
// `waitForStudioPaint` records every paint it performs, so the spec and the fixture cannot
// drift into measuring two different milestones.
test('@perf studio cold first paint stays under its ceiling', async ({ browser }) => {
	test.setTimeout(180_000);
	const SAMPLES = 7;

	for (let i = 0; i < SAMPLES; i++) {
		// A FRESH CONTEXT per sample — this measures a COLD visit, and a reused context
		// carries a warm HTTP cache, a warm module graph and a populated localStorage, so
		// samples 2..n would answer a different question than sample 1.
		const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
		try {
			await gotoStudio(await ctx.newPage());
		} finally {
			await ctx.close();
		}
	}

	const ms = test
		.info()
		.annotations.filter((a) => a.type === 'first-paint')
		.map((a) => Number.parseInt(a.description ?? '', 10))
		.filter(Number.isFinite);
	// The instrument, asserted before what it measures: a fixture that stopped annotating
	// would leave `ms` empty and every ceiling below vacuously green.
	expect(ms.length, `no first-paint annotations — waitForStudioPaint stopped recording, so this ceiling measured nothing`).toBe(SAMPLES);

	const sorted = [...ms].sort((a, b) => a - b);
	const p50 = sorted[Math.floor(sorted.length / 2)];
	console.log(`\nCOLD FIRST PAINT — ${SAMPLES} fresh contexts, no throttle`);
	console.log(`  samples: ${ms.join(', ')} ms`);
	console.log(`  p50 ${p50}ms  min ${sorted[0]}ms  max ${sorted[sorted.length - 1]}ms`);

	const cap = BUDGET.ceilings.firstPaint.p50;
	expect(p50, `${BREACH_TOKEN} cold first paint: p50 ${p50}ms is past the ${cap}ms ceiling — the Studio takes materially longer to become usable, which is a code change, not drift`).toBeLessThan(cap);
});
