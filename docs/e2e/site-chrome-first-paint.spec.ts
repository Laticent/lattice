import { expect, test } from './studio-fixture';

// ── The shared header's controls must not fill themselves in while you watch (#1592) ──────
//
// The theme <select> rendered EMPTY and filled in with the persisted palette a second or more
// later, and the mode toggle rendered the Monitor ("System") icon at a visitor who had pinned
// dark — a control naming the WRONG stop, which is worse than one naming none. Same disease
// as #1581's Playground toolbar, in chrome that ships on every page of the site.
//
// Measured before the fix at 1440x900 with the CPU throttled 6x: empty/Monitor from t≈145ms,
// correct at t≈1.9s on the component reference, t≈3.8s on the landing, t≈5.1s on the
// Playground — three different page families, one shared component.
//
// The oracle is the card's: sample every animation frame from document start and require the
// control to show ONE value. Absence (the header not parsed yet) is not a value; a wrong
// value is. This is deliberately NOT "does it end up right" — it always did.

test.use({ viewport: { width: 1440, height: 900 } });

type Sample = { t: number; label: string | null; icon: string | null };

/** Record the header's two controls every frame, from document start. A new entry only when
 *  something CHANGES, so the length of the log is the number of states a person could see. */
async function sampleHeader(page: import('@playwright/test').Page) {
	await page.addInitScript(() => {
		const log: { t: number; label: string | null; icon: string | null }[] = [];
		(window as unknown as { __hdr: typeof log }).__hdr = log;
		const t0 = performance.now();
		const tick = () => {
			const value = document.querySelector('.sh-actions [data-slot="select-trigger"][aria-label="Theme"] [data-slot="select-value"]');
			const button = document.querySelector('.sh-actions button[aria-label^="Color mode"]');
			// The icon that is actually PAINTED, not the first one in the DOM: all three are
			// rendered and CSS shows one, so reading `querySelector('svg')` would always answer
			// "Monitor" and the assertion would be vacuous.
			const shown = button
				? [...button.querySelectorAll<HTMLElement>('[data-slot="mode-icon"]')]
						.filter((s) => getComputedStyle(s).display !== 'none')
						.map((s) => s.getAttribute('data-pref'))
						.join(',')
				: null;
			const rec = { t: Math.round(performance.now() - t0), label: value ? value.textContent : null, icon: shown };
			const last = log[log.length - 1];
			if (!last || last.label !== rec.label || last.icon !== rec.icon) log.push(rec);
			if (performance.now() - t0 < 9000) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
}

async function throttle(page: import('@playwright/test').Page) {
	const cdp = await page.context().newCDPSession(page);
	await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
}

/** The states a person could actually see — an element that has not been parsed yet is not
 *  one of them, and neither is the frame before the header exists. */
function shown(log: Sample[]) {
	return log.filter((s) => s.label !== null || s.icon !== null);
}

// The header is one component but three page families reach it three different ways (a
// standalone route with its own head seed, the landing, and the component reference's
// layout), and the defect showed up at a different time on each. So drive all three.
for (const route of ['/', '/playground/', '/components/']) {
	test(`the header's palette and mode controls show one value each on ${route}`, async ({ page }) => {
		await throttle(page);
		// Set the preferences the way the site does, then RELOAD — the reload is the experiment.
		await page.goto(route, { waitUntil: 'domcontentloaded' });
		await page.evaluate(() => {
			localStorage.setItem('lattice-docs-palette', 'burgundy');
			localStorage.setItem('lattice-docs-mode', 'dark');
		});

		await sampleHeader(page);
		await page.goto(route, { waitUntil: 'domcontentloaded' });
		// Well past hydration: the island is `client:idle`, and under 6x throttle it landed as
		// late as 5.1s on the Playground before this was fixed.
		await page.waitForTimeout(7000);

		const log = shown((await page.evaluate(() => (window as unknown as { __hdr: Sample[] }).__hdr)) as Sample[]);
		expect(log.length, 'the sampler never saw the header — the assertions below would be vacuous').toBeGreaterThan(0);
		const labels = [...new Set(log.map((s) => s.label))];
		const icons = [...new Set(log.map((s) => s.icon))];
		expect(labels, `the theme control showed ${labels.length} different values: ${JSON.stringify(log)}`).toEqual(['Burgundy']);
		expect(icons, `the mode toggle showed ${icons.length} different icons: ${JSON.stringify(log)}`).toEqual(['dark']);
	});
}

// The seed is only worth having if the controls still WORK afterwards — a frozen-but-correct
// control would pass everything above.
test('the seeded controls still drive the site chrome after hydration', async ({ page }) => {
	await page.goto('/playground/', { waitUntil: 'domcontentloaded' });
	await page.evaluate(() => {
		localStorage.setItem('lattice-docs-palette', 'burgundy');
		localStorage.setItem('lattice-docs-mode', 'dark');
	});
	await page.goto('/playground/', { waitUntil: 'domcontentloaded' });

	const trigger = page.locator('.sh-actions [data-slot="select-trigger"][aria-label="Theme"]');
	await expect(trigger).toHaveText('Burgundy');
	await trigger.click();
	await page.getByRole('option', { name: 'Laguna', exact: true }).click();
	await expect(trigger).toHaveText('Laguna');
	await expect(page.locator('html')).toHaveAttribute('data-palette', 'laguna');
	expect(await page.evaluate(() => localStorage.getItem('lattice-docs-palette'))).toBe('laguna');

	// The three-stop cycle, from the pinned-dark stop: dark → system → light (the order is
	// derived from the OS; assert the STOP the control reports rather than a fixed sequence).
	const modeButton = page.locator('.sh-actions button[aria-label^="Color mode"]');
	const stop = () =>
		page.evaluate(() => {
			const b = document.querySelector('.sh-actions button[aria-label^="Color mode"]');
			return [...(b?.querySelectorAll<HTMLElement>('[data-slot="mode-icon"]') ?? [])]
				.filter((s) => getComputedStyle(s).display !== 'none')
				.map((s) => s.getAttribute('data-pref'))
				.join(',');
		});
	expect(await stop()).toBe('dark');
	await modeButton.click();
	// Whatever stop it lands on, exactly one icon is lit and it matches the published
	// preference — which is what the NEXT load's seed will read.
	const after = await stop();
	expect(after).not.toBe('dark');
	expect(after.split(',')).toHaveLength(1);
	await expect(page.locator('html')).toHaveAttribute('data-mode-pref', after);
	expect(await page.evaluate(() => localStorage.getItem('lattice-docs-mode'))).toBe(after);
});
