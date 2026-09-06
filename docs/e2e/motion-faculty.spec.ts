import { expect, gotoStudio, test } from './studio-fixture';

// THE MOTION FACULTY, DRIVEN ON THE REAL SURFACE (HARD RULE #23).
//
// A unit test can prove the intake kernel is right about a drawing. It cannot prove the tab exists,
// that the paste box accepts a paste, that the parts appear, that Save is gated, or that any of it
// survives a real Chromium layout — and those are the claims a reviewer cares about. So this drives
// the built Studio: open Fabricate, switch to Motion, paste an SVG, choreograph, and read back what
// the surface actually shows.

const DRAWING = `<svg viewBox="0 0 460 150" fill="none" stroke-width="3" xmlns="http://www.w3.org/2000/svg"><rect id="first-stage" x="14" y="50" width="118" height="52" rx="11" stroke="var(--cat-2-mark)"/><path id="first-arrow" d="M132 76 H176" stroke="var(--text-muted)"/><rect id="second-stage" x="176" y="50" width="118" height="52" rx="11" stroke="var(--accent)"/></svg>`;

async function openMotion(page: import('@playwright/test').Page) {
	await gotoStudio(page);
	await page.getByRole('button', { name: 'Workspace launcher' }).click();
	await page.getByRole('menuitem', { name: 'Fabricate' }).click();
	await expect(page.getByRole('button', { name: 'Back to Compose' })).toBeVisible();
	await page.getByRole('button', { name: 'Motion', exact: true }).first().click();
	await expect(page.getByRole('heading', { name: 'Bring a drawing' })).toBeVisible();
}

test.describe('Fabricate → Motion', () => {
	test('the empty state is a real, reachable paste field — not a div with a handler', async ({ page }) => {
		await openMotion(page);
		const box = page.getByLabel('Paste SVG markup');
		await expect(box).toBeVisible();
		// It must be focusable and typeable: a screen-reader or keyboard user has no other way in.
		await box.focus();
		await expect(box).toBeFocused();
		await expect(page.getByRole('button', { name: /try an example/i })).toBeVisible();
	});

	test('a pasted drawing becomes named parts, a receipt, and a plan that already plays', async ({ page }) => {
		await openMotion(page);
		await page.getByLabel('Paste SVG markup').fill(DRAWING);
		await page.getByRole('button', { name: 'Use this drawing' }).click();

		// The parts list is the primary surface, and the names come from the author's own ids.
		const list = page.getByRole('listbox', { name: 'Parts, grouped by beat' });
		await expect(list).toBeVisible();
		await expect(list.getByRole('option')).toHaveCount(3);
		await expect(list.getByRole('option').first()).toContainText('First Stage');

		// Every part starts on beat 1 already fading in — nobody stares at a dead stage.
		await expect(list.getByText('Fades in').first()).toBeVisible();

		// The receipt reports rather than hides.
		await expect(page.getByRole('button', { name: /Intake/ })).toBeVisible();
		await expect(page.getByText(/3 names made unique/)).toBeVisible();

		// The live stage mounted the real host.
		await expect(page.locator('.motion-stage section.scene[data-scene-spec]')).toBeAttached();
	});

	test('Save is gated on a name, and the gate says why', async ({ page }) => {
		await openMotion(page);
		await page.getByRole('button', { name: /try an example/i }).click();
		await expect(page.getByRole('listbox', { name: 'Parts, grouped by beat' })).toBeVisible();

		const save = page.getByRole('button', { name: 'Save' });
		await expect(save).toBeDisabled();
		await page.getByLabel('Motion name').fill('value-chain');
		await expect(save).toBeEnabled();
	});

	test('a part that cannot be drawn says so in WORDS, not by graying alone (WCAG 1.4.1)', async ({ page }) => {
		await openMotion(page);
		// A fill-only rectangle: highlight paints stroke-width, so Emphasize is inert on it.
		await page.getByLabel('Paste SVG markup').fill('<svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg"><rect id="solid" width="20" height="20" fill="var(--accent)"/><path id="line" d="M0 30 H40" stroke="var(--accent)"/></svg>');
		await page.getByRole('button', { name: 'Use this drawing' }).click();
		await page.getByRole('listbox', { name: 'Parts, grouped by beat' }).getByRole('option').first().click();
		// Both breakpoint halves of the inspector are in the DOM; assert on the one a person can SEE.
		await expect(page.getByText(/no outline to thicken/).filter({ visible: true })).toHaveCount(1);
		// And the control really is refused, not merely captioned — the words explain a real state.
		await expect(page.locator('input[type=checkbox][id^=emph-]:visible')).toBeDisabled();
	});

	test('the frame strip renders REAL stills — the frame model as a picture, and the reduced-motion path', async ({ page }) => {
		await openMotion(page);
		await page.getByRole('button', { name: /try an example/i }).click();
		const strip = page.getByRole('radiogroup', { name: 'Frames' });
		await expect(strip).toBeVisible();
		// The last stop is the still the PDF freezes, and it must say so.
		await expect(strip.getByRole('radio').last()).toHaveAccessibleName(/the still the PDF gets/);
		// And they must carry actual drawings, not empty boxes: a strip of blanks teaches nothing and
		// leaves a reduced-motion author with no way to check their work.
		await expect
			.poll(async () => strip.locator('svg').count(), { timeout: 15_000 })
			.toBeGreaterThan(1);
	});

	test('a drawing with nothing addressable is refused with its OWN reason', async ({ page }) => {
		await openMotion(page);
		await page.getByLabel('Paste SVG markup').fill('this is not an svg at all');
		await page.getByRole('button', { name: 'Use this drawing' }).click();
		const alert = page.getByRole('alert');
		await expect(alert).toContainText(/no <svg> element/i);
	});
});

test.describe('the Motion faculty at every width', () => {
	for (const [label, width, height] of [
		['desktop', 1440, 900],
		['tablet', 820, 1180],
		['mobile', 390, 844],
	] as const) {
		test(`lays out at ${label} (${width}px) with no horizontal overflow`, async ({ page }) => {
			await page.setViewportSize({ width, height });
			await openMotion(page);
			await page.getByRole('button', { name: /try an example/i }).click();
			await expect(page.getByRole('listbox', { name: 'Parts, grouped by beat' })).toBeVisible();

			// The page body must never scroll sideways — the QUALITY BAR's flat rule.
			const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
			expect(overflow, `${label} must not scroll horizontally`).toBeLessThanOrEqual(1);

			// The inspector is ONE component placed by breakpoint. Both halves are in the DOM at all
			// times; exactly one may be VISIBLE, and at no width may both be hidden — the 1024-1099
			// band had that defect until the two breakpoints were made the same number.
			await page.getByRole('listbox', { name: 'Parts, grouped by beat' }).getByRole('option').first().click();
			const visible = await page.getByText('Arrives by').filter({ visible: true }).count();
			expect(visible, 'exactly one inspector must be visible').toBe(1);

			// Wait for the frame strip to actually paint before capturing — a screenshot taken inside the
			// 300ms serialize debounce shows placeholders and would hide a real defect behind a shrug.
			await expect.poll(async () => page.getByRole('radiogroup', { name: 'Frames' }).locator('svg').count(), { timeout: 15_000 }).toBeGreaterThan(0);
			await page.screenshot({ path: `test-results/motion-${label}.png`, fullPage: false });
		});
	}
});
