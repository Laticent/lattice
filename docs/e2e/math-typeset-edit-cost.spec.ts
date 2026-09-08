import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendToEditor, expect, gotoStudio, setEditorContent, test, waitForStudioPaint } from './studio-fixture';

/**
 * WHAT A KEYSTROKE COSTS IN TYPESETS, MEASURED IN THE REAL STUDIO.
 *
 * The typeset memo (`lib/engine/math.js`) was landed on Node-side numbers: 90
 * `katex.renderToString` calls per keystroke before, 0 after, on
 * `math.gallery.md`. Those came from a harness that RECONSTRUCTS what the
 * Studio's render route hands the engine — it never drove the Studio. Under
 * HARD RULE #23 that is an estimate of this surface, not a measurement of it,
 * and `math.js`'s own docblock says so. This spec is the measurement.
 *
 * IT ALSO CORRECTS THE FRAMING, which is the more useful half. The real Studio
 * renders ONE SLIDE, not the deck: the first run of this spec seeded all 16
 * gallery slides, left the preview on slide 16 ("See also", which carries no
 * math) and counted ZERO typesets for the whole cold paint. So "90 per
 * keystroke" was never a number an author paid in the Studio — it is the
 * whole-deck route's number. What an author actually pays is the count for the
 * slide they are looking at, which is what this file measures.
 *
 * HOW IT COUNTS, and why the count is trustworthy. In the browser the engine's
 * `require('katex')` resolves to `lib/engine/katex-browser-stub.js`, which holds
 * a null `real` until the separately-bundled provider calls
 * `window.__latticeRegisterKatex(katexModule)` (see `ensure-katex.ts`). That
 * registration happens in the MAIN page — not inside the preview iframe — so
 * an init script can stand in front of it: we intercept the property, wrap the
 * module the provider passes, and hand the stub a `renderToString` that
 * increments a counter before delegating. Nothing in the shipped path changes
 * shape; the stub still calls `real.renderToString` and gets real KaTeX back.
 *
 * `Object.create(k)` rather than a spread: katex's export carries methods we do
 * not enumerate, and only `renderToString` should be shadowed. Everything else
 * resolves through the prototype chain untouched.
 *
 * THE DECK IS THE GALLERY, CUT AT ITS `compare` SLIDE — not a deck invented for
 * the test. Cutting there is what puts a REAL math slide last, so the caret can
 * land in its trailing prose without navigating the preview (`appendToEditor`
 * goes to the document end, and the Studio follows the caret). Nothing is
 * authored here: the slide is sliced out of the committed gallery at run time,
 * so it cannot drift from what the component actually ships.
 *
 * THE CARET GOES IN PROSE, NEVER IN MATH. The claim under test is that a
 * keystroke stops re-typesetting equations THAT DID NOT CHANGE, so the edit has
 * to leave every expression on the slide byte-identical.
 *
 * A ZERO IS ONLY EVIDENCE IF THE COUNTER CAN FIRE. Two arms exist for that, and
 * both were earned — the first version of this spec asserted `0` on a slide with
 * no math and would have passed vacuously if its cold-count oracle had not
 * caught it. So: the cold paint must count MORE THAN ZERO (the counter sees the
 * real path), and the last arm types INSIDE an expression and requires the count
 * to RISE (the memo is keyed on the expression, not suppressing typesets
 * globally). Without that second arm, a memo that never invalidated would score
 * a perfect 0 here and ship a bug where editing an equation stopped updating it.
 *
 * SETTLE BY QUIESCENCE, NOT BY A FIXED WAIT. The Studio debounces its render, so
 * a hard `waitForTimeout` either races the debounce (under-counts) or pads every
 * run and still guarantees nothing. Polling until the counter stops moving for a
 * full quiet window is correct whatever the debounce is set to, and self-adjusts
 * on a loaded runner.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GALLERY = readFileSync(join(REPO, 'lib/components/math/math/math.gallery.md'), 'utf8');

/**
 * The gallery's slides up to and including the one carrying `_class: math compare`
 * — a real math slide, so it ends the deck with expressions on screen.
 */
function deckEndingAtCompare(source: string): string {
	const slides = source.split(/^---$/m);
	const cut = slides.findIndex((s) => /_class:\s*math compare/.test(s));
	if (cut < 0) throw new Error('math.gallery.md no longer has a `math compare` slide — re-point this spec');
	return slides.slice(0, cut + 1).join('---');
}

/**
 * A trailing prose line to put the caret in, so the edit touches no expression —
 * carrying a BUILD FINGERPRINT: the same expression six times.
 *
 * This is what makes the before/after honest. Both builds render the same deck,
 * so a per-keystroke count alone cannot prove WHICH bundle the preview server
 * actually served — and `reuseExistingServer` in `playwright.config.ts` means a
 * stale server is a real possibility, not a paranoid one. A repeated expression
 * separates them behaviorally, in-page, in the same run: the memo typesets
 * `$\alpha_{7}$` ONCE, an unmemoized build typesets it SIX times. So the cold
 * count reads 5 on this branch and 10 on `main`, and any run that reports the
 * wrong one for its bundle is discarded rather than published.
 *
 * The expression is deliberately absent from the rest of the gallery, so it
 * cannot be warmed by anything earlier in the deck.
 */
const FINGERPRINT_REPEATS = 6;
const PROSE_ANCHOR = `\nTyping happens on this line. ${'$\\alpha_{7}$ '.repeat(FINGERPRINT_REPEATS)}\n`;
const DECK = `${deckEndingAtCompare(GALLERY)}${PROSE_ANCHOR}`;

/**
 * Every expression the RENDERED slide contains, counted from the source: total
 * occurrences and distinct strings. The Studio renders one slide, so the cold
 * typeset count must equal `distinct` on a memoized build and `total` on an
 * unmemoized one — and with the fingerprint line above those two numbers are
 * five apart, which is the whole point. Derived, never hardcoded: a hardcoded
 * base would silently stop discriminating the day the gallery slide changes.
 */
function expressionCensus(slide: string): { total: number; distinct: number } {
	const found: string[] = [];
	const body = slide.replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => {
		found.push(`d:${String(tex).trim()}`);
		return ' ';
	});
	for (const m of body.matchAll(/\$([^$\n]+?)\$/g)) found.push(`i:${m[1].trim()}`);
	return { total: found.length, distinct: new Set(found).size };
}

const LAST_SLIDE = DECK.split(/^---$/m).pop() ?? '';
const CENSUS = expressionCensus(LAST_SLIDE);

declare global {
	interface Window {
		__texCount?: number;
	}
}

type PW = import('@playwright/test').Page;

/**
 * Stand in front of `window.__latticeRegisterKatex` before any page script runs,
 * so the module the provider registers is the one we can count through.
 */
async function countTypesets(page: PW): Promise<void> {
	await page.addInitScript(() => {
		window.__texCount = 0;
		let inner: ((k: unknown) => void) | null = null;
		Object.defineProperty(window, '__latticeRegisterKatex', {
			configurable: true,
			get() {
				return (k: { renderToString(src: string, opts?: unknown): string }) => {
					const wrapped = Object.create(k) as typeof k;
					wrapped.renderToString = (src: string, opts?: unknown) => {
						window.__texCount = (window.__texCount ?? 0) + 1;
						return k.renderToString(src, opts);
					};
					inner?.(wrapped);
				};
			},
			set(fn: (k: unknown) => void) {
				inner = fn;
			},
		});
	});
}

const readCount = (page: PW) => page.evaluate(() => window.__texCount ?? 0);

/**
 * Resolve once the typeset counter has been STILL for `quietMs` — the Studio
 * debounces its render, so "the count stopped moving" is the only honest signal
 * that a render finished. The stillness is tracked INSIDE the page and waited on
 * with a single bounded `waitForFunction`, rather than sampled from Node behind a
 * fixed `waitForTimeout`: a fixed sleep is a bet on a guessed interval (the #1526
 * sweep), and Playwright's own polling already does this without one.
 */
async function settledCount(page: PW, { quietMs = 1500, budgetMs = 30_000 } = {}): Promise<number> {
	await page.waitForFunction(
		(quiet) => {
			const w = window as unknown as { __texCount?: number; __texLast?: number; __texSince?: number };
			const n = w.__texCount ?? 0;
			if (w.__texSince === undefined || n !== w.__texLast) {
				w.__texLast = n;
				w.__texSince = Date.now();
				return false;
			}
			return Date.now() - w.__texSince >= quiet;
		},
		quietMs,
		{ timeout: budgetMs, polling: 100 },
	);
	return readCount(page);
}

/** Type `text` at the document end and return how many typesets it cost. */
async function costOf(page: PW, text: string): Promise<number> {
	const before = await readCount(page);
	// Clear the stillness tracker BEFORE typing: left set, the next
	// `waitForFunction` could resolve on the previous edit's quiet window and
	// report 0 for a render that had not started.
	await page.evaluate(() => {
		delete (window as unknown as { __texSince?: number }).__texSince;
	});
	await appendToEditor(page, text);
	return (await settledCount(page)) - before;
}

test.describe('math typeset cost in the real Studio', () => {
	// NOT @smoke, deliberately: that tag runs on the PR path (`ci.yml`'s
	// `test:e2e:smoke`) under a 60s per-test timeout, and this spec spends four
	// quiescence settles — ~26s on this machine, with no headroom I would trust on
	// a loaded runner. It runs in the nightly with the rest of the Studio suite.
	test('a keystroke in prose re-typesets nothing', async ({ page }, testInfo) => {
		await countTypesets(page);
		await gotoStudio(page);

		await setEditorContent(page, DECK);
		await waitForStudioPaint(page);

		const cold = await settledCount(page);
		testInfo.annotations.push({ type: 'typesets-cold', description: String(cold) });

		// The oracle for the counter itself: at 0, every assertion below would pass
		// vacuously. This is not hypothetical — see the header.
		expect(cold, 'the counter never saw a typeset — the interception did not take').toBeGreaterThan(0);

		// WHICH BUNDLE DID THE PREVIEW ACTUALLY SERVE? Answered behaviorally, in
		// this run, against numbers derived from the deck — not from a constant and
		// not from the reading being explained. `reuseExistingServer` in
		// `playwright.config.ts` makes a stale server a real possibility, and a
		// stale one would report the memo's `0` for a `main` bundle.
		const servedMemoized = cold === CENSUS.distinct;
		const servedUnmemoized = cold === CENSUS.total;
		testInfo.annotations.push({
			type: 'bundle',
			description: servedMemoized
				? `memoized — cold ${cold} == ${CENSUS.distinct} distinct`
				: servedUnmemoized
					? `UNMEMOIZED — cold ${cold} == ${CENSUS.total} total`
					: `UNKNOWN — cold ${cold} matches neither ${CENSUS.distinct} distinct nor ${CENSUS.total} total`,
		});
		expect(
			servedMemoized || servedUnmemoized,
			`cold=${cold} matches neither ${CENSUS.distinct} distinct nor ${CENSUS.total} total expressions — the run cannot say which bundle it measured`,
		).toBe(true);

		const single = await costOf(page, 'x');
		testInfo.annotations.push({ type: 'typesets-single-key', description: String(single) });

		const burst = await costOf(page, 'yz burst edit');
		testInfo.annotations.push({ type: 'typesets-burst-13', description: String(burst) });

		// The memo must still INVALIDATE. `$x+1$` is an expression this deck has
		// never rendered, so it cannot be a cache hit; if the count does not move,
		// the memo is suppressing typesets rather than keying them.
		const changed = await costOf(page, '\n\nA new expression: $x+1$\n');
		testInfo.annotations.push({ type: 'typesets-new-expression', description: String(changed) });

		// eslint-disable-next-line no-console
		console.log(
			`\n  REAL STUDIO [${servedMemoized ? 'MEMOIZED' : 'UNMEMOIZED'} bundle] — typesets:` +
				` cold=${cold} (${CENSUS.distinct} distinct / ${CENSUS.total} total)` +
				` · single-key=${single} · burst-13=${burst} · new-expression=${changed}\n`,
		);

		// The memo's own claims hold only for the memoized bundle. Run against a
		// `main` bundle this spec still runs and still REPORTS — that is how the
		// before/after was taken — but it asserts the opposite, so neither build can
		// pass by accident.
		if (servedMemoized) {
			expect(single, 'a keystroke in prose re-typeset an expression that did not change').toBe(0);
			expect(burst, 'a 13-character burst in prose re-typeset an expression that did not change').toBe(0);
			expect(changed, 'a NEW expression was not typeset — the memo is suppressing, not keying').toBeGreaterThan(0);
		} else {
			expect(single, 'an unmemoized bundle should re-typeset the slide on every keystroke').toBeGreaterThan(0);
		}
	});
});
