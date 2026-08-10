import { STUDIO_SPLIT_BUCKET, STUDIO_SPLIT_PANEL_IDS } from '../src/components/studio/preview-rect';
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
//
// It runs a MATRIX for the same reason `studio-shell-parity.spec.ts` does: every divergence
// the adversarial trio found lived in a STATE the single default case never entered — a
// persisted splitter, a collapsed pane, a landscape phone, a viewport too narrow for the lens
// label, a rotation mid-load. A band oracle that only ever samples "desktop, Write, factory
// defaults" is an oracle for the one configuration nobody reports a bug from.
//
// (The per-CONTROL comparison that used to live here is retired: it was a hand-listed set — the
// mode toggle, the workspace-settings button, the eight bar cells — and it went stale the moment
// one of those labels was corrected. studio-shell-parity.spec.ts now ENUMERATES every control in
// both chromes across a width x stop matrix, which catches the same regressions plus the ones
// nobody thought to list.)

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

// The deck pill is the one control whose exact width is UNKNOWABLE to the shell: it is
// content-sized, and part of that content is a per-deck string the shell must not draw
// ("7 slides" vs "12 slides"). Its slot is reserved at the measured typical width, so a few
// px of variance is by construction. This tolerance is still an order of magnitude tighter
// than the drift it exists to catch — the shell forcing a system font stack moved it 20.5px.
const PILL_TOLERANCE = 6;

/**
 * The app's split-layout store, as `useResizableSplit` writes it. Built from the SHARED
 * declarations rather than retyped: a third hand-written copy of the format let the spec and
 * the seed agree with each other while both disagreed with the hook (#1495).
 */
const splitLayout = (previewPct: number) =>
	JSON.stringify({
		[STUDIO_SPLIT_BUCKET]: { [STUDIO_SPLIT_PANEL_IDS[0]]: 100 - previewPct, [STUDIO_SPLIT_PANEL_IDS[1]]: previewPct },
	});

type Case = {
	w: number;
	h: number;
	stop: 'read' | 'write' | 'build';
	why: string;
	/** Persisted editor|preview split, as the preview pane's percentage. */
	split?: number;
	/** Persisted collapsed side — 'a' is the editor, 'b' the preview. */
	collapsed?: 'a' | 'b';
	/** Resize mid-load, after the shell has painted — a phone rotated during the engine fetch. */
	rotateTo?: { w: number; h: number };
	/** Also run on the PER-PR path (`test:e2e:smoke`), not just the nightly. See the note below. */
	smoke?: boolean;
};

// The matrix is a NIGHTLY cost — 16 cases, each a page load with an engine hold, plus the
// standalone tests below. Two cases carry an `@smoke` tag so the per-PR job runs them too: one
// desktop, one phone.
//
// Be precise about what those two DO cover, because an earlier version of this note over-claimed
// it: both are at the WRITE stop, so they cover every band the shell draws at Write and nothing
// that is Build-only or Read-only — the activity rail, the Build header's tail, the Read dial and
// the chromeless preview are all nightly. Promotion of the whole matrix follows the repo's
// escalation rule — an observed nightly green streak first (#800).

const CASES: Case[] = [
	{ w: 1280, h: 720, stop: 'write', smoke: true, why: 'the shipped default — laptop, factory settings' },
	{ w: 390, h: 844, stop: 'write', smoke: true, why: 'phone, the reported surface' },
	// 320 is below the lens picker's `@[21rem]` container query, so the app's preview sub-bar
	// is 41px there and 47px everywhere else. The shell modelled one number for both.
	{ w: 320, h: 844, stop: 'write', why: 'phone too narrow for the lens label — the 41px sub-bar' },
	{ w: 390, h: 844, stop: 'read', why: 'phone at Read — chromeless preview' },
	{ w: 820, h: 1180, stop: 'write', why: 'tablet' },
	// One case per TIER x STOP, so no tier is verified only at the stop that happens to be the
	// default. The three tiers render three different headers and three different pane
	// arrangements, and every band the shell draws differs across them.
	{ w: 390, h: 844, stop: 'build', why: 'phone at Build — no rail, no docked panels, the bar stays' },
	{ w: 820, h: 1180, stop: 'read', why: 'tablet at Read — chromeless preview, no editor column' },
	{ w: 820, h: 1180, stop: 'build', why: 'tablet at Build — full header, NO activity rail (desktop-only)' },
	{ w: 1440, h: 900, stop: 'read', why: 'desktop at Read — slim header, full-bleed preview' },
	{ w: 1440, h: 900, stop: 'build', why: 'desktop at Build — the activity rail sits outside the split' },
	// A dragged splitter is PERSISTED, so it is the state a returning visitor reloads into.
	// The shell drew the 54% default regardless, which put the split line up to 288px off.
	{ w: 1440, h: 900, stop: 'write', split: 75, why: 'splitter dragged toward the editor' },
	{ w: 1440, h: 900, stop: 'write', split: 30, why: 'splitter dragged toward the preview' },
	// Drag the preview down to its 300px minimum and its sub-bar loses the lens label too —
	// the container query is on the PANE, so the narrow bar is reachable on a 1440px desktop.
	{ w: 1024, h: 900, stop: 'write', split: 30, why: 'preview pane below the lens-label threshold' },
	{ w: 820, h: 1180, stop: 'write', split: 40, why: 'tablet, pane below the lens-label threshold' },
	{ w: 1440, h: 900, stop: 'write', collapsed: 'a', why: 'editor collapsed to its 46px rail' },
	{ w: 390, h: 844, stop: 'write', rotateTo: { w: 844, h: 390 }, why: 'rotated while the engine was still loading' },
];

function near(actual: Rect | null, expected: Rect | null, label: string, tol = TOLERANCE) {
	expect(actual, `${label}: shell band missing`).not.toBeNull();
	expect(expected, `${label}: app band missing`).not.toBeNull();
	for (const [i, axis] of ['left', 'top', 'width', 'height'].entries()) {
		expect(
			Math.abs((actual as Rect)[i] - (expected as Rect)[i]),
			`${label} ${axis}: shell ${(actual as Rect)[i]} vs app ${(expected as Rect)[i]}`,
		).toBeLessThanOrEqual(tol);
	}
}

const READ_SHELL = () => {
	const r = (sel: string) => {
		const el = document.querySelector(sel);
		if (!el) return null;
		const b = el.getBoundingClientRect();
		return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
	};
	return {
		mobile: document.documentElement.getAttribute('data-ssr-bp') === 'mobile',
		cinema: document.documentElement.hasAttribute('data-ssr-cinema'),
		topbar: r('#studio-ssr-shell .ssr-topbar'),
		actionbar: r('#studio-ssr-shell .ssr-actionbar'),
		panehdr: r('#studio-ssr-shell .ssr-panehdr'),
		paneftr: r('#studio-ssr-shell .ssr-paneftr'),
		status: r('#studio-ssr-shell .ssr-status'),
		box: r('#ssr-slidebox'),
		// The deck pill is CONTENT-sized from tablet up, which makes it the one control
		// that detects a text-metrics disagreement between the two surfaces — the shell
		// used to force a system font stack while the app renders in --font-body, and the
		// pill jumped 164.5px -> 185px at hand-off. Bands and the phone's bar cells are
		// both width-constrained, so nothing else here can see that class of drift.
		pill: r('#studio-ssr-shell .ssr-deck-pill'),
		// The deck TITLE, which exists at every tier and stop — unlike the switcher, which the
		// desktop slim header drops at Read. Compared by its own box, so the two surfaces are
		// held to the same line whichever container the tier puts it in.
		// BOTH deck-title elements are in the DOM (the switcher's and the slim header's); the
		// CSS shows one. Pick the one with a box — `:not([hidden])` would match the collapsed
		// one too, since it is hidden by a display rule, not the attribute.
		title: (() => {
			const el = [...document.querySelectorAll('#studio-ssr-shell .ssr-deck-title')].find(
				(e) => e.getBoundingClientRect().width > 0,
			);
			if (!el) return null;
			const b = el.getBoundingClientRect();
			return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
		})(),
		// Must be the VISIBLE one — reading the first match took the hidden pill's text, so the
		// app-side lookup compared against a string the visitor never sees. That is exactly how
		// the desktop-Read wrong-title bug passed this spec green.
		titleText:
			[...document.querySelectorAll('#studio-ssr-shell .ssr-deck-title')]
				.find((e) => e.getBoundingClientRect().width > 0)
				?.textContent?.trim() ?? '',
	};
};

// Takes the deck title as an argument because it runs AFTER the shell node is gone — by
// design; the app is only measured once it has fully replaced the shell.
const READ_APP = (want: string) => {
	const r = (el: Element | null | undefined) => {
		if (!el) return null;
		const b = el.getBoundingClientRect();
		return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
	};
	// The preview PANE is the section that holds the live iframe. Walking up from the iframe
	// keeps this spec off the app's class names, which are not a contract — the band GEOMETRY
	// is what it asserts. Its children are located RELATIVE TO THE HOLDER rather than by
	// index, because the pane sheds bands per stop: at Read there is no sub-bar at all, and
	// indexing from 0 silently compared the shell's sub-bar to the app's slide holder.
	const preview = document.querySelector('[aria-label="Live deck preview"]');
	let pane: Element | null = preview;
	while (pane && pane.tagName !== 'SECTION') pane = pane.parentElement;
	const kids = pane ? [...pane.children] : [];
	const holderIdx = kids.findIndex((k) => k.contains(preview));
	const below = holderIdx < 0 ? [] : kids.slice(holderIdx + 1);
	return {
		header: r(document.querySelector('header')),
		toolbar: r(document.querySelector('[role="toolbar"][aria-label="Deck actions"]')),
		pill: r(document.querySelector('header [data-demo="deck-switcher"]')),
		// Null where the app draws none — the shell must then draw none either.
		panehdr: holderIdx > 0 ? r(kids[holderIdx - 1]) : null,
		rail: r(below[0]),
		// Write/Build stack the navigator and the deck status strip; Read has a single
		// affordance and no status strip of its own.
		status: below.length > 1 ? r(below[below.length - 1]) : null,
		// The deck title, found by TEXT rather than by class: the app puts it inside the
		// switcher button in its full header and bare in its slim one, and neither container is
		// a contract. The deepest header element carrying exactly that string is.
		title: (() => {
			const header = document.querySelector('header');
			if (!want || !header) return null;
			const hit = [...header.querySelectorAll('*')]
				.filter((e) => e.textContent?.trim() === want && !e.querySelector('*'))
				.pop();
			return r(hit);
		})(),
		// The slide CARD (the bordered, letterboxed box) — `[aria-label="Live deck preview"]`
		// is the DeckPreview INSIDE it, 2px narrower for the card's 1px border. The shell's
		// `#ssr-slidebox` is the card's counterpart, so comparing the inner element made every
		// case read as a 2-3px disagreement that was really a measuring error.
		box: r(preview?.closest('[style*="aspect-ratio"]')),
	};
};

for (const c of CASES) {
	// NOT `@crosswidth`: that tag exists for assertions worth re-running at the project's own
	// viewport, and every case here sets its own — so the tag ran the whole matrix twice, in two
	// projects, for identical results and double the nightly wall-clock.
	const title = `${c.smoke ? '@smoke ' : ''}the instant shell frames the app — ${c.w}x${c.h} @ ${c.stop} (${c.why})`;
	test(title, async ({ page }) => {
		await page.addInitScript(
			([stop, split, collapsed]) => {
				try {
					const k = 'lattice-studio-settings';
					localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), posture: stop }));
					if (split) localStorage.setItem('lattice-docs-split-studio', split);
					if (collapsed) sessionStorage.setItem('lattice-docs-split-studio-collapsed', collapsed);
				} catch {
					/* storage blocked — both surfaces fall back to the same defaults */
				}
			},
			[c.stop, c.split ? splitLayout(c.split) : '', c.collapsed ?? ''] as const,
		);
		await page.setViewportSize({ width: c.w, height: c.h });
		await page.route('**/lattice-playground.js', async (route) => {
			await new Promise((r) => setTimeout(r, ENGINE_HOLD_MS));
			await route.continue();
		});
		await page.goto('/studio/', { waitUntil: 'commit' });
		await page.locator('#studio-ssr-shell .ssr-paneftr').waitFor({ state: 'attached' });
		if (c.rotateTo) {
			// The shell derives its geometry at parse time. A phone rotated during the ~505KB
			// engine fetch used to keep the portrait layout until hydration corrected it in one
			// jump; the seed now re-runs on resize, and this is the only thing that can prove it.
			await page.setViewportSize({ width: c.rotateTo.w, height: c.rotateTo.h });
		}
		// Webfonts swap in with `font-display: swap`, moving the content-sized controls while
		// they do. Measuring inside that window is the difference between a guard and a flake.
		await page.evaluate(() => document.fonts.ready);

		const shell = await page.evaluate(READ_SHELL);
		// A dismissed shell reads as all-zero rects and would pass every comparison below
		// vacuously — assert we caught it up, so the engine hold can't rot silently.
		expect(shell.topbar?.[3], 'the shell was already dismissed — the engine hold is not working').toBe(54);

		// Now let the app through and measure its own bands. Do NOT `unrouteAll` here: the engine
		// request is still parked inside the handler above, and tearing the handler down discards
		// it — the engine then never loads, the preview never paints, and this waits out its
		// timeout. The handler releases the request on its own; just wait for it.
		await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible', timeout: 45_000 });
		await expect(page.locator('#studio-ssr-shell')).toHaveCount(0);
		await page.evaluate(() => document.fonts.ready);

		const app = await page.evaluate(READ_APP, shell.titleText);

		near(shell.topbar, app.header, 'topbar');
		// At Read the app strips the pane to just the slide — no sub-bar and no status strip.
		// The shell has to strip them too, so "the app has none" is an assertion, not a skip.
		if (app.panehdr) near(shell.panehdr, app.panehdr, 'preview sub-bar');
		else expect(shell.panehdr?.[3], 'the shell painted a preview sub-bar the app does not draw').toBe(0);
		if (app.status) near(shell.status, app.status, 'status strip');
		else expect(shell.status?.[3], 'the shell painted a status strip the app does not draw').toBe(0);
		// The shell draws the footer as ONE band (navigator + status stacked); the app renders them
		// as two siblings. Compare the union: same left/width, and top/height spanning both.
		const appFooter: Rect | null = app.rail
			? [app.rail[0], app.rail[1], app.rail[2], app.rail[3] + (app.status?.[3] ?? 0)]
			: null;
		near(shell.paneftr, appFooter, 'preview footer');
		// The switcher exists only where the app draws one (everywhere but the desktop slim
		// header at Read); the TITLE exists everywhere, so it is the assertion that holds at
		// every tier and stop.
		if (app.pill) near(shell.pill, app.pill, 'deck switcher', PILL_TOLERANCE);
		else {
			expect(shell.pill, 'the .ssr-deck-pill element is gone — the selector has drifted').not.toBeNull();
			expect(shell.pill?.[2], 'the shell drew a deck switcher the app does not').toBe(0);
		}
		near(shell.title, app.title, 'deck title', PILL_TOLERANCE);
		// The Nacre box itself. These contexts start with empty storage, so the shell has no
		// persisted rect to replay and takes its COMPUTE path — the one that letterboxes the
		// deck ratio into the pane it just derived. Comparing it is how a wrong pad, a wrong
		// sub-bar height or a wrong split shows up as the thing a visitor actually sees move.
		near(shell.box, app.box, 'slide box');

		if (shell.mobile) {
			// The phone's eight-cell deck-actions bar — the "middle action bar" of the report.
			near(shell.actionbar, app.toolbar, 'action bar');
		} else {
			// Tablet/desktop have no action bar; the shell must not paint one, or it would push a
			// 49px band into a row the app leaves to the editor|preview split. Assert the element
			// is PRESENT and collapsed, not just "not tall" — a `?? 0` on a drifted selector would
			// pass this vacuously, which is how a guard rots into decoration.
			expect(app.toolbar, 'the app grew an action bar above the split').toBeNull();
			expect(shell.actionbar, 'the .ssr-actionbar element is gone — the selector has drifted').not.toBeNull();
			expect(shell.actionbar?.[3], 'the shell painted a phone action bar on a wide viewport').toBe(0);
		}
	});
}

// The rect-REPLAY path, which the matrix above never enters (its contexts start with empty
// storage, so every case there exercises the COMPUTE path instead).
//
// The shell prefers replaying the app's own last measured preview rect over computing one.
// That is only sound while the stored rect describes a layout the app can BOOT into — and two
// pieces of layout state are transient in a way the rect cannot express. Docked panels are the
// sharp one: `activeAssistant` / `activeSettings` are plain `useState(null)`, never persisted,
// so the app ALWAYS boots with the Settings/assistant columns closed. A rect captured with the
// Coach open therefore describes a layout that cannot recur, and the shell replayed it: 601px
// box on a 1440 Build reload, which the app re-drew at 708px the moment it mounted.
//
// This is a TIER-ASYMMETRIC failure — docked panels exist only on tablet and desktop, so a
// phone was structurally immune and no phone test could have found it.
test('a rect measured with a docked panel open is not replayed', async ({ page }) => {
	await page.addInitScript(() => {
		try {
			localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'build' }));
		} catch {
			/* storage blocked — the app falls back to its default stop and the shell to the same */
		}
	});
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto('/studio/', { waitUntil: 'commit' });
	await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible', timeout: 45_000 });
	await page.evaluate(() => document.fonts.ready);

	const card = () =>
		page.evaluate(() => {
			const el = document.querySelector('[aria-label="Live deck preview"]')?.closest('[style*="aspect-ratio"]');
			if (!el) return null;
			const b = el.getBoundingClientRect();
			return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
		});
	const boot = await card();

	// Dock a panel — the preview pane narrows and the slide box shrinks with it.
	await page.getByRole('button', { name: 'Toggle Coach' }).first().click();
	await expect(page.locator('#studio-assistant')).toBeVisible();
	const docked = await card();
	expect(docked?.[2], 'docking the Coach did not narrow the preview — the layout has changed').toBeLessThan(
		(boot as number[])[2] - 20,
	);

	// This is what the app writes on unload. With a panel open it must DROP the stale rect
	// rather than store one describing a layout that cannot boot.
	await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
	expect(
		await page.evaluate(() => localStorage.getItem('lattice-studio-preview-rect-v2')),
		'the app stored a preview rect measured with a docked panel open',
	).toBeNull();

	// And the next load must land on the boot geometry, not the docked one.
	await page.route('**/lattice-playground.js', async (route) => {
		await new Promise((r) => setTimeout(r, ENGINE_HOLD_MS));
		await route.continue();
	});
	await page.reload({ waitUntil: 'commit' });
	await page.locator('#ssr-slidebox').waitFor({ state: 'attached' });
	await page.evaluate(() => document.fonts.ready);
	const shellBox = await page.evaluate(() => {
		const b = (document.querySelector('#ssr-slidebox') as Element).getBoundingClientRect();
		return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
	});
	await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible', timeout: 45_000 });
	await page.evaluate(() => document.fonts.ready);
	near(shellBox, await card(), 'slide box after a docked-panel session');
});

// A saved share restored on a narrower viewport does NOT simply clamp to the 300px minimum.
// Both panes are `collapsible`, so once the requested size falls below the midpoint of 46 and
// 300 the library COLLAPSES the pane instead — and a shell that clamped painted a 300px preview
// with a slide in it where the app handed off to a 46px rail with no preview at all.
//
// This one cannot use the band flow above: the app collapses the preview, so `iframe.live`
// never becomes visible. What it asserts is the pane the shell reserves.
test('a saved share below the collapse midpoint reserves the rail, not the minimum', async ({ page }) => {
	await page.addInitScript((layout) => {
		try {
			localStorage.setItem('lattice-docs-split-studio', layout);
		} catch {
			/* storage blocked — nothing to restore, and the case proves nothing; asserted below */
		}
	}, splitLayout(20));
	await page.setViewportSize({ width: 820, height: 1180 });
	await page.route('**/lattice-playground.js', async (route) => {
		await new Promise((r) => setTimeout(r, ENGINE_HOLD_MS));
		await route.continue();
	});
	await page.goto('/studio/', { waitUntil: 'commit' });
	await page.locator('#studio-ssr-shell .ssr-panehdr').waitFor({ state: 'attached' });
	await page.evaluate(() => document.fonts.ready);
	const shellPaneW = await page.evaluate(() =>
		Math.round((document.querySelector('#studio-ssr-shell .ssr-panehdr') as Element).getBoundingClientRect().width),
	);

	// 20% of (820 - 1) is 163.8px, under the (46+300)/2 = 173 midpoint, so the app collapses.
	await page.locator('[data-pane-role="preview"]').waitFor({ state: 'attached', timeout: 45_000 });
	await expect(page.locator('[data-studio-split][data-split-collapsed="b"]')).toHaveCount(1);
	const appPaneW = await page.evaluate(() =>
		Math.round((document.querySelector('[data-pane-role="preview"]') as Element).getBoundingClientRect().width),
	);
	expect(appPaneW, 'the app did not collapse the preview — the library rule has changed').toBe(46);
	expect(
		Math.abs(shellPaneW - appPaneW),
		`the shell reserved ${shellPaneW}px where the app collapsed to ${appPaneW}px`,
	).toBeLessThanOrEqual(TOLERANCE);
});

// ROTATION INTO CINEMA — the case the matrix above cannot reach.
//
// `pointer: coarse` is a CONTEXT option, not a viewport, and neither Playwright project sets
// `hasTouch`. So the matrix's `rotateTo` case lands at 844x390 with a FINE pointer, which is a
// tablet, not cinema — and the re-seed bug that lived exactly in the portrait→cinema transition
// was invisible to the matrix written to catch re-seed bugs. This is that transition: the four
// bands are SIBLINGS of `.ssr-chrome`, so suppressing the chrome does not suppress them, and a
// publish that set `data-ssr-cinema` without clearing `data-ssr-chrome` left a portrait-width
// sub-bar and footer painted on top of the full-bleed slide.
test.describe('rotation into cinema', () => {
	test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

	test('rotating a phone into landscape leaves no chrome behind', async ({ page }) => {
		await page.route('**/lattice-playground.js', async (route) => {
			await new Promise((r) => setTimeout(r, ENGINE_HOLD_MS));
			await route.continue();
		});
		await page.goto('/studio/', { waitUntil: 'commit' });
		await page.locator('#studio-ssr-shell .ssr-paneftr').waitFor({ state: 'attached' });
		await page.evaluate(() => document.fonts.ready);

		const portrait = await page.evaluate(READ_SHELL);
		expect(portrait.cinema, 'a portrait phone should not be in cinema').toBe(false);
		expect(portrait.panehdr?.[3], 'the portrait shell drew no preview sub-bar to begin with').toBeGreaterThan(0);

		await page.setViewportSize({ width: 844, height: 390 });
		await page.evaluate(() => document.fonts.ready);

		const landscape = await page.evaluate(READ_SHELL);
		expect(landscape.cinema, 'the re-seed did not detect cinema after the rotation').toBe(true);
		// Cinema is defined by what is ABSENT. Each of these is a band the app deletes.
		for (const [name, box] of [
			['topbar', landscape.topbar],
			['action bar', landscape.actionbar],
			['preview sub-bar', landscape.panehdr],
			['preview footer', landscape.paneftr],
		] as const) {
			expect(box, `the .ssr-* element for ${name} is gone — the selector has drifted`).not.toBeNull();
			expect(box?.[3], `the shell left the ${name} painted over the cinema morph`).toBe(0);
		}

		await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible', timeout: 45_000 });
		await expect(page.locator('#studio-ssr-shell')).toHaveCount(0);
		await page.evaluate(() => document.fonts.ready);
		const app = await page.evaluate(READ_APP, landscape.titleText);
		expect(app.header, 'the app grew a header in cinema — the morph has changed').toBeNull();
		near(landscape.box, app.box, 'slide box after rotating into cinema');
	});
});

// The rect-REPLAY path. Every case in the matrix above starts with EMPTY storage, so all of
// them exercise the COMPUTE path — which means the replay path, the one the shell prefers when
// a rect exists, had no coverage at all. Replacing the whole boot-shape guard with `false`
// would have left every other test green.
test('a boot-shaped rect IS replayed, and lands where the app re-measures', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 720 });
	// Registered BEFORE the first load: a reload can serve the engine from the memory cache,
	// firing no request for a later-registered route to intercept — the shell would then be
	// dismissed before it could be measured, and every comparison below would pass on zeros.
	await page.route('**/lattice-playground.js', async (route) => {
		await new Promise((r) => setTimeout(r, ENGINE_HOLD_MS));
		await route.continue();
	});
	await page.goto('/studio/', { waitUntil: 'commit' });
	await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible', timeout: 45_000 });
	await page.evaluate(() => document.fonts.ready);
	// A plain Write session with nothing docked, nothing collapsed, no transient stop — the
	// layout the next load WILL boot into, so the app must store its rect.
	await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
	const stored = await page.evaluate(() => localStorage.getItem('lattice-studio-preview-rect-v2'));
	expect(stored, 'the app dropped a rect from a layout it can boot into').not.toBeNull();

	await page.reload({ waitUntil: 'commit' });
	await page.locator('#ssr-slidebox').waitFor({ state: 'attached' });
	await page.evaluate(() => document.fonts.ready);
	// `data-ssr-rect` is set by BOTH the replay and the compute path, so it does not prove
	// replay ran. The stored rect surviving the seed does.
	expect(
		await page.evaluate(() => localStorage.getItem('lattice-studio-preview-rect-v2')),
		'the seed discarded a valid rect',
	).not.toBeNull();
	const shell = await page.evaluate(READ_SHELL);
	expect(shell.box?.[2], 'the shell was dismissed before it could be measured').toBeGreaterThan(1);
	await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible', timeout: 45_000 });
	await page.evaluate(() => document.fonts.ready);
	const app = await page.evaluate(READ_APP, shell.titleText);
	near(shell.box, app.box, 'replayed slide box');
});

// A rect measured in landscape describes a viewport SHAPE this load does not have; the stored
// fractions resolve to a 300x791 panel where the app draws a 358x201 slide. The aspect gate in
// the seed is what rejects it — the deck's own ratio is the invariant the app's box always
// carries, and a resolved rect that misses it came from a layout this load cannot be in.
test.describe('a rect from another orientation', () => {
	test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });

	test('is not replayed in portrait', async ({ page }) => {
		// Held from the FIRST load: a reload can serve the engine from cache, so a route
		// registered later never fires and the shell is gone before it can be measured.
		await page.route('**/lattice-playground.js', async (route) => {
			await new Promise((r) => setTimeout(r, ENGINE_HOLD_MS));
			await route.continue();
		});
		await page.goto('/studio/', { waitUntil: 'commit' });
		await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible', timeout: 45_000 });
		await page.evaluate(() => document.fonts.ready);
		await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
		expect(
			await page.evaluate(() => localStorage.getItem('lattice-studio-preview-rect-v2')),
			'the cinema session stored no rect, so this case proves nothing',
		).not.toBeNull();

		await page.setViewportSize({ width: 390, height: 844 });
		await page.reload({ waitUntil: 'commit' });
		await page.locator('#ssr-slidebox').waitFor({ state: 'attached' });
		await page.evaluate(() => document.fonts.ready);
		const shell = await page.evaluate(READ_SHELL);
		expect(shell.box?.[2], 'the shell was dismissed before it could be measured').toBeGreaterThan(1);
		await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible', timeout: 45_000 });
		await page.evaluate(() => document.fonts.ready);
		const app = await page.evaluate(READ_APP, shell.titleText);
		near(shell.box, app.box, 'portrait slide box after a landscape session');
	});
});

// The landscape-phone CINEMA morph needs a COARSE pointer to exist at all (the app's
// `useLandscapePhone` media query asks for one), which is a context option, not a viewport —
// hence its own block. It is the case with no chrome whatsoever: no header, no bar, no
// navigator, the slide full-bleed in a holder padded on ONE axis (`px-0 py-3`). The shell
// modelled it as unpadded, which made its slide 43px wider and 24px taller than the app's.
test.describe('cinema', () => {
	test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });

	test('the instant shell frames the app — landscape phone, the cinema morph', async ({ page }) => {
		await page.route('**/lattice-playground.js', async (route) => {
			await new Promise((r) => setTimeout(r, ENGINE_HOLD_MS));
			await route.continue();
		});
		await page.goto('/studio/', { waitUntil: 'commit' });
		await page.locator('#ssr-slidebox').waitFor({ state: 'attached' });
		await page.evaluate(() => document.fonts.ready);

		const shell = await page.evaluate(READ_SHELL);
		expect(shell.cinema, 'the shell did not detect the cinema morph — the media query has drifted').toBe(true);
		expect(shell.box?.[2], 'the shell was already dismissed — the engine hold is not working').toBeGreaterThan(1);
		// Cinema is defined by what is ABSENT: the app draws no header and no action bar there,
		// so a shell that paints either is drawing chrome the app is about to delete.
		expect(shell.topbar, 'the .ssr-topbar element is gone — the selector has drifted').not.toBeNull();
		expect(shell.topbar?.[3], 'the shell painted a topbar over the cinema morph').toBe(0);

		await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible', timeout: 45_000 });
		await expect(page.locator('#studio-ssr-shell')).toHaveCount(0);
		await page.evaluate(() => document.fonts.ready);

		const app = await page.evaluate(READ_APP, shell.titleText);
		expect(app.header, 'the app grew a header in cinema — the morph has changed').toBeNull();
		// No bands to compare here; the SLIDE BOX is the whole surface, so it is the assertion.
		near(shell.box, app.box, 'cinema slide box');
	});
});

// ── A RAISED BROWSER MINIMUM FONT SIZE (#1496) ────────────────────────────────────────────
//
// Runs only in the `minfont` project, which launches Chromium with the low-vision setting a
// reader actually flips (Settings -> Appearance -> Customize fonts) turned up to 24px. Every
// other case in this file runs at the default size, and that was a structural blind spot of
// the same shape the trio's rule on #1444 names for CONTROLS — the shell can express viewport
// width and the seeded stop, and nothing else — applied to BAND HEIGHTS, which are a
// text-metrics question that is neither.
//
// What it is for: the shell's bands used to be frozen numbers, so the app's rows grew with the
// reader's text and the shell's did not — 9/18px on the sub-bar, 20/38px on the footer, 11/20px
// on the status strip. The skeletons now carry the app's own text metrics and the bands are
// floored by the constants rather than pinned to them, so those three track. This asserts that,
// AND pins the two residuals that do NOT track, so neither can grow in silence.
test.describe('@minfont a raised browser minimum font size', () => {
	for (const c of [
		{ w: 1280, h: 720, why: 'laptop' },
		{ w: 390, h: 844, why: 'phone — where the action bar also grows' },
		// SHORT viewports, which the rest of this file does not cover: every other case here is
		// 720px tall or more, and a raised font size is the one input that makes height scarce.
		// Three bands grow ~40px between them while the viewport does not, so the preview box is
		// squeezed by more than any default-size case can produce — and the shell computes that
		// box from constants that did not change. If the two surfaces are going to disagree
		// about the box anywhere, it is here.
		{ w: 390, h: 640, why: 'short phone — bands grow while the viewport cannot' },
		{ w: 1024, h: 600, why: 'short laptop — the same squeeze with a split in play' },
	] as const) {
		test(`the bands track the app's own rows — ${c.w}x${c.h} (${c.why})`, async ({ page }) => {
			await page.addInitScript(() => {
				try {
					const k = 'lattice-studio-settings';
					localStorage.setItem(k, JSON.stringify({ ...JSON.parse(localStorage.getItem(k) || '{}'), posture: 'write' }));
				} catch {
					/* storage blocked — both surfaces fall back to the same defaults */
				}
			});
			await page.setViewportSize({ width: c.w, height: c.h });
			await page.route('**/lattice-playground.js', async (route) => {
				await new Promise((r) => setTimeout(r, ENGINE_HOLD_MS));
				await route.continue();
			});
			await page.goto('/studio/', { waitUntil: 'commit' });
			await page.locator('#studio-ssr-shell .ssr-paneftr').waitFor({ state: 'attached' });
			await page.evaluate(() => document.fonts.ready);
			const shell = await page.evaluate(READ_SHELL);
			expect(shell.topbar?.[3], 'the shell was already dismissed — the engine hold is not working').toBe(54);

			await page.locator('[aria-label="Live deck preview"] iframe.live').waitFor({ state: 'visible', timeout: 45_000 });
			await expect(page.locator('#studio-ssr-shell')).toHaveCount(0);
			await page.evaluate(() => document.fonts.ready);
			const app = await page.evaluate(READ_APP, shell.titleText);

			// The three bands that now size themselves from real text, as the app's rows do.
			// HEIGHT only: `top` is a separate question, and on the phone it is still derived
			// from a constant (pinned below rather than asserted equal).
			expect(Math.abs((shell.panehdr as Rect)[3] - (app.panehdr as Rect)[3]), 'preview sub-bar height').toBeLessThanOrEqual(TOLERANCE);
			expect(Math.abs((shell.status as Rect)[3] - (app.status as Rect)[3]), 'status strip height').toBeLessThanOrEqual(TOLERANCE);
			const appFooterH = (app.rail as Rect)[3] + ((app.status as Rect | null)?.[3] ?? 0);
			expect(Math.abs((shell.paneftr as Rect)[3] - appFooterH), 'preview footer height').toBeLessThanOrEqual(TOLERANCE);

			// The phone's action bar was ALREADY fluid — it renders the app's own cells — so it
			// is held to the same line as everything else, not to a bound.
			if (shell.mobile) near(shell.actionbar, app.toolbar, 'action bar');

			// ── The two KNOWN residuals ──────────────────────────────────────────────────────
			// These are pinned, not passed. Each is a constant the shell still PLACES from, and
			// each has a measured worst case at 24px; the bound is that measurement plus a
			// little slack. If one grows, this fails and someone reads the note in
			// preview-rect.ts rather than discovering it on a device.
			//
			// 1. The phone's sub-bar `top`: everything below the action bar is placed from
			//    `mobileBarH`, which cannot grow. Measured 24px high at 24px minimum font.
			//    A post-paint measure-and-republish fixes the number and loses a race against
			//    the rotation re-seed (see the note in studio.astro), so it stays until that
			//    correction can be folded into the re-seed path.
			const topGap = Math.abs((shell.panehdr as Rect)[1] - (app.panehdr as Rect)[1]);
			expect(topGap, 'phone sub-bar top drifted past its recorded bound').toBeLessThanOrEqual(shell.mobile ? 26 : TOLERANCE);

			// 2. The slide box `top` on a wide viewport: the stage reserves footer space from
			//    `--sh-ftr`, which is the CONSTANT, while the footer band itself now grows.
			//    Measured 11px at 24px minimum font — an order of magnitude below the 39px the
			//    bands used to be out by, and the box's SIZE is unaffected either way.
			const boxTopGap = Math.abs((shell.box as Rect)[1] - (app.box as Rect)[1]);
			expect(boxTopGap, 'slide box top drifted past its recorded bound').toBeLessThanOrEqual(shell.mobile ? TOLERANCE : 13);
			expect(Math.abs((shell.box as Rect)[3] - (app.box as Rect)[3]), 'slide box height').toBeLessThanOrEqual(TOLERANCE);
		});
	}
});
