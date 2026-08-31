import { CHROME, expect, gotoStudio, test } from './studio-fixture';

// A Library card's action row must FIT INSIDE ITS CARD at every width.
//
// It did not, in the docked panel, and nothing could see it. The grid was
// `grid-cols-1 sm:grid-cols-2` — a VIEWPORT breakpoint — while the docked Library is a
// ~270px column that is nearly always on a ≥640px screen. So it took two columns of
// 125px, and the four-control row overflowed its box by ~110px: Share and Delete were
// rendered, reported themselves visible, and sat behind the card's edge.
//
// This is the same shape of failure as the deck pill in `studio-header-fit.spec.ts`
// (#1417): the element engineered to absorb the pressure is the one that breaks
// silently, because every overflow oracle in the repo reads the HEADER's `scrollWidth`
// and this is a card in a panel. It is also invisible to jsdom, which has no layout —
// so a real browser measuring real boxes is the only oracle there is (HARD RULE #23).
//
// The row is measured against ITS OWN box rather than screenshotted, because a clipped
// control still paints inside a `overflow-hidden` card and a picture of it looks fine.

const KINDS = ['Probe Theme', '.quarter-callout', 'Boardroom Linen'];

async function retype(page: Parameters<typeof gotoStudio>[0], label: string, text: string) {
	await page.getByRole('textbox', { name: label }).click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type(text);
}

/** Save one of each versioned kind through the app's own Save, so all three card shapes exist. */
async function seedOneOfEach(page: Parameters<typeof gotoStudio>[0]) {
	await page.getByRole('button', { name: CHROME.workspaceLauncher }).click();
	await page.getByRole('menuitem', { name: /Fabricate/ }).click();
	await page.getByRole('textbox', { name: 'Theme name' }).fill('probe-theme');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(/Saved .*Probe Theme/)).toBeVisible();

	await page.getByRole('button', { name: 'Component', exact: true }).click();
	await page.getByRole('textbox', { name: 'Component name' }).fill('quarter-callout');
	await retype(page, 'Component skeleton', '<!-- _class: quarter-callout -->\n\n## Revenue is up 24%\n\nGrowth.');
	await retype(page, 'Component CSS', 'section.quarter-callout { display: grid; }\nsection.quarter-callout h2 { color: var(--accent); }');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(/Saved .*quarter-callout/)).toBeVisible();

	await page.getByRole('button', { name: 'Finish', exact: true }).click();
	await page.getByRole('textbox', { name: /finish name/i }).fill('Boardroom Linen');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(/Saved "Boardroom Linen"/)).toBeVisible();

	await page.getByRole('button', { name: /Back to Compose/ }).click();
}

// THE VIEWPORT IS NOT THE WIDTH THAT MATTERS FOR THE DOCKED PANEL, and the first version
// of this spec only checked viewports. The docked Library is a DRAGGABLE column between
// `LIB_MIN = 240` and `PANEL_MAX = 420` (StudioShell.tsx), so its cards are narrowest at a
// width no viewport size can produce — and that is exactly where the four-control row
// broke: 31px of overflow at the 240px minimum, on all three kinds, invisible to a spec
// that only resized the window. A spec whose stated invariant is "at every width" has to
// visit the narrow end of the thing that actually resizes.
async function dragLibraryTo(page: Parameters<typeof gotoStudio>[0], target: 'min' | 'max'): Promise<number> {
	// The Library is the leftmost docked panel, so its seam is the first handle in the
	// spine. `data-slot="resizable-handle"` is what `components/ui/resizable.tsx` stamps.
	const handle = page.locator('[data-slot="resizable-handle"]').first();
	const box = await handle.boundingBox();
	if (!box) throw new Error('no resize handle — the docked Library is not open');
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	// Overshoot deliberately: the panel clamps at its own min/max, so aiming past the
	// stop lands ON the stop without this spec having to know the pixel.
	await page.mouse.move(target === 'min' ? 0 : 3000, box.y + box.height / 2, { steps: 14 });
	await page.mouse.up();
	// Report the width reached, so the test can prove the drag did something. A silent
	// no-op drag would let this spec "pass" at the default width forever.
	return await page.evaluate(() => {
		const el = document.querySelector('[style*="container-type"], .\\[container-type\\:inline-size\\]') as HTMLElement | null;
		return el?.clientWidth ?? -1;
	});
}

test('@smoke every Library card action row fits its card at 1440 / 820 / 390', async ({ page }) => {
	test.slow(); // three widths, three kinds, seeded through the real Save path
	await gotoStudio(page);
	await seedOneOfEach(page);

	for (const width of [1440, 820, 390]) {
		await page.setViewportSize({ width, height: width === 1440 ? 900 : 1000 });
		// Open the Library by whichever route this tier offers — the docked rail at
		// desktop, the ⋯ menu at tablet, the drawer on a phone.
		if (width >= 1100) {
			await page.getByRole('button', { name: CHROME.library }).click();
		} else if (width >= 700) {
			await page.getByRole('button', { name: CHROME.searchOverflow, exact: true }).click();
			await page.getByRole('menuitem', { name: /^Library/ }).click();
		} else {
			await page.getByRole('button', { name: CHROME.moreControls, exact: true }).click();
			await page.getByRole('button', { name: /^Library/ }).click();
		}

		for (const kind of KINDS) {
			// Every card carries a Delete; its parent is the action row.
			const del = page.getByRole('button', { name: `Delete ${kind}` });
			await expect(del, `${kind} should have a card at ${width}px`).toBeVisible();
			const overflow = await del.evaluate((el) => {
				const row = el.parentElement;
				return row ? row.scrollWidth - row.clientWidth : -1;
			});
			expect(overflow, `${kind}'s action row overflows its card by ${overflow}px at ${width}px`).toBeLessThanOrEqual(0);
		}
		await page.keyboard.press('Escape');
	}
});

test('@smoke the docked Library card rows fit at BOTH ends of the panel drag range', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await seedOneOfEach(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: CHROME.library }).click();

	const widths: Record<string, number> = {};
	for (const end of ['min', 'max'] as const) {
		widths[end] = await dragLibraryTo(page, end);
		for (const kind of KINDS) {
			const del = page.getByRole('button', { name: `Delete ${kind}` });
			await expect(del, `${kind} should have a card at the ${end} drag width`).toBeVisible();
			const shape = await del.evaluate((el) => {
				const row = el.parentElement;
				return { overflow: row ? row.scrollWidth - row.clientWidth : -1, client: row?.clientWidth ?? -1 };
			});
			expect(
				shape.overflow,
				`${kind}'s action row overflows its card by ${shape.overflow}px at the ${end} drag width (card ${shape.client}px)`,
			).toBeLessThanOrEqual(0);
		}
	}
	// The two ends must actually differ, or the loop above measured one width twice and
	// the "both ends" in this test's name is a lie. `LIB_MIN = 240`, `PANEL_MAX = 420`.
	expect(widths.max - widths.min, `drag range collapsed: min=${widths.min}px max=${widths.max}px`).toBeGreaterThan(100);
	expect(widths.min, `min drag width ${widths.min}px should be near LIB_MIN (240)`).toBeLessThan(280);
});

// THE ARMED DELETE IS THE STATE THAT MATTERS, and the two tests above cannot see it.
//
// `DeleteBtn` swaps its icon-only button for a wider "Sure?" when armed, which is the
// state you must reach to delete anything — and at the panel's minimum that pushed the
// row 21–23px past the card on all three kinds while every idle measurement read 0.
//
// The assertion is deliberately TWO numbers, because the first fix for this passed the
// row check by destroying the button instead: giving the primary action `min-w-0` let it
// collapse from 70px to 28px with its own "Apply" clipped, and the row-level oracle
// happily reported 0. A width oracle that only asks "does the row fit" cannot tell a fix
// from a squash — so this also asserts the primary action still renders its own label.
test('@smoke an ARMED delete row still fits, without squashing the primary action', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await seedOneOfEach(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: CHROME.library }).click();
	await dragLibraryTo(page, 'min');

	for (const kind of KINDS) {
		await page.getByRole('button', { name: `Delete ${kind}` }).click();
		const shape = await page.getByRole('button', { name: `Confirm delete ${kind}` }).evaluate((el) => {
			const row = el.parentElement as HTMLElement;
			const primary = row.firstElementChild as HTMLElement;
			return {
				row: row.scrollWidth - row.clientWidth,
				primaryClipped: primary.scrollWidth - primary.clientWidth,
				primaryText: (primary.textContent || '').trim(),
			};
		});
		expect(shape.row, `${kind}'s ARMED row overflows its card by ${shape.row}px at the min drag width`).toBeLessThanOrEqual(0);
		expect(
			shape.primaryClipped,
			`${kind}'s primary action ("${shape.primaryText}") is clipped by ${shape.primaryClipped}px — the row fits only because this button was squashed`,
		).toBeLessThanOrEqual(0);
		await page.keyboard.press('Escape');
		// Wait for the SIGNAL, not the timer. `DeleteBtn` disarms on a 3s timeout, an
		// outside pointerdown, or a re-click — and what this loop actually needs is for
		// the next card to start idle, which is observable: the armed "Sure?" is replaced
		// by the icon-only Delete. Polling that is bounded and cannot be outrun by a
		// loaded runner the way a guessed sleep can.
		await expect(page.getByRole('button', { name: `Delete ${kind}` })).toBeVisible({ timeout: 6000 });
	}
});

// ARMING A DELETE MUST NOT MOVE ANY OTHER CONTROL.
//
// The first fix for the armed-row overflow hid Share to free the width, and that was worse
// than the overflow it cured: the confirm then expanded onto the coordinates Share had
// occupied one frame earlier, so a mis-click on Delete followed by a click where Share had
// just been DELETED THE ASSET — measured, one click, record and version history gone.
//
// This asserts the property that makes that impossible: every sibling control keeps its
// box across the idle→armed swap. It is stated as geometry rather than as "Share is still
// rendered", because re-rendering Share somewhere else would satisfy the weaker claim and
// reintroduce the hazard.
test('@smoke arming a delete moves no other control', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await seedOneOfEach(page);
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.getByRole('button', { name: CHROME.library }).click();
	await dragLibraryTo(page, 'min');

	for (const kind of KINDS) {
		const boxesOf = () =>
			page.getByRole('button', { name: `Delete ${kind}` }).or(page.getByRole('button', { name: `Confirm delete ${kind}` }))
				.evaluate((el) => {
					const row = el.parentElement as HTMLElement;
					return [...row.children].map((c) => {
						const r = c.getBoundingClientRect();
						return `${(c as HTMLElement).getAttribute('aria-label') || (c.textContent || '').trim()}@${Math.round(r.x)}x${Math.round(r.width)}`;
					});
				});

		const before = await boxesOf();
		await page.getByRole('button', { name: `Delete ${kind}` }).click();
		const after = await boxesOf();

		// Every control except the delete itself must be byte-identical in position+width.
		expect(after.slice(0, -1), `arming ${kind}'s delete moved a sibling control:\n  before ${before.slice(0, -1)}\n  after  ${after.slice(0, -1)}`).toEqual(before.slice(0, -1));
		// …and the delete button itself must not have grown into where a sibling was.
		const w = (s: string) => Number(s.split('x').pop());
		expect(w(after[after.length - 1]), `${kind}'s confirm grew from ${before.at(-1)} to ${after.at(-1)} — it can only do that over a neighbour`).toBeLessThanOrEqual(w(before[before.length - 1]));

		await expect(page.getByRole('button', { name: `Delete ${kind}` })).toBeVisible({ timeout: 6000 });
	}
});
