import type { Page } from '@playwright/test';
import { expect, test } from './studio-fixture';

// LITE visuals on the real Studio (engineering/decisions/2026-11-12-device-capability-tiers.md §4, slice 3): on a LITE
// device the preview loader is the landing hero's one-gradient pulse, not Nacre's three rotating blended layers, in the
// pre-paint shell AND in the hydrated island; no element keeps a backdrop blur; and the slide frame opts into a still
// Underpainting. FULL is unchanged.
//
// HARD RULE #32: the runner's GPU never decides the tier. The CI browser draws in software and would read as LITE, so
// every test pins its tier with `?tier=`. Every wait is on a signal (an element, an attribute), never a duration.

type LoaderStyle = { display: string; layerDisplay: string | null; backgroundImage: string; animationName: string; layerAnimation: string | null } | null;

/** The computed look of a Nacre loader element and of its first layer. */
function loaderStyle(el: Element | null): LoaderStyle {
	if (!el) return null;
	const cs = getComputedStyle(el);
	const layer = el.querySelector('.nacre-loader__layer');
	const ls = layer ? getComputedStyle(layer) : null;
	return { display: cs.display, layerDisplay: ls?.display ?? null, backgroundImage: cs.backgroundImage, animationName: cs.animationName, layerAnimation: ls?.animationName ?? null };
}

/**
 * Record the pre-paint shell's loader AT DOMContentLoaded, inside the page: the island has not mounted its own loader by
 * then, so this reads what the inline shell CSS paints, whatever the runner's speed.
 */
async function recordShellLoader(page: Page): Promise<void> {
	// The same reading as loaderStyle(), written inline: an init script cannot close over a Node-side function.
	await page.addInitScript(() => {
		document.addEventListener('DOMContentLoaded', () => {
			const el = document.querySelector('#studio-ssr-shell .nacre-loader');
			let out: unknown = null;
			if (el) {
				const cs = getComputedStyle(el);
				const layer = el.querySelector('.nacre-loader__layer');
				const ls = layer ? getComputedStyle(layer) : null;
				out = { display: cs.display, layerDisplay: ls?.display ?? null, backgroundImage: cs.backgroundImage, animationName: cs.animationName, layerAnimation: ls?.animationName ?? null };
			}
			(window as unknown as { __shellLoader?: unknown }).__shellLoader = out;
		});
	});
}
const shellLoader = (page: Page) => page.evaluate(() => (window as unknown as { __shellLoader?: LoaderStyle }).__shellLoader ?? null);

/** The island's loader (DeckPreview), once it has mounted. It keeps its look after the hand-off (`is-done` only fades it). */
async function islandLoader(page: Page): Promise<LoaderStyle> {
	const island = page.locator('.nacre-loader:not(#studio-ssr-shell .nacre-loader)').first();
	await expect(island).toBeAttached({ timeout: 60_000 });
	return island.evaluate(loaderStyle);
}

/** The backdrop filter of a probe element carrying the Tailwind `backdrop-blur` utility the Studio's pills use. */
async function probeBackdrop(page: Page): Promise<string> {
	return page.evaluate(() => {
		const el = document.createElement('div');
		el.className = 'backdrop-blur';
		document.body.append(el);
		const cs = getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string };
		const v = cs.backdropFilter || cs.webkitBackdropFilter || 'none';
		el.remove();
		return v;
	});
}

/** The `data-lattice-live-media` value on the Studio slide frame's <html>, once a frame has been written. */
async function frameLiveMedia(page: Page): Promise<string | null> {
	let value: string | null | undefined;
	await expect
		.poll(
			async () => {
				for (const f of page.frames()) {
					if (f === page.mainFrame()) continue;
					const v = await f.evaluate(() => (document.documentElement.hasAttribute('data-lattice-live-media') ? document.documentElement.getAttribute('data-lattice-live-media') : undefined)).catch(() => undefined);
					if (v !== undefined) {
						value = v;
						return true;
					}
				}
				return false;
			},
			{ timeout: 60_000, message: 'no live slide frame was written' },
		)
		.toBe(true);
	return value ?? null;
}

const reducedMotion = (page: Page) => page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches);

test('@crosswidth @webkit-phone @webkit-tablet @gecko LITE paints the pulse skeleton, drops backdrop blur and holds the Underpainting still', async ({ page }) => {
	await recordShellLoader(page);
	await page.goto('/studio/?tier=lite', { waitUntil: 'domcontentloaded' });
	const still = !(await reducedMotion(page));

	const shell = await shellLoader(page);
	expect(shell, 'the pre-paint shell has no Nacre loader').not.toBeNull();
	expect(shell?.layerDisplay).toBe('none');
	expect(shell?.backgroundImage).toMatch(/^linear-gradient\(/);
	if (still) expect(shell?.animationName).toBe('nacre-lite-pulse');

	const island = await islandLoader(page);
	expect(island?.layerDisplay).toBe('none');
	expect(island?.backgroundImage).toMatch(/^linear-gradient\(/);

	expect(await probeBackdrop(page)).toBe('none');
	expect(await frameLiveMedia(page)).toBe('still');
});

test('@crosswidth @webkit-phone @webkit-tablet @gecko FULL keeps Nacre, the backdrop blur and the moving Underpainting', async ({ page }) => {
	await recordShellLoader(page);
	await page.goto('/studio/?tier=full', { waitUntil: 'domcontentloaded' });
	const moving = !(await reducedMotion(page));

	const shell = await shellLoader(page);
	expect(shell, 'the pre-paint shell has no Nacre loader').not.toBeNull();
	expect(shell?.layerDisplay).not.toBe('none');
	expect(shell?.backgroundImage).toBe('none');
	if (moving) expect(shell?.layerAnimation).toBe('nacre-rot');

	const island = await islandLoader(page);
	expect(island?.layerDisplay).not.toBe('none');
	expect(island?.backgroundImage).toBe('none');

	expect(await probeBackdrop(page)).not.toBe('none');
	expect(await frameLiveMedia(page)).toBe('');
});
