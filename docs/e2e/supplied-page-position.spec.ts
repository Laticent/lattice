// A paginated deck must print TRUE page numbers while taking the cheap slice path.
//
// WHY THIS EXISTS. The engine's default is to DERIVE a page number by counting the sections of
// whatever document it parses. That is right for a whole deck and wrong for a preview showing one
// slide, which is why previews used to re-parse the entire deck just to recompute a position the
// caller already knew — and why `paginate` was the single biggest reason a deck paid for that
// (115 of 126 committed decks set it; 68 tripped the deck-context gate for that reason ALONE).
//
// The position is now SUPPLIED to the engine (`page: { offset, total }`) and pagination no longer
// forces a whole-deck render. That trade is only sound if the number stays true, so this drives the
// real Present overlay and reads the PAINTED badge — not the attribute alone, and not a unit mock.
// If the supply path breaks, every slide silently reads "1" again: the original bug, reintroduced
// by the optimization meant to be free.
//
// Not `@smoke` (studio-smoke is advisory and the smoke set stays lean) — this runs nightly, ~5s.
import { expect, gotoStudio, slideCount, test } from './studio-fixture';

test('a paginated deck paints its true page number on the slice path', async ({ page }) => {
	await gotoStudio(page);
	const before = await slideCount(page);
	// insertText, not per-key typing: list auto-continuation eats the `---` separators.
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.insertText(
		`\n\n---\n\n<!-- _paginate: true -->\n\n## Alpha.\n\n---\n\n<!-- _paginate: true -->\n\n## Beta.\n\n---\n\n<!-- _paginate: true -->\n\n## Gamma.\n`,
	);
	await expect.poll(() => slideCount(page), { timeout: 20000 }).toBe(before + 3);
	const first = before + 1;
	const total = before + 3;

	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();

	// Present opens on the Studio's ACTIVE slide, so walk back to the start of the run.
	const counter = dialog.getByText(/^\d+ \/ \d+$/).first();
	const at = async () => Number((await counter.innerText()).split('/')[0].trim());
	while ((await at()) > first) {
		await dialog.getByRole('button', { name: 'Previous slide' }).click();
		await expect(counter).toHaveText(new RegExp(`^${await at()} / ${total}$`));
	}

	const seen: Array<{ n: string; tot: string; badge: string }> = [];
	for (let slide = first; slide <= total; slide++) {
		await expect(counter).toHaveText(`${slide} / ${total}`);
		const sec = page.frameLocator('[aria-label="Presented slide"] iframe.live').locator('section').first();
		await expect(sec).toBeVisible();
		seen.push(
			await sec.evaluate((el) => ({
				n: el.getAttribute('data-lattice-pagination') ?? '',
				tot: el.getAttribute('data-lattice-pagination-total') ?? '',
				// TWO painters exist and which one runs depends on the slide's frame: the universal
				// `section::after` (content: attr(data-lattice-pagination)) and the form-frame's
				// `<span class="lat-pagination">`. Read whichever this deck actually uses — asserting
				// only `::after` passes vacuously as "none" on a form-framed slide.
				badge:
					(el.querySelector('.lat-pagination')?.textContent || '').trim() ||
					getComputedStyle(el, '::after').content,
			})),
		);
		if (slide < total) await dialog.getByRole('button', { name: 'Next slide' }).click();
	}

	seen.forEach((s, i) => {
		expect(s.n).toBe(String(first + i));
		expect(s.tot).toBe(String(total));
		expect(s.badge).toContain(String(first + i)); // what the reader actually sees
	});
	// The run starts past slide 1, so a regression to "1 of 1" cannot pass by coincidence.
	expect(first).toBeGreaterThan(1);
});
