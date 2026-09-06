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
	await expect(page.getByRole('heading', { name: 'Start a drawing' })).toBeVisible();
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

	test('Describe is offered and degrades honestly with no model connected', async ({ page }) => {
		await openMotion(page);
		// The faculty's second on-ramp — the same command bar its three siblings ship.
		const bar = page.getByLabel('Describe a drawing');
		await expect(bar).toBeVisible();
		// No model is connected in a fresh profile, so the field is disabled and the way IN is offered
		// rather than a dead button: this is the "no dead controls" rule doing its job, not an absence.
		await expect(bar).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Connect a model' })).toBeVisible();
		await expect(page.getByText(/Connect a model to describe a drawing/)).toBeVisible();
		// And Bring is still right there — Describe is a second door, not a gate in front of the first.
		await expect(page.getByLabel('Paste SVG markup')).toBeEnabled();
		await page.screenshot({ path: 'test-results/motion-empty.png' });
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
		// And Draw is refused on it too, in words — drawing traces an OUTLINE, so a filled shape given
		// Draw would sit fully painted from frame 0 while the running order said it arrives at a beat.
		await expect(page.getByText(/filled, not outlined/).filter({ visible: true })).toHaveCount(1);
		await expect(page.getByRole('button', { name: 'Draws itself' }).filter({ visible: true })).toBeDisabled();
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

	test('Replace RECONCILES against the plan you already have — it never silently resets it', async ({ page }) => {
		await openMotion(page);
		await page.getByLabel('Paste SVG markup').fill(DRAWING);
		await page.getByRole('button', { name: 'Use this drawing' }).click();
		const list = page.getByRole('listbox', { name: 'Parts, grouped by beat' });
		await expect(list.getByRole('option')).toHaveCount(3);

		await page.getByRole('button', { name: 'Replace the drawing' }).click();
		// The paste pane says what it is about to do, and offers a way back.
		await expect(page.getByRole('heading', { name: 'Replace the drawing' })).toBeVisible();
		await expect(page.getByRole('button', { name: /Cancel — keep the drawing I have/ })).toBeVisible();

		// The same drawing with one path edited: the plan must be MATCHED, not discarded.
		await page.getByLabel('Paste SVG markup').fill(DRAWING.replace('H176', 'H180'));
		await page.getByRole('button', { name: 'Use this drawing' }).click();
		await expect(list.getByRole('option')).toHaveCount(3);
		// And it reports the outcome rather than saying nothing.
		await expect(page.getByText(/parts? matched/)).toBeVisible();
	});

	test('a band opens — an automatic group is never a wall you cannot get past', async ({ page }) => {
		await openMotion(page);
		// 30 flat shapes exceed the 24-row cap, so intake bands them.
		const many = Array.from({ length: 30 }, (_, i) => `<path id="s${i}" d="M${i} ${i} H${i + 4}" stroke="var(--accent)"/>`).join('');
		await page.getByLabel('Paste SVG markup').fill(`<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">${many}</svg>`);
		await page.getByRole('button', { name: 'Use this drawing' }).click();

		const list = page.getByRole('listbox', { name: 'Parts, grouped by beat' });
		const banded = await list.getByRole('option').count();
		expect(banded, '30 shapes must band rather than list').toBeLessThan(30);

		await list.getByRole('option').first().click();
		await page.getByRole('button', { name: 'Choreograph these separately' }).first().click();
		// The band is replaced by its members, so the list GREW and a single shape is now addressable.
		await expect.poll(async () => list.getByRole('option').count()).toBeGreaterThan(banded);
	});

	test('a drawing with nothing addressable is refused with its OWN reason', async ({ page }) => {
		await openMotion(page);
		await page.getByLabel('Paste SVG markup').fill('this is not an svg at all');
		await page.getByRole('button', { name: 'Use this drawing' }).click();
		const alert = page.getByRole('alert');
		await expect(alert).toContainText(/no <svg> element/i);
	});
});

test.describe('the whole round trip, on the real surface', () => {
	test('save, then reopen from the Library — the running order survives, and the shelf is not empty', async ({ page }) => {
		await openMotion(page);
		await page.getByRole('button', { name: /try an example/i }).click();
		const list = page.getByRole('listbox', { name: 'Parts, grouped by beat' });
		await expect(list.getByRole('option')).toHaveCount(5);

		// Give it a running order worth losing: move one part to its own beat.
		await list.getByRole('option').nth(1).click();
		await page.getByRole('spinbutton', { name: /^Beat for / }).filter({ visible: true }).fill('2');
		await page.getByLabel('Motion name').fill('value-chain');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page.getByText(/Saved “value-chain”/)).toBeVisible();

		// The Library must actually SHOW it. A shelf holding only motions used to render its empty
		// state, which gates the whole card grid — the door existed, behind a wall.
		await page.getByRole('button', { name: 'Back to Compose' }).click();
		await page.getByRole('button', { name: 'Open Library' }).click();
		await expect(page.getByText('value-chain').first()).toBeVisible();

		// Reopening must not destroy the plan. Feeding stored art back through intake used to
		// prefix every id a second time, so every saved pathRef matched nothing.
		await page.getByRole('button', { name: 'Edit value-chain' }).click();
		await expect(list.getByRole('option')).toHaveCount(5);
		await expect(page.getByText(/No longer in the drawing/)).toHaveCount(0);
		await expect(page.getByText(/did not validate/)).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Save' })).toBeEnabled();
		// And the beat we set came back with it.
		await expect(page.getByText('Beat 2')).toBeVisible();
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

			// MEASURE THE EMPTY PANE FIRST. Clicking straight through to the example unmounts it, so
			// the on-ramps — the Describe command bar, the paste box, the file picker — were never
			// overflow-checked at any width, which is exactly where a command bar with an input and
			// two buttons is most likely to burst at 390px.
			const empty = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
			expect(empty, `${label} empty pane must not scroll horizontally`).toBeLessThanOrEqual(1);
			const bar = page.getByLabel('Describe a drawing');
			await expect(bar).toBeVisible();
			const box = await bar.boundingBox();
			expect(box, 'the Describe input must have a box').not.toBeNull();
			expect((box?.x ?? 0) + (box?.width ?? 0), `${label} Describe bar must fit the viewport`).toBeLessThanOrEqual(width);

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

// DARK MODE, AND THE ONE THING THAT SILENTLY BREAKS IN IT.
//
// The Studio document does NOT load the engine stylesheet — decks render in their iframe — so every
// `--cat-N-mark` resolves to the EMPTY STRING here. A drawing painted with the categorical ramp,
// which includes this faculty's own worked example, had two of its five shapes render INVISIBLE
// until `palette-fallback.ts` derived a ramp from the tokens the Studio does carry.
//
// Nothing above catches a regression in that: an invisible stroke still lays out, still counts as a
// part, still passes an overflow check and still screenshots as a box that happens to be empty. So
// this reads the COMPUTED stroke of every shape on the live stage, in both modes.
test.describe('the live stage paints every shape, in both modes', () => {
	for (const mode of ['light', 'dark'] as const) {
		test(`no shape is invisible in ${mode} mode`, async ({ page }) => {
			test.slow();
			// The app's own persisted preference, read on boot — the state a returning user lands in.
			// The chrome's toggle is not exposed at every width, and this is the same code path.
			await page.addInitScript((m) => {
				try {
					localStorage.setItem('lattice-docs-mode', m);
					localStorage.setItem('starlight-theme', m);
				} catch {
					/* storage unavailable — the assertion below fails loudly either way */
				}
			}, mode);
			await openMotion(page);
			await page.getByRole('button', { name: /try an example/i }).click();
			await expect(page.getByRole('listbox', { name: 'Parts, grouped by beat' })).toBeVisible();
			await expect(page.locator('.motion-stage [id]').first()).toBeAttached();

			const strokes = await page.evaluate(() => {
				const stage = document.querySelector('.motion-stage');
				if (!stage) return null;
				const seen = new Map<string, string>();
				for (const el of Array.from(stage.querySelectorAll('[id]'))) {
					// First wins: the poster and the live layer carry the same ids.
					if (!seen.has(el.id)) seen.set(el.id, getComputedStyle(el).stroke);
				}
				return Object.fromEntries(seen);
			});
			expect(strokes, 'the stage must be mounted').not.toBeNull();

			const entries = Object.entries(strokes ?? {});
			expect(entries.length, 'the example has five shapes').toBe(5);
			for (const [id, stroke] of entries) {
				// `none` is what an UNRESOLVED var() collapses to, and it is indistinguishable from a
				// deliberately unstroked shape by eye — which is exactly how this shipped once.
				expect(stroke, `${id} must paint a stroke in ${mode} mode`).not.toBe('none');
				expect(stroke, `${id} must paint a stroke in ${mode} mode`).not.toBe('');
				expect(stroke, `${id} must not be fully transparent in ${mode} mode`).not.toMatch(/,\s*0\s*\)$/);
			}

			// And the ramp must not collapse: a categorical drawing whose shapes all paint IDENTICALLY
			// has lost the distinction it was drawn to make. The derived fallback varies by lightness
			// rather than hue — approximate, as the panel says — but it must still vary.
			expect(new Set(entries.map(([, v]) => v)).size, `${mode}: the categorical ramp must not collapse to one value`).toBeGreaterThanOrEqual(3);
		});
	}
});
