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

/** The app's split-layout store, as `useResizableSplit` writes it (see preview-rect.ts). */
const splitLayout = (previewPct: number) =>
	JSON.stringify({ 'studio-editor,studio-preview': { 'studio-editor': 100 - previewPct, 'studio-preview': previewPct } });

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

// The matrix is a NIGHTLY cost (13 page loads x an engine hold). Two cases carry an `@smoke`
// tag so the per-PR job runs them too: one desktop, one phone. They are the two surfaces the
// bands differ most between, and between them they cover every band the shell draws — which
// makes "someone moved a band" a same-PR failure rather than a next-morning one. The rest of
// the matrix (the persisted states, the boundaries, the morphs) stays nightly, where a browser
// matrix belongs. Promotion of the whole matrix follows the repo's escalation rule — an
// observed nightly green streak first (#800).

const CASES: Case[] = [
	{ w: 1280, h: 720, stop: 'write', smoke: true, why: 'the shipped default — laptop, factory settings' },
	{ w: 390, h: 844, stop: 'write', smoke: true, why: 'phone, the reported surface' },
	// 320 is below the lens picker's `@[21rem]` container query, so the app's preview sub-bar
	// is 41px there and 47px everywhere else. The shell modelled one number for both.
	{ w: 320, h: 844, stop: 'write', why: 'phone too narrow for the lens label — the 41px sub-bar' },
	{ w: 390, h: 844, stop: 'read', why: 'phone at Read — chromeless preview' },
	{ w: 820, h: 1180, stop: 'write', why: 'tablet' },
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
	};
};

const READ_APP = () => {
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
		// The slide CARD (the bordered, letterboxed box) — `[aria-label="Live deck preview"]`
		// is the DeckPreview INSIDE it, 2px narrower for the card's 1px border. The shell's
		// `#ssr-slidebox` is the card's counterpart, so comparing the inner element made every
		// case read as a 2-3px disagreement that was really a measuring error.
		box: r(preview?.closest('[style*="aspect-ratio"]')),
	};
};

for (const c of CASES) {
	const title = `@crosswidth${c.smoke ? ' @smoke' : ''} the instant shell frames the app — ${c.w}x${c.h} @ ${c.stop} (${c.why})`;
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

		const app = await page.evaluate(READ_APP);

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
		near(shell.pill, app.pill, 'deck pill', PILL_TOLERANCE);
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

// The landscape-phone CINEMA morph needs a COARSE pointer to exist at all (the app's
// `useLandscapePhone` media query asks for one), which is a context option, not a viewport —
// hence its own block. It is the case with no chrome whatsoever: no header, no bar, no
// navigator, the slide full-bleed in a holder padded on ONE axis (`px-0 py-3`). The shell
// modelled it as unpadded, which made its slide 43px wider and 24px taller than the app's.
test.describe('cinema', () => {
	test.use({ hasTouch: true, isMobile: true, viewport: { width: 844, height: 390 } });

	test('@crosswidth the instant shell frames the app — landscape phone, the cinema morph', async ({ page }) => {
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

		const app = await page.evaluate(READ_APP);
		expect(app.header, 'the app grew a header in cinema — the morph has changed').toBeNull();
		// No bands to compare here; the SLIDE BOX is the whole surface, so it is the assertion.
		near(shell.box, app.box, 'cinema slide box');
	});
});
