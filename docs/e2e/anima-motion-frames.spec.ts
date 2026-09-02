import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { expect, test } from './studio-fixture';

// ── Live chart motion, on the REAL Playground ─────────────────────────────────────────
//
// This file exists because of a gap the motion audit found and could not close from a
// harness: across 82 specs in this folder, NONE referenced `data-scene-spec`,
// `scene-live`, `data-anima` or `hydrateScene`. Live motion shipped with zero coverage on
// any surface a person actually uses, so under HARD RULE #23 no claim that it worked had
// evidence. `examples/anima-chart.playground.*.png` are hand-captured stills, not a gate.
//
// It also carries the real-surface half of the anime.js decision
// (engineering/decisions/2026-09-02-frame-model-for-motion.md). The bake-off measured
// anime.js against a hand-rolled painter in a STANDALONE harness — a real browser, but a
// synthetic scene. These tests re-measure the same claim against real funnel marks, in the
// real preview frame, on the built site.
//
// THE ORACLE IS THE FRAME MODEL. A motion is a finite, ordered set of known frames; frame
// k is a deterministic still. So the test is not "does it look animated" (unfalsifiable)
// but: the shipped painter emits a monotonic frame sequence, and anime.js can paint every
// one of those frames to within a fraction of a representable pixel step.
//
// WHY THE DECK IS INLINE rather than read from `examples/anima-chart.md`: the Playground
// renders one deck from localStorage, and this spec asserts on the mark COUNT (4 bands).
// A future edit to that example deck would silently change what this measures.

/** The slice of anime.js v4's UMD global this spec drives. Structural, not the package's
 *  own types: the bundle is injected into the preview frame at runtime, so nothing here is
 *  imported and there is no module to take types from. */
interface AnimeSeekable {
	seek(timeMs: number): void;
}
interface AnimeGlobal {
	utils: { set(target: Element, props: Record<string, number>): void };
	animate(target: unknown, opts: Record<string, unknown>): AnimeSeekable;
	svg?: { createDrawable?(target: Element): unknown };
}
type AnimeWindow = Window & { anime?: AnimeGlobal };

const SOURCE_KEY = 'lattice-docs-pg-source';
const SEEDED = 'e2e-anima-frames-seeded';

// The `funnel` slide from examples/anima-chart.md, with the deck-level `motion: on` that
// makes every rendered chart eligible — no per-slide marker, the default Build style.
const DECK = `---
marp: true
theme: indaco
motion: on
---

<!-- _class: funnel -->

## Build — marks arrive in reading order.

- Visitors \`12,000\`
- Signups \`4,800\`
- Activated \`2,160\`
- Paid \`864\`
`;

// The live marks live in `.scene-live`, NOT in the figure's first svg: the host keeps the
// original chart as a `display:none` POSTER and animates a copy. A bare
// `[data-anima-role=bar]` query matches BOTH and silently reads the poster's frozen
// attributes — which is exactly how an earlier draft of this spec measured 240 frames of
// `null` and looked like a dead animation.
const LIVE_BAR = '.scene-live [data-anima-role="bar"]';

// anime.js is injected as its UMD bundle rather than imported, because the assertion is
// about the PREVIEW FRAME's document — a same-origin `srcdoc` iframe with its own window.
// The package's `exports` map does not expose the bundle path, so resolve the manifest and
// walk from its directory.
const ANIME_UMD = readFileSync(
	path.join(path.dirname(createRequire(import.meta.url).resolve('animejs/package.json')), 'dist/bundles/anime.umd.min.js'),
	'utf8',
);

test.beforeEach(async ({ context, page }) => {
	// Same external stubs as playground-paint.spec.ts — the engine paint here must not be
	// gated on the network.
	await context.route(/mermaid.*\.js($|\?)/, (route) =>
		route.fulfill({ contentType: 'text/javascript', body: 'window.mermaid={initialize(){},run(){},render(){return{svg:""}}};' }),
	);
	await context.route(/katex.*\.css($|\?)/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
	await context.route(/fonts\.googleapis|fonts\.gstatic/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
	// One-shot seed: `addInitScript` re-runs on every document load and the Playground
	// navigates during startup, so an unguarded write re-seeds mid-run (the trap
	// playground-state.spec.ts documents).
	await page.addInitScript(
		([k, md, seeded]) => {
			if (localStorage.getItem(seeded)) return;
			localStorage.setItem(seeded, '1');
			localStorage.setItem(k, md);
		},
		[SOURCE_KEY, DECK, SEEDED] as const,
	);
});

/** Open the Playground and wait for the host to have mounted a LIVE chart copy. */
async function gotoLiveChart(page: import('@playwright/test').Page): Promise<void> {
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(
		(sel) => !!document.querySelector('iframe')?.contentDocument?.querySelector(sel),
		LIVE_BAR,
		{ timeout: 45_000 },
	);
}

/** Sample every mark's `opacity` once per animation frame, for `n` frames. */
function sampleFrames(page: import('@playwright/test').Page, n: number): Promise<(string | null)[][]> {
	return page.evaluate(
		([sel, count]) =>
			new Promise<(string | null)[][]>((resolve) => {
				const d = (document.querySelector('iframe') as HTMLIFrameElement).contentDocument as Document;
				const bars = Array.from(d.querySelectorAll(sel));
				const rows: (string | null)[][] = [];
				let i = 0;
				const tick = () => {
					rows.push(bars.map((b) => b.getAttribute('opacity')));
					if (++i < count) requestAnimationFrame(tick);
					else resolve(rows);
				};
				requestAnimationFrame(tick);
			}),
		[LIVE_BAR, n] as const,
	);
}

test('the shipped painter emits a monotonic frame sequence on the real Playground', async ({ page }) => {
	await gotoLiveChart(page);

	const rows = (await sampleFrames(page, 240)).filter((r) => r.every((v) => v !== null)) as string[][];
	expect(rows.length, 'the host wrote per-frame opacity on the live marks').toBeGreaterThan(0);
	expect(rows[0], 'the funnel renders four bands').toHaveLength(4);

	// Every mark's reveal is monotonic non-decreasing — the frame model's ordering claim.
	// A tween that overshoots or rewinds would break this even while ending correctly.
	for (let mark = 0; mark < 4; mark++) {
		const series = rows.map((r) => Number(r[mark]));
		for (let i = 1; i < series.length; i++) {
			expect(series[i], `mark ${mark} never rewinds between frames ${i - 1} and ${i}`).toBeGreaterThanOrEqual(series[i - 1]);
		}
	}

	// The build is STAGGERED in reading order: the first band is never behind the last.
	const first = rows.map((r) => Number(r[0]));
	const last = rows.map((r) => Number(r[3]));
	expect(Math.max(...first)).toBeGreaterThanOrEqual(Math.max(...last));

	// And it settles fully opaque — the last frame IS the still the PDF already ships.
	await expect
		.poll(async () => page.evaluate((sel) => {
			const d = (document.querySelector('iframe') as HTMLIFrameElement).contentDocument as Document;
			return Array.from(d.querySelectorAll(sel)).map((b) => Number(b.getAttribute('opacity')));
		}, LIVE_BAR), { timeout: 20_000 })
		.toEqual([1, 1, 1, 1]);
});

test('anime.js paints every frame the shipped painter emits, on the real marks', async ({ page }) => {
	await gotoLiveChart(page);
	const rows = (await sampleFrames(page, 240)).filter((r) => r.every((v) => v !== null)) as string[][];
	const frames = [...new Map(rows.map((r) => [r.join('|'), r])).values()];
	expect(frames.length, 'enough distinct frames to be a real sequence').toBeGreaterThan(20);

	await page.evaluate((src) => {
		const d = (document.querySelector('iframe') as HTMLIFrameElement).contentDocument as Document;
		const s = d.createElement('script');
		s.textContent = src;
		d.head.appendChild(s);
	}, ANIME_UMD);

	const result = await page.evaluate(
		([sel, framesIn]) => {
			const frame = document.querySelector('iframe') as HTMLIFrameElement;
			const d = frame.contentDocument as Document;
			const w = frame.contentWindow as AnimeWindow;
			const anime = w.anime;
			if (!anime) return { error: 'anime did not attach to the frame window' };
			const bars = Array.from(d.querySelectorAll(sel));
			let maxDelta = 0;
			let checked = 0;
			for (const want of framesIn) {
				bars.forEach((bar, i) => {
					anime.utils.set(bar, { opacity: Number(want[i]) });
				});
				bars.forEach((bar, i) => {
					checked++;
					const got = Number(w.getComputedStyle(bar).opacity);
					maxDelta = Math.max(maxDelta, Math.abs(got - Number(want[i])));
				});
			}
			// The CHANNEL differs, and the migration has to know: anime writes the CSS
			// property, the shipped painter writes the `opacity` PRESENTATION ATTRIBUTE.
			// Inline style outranks a presentation attribute, so a half-migrated mark would
			// be driven by whichever ran last — not by document order.
			const probe = bars[0] as SVGElement;
			return { checked, maxDelta, writesStyle: probe.style.opacity !== '', keepsAttribute: probe.getAttribute('opacity') !== null };
		},
		[LIVE_BAR, frames] as const,
	);

	expect(result.error).toBeUndefined();
	expect(result.checked).toBeGreaterThan(80);
	// Opacity composites to 8 bits, so one representable step is 1/255 ≈ 0.0039. anime
	// quantizes to ~6 decimals; the bound below is two orders of magnitude INSIDE a single
	// step, i.e. the two painters cannot differ by a pixel. Measured max: ~5.2e-7.
	expect(result.maxDelta, 'anime reproduces each frame well within one 8-bit opacity step').toBeLessThan(1e-5);
	expect(result.writesStyle, 'anime drives the CSS channel').toBe(true);
	expect(result.keepsAttribute, 'the presentation attribute the shipped painter writes is a separate channel').toBe(true);
});

test('createDrawable normalizes real marks and seeks deterministically', async ({ page }) => {
	await gotoLiveChart(page);
	await page.evaluate((src) => {
		const d = (document.querySelector('iframe') as HTMLIFrameElement).contentDocument as Document;
		const s = d.createElement('script');
		s.textContent = src;
		d.head.appendChild(s);
	}, ANIME_UMD);

	const out = await page.evaluate((sel) => {
		const frame = document.querySelector('iframe') as HTMLIFrameElement;
		const d = frame.contentDocument as Document;
		const w = frame.contentWindow as AnimeWindow;
		const anime = w.anime;
		const target = d.querySelector(sel) as SVGElement;
		if (!anime?.svg?.createDrawable) return { error: 'createDrawable missing' };
		const a = anime.animate(anime.svg.createDrawable(target), { draw: '0 1', duration: 1000, autoplay: false, ease: 'linear' });
		const read = () => `${target.getAttribute('stroke-dasharray')}|${target.getAttribute('stroke-dashoffset')}`;
		const at = (t: number) => {
			a.seek(t);
			return read();
		};
		// Three different journeys to the SAME frame. Reading one value twice would pass on
		// a painter that never wrote anything, which is how the first draft of this
		// assertion compared two empty strings and reported success.
		const forward = at(500);
		a.seek(0);
		const fromStart = at(500);
		a.seek(1000);
		const fromEnd = at(500);
		return {
			tag: target.tagName,
			pathLength: target.getAttribute('pathLength'),
			mid: forward,
			deterministic: forward === fromStart && fromStart === fromEnd,
			start: at(0),
			end: at(1000),
		};
	}, LIVE_BAR);

	expect(out.error).toBeUndefined();
	// The whole reason this backend is testable where Vivus was not: createDrawable stamps
	// `pathLength` and works in NORMALIZED units, so it never calls `getTotalLength()` — the
	// call that throws in jsdom and silently disabled the Vivus draw channel.
	expect(out.pathLength, 'createDrawable normalizes rather than measuring geometry').toBe('1000');
	expect(out.mid, 'the mid frame actually painted').toMatch(/\d/);
	expect(out.deterministic, 'the same frame index yields the same still from any seek path').toBe(true);
	expect(out.start).not.toBe(out.end);
});
