import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

// THE STRICT CSP HOLDS ON THE PAGES THAT CARRY IT (#3207, stage 1; docs/scripts/csp.mjs).
//
// csp.mjs hashes every inline script a policy page ships and writes a policy
// that admits nothing else. What no build step can see is code that builds a script or a
// style AT RUN TIME, or loads something from another origin. The browser reports each of
// those as a `securitypolicyviolation` event, and this spec fails on any. It also drives the
// two features a policy most easily breaks while they still look fine: the search (Pagefind
// loads a module and WebAssembly, and CommandMenu swallows a load failure into "no doc
// results") and the palette/mode controls (their label rules were a runtime <style> until
// this change).
//
// The page list is read from the built dist/ — every page csp.mjs actually gave a policy —
// so a page that gains or loses one is covered without editing this file.

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const CSP_META = 'meta[http-equiv="Content-Security-Policy"]';

function policyRoutes(): string[] {
	const out: string[] = [];
	(function walk(dir: string) {
		for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
			const p = path.join(dir, e.name);
			if (e.isDirectory()) {
				if (e.name !== '_astro' && !p.includes(`${path.sep}playground${path.sep}v`)) walk(p);
			} else if (e.name === 'index.html' && fs.readFileSync(p, 'utf8').includes('http-equiv="Content-Security-Policy"')) {
				const rel = path.relative(DIST, path.dirname(p)).split(path.sep).join('/');
				out.push(rel ? `/${rel}/` : '/');
			}
		}
	})(DIST);
	return out.sort();
}

/**
 * Record every CSP violation from the first byte, in EVERY frame, then return a reader for them.
 *
 * In every frame because a preview is a frame: a srcdoc preview inherits the page's policy, and a
 * script it refuses is reported to the FRAME's document, never the page's. A reader that listened on
 * the page alone passed while the Playground's preview sat blank under stage 1's trial. The report
 * goes out through a binding, which reaches a sandboxed frame too (the draw host, the code sandbox).
 * `clear()` forgets what was seen so far, for a test that walks many pages.
 *
 * AND FROM THE CONSOLE, because the event is not always fired. Measured 2026-11-17 with an inline
 * script put back into the single-slide preview: WebKit fired `securitypolicyviolation` in the frame;
 * Chromium and Gecko refused the script, printed the refusal, and fired nothing, so an event-only
 * reader stayed green over a blank preview. Gecko's "Ignoring …" notices are about a source the
 * frame's own policy names and makes moot, not a refusal, so they do not count.
 */
const CSP_REFUSAL = /^Refused to |Content-Security-Policy:.*\bblocked\b/;
function watchConsoleRefusals(page: Page, seen: string[]) {
	page.on('console', (m) => {
		const text = m.text();
		if (CSP_REFUSAL.test(text)) seen.push(`console: ${text.slice(0, 240)}`);
	});
}
async function watchViolations(page: Page) {
	const seen: string[] = [];
	watchConsoleRefusals(page, seen);
	await page.exposeBinding('__reportCsp', (src, what: string) => {
		const where = src.frame === page.mainFrame() ? '' : ` (in frame ${src.frame.url().slice(0, 60)})`;
		seen.push(`${what}${where}`);
	});
	await page.addInitScript(() => {
		document.addEventListener('securitypolicyviolation', (e) => {
			(window as unknown as { __reportCsp: (w: string) => void }).__reportCsp(`${e.effectiveDirective} blocked ${e.blockedURI || 'inline'} ${e.sample ?? ''}`.trim());
		});
	});
	return Object.assign(() => Promise.resolve([...seen]), { clear: () => void seen.splice(0) });
}

// One page of each kind csp.mjs covers: a Starlight docs page, a standalone article, the
// features catalog, a catalog Learn page, a library demo shell and the offline fallback — and,
// since stage 2, the pages that build a slide preview: a component page, the function-plot plugin
// page (its figure draws in the draw host's sandboxed frame, which needs `'unsafe-eval'` the page
// itself never grants) and the Playground.
// (Not Cadenza or Suono: their voice code imports a runtime from esm.run, whose own requests no
// scan of ours can list, so csp.mjs leaves them without a policy. Not the landing page: held back
// by name until its route-budget ceiling is decided, csp.mjs HELD_ROUTES.)
const REPRESENTATIVE = ['/getting-started/', '/comparison/', '/features/', '/plugins/math/learn/', '/libraries/lente/', '/offline/', '/components/chart/bar/', '/plugins/function-plot/', '/playground/'];

test('@smoke @crosswidth @webkit-phone @webkit-tablet @gecko a page of every kind loads under its strict CSP with no violation', async ({ page }) => {
	const violations = await watchViolations(page);
	for (const route of REPRESENTATIVE) {
		await page.goto(route, { waitUntil: 'load' });
		// The policy is really there: a test that passes because the page had none proves nothing.
		await expect(page.locator(CSP_META)).toHaveCount(1);
		await page.waitForLoadState('networkidle');
		expect(await violations(), route).toEqual([]);
	}
});

test('@smoke @crosswidth @webkit-phone @webkit-tablet @gecko search, the palette picker and the mode toggle work under the CSP', async ({ page }) => {
	const violations = await watchViolations(page);
	await page.goto('/getting-started/');
	await expect(page.locator(CSP_META)).toHaveCount(1);

	// The palette label is painted by the static rules SiteHeader ships, keyed on <html
	// data-palette>: the current palette's label computes to `inline`, every other to `none`.
	// Read as computed style rather than visibility, because on a phone the control itself sits
	// in the closed menu sheet; the rule applies (or not) at every width.
	const labels = await page.evaluate(() => {
		const current = document.documentElement.getAttribute('data-palette');
		const spans = [...document.querySelectorAll<HTMLElement>('.site-header [data-palette-label]')];
		return {
			current: spans.filter((s) => s.dataset.paletteLabel === current).map((s) => getComputedStyle(s).display),
			others: [...new Set(spans.filter((s) => s.dataset.paletteLabel !== current).map((s) => getComputedStyle(s).display))],
		};
	});
	expect(labels.current.length).toBeGreaterThan(0);
	expect(new Set(labels.current)).toEqual(new Set(['inline']));
	expect(labels.others).toEqual(['none']);

	// Search: a real Pagefind hit, not merely an open dialog. The signal it can open: the island
	// that holds the search button has hydrated (Astro removes `ssr` on mount). A click before
	// that lands on the server-rendered button, opens nothing, and failed 1 run in 10.
	await expect(page.locator('.site-header astro-island:has(button[aria-label^="Search"])').first()).not.toHaveAttribute('ssr');
	await page.locator('.site-header').getByRole('button', { name: /^Search/ }).filter({ visible: true }).first().click();
	await page.getByPlaceholder(/Search docs, jump to a page/).fill('front matter');
	await expect(page.getByRole('option', { name: /front.matter reference/i }).first()).toBeVisible();
	await page.keyboard.press('Escape');
	// The signal the header is reachable again: Radix hides everything outside an open dialog
	// from the accessibility tree until the dialog has finished closing.
	await expect(page.getByRole('dialog')).toHaveCount(0);

	// The mode control moves to its next stop (system → dark → light → system).
	const pref = () => page.evaluate(() => document.documentElement.getAttribute('data-mode-pref'));
	const before = await pref();
	const modeButton = page.locator('.site-header').getByRole('button', { name: /^Color mode:/ }).filter({ visible: true });
	if ((await modeButton.count()) === 0) {
		// A phone keeps the mode control in the menu sheet.
		await page.locator('.site-header').getByRole('button', { name: 'Menu' }).click();
	}
	await page.getByRole('button', { name: /^Color mode:/ }).filter({ visible: true }).first().click();
	await expect.poll(pref).not.toBe(before);

	expect(await violations()).toEqual([]);
});

// LOADING IS NOT USING. The first version of this spec only loaded pages, and review found two
// features a policy broke without a sound: Calco's PPTX export (HarfBuzz builds code from strings
// through an alias no text search sees; the export hung at "Embedding fonts…") and the voice
// demos' cloud calls. csp.mjs now exempts both kinds, and these two tests are the run-time guard
// for what static analysis cannot see.

// Calco is exempt (it evaluates code). This pins the feature itself, so a later change that
// gives the page a policy, or breaks the export another way, fails here.
test('@smoke Calco’s PowerPoint export embeds its fonts', async ({ page }) => {
	await page.goto('/libraries/calco/');
	await expect(page.locator(CSP_META)).toHaveCount(0);
	await page.locator('#pptxBtn').click();
	// The signal is Calco's own status line, written when the file is done ("… · N fonts
	// embedded · K KB"). Rasterizing and subsetting takes a few seconds on a CI runner.
	await expect(page.locator('#status')).toContainText(/fonts embedded/, { timeout: 60_000 });
	const fonts = Number((await page.locator('#status').textContent())?.match(/(\d+) fonts embedded/)?.[1] ?? 0);
	expect(fonts).toBeGreaterThan(0);
});

// Every control on every library demo that carries a policy, pressed once. A demo is a page of
// buttons that run real library code (a wasm module, a worker, a generated file), so this is
// where a feature the policy blocks shows up. Downloads are accepted and discarded.
//
// HOW IT WAITS (HARD RULE #32: a signal, never a duration). A violation can fire seconds after
// the click that caused it (Calco's subsetter evaluates code only after it rasterizes). So:
//   - violations are reported OUT of the page, through a binding, as they happen. Nothing is
//     read-then-cleared, and a navigation cannot erase one;
//   - after each click the test waits until the page has settled: no request in flight AND the
//     main thread idle (requestIdleCallback, which fires only when no task is queued; two
//     animation frames on WebKit, which lacks it), checked until two rounds in a row agree, so
//     work a click spawned in stages is waited out. A violation event queued before that has
//     been delivered by then.
// Two signals this replaced: `waitForLoadState('networkidle')`, which returns at once on a page
// that was already idle (found by review), and "the control is usable again", which never
// comes for a control that disables itself for good (Squadra's "Fix all", once nothing is left).
test('@crosswidth @webkit-phone @webkit-tablet @gecko every control on the library demos with a policy runs with no violation', async ({ page }) => {
	test.setTimeout(300_000);
	const demos = policyRoutes().filter((r) => /^\/libraries\/[^/]+\/$/.test(r));
	expect(demos.length).toBeGreaterThan(5);

	const seen: { page: string; what: string }[] = [];
	await page.exposeBinding('__reportCsp', (_src, pageUrl: string, what: string) => {
		seen.push({ page: new URL(pageUrl).pathname, what });
	});
	// The console too: Chromium and Gecko refuse some scripts without firing the event (watchViolations).
	page.on('console', (m) => {
		if (CSP_REFUSAL.test(m.text())) seen.push({ page: new URL(page.url()).pathname, what: `console: ${m.text().slice(0, 240)}` });
	});
	await page.addInitScript(() => {
		document.addEventListener('securitypolicyviolation', (e) => {
			(window as unknown as { __reportCsp: (u: string, w: string) => void }).__reportCsp(
				location.href,
				`${e.effectiveDirective} blocked ${e.blockedURI || 'inline'} ${e.sample ?? ''}`.trim(),
			);
		});
	});
	let inFlight = 0;
	page.on('request', () => inFlight++);
	page.on('requestfinished', () => inFlight--);
	page.on('requestfailed', () => inFlight--);
	const idle = () =>
		page.evaluate(
			() =>
				new Promise<void>((done) => {
					const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => void };
					if (w.requestIdleCallback) w.requestIdleCallback(() => done(), { timeout: 10_000 });
					else requestAnimationFrame(() => requestAnimationFrame(() => done()));
				}),
		);
	/** No request in flight and the main thread idle, twice in a row. */
	const settle = async () => {
		let quiet = 0;
		while (quiet < 2) {
			await expect.poll(() => inFlight, { timeout: 60_000 }).toBe(0);
			await idle();
			quiet = inFlight === 0 ? quiet + 1 : 0;
		}
	};

	const pressedOn: Record<string, number> = {};
	for (const route of demos) {
		await page.goto(route, { waitUntil: 'load' });
		await settle();
		// One fixed list per page, taken before anything is pressed: re-querying by index while
		// clicks show and hide controls would skip some and press others twice.
		const controls = await page.locator('main button, .wrap button').elementHandles();
		pressedOn[route] = 0;
		for (const control of controls) {
			if (!(await control.isVisible()) || !(await control.isEnabled())) continue;
			if (!(await control.click({ timeout: 2_000 }).then(() => true, () => false))) continue;
			pressedOn[route]++;
			if (new URL(page.url()).pathname !== route) break; // it navigated: the rest of the list is gone
			await settle();
		}
	}
	expect(seen).toEqual([]);
	// Work done, not a vacuous pass: every demo had something pressed.
	for (const route of demos) expect(pressedOn[route], route).toBeGreaterThan(0);
	test.info().annotations.push({ type: 'pressed', description: JSON.stringify(pressedOn) });
});

test('every page that carries the CSP loads with no violation', async ({ page }) => {
	// About 200 pages, each loaded and waited to network quiet, most of them building a preview
	// frame: the default 60 s is a budget for one page's worth of test.
	test.setTimeout(900_000);
	const routes = policyRoutes();
	// csp.mjs gave 198 routes a policy in stage 2 (75 in stage 1); far fewer means the build lost
	// them. csp.mjs's own MIN_POLICY_PAGES floor fails the build first.
	expect(routes.length).toBeGreaterThan(190);
	const violations = await watchViolations(page);
	const found: Record<string, string[]> = {};
	for (const route of routes) {
		await page.goto(route, { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');
		const v = await violations();
		if (v.length) found[route] = v;
		violations.clear();
	}
	expect(found).toEqual({});
});

// A PREVIEW UNDER THE POLICY, used and not only loaded (stage 2). Each frame inherits the page's
// policy, so a refused agent shows as a slide that never appears: these cells wait for the thing a
// reader sees, then for no violation in any frame.
test('@smoke @crosswidth @webkit-phone @webkit-tablet @gecko a component page’s slide preview renders under the CSP', async ({ page }) => {
	const violations = await watchViolations(page);
	await page.goto('/components/chart/bar/');
	await expect(page.locator(CSP_META)).toHaveCount(1);
	// The fit agent reveals `.lattice` once it has scaled the slide and the faces are in.
	const frame = page.frameLocator('iframe').first();
	await expect(frame.locator('.lattice')).toHaveCSS('visibility', 'visible');
	await expect(frame.locator('.lattice > section').first()).toBeVisible();
	expect(await violations()).toEqual([]);
});

test('@smoke @crosswidth @webkit-phone @webkit-tablet @gecko the function-plot figure draws in its sandbox under the CSP', async ({ page }) => {
	const violations = await watchViolations(page);
	await page.goto('/plugins/function-plot/');
	await expect(page.locator(CSP_META)).toHaveCount(1);
	// The draw host loads the sandbox shell, which writes the frame's own strict document into itself
	// (lib/packages/sandbox-shell.mjs). The figure draws when the slide is on screen.
	const preview = page.locator('iframe:not([data-lattice-draw-frame])').first();
	await preview.scrollIntoViewIfNeeded();
	const slide = page.frameLocator('iframe:not([data-lattice-draw-frame])').first();
	await expect(slide.locator('svg.function-plot').first()).toBeVisible({ timeout: 30_000 });
	await expect(slide.locator('.functionplot-error')).toHaveCount(0);
	await expect(page.locator('iframe[data-lattice-draw-frame="function-plot"]')).toHaveAttribute('src', /lattice-sandbox\.html$/);
	expect(await violations()).toEqual([]);
});

test('@smoke @crosswidth @webkit-phone @webkit-tablet @gecko the Playground preview renders under the CSP', async ({ page }) => {
	const violations = await watchViolations(page);
	await page.goto('/playground/');
	await expect(page.locator(CSP_META)).toHaveCount(1);
	const frame = page.frameLocator('iframe[title]').first();
	await expect(frame.locator('.lattice')).toHaveCSS('visibility', 'visible', { timeout: 30_000 });
	await expect(frame.locator('.lattice > section').first()).toBeAttached();
	expect(await violations()).toEqual([]);
});


// WITH THE SERVICE WORKER IN CONTROL, which is how a visitor meets every page after their first. The
// config blocks service workers, so every cell above ran without one, and that hid a Gecko defect: a
// srcdoc preview inherits the page's policy, and Firefox matched its `'self'` wrongly for anything the
// worker answered, so on the second page a visitor opened it refused the frame's own runtime, agents
// file and theme fonts, and the preview fell back to the default serif (measured 2026-11-19; Chromium
// and WebKit were clean). csp.mjs names the site's own origins beside `'self'`, which Gecko matches.
test.describe('under the service worker', () => {
	test.use({ serviceWorkers: 'allow' });
	test('@smoke @crosswidth @webkit-phone @webkit-tablet @gecko the preview pages load with no violation once the service worker controls them', async ({ page }) => {
		const violations = await watchViolations(page);
		await page.goto('/getting-started/');
		// A page is controlled only from the navigation after the worker activates, so wait for it, then walk.
		await page.waitForFunction(() => navigator.serviceWorker.ready.then(() => true));
		for (const route of ['/components/chart/bar/', '/plugins/function-plot/', '/playground/']) {
			violations.clear();
			await page.goto(route, { waitUntil: 'load' });
			expect(await page.evaluate(() => !!navigator.serviceWorker.controller), `${route} is controlled`).toBe(true);
			await expect(page.locator(CSP_META)).toHaveCount(1);
			const frame = page.frameLocator(route === '/playground/' ? 'iframe[title]' : 'iframe:not([data-lattice-draw-frame])').first();
			await expect(frame.locator('.lattice')).toHaveCSS('visibility', 'visible', { timeout: 30_000 });
			// Wait on the font gate's own signal, not on network idle: the worker keeps the network busy
			// (it revalidates in the background), and `networkidle` timed out under --workers=4. A refused
			// face is reported when it is fetched, which is before the gate settles.
			await expect
				.poll(() => Promise.all(page.frames().map((f) => f.evaluate(() => (window as unknown as { __latticeFontsSettled?: boolean }).__latticeFontsSettled === true).catch(() => false))).then((r) => r.some(Boolean)), { timeout: 30_000 })
				.toBe(true);
			expect(await violations(), route).toEqual([]);
		}
	});
});
