// A `split-panel proof` run must show each slide its own deck-order hue in the Studio —
// INCLUDING a deck that does not paginate.
//
// WHY THIS EXISTS. `cat-N` is never authored: the engine assigns it from a slide's ordinal
// among the deck's proof slides (`proofTokensFor`, lib/core/split-panels.js). Any preview
// surface that renders one slide as its own document makes every proof slide look like the
// first one, so they all take `cat-1` — a leveled deck presented as N identical blue panels.
// Reported from a phone against the bloom deck.
//
// #1265 fixed the general cause by rendering the whole deck and displaying one section, but
// its `needsDeckContext` gate only pays for that when the deck trips one of its triggers —
// and `split-panel proof` was not among them. The reported deck also paginates, so it tripped
// `pagination` and came out right BY LUCK, while a proof deck without pagination still
// collapsed. That is the case this spec pins, because it is the one no other test covers:
// the unit tests assert the gate's ANSWER, and this asserts the PAINTED result.
//
// Deliberately NOT `@smoke`: `studio-smoke` is advisory (ci.yml keeps it out of `ci.needs`)
// and the smoke set stays lean, so this runs in the nightly suite. It costs ~5s.
import { expect, gotoStudio, slideCount, test } from './studio-fixture';

const PROOF_SLIDE = (n: number) => `<!-- _class: split-panel proof -->

\`Level ${n}\`

## Claim number ${n}.

*Question ${n}?* Body copy for level ${n}.

- You know you're here when
  - Scenario for level ${n}.
- First checkpoint
  - Detail A.
- Second checkpoint
  - Detail B.`;

test('an un-paginated proof run tints each slide by deck order in Present', async ({ page }) => {
	await gotoStudio(page);
	const before = await slideCount(page);
	// insertText, NOT the fixture's appendToEditor: that types key-by-key and the editor's list
	// auto-continuation then swallows the `---` separators between these bullet-bearing slides,
	// landing the whole block as ONE slide. A single input event is immune.
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.insertText(`\n\n---\n\n${[1, 2, 3].map(PROOF_SLIDE).join('\n\n---\n\n')}\n`);
	// The editor commits to `source` on a flush, so wait for the rail to grow rather than racing it.
	await expect.poll(() => slideCount(page), { timeout: 20000 }).toBe(before + 3);
	const first = before + 1;
	const total = before + 3;

	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();

	// Present opens on the Studio's ACTIVE slide — after an append that is the last one, not
	// slide 1 — so walk back to the start of the run rather than assuming.
	const counter = dialog.getByText(/^\d+ \/ \d+$/).first();
	const at = async () => Number((await counter.innerText()).split('/')[0].trim());
	while ((await at()) > first) {
		await dialog.getByRole('button', { name: 'Previous slide' }).click();
		await expect(counter).toHaveText(new RegExp(`^${await at()} / ${total}$`));
	}

	const seen: Array<{ cat: string; fill: string }> = [];
	for (let slide = first; slide <= total; slide++) {
		await expect(counter).toHaveText(`${slide} / ${total}`);
		const panel = page.frameLocator('[aria-label="Presented slide"] iframe.live').locator('.panel-left').first();
		await expect(panel).toBeVisible();
		seen.push(
			await panel.evaluate((el) => ({
				cat: (el.closest('section')?.className ?? '').match(/cat-\d/)?.[0] ?? '',
				fill: getComputedStyle(el).backgroundColor,
			})),
		);
		if (slide < total) await dialog.getByRole('button', { name: 'Next slide' }).click();
	}

	// CONSECUTIVE, IN ORDER — not merely distinct. "three different hues" would also pass with
	// the run reversed or each slide pinned to its neighbour's slot, and pinning the WRONG slide
	// is precisely the failure mode a deck-context mechanism can introduce. The absolute start
	// depends on how many proof slides the seeded deck already has, so the invariant is "each is
	// the next slot in the 8-cycle".
	const slots = seen.map((s) => Number(s.cat.replace('cat-', '')));
	for (const n of slots) {
		expect(n).toBeGreaterThanOrEqual(1);
		expect(n).toBeLessThanOrEqual(8);
	}
	expect(slots[1]).toBe((slots[0] % 8) + 1);
	expect(slots[2]).toBe((slots[1] % 8) + 1);

	// And they PAINTED differently. The class assertions above would still pass if every slot
	// resolved to one colour, which is the failure a reader actually sees.
	expect(new Set(seen.map((s) => s.fill)).size).toBe(3);
	for (const s of seen) expect(s.fill).toMatch(/^rgb/);
});
