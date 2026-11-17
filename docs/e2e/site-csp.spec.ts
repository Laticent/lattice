import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';

// THE STRICT CSP HOLDS ON THE PAGES THAT CARRY IT (#3207, stage 1; docs/scripts/csp.mjs).
//
// csp.mjs hashes every inline script and <style> a frame-free page ships and writes a policy
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

/** Record every CSP violation from the first byte, then return a reader for them. */
async function watchViolations(page: Page) {
	await page.addInitScript(() => {
		const w = window as unknown as { __csp: string[] };
		w.__csp = [];
		document.addEventListener('securitypolicyviolation', (e) => {
			w.__csp.push(`${e.effectiveDirective} blocked ${e.blockedURI || 'inline'} ${e.sample ?? ''}`.trim());
		});
	});
	return () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

// One page of each kind csp.mjs covers: a Starlight docs page, a standalone article, the
// features catalog, a catalog Learn page, a library demo shell and the offline fallback.
const REPRESENTATIVE = ['/getting-started/', '/comparison/', '/features/', '/plugins/math/learn/', '/libraries/cadenza/', '/offline/'];

test('@smoke @crosswidth @webkit-phone @gecko a page of every kind loads under its strict CSP with no violation', async ({ page }) => {
	const violations = await watchViolations(page);
	for (const route of REPRESENTATIVE) {
		await page.goto(route, { waitUntil: 'load' });
		// The policy is really there: a test that passes because the page had none proves nothing.
		await expect(page.locator(CSP_META)).toHaveCount(1);
		await page.waitForLoadState('networkidle');
		expect(await violations(), route).toEqual([]);
	}
});

test('@smoke @crosswidth @webkit-phone @gecko search, the palette picker and the mode toggle work under the CSP', async ({ page }) => {
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

	// Search: a real Pagefind hit, not merely an open dialog.
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

test('every page that carries the CSP loads with no violation', async ({ page }) => {
	const routes = policyRoutes();
	// csp.mjs measured 78 frame-free routes when this landed; far fewer means the build lost them.
	expect(routes.length).toBeGreaterThan(60);
	const violations = await watchViolations(page);
	const found: Record<string, string[]> = {};
	for (const route of routes) {
		await page.goto(route, { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');
		const v = await violations();
		if (v.length) found[route] = v;
		await page.evaluate(() => {
			(window as unknown as { __csp: string[] }).__csp.length = 0;
		});
	}
	expect(found).toEqual({});
});
