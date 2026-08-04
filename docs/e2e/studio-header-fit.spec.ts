import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// The Studio top bar is one non-wrapping flex row in which every control is
// `shrink-0` except the deck switcher. When it runs out of width it does not wrap
// or scroll — the controls at its end simply leave the screen, silently. That is
// #1381 (the ⋯ Menu, a tablet's only route to Library / Reader views / Workspace
// settings, pushed clean off a 700px viewport) and it is the standing failure mode
// of every future addition to this row.
//
// Two guards existed for it and NEITHER can block a merge on its own:
//   • `check:overflow` measures the real geometry, but its CI step is
//     `continue-on-error` — it can go red without failing anything.
//   • the `StudioShell.test.tsx` cover runs in jsdom, which has NO LAYOUT. It can
//     assert what renders; it cannot assert that what renders FITS.
// So the fit itself was held by desk arithmetic, and #1401 then had to re-derive it
// from scratch. This spec is the missing MEASURED oracle: a real browser, the real
// built site, the eight widths the header claims to support, on the per-PR `@smoke`
// subset. It does not block a merge either — `studio-smoke` is deliberately advisory
// until a nightly green streak promotes it (#800, and the experience-gating framework
// in 2026-06-28-experience-gating-playwright.md §3) — but it turns "someone should
// re-measure" into a run that reports on every PR touching the docs.
//
// It asserts three things at once, because they are one contract:
//   1. the header fits inside itself (`scrollWidth <= clientWidth`);
//   2. the ⋯ Menu — the control the overflow eats first — is fully on-screen;
//   3. Read / Write / Build render as WORDS at every width the dial appears at
//      (#1401: below 1100 the words were not merely hidden but unreachable on a
//      touch tablet, where the tooltip carrying them never fires).
// Plus the invariant #1371 shipped: the tail controls hold their x across the three
// dial stops, so stepping the dial never slides the row under your finger.

const WIDTHS = [700, 720, 760, 820, 1024, 1099, 1100, 1440];
const DESKTOP = 1100; // the app's own boundary (use-breakpoint.ts), not Tailwind's `lg`
const TOLERANCE = 2; // sub-pixel rounding, same as check:overflow
const X_DRIFT = 1; // sub-pixel only: #1371's defect was a 70px jump, not a rounded pixel
// Every geometry read waits for the row to STOP MOVING first. Stepping the dial at
// ≥1100 swaps the slim header for the full one, and the deck pill then reflows for
// ~100ms (250px → 240px), dragging Present from 630 to 616 as it goes. A read taken
// the instant React commits the button is a read of a row mid-flight: it reported
// 616 / 616 / 631 locally and 616 / 616 / 617 on CI — the SAME defect, sized by how
// busy the machine is. A tolerance cannot fix that; it only picks which machines
// flake. Waiting for two consecutive identical reads can, and it makes the assertions
// mean what they say: the SETTLED row fits, and the SETTLED cluster does not move.
const SETTLE_STEP_MS = 100;
const SETTLE_TRIES = 40; // 4s ceiling — far past the ~100ms reflow, still bounded
// The row must not merely FIT at its floor — it must fit with room a person could spend.
// `scrollWidth <= clientWidth` is a cliff-edge oracle: the deck switcher truncates to
// absorb pressure, so the first thing a squeeze destroys is the deck title (the user's
// orientation), and the fit assertion cannot fail until that is already at zero. This
// floor fires BEFORE the cliff. 24px is not arbitrary: with the webfont unavailable the
// system-ui fallback grows the dial by ~20px, so a row under ~24px of spare is a row that
// breaks for anyone whose font has not loaded yet. Today's measurement is 35px.
const MIN_SPARE_AT_FLOOR = 24;

// Step the dial by ARIA NAME, never by text: an icon-only dial has no text, so a
// textContent lookup would match nothing, the click would be a no-op, and every
// control would report "stable" for the emptiest possible reason. `aria-pressed`
// flipping is what proves the step actually happened.
const STOPS = [
	{ name: 'Read — just the slides', word: 'Read' },
	{ name: 'Write — editor + preview', word: 'Write' },
	{ name: 'Build — every panel', word: 'Build' },
] as const;

/** The tail controls whose x must not move when the dial steps (#1371). Present and
 *  Share are in both headers; the rest exist per tier, and a missing one is skipped
 *  rather than failed — the comparison is across STOPS at one width, not across widths.
 *  Names come from `CHROME` where the contract already carries them, so a rename is a
 *  one-file fix there (the #780 failure mode) rather than a sweep. 'Present', 'Share'
 *  and the tablet 'Settings' button have no CHROME entry — 'Slide settings' is a
 *  different control — so they stay literal here. */
const TAIL = ['Present', 'Share', CHROME.feedback, 'Settings', CHROME.moreControls];

type HeaderShape = { over: number; menu: { x: number; right: number } | null; x: Record<string, number> };

async function readHeader(page: import('@playwright/test').Page, tail: string[], menuName: string): Promise<HeaderShape> {
	return page.evaluate(([names, menuLabel]) => {
		const h = document.querySelector('[data-studio-root] header');
		if (!h) throw new Error('no [data-studio-root] header — the selector or the route moved');
		const at = (name: string) => {
			const el = [...h.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === name);
			return el ? el.getBoundingClientRect() : null;
		};
		const menu = at(menuLabel);
		const x: Record<string, number> = {};
		for (const n of names) {
			const r = at(n);
			if (r) x[n] = Math.round(r.x);
		}
		return {
			over: h.scrollWidth - h.clientWidth,
			menu: menu ? { x: Math.round(menu.x), right: Math.round(menu.right) } : null,
			x,
		};
	}, [tail, menuName] as const);
}


/** `readHeader`, but only once two consecutive reads agree — see SETTLE_STEP_MS above. */
async function readHeaderSettled(page: import('@playwright/test').Page, tail: string[], menuName: string): Promise<HeaderShape> {
	let prev = await readHeader(page, tail, menuName);
	for (let i = 0; i < SETTLE_TRIES; i++) {
		await page.waitForTimeout(SETTLE_STEP_MS);
		const next = await readHeader(page, tail, menuName);
		if (JSON.stringify(next) === JSON.stringify(prev)) return next;
		prev = next;
	}
	// Never silently accept an unsettled row: a header still moving after 4s is itself
	// the finding, and reporting it as a measurement would hide it.
	throw new Error(`the header never settled after ${(SETTLE_TRIES * SETTLE_STEP_MS) / 1000}s — last read ${JSON.stringify(prev)}`);
}

/**
 * How much MORE could this row carry before it clips? Binary-searches the width of a
 * rigid probe appended to the header, then removes it.
 *
 * The probe must carry INK. An empty `<div>` of any width does not grow a flex row's
 * `scrollWidth` in Chrome, so an empty probe reports infinite headroom — measured, and
 * it is exactly the kind of silently-passing measurement this file exists to prevent.
 */
async function spareAt(page: import('@playwright/test').Page, tolerance: number): Promise<number> {
	return page.evaluate((tol) => {
		const h = document.querySelector('[data-studio-root] header');
		if (!h) throw new Error('no [data-studio-root] header');
		const probe = document.createElement('span');
		probe.textContent = '·';
		probe.style.cssText = 'flex:0 0 auto;display:inline-block;overflow:hidden;visibility:hidden';
		h.appendChild(probe);
		const fits = (px: number) => {
			probe.style.width = `${px}px`;
			void (h as HTMLElement).offsetWidth; // force layout
			return h.scrollWidth - h.clientWidth <= tol;
		};
		try {
			if (!fits(0)) return -1;
			let lo = 0;
			let hi = 400;
			while (lo < hi) {
				const mid = Math.ceil((lo + hi) / 2);
				if (fits(mid)) lo = mid;
				else hi = mid - 1;
			}
			return lo;
		} finally {
			probe.remove(); // never leave the probe behind — later widths measure the real row
		}
	}, tolerance);
}

test('@smoke the Studio header fits — and keeps its words — at every supported width', async ({ page }) => {
	test.slow(); // 8 widths x 3 dial stops in one page: headroom, not an expectation
	await gotoStudio(page);
	// EVERY query below is scoped to the Studio header, never to the page. A local
	// `astro dev` run injects its own dev-toolbar buttons — including one named
	// "Menu" — into the accessibility tree, which turns a page-wide role query into
	// a strict-mode failure or, worse, a count assertion that reads 2 and blames the
	// app (responsive.spec.ts carries the same warning for its "Settings" button).
	// Scoping is also just more honest: the claim is about THIS row, not the page.
	const header = page.locator('[data-studio-root] header');

	for (const width of WIDTHS) {
		await page.setViewportSize({ width, height: 900 });
		const compact = width < DESKTOP;
		// The breakpoint flip is a matchMedia listener + a React render; wait on the
		// OBSERVABLE consequence (the ⋯ Menu exists below 1100 and not at/above it)
		// rather than on a sleep, so the measurement can never race the re-layout.
		await expect(header.getByRole('button', { name: CHROME.moreControls, exact: true })).toHaveCount(compact ? 1 : 0);

		const perStop: Record<string, HeaderShape> = {};
		for (const stop of STOPS) {
			const button = header.getByRole('button', { name: stop.name }).first();
			await button.click();
			// The step really happened — see the note on STOPS above.
			await expect(button, `${stop.word} @ ${width}px should be the lit stop`).toHaveAttribute('aria-pressed', 'true');
			// …and the dial SHOWS the word, not just the icon (#1401). Both halves matter:
			// `toHaveText` alone passes on an `sr-only` span, a `display:none` span, or a
			// clipped one — every one of which reproduces the exact defect this guards
			// (a sighted user who cannot READ the stop). So assert the span is visible
			// and has real width, not merely that the text is in the DOM.
			await expect(button, `${stop.word} @ ${width}px should render its word`).toHaveText(new RegExp(stop.word));
			const word = button.getByText(stop.word, { exact: true });
			await expect(word, `${stop.word} @ ${width}px should be VISIBLE, not just present`).toBeVisible();
			const wordBox = await word.boundingBox();
			expect(wordBox?.width ?? 0, `${stop.word} @ ${width}px should occupy real width`).toBeGreaterThan(0);

			const shape = await readHeaderSettled(page, TAIL, CHROME.moreControls);
			expect(shape.over, `header self-overflow at ${width}px on ${stop.word}`).toBeLessThanOrEqual(TOLERANCE);
			if (compact) {
				expect(shape.menu, `the ⋯ Menu should exist at ${width}px`).not.toBeNull();
				expect(shape.menu?.right ?? Number.POSITIVE_INFINITY, `⋯ Menu right edge at ${width}px on ${stop.word}`).toBeLessThanOrEqual(width);
				expect(shape.menu?.x ?? -1, `⋯ Menu left edge at ${width}px on ${stop.word}`).toBeGreaterThanOrEqual(0);
			}
			perStop[stop.word] = shape;
		}

		// #1371: stepping the dial must not slide the controls beside it. Compared
		// only across controls present in ALL three stops — at desktop the Read/Write
		// slim header genuinely carries fewer of them, and that is not drift.
		//
		// Read from SETTLED geometry (above), so this compares finished layouts. The 1px
		// of allowance left is for genuine sub-pixel rounding between two DIFFERENT rows:
		// at ≥1100 Read and Write render the slim header and Build the full one.
		//
		// Below 1100 the assertion is structurally satisfied — all three stops render the
		// same full header, so nothing CAN move — and it is kept anyway: it costs nothing
		// and it is what would fail if a future change reintroduced a per-stop header
		// below desktop. The load-bearing widths for it are 1100 and 1440.
		//
		// Be exact about what settling gives up: at ≥1100 the tail DOES slide briefly on
		// Write→Build (Present travels ~15px over ~75ms at 1440 as the deck pill reflows
		// into the full header), so what is asserted here is "lands in the same place",
		// not "never moves at all". That transient predates this branch — it belongs to
		// the slim↔full header swap, which #1371 did not touch — so it is logged rather
		// than folded in (HARD RULE #18, off-path): #1414.
		const shared = TAIL.filter((n) => STOPS.every((s) => perStop[s.word].x[n] !== undefined));
		for (const name of shared) {
			const xs = STOPS.map((s) => perStop[s.word].x[name]);
			const drift = Math.max(...xs) - Math.min(...xs);
			expect(drift, `${name} moved across the dial at ${width}px (x = ${xs.join(' / ')})`).toBeLessThanOrEqual(X_DRIFT);
		}

		// Headroom, at the floor only — see MIN_SPARE_AT_FLOOR above.
		if (width === WIDTHS[0]) {
			const spare = await spareAt(page, TOLERANCE);
			expect(spare, `spare capacity at the ${width}px floor`).toBeGreaterThanOrEqual(MIN_SPARE_AT_FLOOR);
		}
	}
});
