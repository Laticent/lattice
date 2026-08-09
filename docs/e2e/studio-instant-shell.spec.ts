import { expect, test } from './studio-fixture';

// The Studio's pre-paint INSTANT SHELL vs the app it hands off to (#1438).
//
// The Studio is `client:only`, so at HTML-parse time the React tree does not exist: what a
// visitor sees on a reload is the static shell in `docs/src/pages/studio.astro`. That shell
// used to draw exactly two things — a topbar and the Nacre slide box — so hydration then
// dropped four more bands into place at once (the phone's eight-cell action bar, the preview
// sub-bar, the slide navigator, the status strip) and, on tablet/desktop, the entire editor
// column. Reported as "the icons and the action bar are missing on reload"; the accurate
// description is that the shell was STRUCTURALLY INCOMPLETE, so the hand-off was a re-layout
// rather than a cross-fade.
//
// The shell now draws those bands from `PREVIEW_CHROME` — the same constants the seed already
// used to PLACE the slide box. That makes the constants load-bearing in a way they were not
// before: a stale one used to hide as a few px of box offset, and now shows as a visible seam
// where a band lands on the wrong line. `mobileBarH` was exactly that — 53px, the height of
// the pane-toggle bar it measured before the eight-cell redesign reshaped that row, off by 4px
// and undetectable by anything in the repo.
//
// So this is the missing oracle: measure the SHELL's bands in a real browser on the real built
// site, then measure the APP's own bands in the SAME page load, and require them to agree.
// It is the only guard that can see the two surfaces at once — the unit tier renders in jsdom
// (no layout at all) and `check:studio-shell` reads the shipped HTML for markers, which proves
// the bands exist, never that they land where the app puts them.

// [left, top, width, height]. Read back from `page.evaluate` as a plain number[], so that is
// what the helper takes — a tuple type here would only make every call site cast.
type Rect = number[];

// Sub-pixel rounding only. The bands are integers or a single .6 (`footerWrite`); anything
// past 2px is a real disagreement, which is the whole point of the spec.
const TOLERANCE = 2;

// The engine bundle is what the shell waits on: it is dismissed when the live preview first
// paints. Holding the bundle briefly keeps the shell up long enough to measure it WITHOUT
// changing a single thing about its layout — the alternative (racing a fast machine to read
// the rects before dismissal) is a flake, not a test.
const ENGINE_HOLD_MS = 2500;

function near(actual: Rect | null, expected: Rect | null, label: string) {
	expect(actual, `${label}: shell band missing`).not.toBeNull();
	expect(expected, `${label}: app band missing`).not.toBeNull();
	for (const [i, axis] of ['left', 'top', 'width', 'height'].entries()) {
		expect(
			Math.abs((actual as Rect)[i] - (expected as Rect)[i]),
			`${label} ${axis}: shell ${(actual as Rect)[i]} vs app ${(expected as Rect)[i]}`,
		).toBeLessThanOrEqual(TOLERANCE);
	}
}

test('@crosswidth the instant shell frames the app it hands off to', async ({ page }) => {
	await page.route('**/lattice-playground.js', async (route) => {
		await new Promise((r) => setTimeout(r, ENGINE_HOLD_MS));
		await route.continue();
	});
	// No `gotoStudio` here: that fixture seeds the BUILD posture, whose docked side panels are
	// explicitly outside what the shell's geometry models. The shipped default (Write) is both
	// the surface the bug was reported on and the one the seed claims to reproduce.
	await page.goto('/studio/', { waitUntil: 'commit' });
	await page.locator('#studio-ssr-shell .ssr-paneftr').waitFor({ state: 'attached' });

	const shell = await page.evaluate(() => {
		const r = (sel: string) => {
			const el = document.querySelector(sel);
			if (!el) return null;
			const b = el.getBoundingClientRect();
			return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
		};
		return {
			mobile: document.documentElement.getAttribute('data-ssr-bp') === 'mobile',
			topbar: r('#studio-ssr-shell .ssr-topbar'),
			actionbar: r('#studio-ssr-shell .ssr-actionbar'),
			panehdr: r('#studio-ssr-shell .ssr-panehdr'),
			paneftr: r('#studio-ssr-shell .ssr-paneftr'),
			status: r('#studio-ssr-shell .ssr-status'),
		};
	});
	// A dismissed shell reads as all-zero rects and would pass every comparison below
	// vacuously — assert we caught it up, so the engine hold can't rot silently.
	expect(shell.topbar?.[3], 'the shell was already dismissed — the engine hold is not working').toBe(54);

	// Now let the app through and measure its own bands.
	await page.unrouteAll({ behavior: 'ignoreErrors' });
	await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible' });
	await expect(page.locator('#studio-ssr-shell')).toHaveCount(0);

	const app = await page.evaluate(() => {
		const r = (el: Element | null | undefined) => {
			if (!el) return null;
			const b = el.getBoundingClientRect();
			return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
		};
		// The preview PANE is the section that holds the live iframe; its first child is the
		// sub-bar and its last two are the slide navigator and the deck status strip. Walking
		// up from the iframe keeps this spec off the app's class names, which are not a
		// contract — the band GEOMETRY is what it asserts.
		let pane: Element | null = document.querySelector('[aria-label="Live deck preview"] iframe.live');
		while (pane && pane.tagName !== 'SECTION') pane = pane.parentElement;
		const kids = pane ? [...pane.children] : [];
		return {
			header: r(document.querySelector('header')),
			toolbar: r(document.querySelector('[role="toolbar"][aria-label="Deck actions"]')),
			panehdr: r(kids[0]),
			rail: r(kids[kids.length - 2]),
			status: r(kids[kids.length - 1]),
		};
	});

	near(shell.topbar, app.header, 'topbar');
	near(shell.panehdr, app.panehdr, 'preview sub-bar');
	near(shell.status, app.status, 'status strip');
	// The shell draws the footer as ONE band (navigator + status stacked); the app renders them
	// as two siblings. Compare the union: same left/width, and top/height spanning both.
	const appFooter: Rect | null =
		app.rail && app.status ? [app.rail[0], app.rail[1], app.rail[2], app.rail[3] + app.status[3]] : null;
	near(shell.paneftr, appFooter, 'preview footer');

	if (shell.mobile) {
		// The phone's eight-cell deck-actions bar — the "middle action bar" of the report.
		near(shell.actionbar, app.toolbar, 'action bar');
	} else {
		// Tablet/desktop have no action bar; the shell must not paint one, or it would push a
		// 49px band into a row the app leaves to the editor|preview split.
		expect(app.toolbar, 'the app grew an action bar above the split').toBeNull();
		expect(shell.actionbar?.[3] ?? 0, 'the shell painted a phone action bar on a wide viewport').toBe(0);
	}
});
