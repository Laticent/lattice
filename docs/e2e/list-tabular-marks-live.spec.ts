import { expect, test } from '@playwright/test';

/**
 * THE REAL PLAYGROUND, NOT A HARNESS.
 *
 * `list-tabular`'s marks cell is decoded on two paths (the markdown-it plugin and
 * the runtime's DOM mirror) and painted by CSS that reaches through a loose list's
 * `<p>` wrapper. Every check of that before this spec ran in jsdom or against a
 * built artifact's bytes — neither of which is the surface a person uses, and one
 * of the defects it shipped (a disc computing 0x19px and drawing nothing) is
 * invisible to both. HARD RULE #23: a verification claim names its surface.
 *
 * So this drives the Playground the docs site actually serves, in a real browser,
 * and measures the disc's painted box inside the preview iframe.
 */
const SOURCE_KEY = 'lattice-docs-pg-source';

const DECK = `---
marp: true
---

<!-- _class: list-tabular -->

## Ledger.

1. Contracts
   - Signed by both parties.
   - [x] \`stable\`
2. Migration

   - Data moved.

   - [ ] \`draft\`
3. Runbook
   - Half written.
   - [-] \`beta\`
4. Sign-off
   - Dropped.
   - [/] \`parked\`
5. Notes
   - No marker here.
   - \`internal\`
`;

test('the marks cell decodes and PAINTS in the live Playground', async ({ page }) => {
	await page.addInitScript(
		([k, s]) => {
			try {
				localStorage.setItem(k as string, s as string);
			} catch {
				/* a blocked store just means the draft does not seed */
			}
		},
		[SOURCE_KEY, DECK],
	);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });

	const preview = page.frameLocator('#preview');
	await expect(preview.locator('.lattice')).toBeVisible({ timeout: 40_000 });

	// ANTI-VACUITY: the transform must actually have run, or every assertion below is
	// trivially true over an empty set.
	await expect(preview.locator('li.marks').first()).toBeAttached({ timeout: 30_000 });
	await expect(preview.locator('li.marks')).toHaveCount(5);

	// Four discs (row 5 is pills-only), each with its own state and accessible name.
	const discs = preview.locator('li.marks .state');
	await expect(discs).toHaveCount(4);
	expect(await discs.evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))).toEqual([
		'done',
		'to do',
		'partial',
		'skipped',
	]);

	// PAINTED, not merely present. A disc inside an unflattened `<p>` measured 0x19px
	// and drew nothing, so `[x]` and `[ ]` were indistinguishable on the slide — and
	// row 2 above is deliberately a LOOSE list, which is the shape that produced it.
	const boxes = await discs.evaluateAll((els) =>
		els.map((e) => {
			const r = e.getBoundingClientRect();
			return { w: Math.round(r.width), h: Math.round(r.height) };
		}),
	);
	for (const b of boxes) {
		expect(b.w, `a disc painted ${b.w}x${b.h}`).toBeGreaterThan(4);
		expect(b.h, `a disc painted ${b.w}x${b.h}`).toBeGreaterThan(4);
	}

	// The typed marker never reaches the slide, and the accessible word never becomes
	// visible text beside the pill.
	const text = await preview.locator('li.marks').evaluateAll((els) => els.map((e) => e.textContent?.trim()));
	expect(text).toEqual(['stable', 'draft', 'beta', 'parked', 'internal']);

	// The trailing column holds the right edge: every marks cell ends on the same x as
	// the row rule above it.
	const aligned = await preview.locator('section.list-tabular ol').evaluate((ol) => {
		const right = (el: Element) => Math.round(el.getBoundingClientRect().right);
		const listRight = right(ol);
		return [...ol.querySelectorAll('li.marks')].map((m) => listRight - right(m));
	});
	for (const gap of aligned) expect(Math.abs(gap), `marks cell is ${gap}px off the right edge`).toBeLessThanOrEqual(2);
});
