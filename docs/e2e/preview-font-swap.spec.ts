import { expect, test } from '@playwright/test';
import { PREVIEW_FONT_GATE_MS } from '../../lib/core/preview-font-gate.mjs';

// ── THE PREVIEW FRAME MUST NOT RE-SOLVE ITS LAYOUT ON THE FONT SWAP ───────────────
//
// Every `@font-face` the engine emits is `font-display: swap` (tools/build-css.js).
// So a preview document laid out once against FALLBACK metrics, painted, and
// re-solved when the real face arrived — and NOTHING in the engine reported it.
// The slide box is pinned to its `@size`, so no box overflows, no fit channel
// fires, no probe rings: the text simply moves, once, while the reader is already
// looking at it. #2095 removed this for matrix-grid's columns alone by pinning
// `table-layout: fixed` at wide; this guards the CAUSE, for every component.
//
// THE ORACLE is the one `playground-first-paint.spec.ts` established, pointed
// inside the frame: not "does it end up right" — every other assertion on this
// surface already waits for the settled state, which is how a dead pre-paint
// mechanism passed CI for months — but "how many layouts did a person SEE".
// Sample every animation frame while `.lattice` is visible and require exactly ONE.
//
// FOUR TRAPS, every one of them paid for while writing this:
//
//   1. `serviceWorkers: 'block'` is NOT optional. The docs site is a PWA, and a
//      service-worker-served response never reaches a route handler — so the
//      fonts-blocked control silently does nothing. Measured: without it, the
//      blocked and allowed signatures came back BYTE-IDENTICAL, which reads as a
//      clean pass over the exact window the defect lives in.
//   2. `renderDeck` REWRITES the srcdoc, and each write mints a fresh document.
//      Reading a log off the frame at the end reads the LAST document, which is
//      cache-warm and shows no swap. Every document ships its samples out as it
//      takes them, and they are grouped per document.
//   3. On localhost the faces land inside a frame or two, so the swap is real but
//      too narrow to sample. The run MODELS a link rather than pretending
//      localhost is one — the same argument `scripts/fouc-bench.mjs` makes about
//      its own measurement.
//   4. A component whose fallback and webfont solves happen to agree would make a
//      clean run VACUOUS. The last test is the falsifiability half: the two solves
//      must genuinely differ, or this spec is measuring nothing.
//
// NOT a matrix-grid deck, deliberately. `list` and `cards-grid` are the proof that
// this is the root cause and not one component's quirk.
//
// See lib/core/preview-font-gate.mjs and engineering/jank.md.

test.use({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });

const SOURCE_KEY = 'lattice-docs-pg-source';

const DECK = `---
theme: indaco
---

<!-- _class: list -->

\`Reach\`

## Where the quarter actually went

- Enterprise renewals
  - Three of the five largest accounts re-signed at a higher tier.
- Self-serve conversion
  - The onboarding rewrite moved trial-to-paid from 4.1% to 6.8%.
- Partner channel
  - Flat, and the pipeline says it stays flat through Q3.

---

<!-- _class: cards-grid -->

\`Operating picture\`

## Three things we changed

- Pricing
  - Moved to seat bands, which removed the per-call negotiation.
- Support
  - One queue, staffed to the p95 rather than the median.
- Roadmap
  - Published externally, so the field stops inventing dates.
`;

/** Per-document geometry sample: `shown` is how many distinct layouts that one
 *  document put in front of a reader. */
type DocSamples = { shown: number; at: number[]; settled: string | null };

/** Runs in EVERY document. Ships a sample out only when the frame's text geometry
 *  CHANGES *while it is visible*, so a re-solve behind the reveal gate — which is
 *  exactly what the fix is allowed to do — is correctly not counted. */
function sampler(durationMs: number) {
	if (location.href.indexOf('srcdoc') === -1) return;
	const push = (window as unknown as { __geom?: (e: unknown) => void }).__geom;
	if (typeof push !== 'function') return;
	const docId = Math.random().toString(36).slice(2, 8);
	const t0 = performance.now();
	// ANNOUNCE THE DOCUMENT AS SOON AS IT HAS PAINTED CONTENT, independently of whether
	// it was ever revealed. Without this the spec is blind to its own worst failure: a
	// document that stays hidden forever emits no geometry samples, so it never enters
	// the per-document map and cannot fail the "exactly one layout" assertion — a
	// stranded second document would pass green behind a healthy first one.
	let announced = false;
	const announce = () => {
		if (announced || !document.querySelector('.lattice')) return;
		announced = true;
		push({ docId, painted: true });
	};
	// Element-owned text only — the honest unit (engineering/jank.md). A wrapper's
	// box spans its children whatever the metrics do, so it cannot see a re-solve.
	const signature = () => {
		const lat = document.querySelector('.lattice');
		if (!lat) return null;
		const out: number[][] = [];
		const walk = document.createTreeWalker(lat, NodeFilter.SHOW_TEXT);
		let n = walk.nextNode();
		while (n) {
			if (n.nodeValue?.trim()) {
				const r = document.createRange();
				r.selectNodeContents(n);
				const rects = r.getClientRects();
				for (let i = 0; i < rects.length; i++) {
					const b = rects[i];
					out.push([Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.width * 10) / 10]);
				}
			}
			n = walk.nextNode();
		}
		return out.length ? JSON.stringify(out) : null;
	};
	let last: string | null = null;
	const tick = () => {
		announce();
		const lat = document.querySelector('.lattice');
		if (lat && getComputedStyle(lat).visibility === 'visible') {
			const sig = signature();
			if (sig && sig !== last) {
				last = sig;
				push({ docId, t: Math.round(performance.now() - t0), sig });
			}
		}
		if (performance.now() - t0 < durationMs) requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
}

/** How long the in-frame sampler keeps watching. Generous: it costs nothing, and
 *  it must outlast the OBSERVE window below on a loaded box. */
const SAMPLE_MS = 12_000;

// The ABSENCE window is the literal `1500` in `measure` below, deliberately not a
// named constant: `checkE2ESleeps` censuses the ARGUMENT TEXT, so a named one shows
// up in the gate (and in SANCTIONED_E2E_SLEEPS) as an opaque identifier rather than
// as the duration a reviewer has to judge.

/** Drive the real Playground with the deck above and return what each preview
 *  document showed. `faces` chooses the arm: a modeled link, an outright block, or
 *  a request that never answers. */
async function measure(
	page: import('@playwright/test').Page,
	faces: { mode: 'delay' | 'block' | 'hang'; delayMs?: number },
): Promise<DocSamples[]> {
	const samples: { docId: string; t?: number; sig?: string; painted?: boolean }[] = [];
	await page.exposeBinding('__geom', (_src, entry) => {
		samples.push(entry as { docId: string; t?: number; sig?: string; painted?: boolean });
	});

	await page.route(/\.woff2(\?|$)/, async (route) => {
		if (faces.mode === 'hang') return new Promise<void>(() => {});
		if (faces.mode === 'block') return route.abort();
		await new Promise((r) => setTimeout(r, faces.delayMs ?? 400));
		return route.continue();
	});
	await page.route(/fonts\.googleapis|fonts\.gstatic/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
	await page.route(/mermaid.*\.js($|\?)/, (route) =>
		route.fulfill({ contentType: 'text/javascript', body: 'window.mermaid={initialize(){},run(){},render(){return{svg:""}}};' }),
	);

	await page.addInitScript(`(${sampler.toString()})(${SAMPLE_MS})`);
	await page.addInitScript(
		([key, src]) => {
			try {
				localStorage.setItem(key, src);
			} catch (_e) {}
		},
		[SOURCE_KEY, DECK],
	);

	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });

	// POLL the real signal — the preview has shown at least one layout AND the
	// document's own gate reports its faces settled. The gate always resolves (it
	// races its own backstop), so this terminates on every arm, the hung-face one
	// included.
	await expect
		.poll(
			async () => {
				if (!samples.length) return false;
				for (const f of page.frames()) {
					if (f === page.mainFrame()) continue;
					try {
						if (await f.evaluate(() => (window as unknown as { __latticeFontsSettled?: boolean }).__latticeFontsSettled === true)) return true;
					} catch {
						/* frame torn down mid-read — try the next tick */
					}
				}
				return false;
			},
			{ timeout: 25_000, message: 'no preview frame ever revealed a layout and reported its faces settled' },
		)
		.toBe(true);

	// …then OBSERVE. This one is a fixed wait on purpose and it is the only one:
	// the claim is that NOTHING more happens, which by construction has no signal
	// to poll — a poll goes green on its first tick, before the second layout it
	// exists to catch could have been painted.
	await page.waitForTimeout(1500);

	const byDoc = new Map<string, typeof samples>();
	for (const s of samples) {
		if (!byDoc.has(s.docId)) byDoc.set(s.docId, []);
		byDoc.get(s.docId)?.push(s);
	}
	// A document contributes an entry whether or not it revealed: the `painted` marker
	// puts it in the map, and `shown` counts only the GEOMETRIES, so a stranded
	// document lands here as `shown: 0` and fails the assertion instead of vanishing.
	return [...byDoc.values()].map((entries) => {
		const geoms = entries.filter((e) => e.sig !== undefined);
		return {
			shown: geoms.length,
			at: geoms.map((e) => e.t as number),
			settled: geoms.length ? (geoms[geoms.length - 1].sig as string) : null,
		};
	});
}

test('the preview frame shows ONE layout, not a fallback solve and then a webfont one', async ({ page }) => {
	const docs = await measure(page, { mode: 'delay', delayMs: 400 });

	expect(docs.length, 'no preview document ever became visible — the reveal gate is stuck').toBeGreaterThan(0);
	for (const doc of docs) {
		expect(
			doc.shown,
			doc.shown === 0
				? 'a preview document PAINTED but was never revealed — the gate stranded it hidden, which is ' +
					'worse than the shift it exists to remove. Check the backstop timer in ' +
					'lib/core/preview-font-gate.mjs and the revealer that waits on it.'
				: `a preview document showed ${doc.shown} distinct layouts (at ${doc.at.join('ms, ')}ms). ` +
					'Exactly one is the contract: the second is the font swap re-solving a layout the reader is ' +
					'already reading. Check that lib/core/preview-font-gate.mjs is still injected in the HEAD of ' +
					'the document built by docs/src/playground/deck-preview.js.',
		).toBe(1);
	}
});

test('a face fetch that NEVER answers still reveals the preview', async ({ page }) => {
	// The gate trades a shift for a wait, and the wait must be bounded. If this
	// regresses, the failure is a preview that never appears — strictly worse than
	// the defect the gate exists to fix.
	const docs = await measure(page, { mode: 'hang' });
	expect(docs.length, 'no preview document ever painted, so this arm measured nothing').toBeGreaterThan(0);
	// Bounded by the gate's own backstop plus slack, not by the sampler's window:
	// asserting against the window would pass on a gate whose bound had been raised
	// to anything under it.
	// Every document must have revealed — `shown: 0` is the stranded case — and it must
	// have been the BACKSTOP that released it, not something earlier. An ungated reveal
	// would land near first paint, so the lower bound is what carries the claim; the
	// upper bound only says the backstop is still bounded.
	for (const doc of docs) expect(doc.shown, 'a document painted and never revealed under hung faces').toBeGreaterThan(0);
	const first = Math.min(...docs.map((d) => d.at[0]));
	expect(first, 'the preview revealed BEFORE the gate bound, so something other than the backstop released it — with every face hung, that means the reveal is not gated at all').toBeGreaterThan(
		PREVIEW_FONT_GATE_MS * 0.5,
	);
	expect(first, 'the preview revealed far later than the gate bound — the backstop is not what released it').toBeLessThan(
		PREVIEW_FONT_GATE_MS + 2000,
	);
});

test('@smoke the two font solves genuinely differ, so a clean run is not vacuous', async ({ page }) => {
	// Falsifiability, in the shape `test/integration/invariants/jank-sweep.test.js`
	// uses: a geometry rig that quietly stops being able to see a shift reports
	// "clean" for the same reason an unplugged smoke alarm reports no fire.
	const withFaces = await measure(page, { mode: 'delay', delayMs: 0 });
	const context = page.context();
	const second = await context.newPage();
	const withoutFaces = await measure(second, { mode: 'block' });

	const lastWith = withFaces[withFaces.length - 1]?.settled ?? null;
	const lastWithout = withoutFaces[withoutFaces.length - 1]?.settled ?? null;
	// Both must actually have a geometry. `settled` is null for a document that painted
	// and never revealed, and `null !== null` is false — so without these two lines a
	// pair of stranded documents would satisfy the "they differ" assertion below by
	// having nothing to compare, which is the vacuity this arm exists to rule out.
	expect(lastWith, 'the fonts-allowed run produced no visible geometry to compare').not.toBeNull();
	expect(lastWithout, 'the fonts-blocked run produced no visible geometry to compare').not.toBeNull();
	expect(
		lastWith,
		'the fallback solve and the webfont solve produced the SAME geometry, so the test above ' +
			'cannot distinguish a gated reveal from an ungated one. Pick a deck whose metrics move.',
	).not.toBe(lastWithout);
});
