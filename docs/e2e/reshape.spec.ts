import type { Page } from '@playwright/test';
import { expect, gotoStudio, persistedSource, setEditorContent, test } from './studio-fixture';

/**
 * Reshape, on the real Studio (#1281).
 *
 * WHY THIS IS AN E2E AND NOT A UNIT TEST. `applyVariant` was already correct and already
 * unit-tested: a component's declared variants are a pick-ONE family, and the empty token
 * returns the slide to its base form. The bug lived entirely in the WIRING — the picker's
 * preview tiles passed the declared variants, the apply handler did not — so the function
 * under test never saw the argument that makes a look exclusive. Every reshape stacked
 * another token onto `_class` (`kpi ops spotlight trajectory`), "Default" stopped
 * clearing, and the preview tile disagreed with the slide the user actually got.
 *
 * A unit test on the pure function passes in both worlds. The claim a user cares about is
 * "picking a second look REPLACES the first in my deck source", and only the real picker
 * driving the real store can make it (HARD RULE #23: a verification claim names its
 * surface). So: read the persisted deck source after each pick.
 */

// A one-slide kpi deck — kpi declares five looks (attention / ops / compliance /
// trajectory / spotlight), none of which sit in a vocab exclusive axis, so this is the
// path the bug ran down every single time.
const DECK = ['---', 'theme: indaco', 'paginate: true', '---', '', '<!-- _class: kpi -->', '', '## Revenue ahead of plan.', '', '1. $2.4B', '   - Total revenue', '   - target $2.2B · +9%', ''].join('\n');

/** The `_class` tokens of the persisted deck's only slide. */
async function classTokens(page: Page): Promise<string[]> {
	const src = await persistedSource(page);
	const m = src.match(/<!--\s*_class:\s*([^>]*?)\s*-->/);
	return m ? m[1].split(/\s+/).filter(Boolean) : [];
}

async function reshapeTo(page: Page, label: string): Promise<void> {
	await page.getByRole('button', { name: 'Reshape slide' }).click();
	await page.getByRole('button', { name: `Reshape to ${label}` }).click();
}

test('reshaping twice REPLACES the look instead of stacking classes @studio', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => classTokens(page), { timeout: 15_000 }).toEqual(['kpi']);

	// First pick: the look lands.
	await reshapeTo(page, 'ops');
	await expect.poll(() => classTokens(page), { timeout: 15_000 }).toEqual(['kpi', 'ops']);

	// Second pick: `ops` is GONE, not stacked. This is the assertion that was red.
	await reshapeTo(page, 'spotlight');
	await expect.poll(() => classTokens(page), { timeout: 15_000 }).toEqual(['kpi', 'spotlight']);

	// Third: still exactly one look, however many times you browse the gallery.
	await reshapeTo(page, 'trajectory');
	await expect.poll(() => classTokens(page), { timeout: 15_000 }).toEqual(['kpi', 'trajectory']);

	// And Default really returns the slide to the base form.
	await reshapeTo(page, 'Default');
	await expect.poll(() => classTokens(page), { timeout: 15_000 }).toEqual(['kpi']);
});
