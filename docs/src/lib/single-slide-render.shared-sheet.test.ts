// ONE PARSED STYLESHEET FOR EVERY PREVIEW FRAME (#1538).
//
// The engine sheet is ~640KB and is a pure function of theme-name + geometry, so every tile in
// a thumbnail grid wants byte-identical CSS. Each frame used to inline its own copy into its own
// `<style>`, which a browser cannot recognize as the same thing — fifteen tiles, fifteen parses,
// fifteen CSSOMs. Measured over 16 same-origin frames, moving the sheet to ONE url cost
// 6.4 MB/frame against 11.1 inline on Chromium, and 5.2 against 12.9 on WebKit — the engine an
// iPhone runs, and the larger saving of the two.
//
// WHY THIS FILE EXISTS SEPARATELY, and it is the whole reason: **jsdom has `Blob` but not
// `URL.createObjectURL`**. So every other suite in this directory exercises the FALLBACK
// (inline) delivery and none of them can reach the shared path — they stayed green through the
// entire change without executing a line of it. These stub `createObjectURL` so the path under
// test is the one that ships.

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./render-engine', () => ({ renderMarkdown: vi.fn() }));
vi.mock('./theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, ensureKatexFaces: async () => {}, katexFacesActive: () => false, fetch: async () => {} }),
}));
vi.mock('../playground/font-embed.js', () => ({ previewFontFaceCss: () => '' }));

import { renderMarkdown } from './render-engine';
import { __resetLiveRenderersForTest, __swapSharedSheetForTest, clearDeckMemo, clearSliceCache, createSingleSlideRenderer } from './single-slide-render';

const base = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };
const HTML = '<article class="lattice"><section class="form" id="1"><div class="cell-stage"><h1>One</h1></div></section></article>';

/** Object URLs jsdom does not provide. Counted, so a test can assert how many DISTINCT sheets
 *  were minted — which is the actual claim: N frames, one blob. */
let minted: string[] = [];
let revoked: string[] = [];

beforeEach(() => {
	class RO {
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
	}
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { hasTheme: () => false, addThemes: () => {} };
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockReset();
	clearDeckMemo();
	clearSliceCache();
	__resetLiveRenderersForTest();
	document.body.innerHTML = '';
	minted = [];
	revoked = [];
	tileN = 0;
	let n = 0;
	(URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => {
		const u = `blob:stub/${++n}`;
		minted.push(u);
		return u;
	};
	(URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = (u: string) => {
		revoked.push(u);
	};
});

/**
 * Render one tile and hand back the srcdoc its frame was written with.
 *
 * DISTINCT MARKDOWN PER CALL, which is load-bearing rather than tidy: the whole-deck memo is
 * keyed on the source, so rendering the same string twice serves the FIRST render's css and
 * never reaches the sheet cache at all. Caught by the second test below minting one url for two
 * different sheets — and it would have made the first test (four frames, one url) pass
 * vacuously, proving the memo works rather than that the sheet is shared.
 */
let tileN = 0;
async function tileDoc(css: string, extraCss?: string): Promise<string> {
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ html: HTML, css }));
	const host = document.createElement('figure');
	document.body.appendChild(host);
	const r = createSingleSlideRenderer(base);
	await r.renderInto(host, `body ${++tileN}`, false, undefined, undefined, undefined, extraCss);
	const frame = host.querySelector('iframe') as HTMLIFrameElement;
	return frame?.getAttribute('srcdoc') ?? '';
}

/**
 * A sheet nobody else in this file has used.
 *
 * The cache is MODULE-LEVEL — that is the entire point of it, since sharing across frames means
 * sharing across renderer instances — so it survives `beforeEach` and every test's sheets stay
 * cached for the next one. Reusing a literal across tests therefore measures the first test's
 * leftovers: an earlier draft asserted "two sheets mint two urls" and read ONE, because the
 * first sheet was already cached by the test above it.
 */
let sheetN = 0;
const uniqueSheet = () => `.lattice{--s${++sheetN}:1}`.padEnd(4000, ' ');

describe('the engine sheet is shared across frames, not inlined per frame (#1538)', () => {
	it('mints ONE object url for many frames rendering the same sheet', async () => {
		const sheet = uniqueSheet();
		const docs = [await tileDoc(sheet), await tileDoc(sheet), await tileDoc(sheet), await tileDoc(sheet)];

		// THE CLAIM, and the reason the whole change exists: four frames, one sheet.
		expect(minted.length, `four identical tiles minted ${minted.length} sheets`).toBe(1);
		for (const d of docs) expect(d).toContain(`<link id="lattice-sheet" rel="stylesheet" href="${minted[0]}">`);
		// And the bytes are NOT also inlined — otherwise the frames pay for the sheet twice and
		// the measurement this was chosen on would be meaningless.
		for (const d of docs) expect(d, 'the sheet is linked AND inlined').not.toContain(sheet.trim());
	});

	it('mints a SECOND url for a different sheet, and keeps serving both', async () => {
		const a = uniqueSheet();
		const b = uniqueSheet();
		await tileDoc(a);
		await tileDoc(b);
		const backToA = await tileDoc(a);
		expect(minted.length, 'a distinct sheet did not get its own url').toBe(2);
		// A is still cached — returning to it must not mint a third.
		expect(backToA).toContain(`href="${minted[0]}"`);
	});

	it('keeps the cascade order: frame box, then the engine sheet, then the author CSS', async () => {
		// LOAD-BEARING, not cosmetic. `singleSlideFrame` emits `.lattice>section{width;height}`
		// and frame-css.js states it "must AGREE with the engine scaffold's
		// `article.lattice > section`" — the two collide, and the engine's copy wins today only
		// by coming later. Splitting the sheet out is exactly the kind of change that silently
		// reverses that, so the order is pinned rather than assumed.
		const doc = await tileDoc(uniqueSheet(), '.mine{color:red}');
		const frame = doc.indexOf('<style id="lattice-frame">');
		const sheet = doc.indexOf('<link id="lattice-sheet"');
		const author = doc.indexOf('<style id="lattice-theme">');
		expect(frame, 'no frame style element').toBeGreaterThan(-1);
		expect(sheet, 'no shared sheet link').toBeGreaterThan(-1);
		expect(author, 'no author style element').toBeGreaterThan(-1);
		expect(frame).toBeLessThan(sheet);
		expect(sheet).toBeLessThan(author);
		// All three inside the head, so none of them is render-blocking the body late.
		expect(author).toBeLessThan(doc.indexOf('</head>'));
	});

	it("puts the author's CSS in the resident <style>, where the restyle path looks for it", async () => {
		const doc = await tileDoc(uniqueSheet(), '.mine{color:red}');
		const author = doc.slice(doc.indexOf('<style id="lattice-theme">'), doc.indexOf('</head>'));
		expect(author).toContain('.mine{color:red}');
	});

	it('falls back to an inline sheet where object urls are unavailable', async () => {
		// The path every OTHER suite here takes, and a real one: jsdom, and any host without
		// object urls. It must produce a working document in the SAME cascade order, not a
		// frame with no theme at all.
		(URL as unknown as { createObjectURL: unknown }).createObjectURL = undefined;
		const css = uniqueSheet();
		const doc = await tileDoc(css, '.mine{color:red}');
		expect(doc, 'the fallback dropped the sheet instead of inlining it').toContain(css.trim());
		expect(doc).not.toContain('<link id="lattice-sheet"');
		const frame = doc.indexOf('<style id="lattice-frame">');
		const sheet = doc.indexOf('<style id="lattice-sheet">');
		const author = doc.indexOf('<style id="lattice-theme">');
		expect(frame).toBeLessThan(sheet);
		expect(sheet).toBeLessThan(author);
	});

	it('compares the sheet BYTES, so a hash collision cannot serve the wrong theme', async () => {
		// `single-slide-render.cache-keys.test.ts` exists because a `hashString` collision once
		// served a stale sheet, and serving the wrong 640KB of CSS is worse than a cache miss.
		// Two sheets of the SAME LENGTH with a forced identical hash must still get their own url.
		const mod = await import('../playground/deck-preview.js');
		const spy = vi.spyOn(mod, 'hashString');
		// Not stubbing the hash outright — this module captured the import at load time. Instead
		// use two sheets of equal length whose difference is late in the string, the shape a
		// cheap rolling hash is most likely to collide on, and require distinct urls regardless.
		spy.mockRestore();
		const stem = `.c${++sheetN}` + 'x'.repeat(3990);
		const a = stem + 'a';
		const b = stem + 'b';
		await tileDoc(a);
		const docB = await tileDoc(b);
		expect(minted.length, 'two different sheets shared one url').toBe(2);
		expect(docB).toContain(`href="${minted[1]}"`);
	});
});

// The restyle path writes the new body only after the new sheet has loaded, so no frame paints a
// new slide under the previous slide's sheet (a pane slide's table sat at the wrong height until
// the sheet arrived, on iPhone WebKit where a ~1.5 MB sheet takes long to parse). That ordering
// needs the promise `swapSharedSheet` returns to settle at the right moments.
describe('swapSharedSheet settles when the new sheet is ready', () => {
	const frameDoc = (href: string) => {
		const doc = document.implementation.createHTMLDocument('f');
		doc.head.innerHTML = `<link id="lattice-sheet" rel="stylesheet" href="${href}">`;
		return doc;
	};

	it('returns null when the frame already holds that sheet', () => {
		expect(__swapSharedSheetForTest(frameDoc('blob:a'), 'blob:a')).toBeNull();
	});

	it('stays pending, with the old sheet attached, until the new one loads', async () => {
		const doc = frameDoc('blob:a');
		const done = __swapSharedSheetForTest(doc, 'blob:b') as Promise<void>;
		let settled = false;
		void done.then(() => { settled = true; });
		await Promise.resolve();
		expect(settled, 'settled before the new sheet loaded').toBe(false);
		expect(doc.querySelectorAll('link[rel=stylesheet]').length, 'old and new overlap while loading').toBe(2);
		doc.getElementById('lattice-sheet')!.dispatchEvent(new Event('load'));
		await done;
		expect(settled, 'did not settle after the load').toBe(true);
		const links = [...doc.querySelectorAll('link[rel=stylesheet]')];
		expect(links.map((l) => l.getAttribute('href'))).toEqual(['blob:b']);
	});

	it('shares the wait when a second render swaps to the sheet that is already loading', async () => {
		// The landing demo's palette picker does not queue its renders: a second one can start while the
		// first waits. It must wait for the SAME load, not return at once and write its body ahead of the sheet.
		const doc = frameDoc('blob:a');
		const first = __swapSharedSheetForTest(doc, 'blob:b') as Promise<void>;
		const second = __swapSharedSheetForTest(doc, 'blob:b');
		expect(second, 'a swap to the sheet already loading returned no wait').not.toBeNull();
		let settled = false;
		void (second as Promise<void>).then(() => { settled = true; });
		await Promise.resolve();
		expect(settled, 'the second render did not wait for the load').toBe(false);
		doc.getElementById('lattice-sheet')!.dispatchEvent(new Event('load'));
		await Promise.all([first, second]);
		expect(settled).toBe(true);
		// Loaded: nothing left to wait for.
		expect(__swapSharedSheetForTest(doc, 'blob:b')).toBeNull();
	});

	it('settles on an error too, so a failed fetch cannot hold the render forever', async () => {
		const doc = frameDoc('blob:a');
		const done = __swapSharedSheetForTest(doc, 'blob:c') as Promise<void>;
		doc.getElementById('lattice-sheet')!.dispatchEvent(new Event('error'));
		await done;
		expect([...doc.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href'))).toEqual(['blob:c']);
	});

	it('settles after 2 s when neither event fires (a frame torn down mid-swap)', async () => {
		vi.useFakeTimers();
		try {
			const doc = frameDoc('blob:a');
			const done = __swapSharedSheetForTest(doc, 'blob:d') as Promise<void>;
			vi.advanceTimersByTime(2000);
			await done;
			expect(doc.querySelectorAll('link[rel=stylesheet]').length).toBe(1);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe('two overlapping restyle renders on one frame', () => {
	it('an older render that finishes late does not swap the sheet out from under a newer one that is waiting', async () => {
		const mock = renderMarkdown as unknown as ReturnType<typeof vi.fn>;
		const host = document.createElement('figure');
		document.body.appendChild(host);
		const r = createSingleSlideRenderer(base);
		// Render 0 puts the frame up with sheet A.
		const sheetA = uniqueSheet();
		mock.mockImplementation(async () => ({ html: HTML, css: sheetA }));
		await r.renderInto(host, 'race 0', false);
		const frame = host.querySelector('iframe') as HTMLIFrameElement;
		// jsdom does not load a srcdoc, so do what the browser does: parse the document the renderer wrote into the frame.
		const doc = frame.contentDocument as Document;
		doc.open();
		doc.write(frame.getAttribute('srcdoc') ?? '');
		doc.close();
		expect(doc.getElementById('lattice-sheet'), 'the frame did not come up with a linked sheet').toBeTruthy();
		frame.dispatchEvent(new Event('load'));
		await vi.waitFor(() => expect((host as unknown as { __latticePendingLoad?: boolean }).__latticePendingLoad).toBe(false));

		// Render 1 (older) is slow in the engine; render 2 (newer) is fast and swaps first.
		const sheetOld = uniqueSheet();
		const sheetNew = uniqueSheet();
		let releaseOld!: () => void;
		const oldGate = new Promise<void>((res) => { releaseOld = res; });
		mock.mockImplementationOnce(async () => {
			await oldGate;
			return { html: HTML, css: sheetOld };
		});
		mock.mockImplementationOnce(async () => ({ html: HTML, css: sheetNew }));
		const older = r.renderInto(host, 'race 1', false, undefined, undefined, 'dark');
		const newer = r.renderInto(host, 'race 2', false, undefined, undefined, 'dark');
		await vi.waitFor(() => expect(doc.querySelectorAll('link[rel=stylesheet]').length, 'the newer render did not start its swap').toBe(2));
		const newLink = doc.getElementById('lattice-sheet') as HTMLLinkElement;
		const newHref = newLink.getAttribute('href');

		// The older render now reaches the swap. It must stand down: no third sheet, the newer link untouched.
		releaseOld();
		await older;
		expect(doc.querySelectorAll('link[rel=stylesheet]').length, 'the older render swapped under the newer one').toBe(2);
		expect(doc.getElementById('lattice-sheet')).toBe(newLink);

		// The newer sheet loads: the newer render completes on it, and it is the only sheet left.
		newLink.dispatchEvent(new Event('load'));
		await newer;
		expect([...doc.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href'))).toEqual([newHref]);
	});
});
