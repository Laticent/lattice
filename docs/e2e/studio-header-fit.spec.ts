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
			// …and the dial says the word, not just the icon (#1401).
			await expect(button, `${stop.word} @ ${width}px should render its word`).toHaveText(new RegExp(stop.word));

			const shape = await readHeader(page, TAIL, CHROME.moreControls);
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
		const shared = TAIL.filter((n) => STOPS.every((s) => perStop[s.word].x[n] !== undefined));
		for (const name of shared) {
			const xs = STOPS.map((s) => perStop[s.word].x[name]);
			expect(new Set(xs).size, `${name} moved across the dial at ${width}px (x = ${xs.join(' / ')})`).toBe(1);
		}
	}
});
