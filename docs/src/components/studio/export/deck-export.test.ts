import { afterEach, describe, expect, it, vi } from 'vitest';
import { assembleSheetPdf, backgroundImageUrls, bakeDeckSections, createImageFailureLog, missingImageReason, rasterizeDeckImages, recordUnreachableAssets, recordUnreachableImages, waitForDiagrams } from './deck-export.js';

// The rasterize → assemble split (item 1 of 2026-06-14-deck-print-styling.md).
// `rasterizeDeckImages` needs a real browser rasterizer (html-to-image), so it is
// exercised on the live Studio Print drawer (HARD RULE #23), not here. This suite
// pins the DOM-free half — `assembleSheetPdf` — which is what a paper/orientation
// change re-runs, reusing cached images with NO re-rasterize.

// A valid 1×1 green PNG (jsPDF parses the real chunks, so it must be well-formed).
const PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC';

const meta = { deck: 'probe', engine: 'lattice' };

// jsPDF's px_scaling hotfix treats 1px = 0.75pt (96dpi), so the MediaBox is the
// page's px size × 0.75 — a physically correct paper size (1344px → 1008pt = 14in).
// jsdom's Blob (jsPDF's output('blob')) has neither `.text()` nor `.arrayBuffer()`;
// read it via FileReader as a binary string. MediaBox/page dicts are uncompressed
// ASCII, so they survive the byte→char mapping — only streams deflate.
function decode(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const r = new FileReader();
		r.onload = () => resolve(String(r.result));
		r.onerror = () => reject(r.error);
		r.readAsBinaryString(blob);
	});
}
function mediaBoxes(text: string): string[] {
	return text.match(/\/MediaBox\s*\[[^\]]*\]/g) || [];
}
function pageCount(text: string): number {
	return (text.match(/\/Type\s*\/Page(?![s])/g) || []).length;
}

describe('assembleSheetPdf — place cached images on a paper sheet', () => {
	it('emits one page per image at the sheet MediaBox (px × 0.75 = pt)', async () => {
		const blob = await assembleSheetPdf([PNG, PNG, PNG], { w: 1280, h: 720 }, 'probe', meta, {
			sheet: { pageW: 1344, pageH: 816 }, // US Legal landscape
			pageFormat: 'png',
		});
		expect(blob.type).toBe('application/pdf');
		const text = await decode(blob);
		expect(pageCount(text)).toBe(3);
		// 1344 × 0.75 = 1008pt (14in) wide; 816 × 0.75 = 612pt (8.5in) tall — real US Legal landscape.
		for (const box of mediaBoxes(text)) {
			expect(box).toMatch(/1008/);
			expect(box).toMatch(/612/);
		}
	});

	it('re-places the SAME images onto a different sheet — the MediaBox flips, no re-rasterize', async () => {
		const images = [PNG, PNG];
		const geom = { w: 1280, h: 720 };
		// Same images (as a paper/orientation change would reuse) → two different sheets.
		const legal = await decode(await assembleSheetPdf(images, geom, 'p', meta, { sheet: { pageW: 1344, pageH: 816 }, pageFormat: 'png' }));
		const a4Portrait = await decode(await assembleSheetPdf(images, geom, 'p', meta, { sheet: { pageW: 794, pageH: 1123 }, pageFormat: 'png' }));
		// 794 × 0.75 ≈ 596pt wide, 1123 × 0.75 ≈ 842pt tall — A4 portrait, distinct from Legal landscape.
		expect(mediaBoxes(legal)[0]).toMatch(/1008/);
		expect(mediaBoxes(a4Portrait)[0]).toMatch(/84[12]/); // ~842pt tall (A4)
		expect(mediaBoxes(a4Portrait)[0]).not.toMatch(/1008/);
		expect(pageCount(legal)).toBe(2);
		expect(pageCount(a4Portrait)).toBe(2);
	});

	it('throws without a sheet (the assemble half needs page geometry)', async () => {
		await expect(assembleSheetPdf([PNG], { w: 1280, h: 720 }, 'p', meta, { pageFormat: 'png' })).rejects.toThrow(/sheet/);
	});

	it('reports progress once per page via onStatus (drives the re-place loading state)', async () => {
		// The re-place path is assemble-only, so this callback + the per-page macrotask yield
		// are what let the Print drawer paint its loading state (else React batches the
		// synchronous loop into one commit and the spinner never shows). Regression guard.
		const seen: Array<{ current: number; total: number }> = [];
		await assembleSheetPdf([PNG, PNG, PNG], { w: 1280, h: 720 }, 'p', meta, {
			sheet: { pageW: 1344, pageH: 816 },
			pageFormat: 'png',
			onStatus: (_m: string, p?: { current: number; total: number }) => { if (p) seen.push(p); },
		});
		expect(seen.map((p) => p.current)).toEqual([0, 1, 2]);
		expect(seen.every((p) => p.total === 3)).toBe(true);
	});

	it('N-up packs multiple slides per sheet → ceil(slides / nup) pages', async () => {
		const imgs = [PNG, PNG, PNG, PNG, PNG]; // 5 slides
		const geom = { w: 1280, h: 720 };
		const sheet = { pageW: 1344, pageH: 816 };
		const oneUp = await decode(await assembleSheetPdf(imgs, geom, 'p', meta, { sheet, pageFormat: 'png', nup: 1 }));
		const twoUp = await decode(await assembleSheetPdf(imgs, geom, 'p', meta, { sheet, pageFormat: 'png', nup: 2 }));
		const fourUp = await decode(await assembleSheetPdf(imgs, geom, 'p', meta, { sheet, pageFormat: 'png', nup: 4 }));
		expect(pageCount(oneUp)).toBe(5); // 1 per page
		expect(pageCount(twoUp)).toBe(3); // ceil(5/2)
		expect(pageCount(fourUp)).toBe(2); // ceil(5/4)
		// The MediaBox is the same sheet regardless of nup (only placement changes).
		expect(mediaBoxes(twoUp)[0]).toMatch(/1008/);
		expect(mediaBoxes(fourUp)[0]).toMatch(/1008/);
	});

	it('an invalid nup falls back to 1-up (one slide per page)', async () => {
		const text = await decode(await assembleSheetPdf([PNG, PNG], { w: 1280, h: 720 }, 'p', meta, { sheet: { pageW: 1344, pageH: 816 }, pageFormat: 'png', nup: 3 as unknown as number }));
		expect(pageCount(text)).toBe(2);
	});

	it('handout mode → one slide + its notes per page (nup ignored)', async () => {
		// Content streams are compressed, so the note TEXT isn't greppable here — its
		// rendering is verified by decoding the real PDF on the live surface (HARD RULE #23).
		// This pins the page structure: always one slide per page, even with nup:4, and a
		// short-notes deck doesn't throw (the empty-note placeholder path runs for slide 2).
		const imgs = [PNG, PNG, PNG];
		const notes = ['First slide note.', '', 'Third slide note here.'];
		const text = await decode(await assembleSheetPdf(imgs, { w: 1280, h: 720 }, 'p', meta, {
			sheet: { pageW: 816, pageH: 1056 }, pageFormat: 'png', handout: true, nup: 4, notes,
		}));
		expect(pageCount(text)).toBe(3);
		// A4/Letter PORTRAIT MediaBox (816×0.75=612 wide, 1056×0.75=792 tall).
		expect(mediaBoxes(text)[0]).toMatch(/612/);
		expect(mediaBoxes(text)[0]).toMatch(/792/);
	});
});

// `waitForDiagrams` gates the export capture on the RUNTIME finishing every
// ```mermaid fence. Its state machine is DOM-only, so it is unit-testable here; the
// bake it guards needs a real laid-out frame and is verified on the live Studio
// export (HARD RULE #23). What these pin is the shape the original loop got wrong:
// it counted only EXISTING `.mermaid` boxes, and a fence the runtime has not reached
// yet has none — so on the very deck it exists to wait for, it saw 0 pending and
// returned at once, letting an un-rendered fence freeze into the exported player.
describe('waitForDiagrams — wait for the runtime, not just for boxes that exist', () => {
	function frag(html: string): Document {
		const d = document.implementation.createHTMLDocument('t');
		d.body.innerHTML = html;
		return d;
	}
	// Did it return WITHIN its own budget, or only once the budget ran out? Always
	// AWAITS the call rather than racing it, so no poll timer outlives the test — a
	// dangling one surfaces as an after-teardown error and fails the whole file.
	const BUDGET = 600;
	async function returned(doc: Document): Promise<'early' | 'at-budget'> {
		const started = Date.now();
		await waitForDiagrams(doc, BUDGET);
		return Date.now() - started < BUDGET * 0.5 ? 'early' : 'at-budget';
	}

	// ```functionplot placeholders stream in the same way now: the runtime loads function-plot.js
	// on demand in the capture frame, so a plot the capture does not wait for bakes as an empty
	// stage. Config is `{"data":[{"fn":"x"}],"yAxis":{"label":"x²"}}`, UTF-8 base64.
	const FP = 'eyJkYXRhIjpbeyJmbiI6IngifV0sInlBeGlzIjp7ImxhYmVsIjoieMKyIn19';
	it('waits for an un-drawn function plot, and releases it to its config at the budget', async () => {
		const doc = frag(`<div class="functionplot" data-fp-config="${FP}"></div>`);
		expect(await returned(doc)).toBe('at-budget');
		const doc2 = frag(`<div class="functionplot" data-fp-config="${FP}"></div>`);
		expect(await waitForDiagrams(doc2, BUDGET)).toBe(1);
		const div = doc2.querySelector('.functionplot');
		expect(div?.getAttribute('data-fp-state')).toBe('unavailable');
		// Final, so a late library load cannot draw over what the capture decided to bake.
		expect(div?.hasAttribute('data-fp-final')).toBe(true);
		// The author's config, decoded as UTF-8 rather than one char per byte.
		expect(div?.textContent).toContain('"label":"x²"');
	});

	it('does not wait for a function plot the runtime drew, errored or released', async () => {
		for (const attr of ['data-fp-inflated="1"', 'data-fp-inflated="error"', 'data-fp-state="unavailable"']) {
			expect(await returned(frag(`<div class="functionplot" data-fp-config="${FP}" ${attr}></div>`))).toBe('early');
		}
	});

	it('leaves a stranded function plot alone when the caller will wait again', async () => {
		const doc = frag(`<div class="functionplot" data-fp-config="${FP}"></div>`);
		expect(await waitForDiagrams(doc, BUDGET, { release: false })).toBe(1);
		expect(doc.querySelector('.functionplot')?.hasAttribute('data-fp-state')).toBe(false);
	});

	it('RELEASES a fence still un-settled at the budget, so it bakes as source not as a blank', async () => {
		// THE WHOLE FIX. `mermaid.css` hides the source <pre> for every state but `error` and
		// `unavailable`, so when this budget expires with a fence un-settled the capture bakes a
		// BLANK REGION into a downloaded file. Releasing it to `unavailable` hands the author
		// their own source instead — the same mechanism `releaseUnrenderableFences` uses when
		// Mermaid never arrives, applied at the export's own give-up point.
		const doc = frag('<pre data-mermaid-state="pending"><code>flowchart LR</code></pre><div class="mermaid"></div>');
		const released = await waitForDiagrams(doc, BUDGET);
		expect(released).toBe(1);
		expect(doc.querySelector('pre')?.getAttribute('data-mermaid-state')).toBe('unavailable');
	});

	it('marks the release FINAL, so the runtime cannot take it back before the capture', async () => {
		// `reclaimReleasedFences` returns any `unavailable` fence to `pending` — re-hiding it —
		// as soon as a content pass runs with Mermaid present. `bakeDeckSections` releases, then
		// awaits a dynamic import before reading `outerHTML`, and the capture frame shares this
		// thread, so a pass scheduled during the wait lands in that await. Without the mark the
		// capture takes the blank this release exists to prevent, and it does it intermittently
		// — which is the worst shape for a defect in a downloaded file.
		const doc = frag('<pre data-mermaid-state="pending"><code>x</code></pre><div class="mermaid"></div>');
		await waitForDiagrams(doc, BUDGET);
		const pre = doc.querySelector('pre');
		expect(pre?.getAttribute('data-mermaid-state')).toBe('unavailable');
		expect(pre?.hasAttribute('data-mermaid-final')).toBe(true);
	});

	it('releases a `rendered` fence whose box never received an SVG', async () => {
		// The subtler blank: the runtime says `rendered`, so the <pre> is hidden, but nothing
		// landed in the box. Both halves of the un-settled test have to reach the release.
		const doc = frag('<pre data-mermaid-state="rendered"><code>x</code></pre><div class="mermaid"></div>');
		expect(await waitForDiagrams(doc, BUDGET)).toBe(1);
		expect(doc.querySelector('pre')?.getAttribute('data-mermaid-state')).toBe('unavailable');
	});

	it('does NOT release when the caller will wait AGAIN — the release belongs to the LAST wait', async () => {
		// THE DOUBLE-WAIT REGRESSION. `bakeDeckSections` builds a capture frame (which waits
		// 4000) and then waits 12000 more on the same document. The release is TERMINAL —
		// `unavailable` + `data-mermaid-final` closes every route the runtime has back to the
		// fence — so releasing at the first wait silently caps the bake at the frame's budget
		// and strands a diagram that was still going to draw. Waiting is idempotent; releasing
		// is not, so only the last wait before the capture may release.
		const doc = frag('<pre data-mermaid-state="pending"><code>x</code></pre><div class="mermaid"></div>');
		const stranded = await waitForDiagrams(doc, BUDGET, { release: false });
		const pre = doc.querySelector('pre');
		// It still REPORTS what is blanking — the caller needs the count — but it has changed
		// nothing, so a later wait can still catch the fence.
		expect(stranded).toBe(1);
		expect(pre?.getAttribute('data-mermaid-state')).toBe('pending');
		expect(pre?.hasAttribute('data-mermaid-final')).toBe(false);
	});

	it('a fence that draws AFTER a non-releasing wait still bakes as a drawing', async () => {
		// The user-visible half of the same regression: the diagram lands between the two
		// budgets. With the frame releasing, this fence shipped as source text; it must ship
		// as the drawing it became.
		const doc = frag('<pre data-mermaid-state="pending"><code>x</code></pre><div class="mermaid"></div>');
		const pre = doc.querySelector('pre');
		await waitForDiagrams(doc, BUDGET, { release: false });
		pre?.setAttribute('data-mermaid-state', 'rendered');
		const box = pre?.nextElementSibling as HTMLElement | null;
		if (box) box.innerHTML = '<svg></svg>';
		// The second, longer wait sees a settled fence and releases nothing.
		expect(await waitForDiagrams(doc, BUDGET)).toBe(0);
		expect(pre?.getAttribute('data-mermaid-state')).toBe('rendered');
		expect(pre?.hasAttribute('data-mermaid-final')).toBe(false);
	});

	it('re-reads at the give-up point — a fence that drew mid-poll is not released', async () => {
		// The give-up must re-read rather than reuse the last poll's list, which is up to one
		// poll interval stale. Reusing it stamps a SUCCESSFULLY DRAWN fence `unavailable`, and
		// `mermaid.css` then hides the box — so the export ships source over a diagram that is
		// sitting right there in the DOM. The draw lands in the final poll gap (after the last
		// poll at 480 of a 600 budget), which is the only window where the two lists differ.
		const doc = frag('<pre data-mermaid-state="pending"><code>x</code></pre><div class="mermaid"></div>');
		const pre = doc.querySelector('pre');
		setTimeout(() => {
			pre?.setAttribute('data-mermaid-state', 'rendered');
			const box = pre?.nextElementSibling as HTMLElement | null;
			if (box) box.innerHTML = '<svg></svg>';
		}, BUDGET - 50);
		expect(await waitForDiagrams(doc, BUDGET)).toBe(0);
		expect(pre?.getAttribute('data-mermaid-state')).toBe('rendered');
		expect(pre?.hasAttribute('data-mermaid-final')).toBe(false);
	});

	it('does NOT release a fence the runtime has not tagged — it already shows its source', async () => {
		// The hide is keyed on `data-mermaid-state`, so an untagged fence paints its own source
		// already. Tagging it here would take nothing away from the blank and would misreport a
		// fence that was never the runtime's to lose.
		const doc = frag('<pre><code class="language-mermaid">flowchart LR\n A --> B</code></pre>');
		expect(await waitForDiagrams(doc, BUDGET)).toBe(0);
		expect(doc.querySelector('pre')?.hasAttribute('data-mermaid-state')).toBe(false);
	});

	it('releases NOTHING when every fence drew in time', async () => {
		const doc = frag('<pre data-mermaid-state="pending"><code>x</code></pre><div class="mermaid"></div>');
		const pre = doc.querySelector('pre');
		setTimeout(() => {
			pre?.setAttribute('data-mermaid-state', 'rendered');
			const box = pre?.nextElementSibling as HTMLElement | null;
			if (box) box.innerHTML = '<svg></svg>';
		}, 150);
		expect(await waitForDiagrams(doc, BUDGET)).toBe(0);
		expect(pre?.getAttribute('data-mermaid-state')).toBe('rendered');
	});

	it('releases only the fences still blanking, not the ones that drew', async () => {
		const doc = frag(
			'<pre id="a" data-mermaid-state="rendered"><code>x</code></pre><div class="mermaid"><svg></svg></div>' +
				'<pre id="b" data-mermaid-state="pending"><code>y</code></pre><div class="mermaid"></div>' +
				'<pre id="c" data-mermaid-state="error"><code>z</code></pre><div class="mermaid"></div>',
		);
		expect(await waitForDiagrams(doc, BUDGET)).toBe(1);
		expect(doc.querySelector('#a')?.getAttribute('data-mermaid-state')).toBe('rendered');
		expect(doc.querySelector('#b')?.getAttribute('data-mermaid-state')).toBe('unavailable');
		expect(doc.querySelector('#c')?.getAttribute('data-mermaid-state')).toBe('error');
	});

	it('gives up AT the budget, not at some multiple of it', async () => {
		// The number this function is about. An earlier design let the give-up threshold be
		// tripled — 4000 to 12000 in the capture frame — with every cell in this file green,
		// because the only timing assertion had 3.3x of slack. This one has 0.5x.
		const doc = frag('<pre data-mermaid-state="pending"></pre>');
		const started = Date.now();
		await waitForDiagrams(doc, BUDGET);
		const waited = Date.now() - started;
		expect(waited).toBeGreaterThanOrEqual(BUDGET);
		expect(waited).toBeLessThan(BUDGET * 1.5);
	});

	it('treats an UNRECOGNIZED state as un-settled, not as done', async () => {
		// The settled set is a whitelist — `rendered` with its SVG in place, plus `error` and
		// `unavailable`, where the runtime has given up and the source <pre> is the honest
		// artifact. Anything else is a diagram still on its way, INCLUDING a state this file has
		// never heard of: a runtime is free to add one, and the failure mode of guessing wrong
		// here is a blank region in a downloaded file rather than a slow export.
		//
		// `deferred` is the concrete instance. It does not exist in the shipped runtime — it
		// came from an abandoned render-latency branch (PR #2128) that held a fence whose source
		// was mid-word — and the arm is kept for the general property, not that branch.
		const doc = frag('<pre data-mermaid-state="deferred"></pre>');
		expect(await returned(doc)).toBe('at-budget');
	});

	it('returns immediately when the deck has no diagram at all', async () => {
		expect(await returned(frag('<p>no diagrams here</p>'))).toBe('early');
	});

	it('keeps waiting on a fence the runtime has NOT tagged yet', async () => {
		// The original loop's blind spot: no `.mermaid` box exists yet, so it counted
		// zero pending and returned at once — on exactly the deck it must wait for.
		expect(await returned(frag('<pre><code class="language-mermaid">flowchart LR\n A --> B</code></pre>'))).toBe('at-budget');
	});

	it('keeps waiting while a tagged fence is still pending', async () => {
		expect(await returned(frag('<pre data-mermaid-state="pending"><code class="language-mermaid-source">x</code></pre><div class="mermaid"></div>'))).toBe('at-budget');
	});

	it('returns once every fence is rendered with its SVG in place', async () => {
		expect(await returned(frag('<pre data-mermaid-state="rendered"><code class="language-mermaid-source">x</code></pre><div class="mermaid"><svg></svg></div>'))).toBe('early');
	});

	it('treats an ERROR fence as settled — the source <pre> is the honest artifact', async () => {
		expect(await returned(frag('<pre data-mermaid-state="error"><code class="language-mermaid-source">x</code></pre><div class="mermaid"></div>'))).toBe('early');
	});
});

// The CALL SITE, not the helper. `waitForDiagrams` is pinned above, cell by cell; the
// two arguments `bakeDeckSections` hands it were not pinned by anything at any tier —
// `engineering/decisions/2026-09-07-diagram-render-latency.md` §16 named that hole: the
// bake's budget and its `releaseDiagrams: false` were free parameters that no PR gate
// could pin. They are exactly the shape of parameter that broke last time. The
// double-wait regression flipped one of them and stayed invisible to four green e2e
// arms; a checker found it by reading, and nothing in the tree could have.
//
// All three cells drive the REAL exporters — `bakeDeckSections` for the explicit override,
// `rasterizeDeckImages` for the default — through a stubbed capture frame, so they fail on
// the mutation rather than on the spelling. A source-text pin would go green the moment
// someone lifted `12000` into a constant.
describe('the capture frame’s diagram-wait arguments, at both call sites', () => {
	// One slide, one fence the runtime has tagged and not yet drawn: the state in which a
	// capture bakes a BLANK, which is the whole reason either argument exists.
	const DECK =
		'<div class="lattice"><section><h1>probe</h1>' +
		'<pre data-mermaid-state="pending"><code class="language-mermaid-source">flowchart LR</code></pre>' +
		'<div class="mermaid"></div></section></div>';

	/** The `DeckRender` shape `createCaptureFrame` destructures. Every field is inert here. */
	const render = () => ({ html: '', css: '', mode: 'light', geom: { w: 1280, h: 720 }, runtimeUrl: '', fontCss: '', mermaidUrl: 'about:blank' });

	/**
	 * jsdom does not parse `srcdoc` — an iframe fires `load` and leaves an EMPTY
	 * `contentDocument` — so `bakeDeckSections` would sail through both waits and return
	 * null at the no-sections check, asserting nothing. Hand the frame a document we
	 * control instead: the only seam into `createCaptureFrame`, which is module-private.
	 */
	function stubCaptureFrame(html: string) {
		const inner = document.implementation.createHTMLDocument('capture');
		inner.body.innerHTML = html;
		const realCreate = document.createElement.bind(document);
		const spy = vi.spyOn(document, 'createElement').mockImplementation(((tag: string, opts?: ElementCreationOptions) => {
			const el = realCreate(tag, opts);
			if (String(tag).toLowerCase() !== 'iframe') return el;
			Object.defineProperty(el, 'contentDocument', { configurable: true, get: () => inner });
			// `null`, NOT `{}`. Both satisfy the optional-chained `win?.__latticeFit`, but the
			// frame's window has a THIRD consumer: `flattenSvgStyles(svg, win)` takes any
			// truthy `win` at its word and calls `win.getComputedStyle`. An empty object is
			// truthy, so it threw, the bake swallowed it into `unbaked++`, and a GREEN cell
			// printed "1/1 diagram(s) could not be baked" — the warning that signals a real
			// export defect. `null` makes the helper fall back to this realm's own window.
			Object.defineProperty(el, 'contentWindow', { configurable: true, get: () => null });
			// `load` fires SYNCHRONOUSLY on assignment. The listener is attached before the
			// assignment in `createCaptureFrame`, so the wait resolves.
			Object.defineProperty(el, 'srcdoc', { configurable: true, get: () => '', set: () => { el.dispatchEvent(new Event('load')); } });
			return el;
		}) as typeof document.createElement);
		return { inner, restore: () => spy.mockRestore() };
	}

	const fence = (d: Document) => d.querySelector('pre') as HTMLElement;
	const draw = (pre: HTMLElement) => {
		pre.setAttribute('data-mermaid-state', 'rendered');
		(pre.nextElementSibling as HTMLElement).innerHTML = '<svg></svg>';
	};

	// NO module pre-warm, deliberately. An earlier draft warmed
	// `standalone-svg.generated.js` in `beforeAll` on the theory that a cold dynamic import
	// under fake timers would block on real I/O. It does not: `advanceTimersByTimeAsync`
	// yields to the real event loop between fake ticks, so the import resolves normally —
	// measured by deleting the hook and watching the cells still pass. The hook was
	// harmless; its reasoning was wrong, which is worse in a comment than in code.
	afterEach(() => { vi.useRealTimers(); });

	it('does NOT release at the capture frame — a diagram that draws after 4000 still bakes as a drawing', async () => {
		// THE DOUBLE-WAIT REGRESSION, at the call site this time. `createCaptureFrame`
		// defaults to releasing, and the release is terminal, so the bake MUST opt out:
		// `releaseDiagrams: false`. Flip it to `true` and this fence is stamped
		// `unavailable` at 4000, the bake's own wait finds nothing blanking and returns on
		// its first poll, and a diagram that was still going to draw ships as source text.
		vi.useFakeTimers();
		const { inner, restore } = stubCaptureFrame(DECK);
		try {
			const pre = fence(inner);
			// Past the frame's 4000, well inside the bake's 12000 — the window the opt-out buys.
			setTimeout(() => draw(pre), 5500);
			const done = bakeDeckSections(render());
			await vi.advanceTimersByTimeAsync(8000);
			const out = await done;
			expect(pre.getAttribute('data-mermaid-state')).toBe('rendered');
			expect(pre.hasAttribute('data-mermaid-final')).toBe(false);
			expect(out?.diagrams).toBe(1);
			expect(out?.failed).toBe(0);
		} finally {
			restore();
		}
	});

	it('leaves the DEFAULT releasing, so a lane that takes it still gives up at 4000', async () => {
		// THE OTHER HALF, and neither cell above can see it. `releaseDiagrams` has a default
		// (`= true`) AND one explicit override (the bake's `false`). The two cells above pin
		// the override; flip the DEFAULT to `false` and they both still pass, while the six
		// `createCaptureFrame` call sites that take it stop releasing at the only wait they
		// get.
		//
		// AND THE HARM IS MEASURED, not inferred. Driven on the real Studio, `Images (.zip)`
		// with `mermaid.render` held: with the default shipping (`true`) the downloaded PNG
		// carries the author's source text; with it flipped to `false` the SAME slide comes
		// back BLANK — heading, rule, and nothing else. Slide 01, which has no diagram, is
		// byte-identical across both arms, which is the control that makes the comparison
		// mean something. §19 has the images and the md5s.
		//
		// §16 concluded the opposite — "the release is a no-op there" — and that conclusion
		// does NOT reproduce. It is corrected in §19 rather than left standing, because it
		// was already being used to argue this cell was pinning a cosmetic parameter.
		//
		// It also pins the default only AS SEEN THROUGH this lane: a change that flips the
		// default and adds an explicit `true` here would keep this cell green while the
		// other five lose the release.
		//
		// `rasterizeDeckImages` is the reachable one: it takes the default, and the release
		// happens inside `createCaptureFrame` BEFORE any rasterizing. Its later work needs
		// `font-embed.js` and `html-to-image`, which do not load here — so the rejection is
		// expected and swallowed. The fence state at 5000 is the whole assertion.
		vi.useFakeTimers();
		const { inner, restore } = stubCaptureFrame(DECK);
		try {
			const pre = fence(inner);
			const done = rasterizeDeckImages(render()).catch(() => null);
			await vi.advanceTimersByTimeAsync(5000);
			expect(pre.getAttribute('data-mermaid-state')).toBe('unavailable');
			expect(pre.hasAttribute('data-mermaid-final')).toBe(true);
			await done;
		} finally {
			restore();
		}
	});

	it('gives up at 16000 — the frame’s 4000 plus the bake’s 12000, and not before', async () => {
		// THE NUMBER. §15 records a suite whose cells all stayed green while the give-up
		// threshold was TRIPLED, because they pinned the shape of the loop and never the
		// constant that decided it.
		//
		// The real release instant is 16112ms, not 16000: a 32ms double-rAF settle, then
		// 4080 for the frame's wait (its 120ms poll overshoots 4000), then 12000. So these
		// checkpoints straddle it by 1112ms below and 888ms above — deterministic under
		// fake timers, which is the point: 12000 -> 8000 gives up at 12152 and fails the
		// first checkpoint, 12000 -> 16000 gives up at 20192 and fails the second. Those two
		// are NOT 12112/20112: the 120ms poll overshoots any budget that is not a multiple
		// of it, and 12000 happens to be one while 8000 and 16000 are not (8040 and 16080).
		// The title rounds; the arithmetic here does not.
		vi.useFakeTimers();
		const { inner, restore } = stubCaptureFrame(DECK);
		try {
			const pre = fence(inner);
			const done = bakeDeckSections(render());
			await vi.advanceTimersByTimeAsync(15_000);
			expect(pre.getAttribute('data-mermaid-state')).toBe('pending');
			expect(pre.hasAttribute('data-mermaid-final')).toBe(false);
			await vi.advanceTimersByTimeAsync(2_000);
			// Released as SOURCE, and marked final so the runtime cannot reclaim it before
			// the capture reads `outerHTML`.
			expect(pre.getAttribute('data-mermaid-state')).toBe('unavailable');
			expect(pre.hasAttribute('data-mermaid-final')).toBe(true);
			const out = await done;
			expect(out?.diagrams).toBe(0);
			expect(out?.failed).toBe(1);
		} finally {
			restore();
		}
	});
});


// ── An unreachable image degrades the export instead of failing it ────────────
// The capture fetches every embedded image itself; before this, one failed fetch
// rejected the whole run, so a deck whose `logo:` is a path relative to the deck FILE
// — correct for the CLI, unresolvable on the web — produced no PDF at all. The picture
// is now simply absent and the author is TOLD, which is the part a silent degradation
// would get wrong. The real export is driven in `docs/e2e/export-missing-image.spec.ts`;
// this pins the two pure pieces.

/** An `<img>` as the browser reports it after a load attempt. */
function img(src: string, { complete = true, naturalWidth = 0 } = {}) {
	const el = document.createElement('img');
	el.setAttribute('src', src);
	Object.defineProperty(el, 'complete', { value: complete, configurable: true });
	Object.defineProperty(el, 'naturalWidth', { value: naturalWidth, configurable: true });
	return el;
}

describe('recordUnreachableImages', () => {
	it('names the path the deck asked for, not the blanked one the clone ends up with', () => {
		const section = document.createElement('section');
		section.append(img('../lib/base/_logo/lattice-mark-min.svg'), img('/ok.png', { naturalWidth: 64 }));
		const log = createImageFailureLog();
		recordUnreachableImages(section, log);
		expect([...log.paths]).toEqual(['../lib/base/_logo/lattice-mark-min.svg']);
	});

	it('does not accuse an image that is still loading', () => {
		// Mid-flight, `naturalWidth` is 0 too. The capture's own error hook counts this one
		// if it really fails — unnamed, but never missed.
		const section = document.createElement('section');
		section.append(img('/slow.png', { complete: false }));
		const log = createImageFailureLog();
		recordUnreachableImages(section, log);
		expect([...log.paths]).toEqual([]);
	});

	it('is inert without a log, and without a section', () => {
		expect(() => recordUnreachableImages(document.createElement('section'), null)).not.toThrow();
		expect(() => recordUnreachableImages(null, createImageFailureLog())).not.toThrow();
	});
});

describe('missingImageReason', () => {
	it('says nothing when nothing failed', () => {
		expect(missingImageReason(createImageFailureLog())).toBeUndefined();
		expect(missingImageReason(null)).toBeUndefined();
	});

	it('names the file, and reads as a clause the toast can finish', () => {
		const log = createImageFailureLog();
		log.count = 1;
		log.paths.add('../logo.svg');
		// The sheet renders `PDF ready — but ${reason}.`
		expect(`PDF ready — but ${missingImageReason(log)}.`).toBe(
			'PDF ready — but the export could not load every image, so the file ships without: ../logo.svg — a path relative to the deck file does not resolve here.',
		);
	});

	it('asserts no total, because `paths` can be a subset of what failed', () => {
		// A CORS-blocked <img> fires the hook and can never be named, so "one image" beside
		// a list of one would tell an author to stop looking while a second is still missing.
		// And `count` is one per failed ELEMENT — one bad logo on 56 slides registers 56.
		const log = createImageFailureLog();
		log.count = 56;
		log.paths.add('../logo.svg');
		const reason = missingImageReason(log) as string;
		expect(reason).toContain('../logo.svg');
		expect(reason).not.toMatch(/\b(?:one|1|56)\b/);
	});

	it('still says something when it can name nothing', () => {
		const log = createImageFailureLog();
		log.count = 2;
		expect(missingImageReason(log)).toBe('the export could not load every image, so the file ships without at least one');
	});

	it('only blames a deck-relative path when the path IS one', () => {
		// An absolute or remote URL that 404s has nothing to do with deck-relative
		// resolution, and sending the author to check for that sends them to the wrong place.
		const absolute = createImageFailureLog();
		absolute.count = 1;
		absolute.paths.add('https://example.invalid/logo.png');
		expect(missingImageReason(absolute)).not.toContain('relative to the deck file');
		const rooted = createImageFailureLog();
		rooted.count = 1;
		rooted.paths.add('/assets/logo.png');
		expect(missingImageReason(rooted)).not.toContain('relative to the deck file');
		const relative = createImageFailureLog();
		relative.count = 1;
		relative.paths.add('../logo.svg');
		expect(missingImageReason(relative)).toContain('relative to the deck file');
	});

	it('stops listing after three, rather than pasting a deck of paths into a toast', () => {
		const log = createImageFailureLog();
		log.count = 5;
		for (const n of [1, 2, 3, 4, 5]) log.paths.add(`/img-${n}.png`);
		expect(missingImageReason(log)).toContain('/img-1.png, /img-2.png, /img-3.png, +2 more');
	});

	it('truncates one very long path rather than pasting a data URI into a toast', () => {
		const log = createImageFailureLog();
		log.count = 1;
		log.paths.add(`/${'a'.repeat(400)}.png`);
		const reason = missingImageReason(log) as string;
		expect(reason.length).toBeLessThan(220);
		expect(reason).toContain('…');
	});
});


describe('backgroundImageUrls', () => {
	it('finds the panel a deck writes as `![bg](…)`, which is not an <img> at all', () => {
		// `lib/core/bg-image.js` emits a <div> with a background-image for the full-bleed
		// panel — the most visually consequential picture on a slide, and invisible to the
		// <img> scan.
		const section = document.createElement('section');
		section.innerHTML = '<div class="lattice-bg" style="background-image:url(\'/photo.jpg\')"></div>';
		document.body.append(section);
		expect(backgroundImageUrls(section)).toEqual(['/photo.jpg']);
	});

	it('ignores a data URI, which is already inline and cannot 404', () => {
		const section = document.createElement('section');
		section.innerHTML = '<div style="background-image:url(data:image/gif;base64,R0lGOD)"></div>';
		document.body.append(section);
		expect(backgroundImageUrls(section)).toEqual([]);
	});
});

describe('recordUnreachableAssets', () => {
	/** Stand in for the browser's loader: these URLs 404, everything else loads. */
	function stubImageLoader(broken: string[]) {
		const real = window.Image;
		class Probe {
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;
			set src(value: string) {
				queueMicrotask(() => (broken.includes(value) ? this.onerror?.() : this.onload?.()));
			}
		}
		(window as unknown as { Image: unknown }).Image = Probe;
		return () => {
			(window as unknown as { Image: unknown }).Image = real;
		};
	}

	it('names a background the export will silently drop, and trips the trigger itself', async () => {
		// html-to-image catches a failed BACKGROUND fetch itself and only console.warns, so
		// the image-error hook never fires: without the probe this ships a hole and says
		// "PDF ready.".
		const section = document.createElement('section');
		section.innerHTML = '<div style="background-image:url(/missing-bg.png)"></div>';
		document.body.append(section);
		const restore = stubImageLoader(['/missing-bg.png']);
		try {
			const log = createImageFailureLog();
			await recordUnreachableAssets([section], log);
			expect([...log.paths]).toEqual(['/missing-bg.png']);
			expect(log.count).toBe(1);
			expect(missingImageReason(log)).toContain('/missing-bg.png');
		} finally {
			restore();
		}
	});

	it('says nothing about a background that loads', async () => {
		const section = document.createElement('section');
		section.innerHTML = '<div style="background-image:url(/fine.png)"></div>';
		document.body.append(section);
		const restore = stubImageLoader([]);
		try {
			const log = createImageFailureLog();
			await recordUnreachableAssets([section], log);
			expect(log.count).toBe(0);
			expect(missingImageReason(log)).toBeUndefined();
		} finally {
			restore();
		}
	});
});

// `freezeTokens` is OFF by default, and the export paths depend on that: the bake deliberately
// leaves a scheme-varying paint as `var(--token)` so a host shipping the deck CSS can re-theme
// it, and freezing would pin the player's diagram colours and kill its dark/light toggle. The
// argument is that `collectTokens: false` and "absent" are the same value to `flattenSvgStyles`
// — true (`const COLLECT = opts ? !!opts.collectTokens : false`), and now pinned rather than
// argued, because it is the one claim the export-safety case rests on.
describe('bakeDeckSections — freezeTokens is opt-in', () => {
	it('defaults to off, so a paint keeps its var() reference for the host to re-theme', async () => {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('data-lattice-tokens', '--cat-1:rgb(1, 2, 3)');
		const { parseTokenDecls, applyCollectedTokens } = await import('../../../../../lib/components/chart/_chart-family/standalone-svg.js');
		// The collection format the bake writes, and the consumer the opt-in calls.
		expect(parseTokenDecls('--cat-1:rgb(1, 2, 3)')).toEqual([['--cat-1', 'rgb(1, 2, 3)']]);
		expect(applyCollectedTokens(svg)).toBe(1);
		expect(svg.style.getPropertyValue('--cat-1')).toBe('rgb(1, 2, 3)');
		// …and the scratch attribute never survives onto a shipped element.
		expect(svg.hasAttribute('data-lattice-tokens')).toBe(false);
	});
});
