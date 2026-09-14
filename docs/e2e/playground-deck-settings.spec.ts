import { expect, test } from './studio-fixture';

// The Playground's Deck settings sheet — the panel `createConfigPanel` draws and the
// sheet that hosts it. Three arms, one per defect this file was written for.
//
// 1. NOTHING IS PUSHED OUT OF THE PANEL. The rows were a flex pair whose two halves
//    both refused to give: `.db-pref-text { min-width: 7rem }` against
//    `.db-pref-select { flex: 0 0 auto; max-width: 11rem }`. That is an
//    incompressible 18.6rem, and the panel's content box is capped in px/vw — so the
//    control went outside the panel and the sheet grew a horizontal scrollbar.
//    Measured before the fix: 5 clipped rows at 320px, and 4 at 390px once the root
//    font went to 18px. BOTH HALVES OF THAT MATRIX MATTER and the second is the one
//    that made this a bug for everyone: the failing sum is in `rem` while the panel
//    is not, so scaling text breaks a width that was comfortable at the default.
//    `--blink-settings=minimumFontSize` (the existing `minfont` project) would NOT
//    have caught it — that knob raises computed sizes and leaves `rem` alone, so the
//    row's minimum never moves. The axis here is the ROOT font size, which is what
//    a browser's "font size" picker and iOS text scaling actually change.
//
// 2. OPENING THE SHEET ARMS NO CONTROL. Radix focuses the first focusable descendant
//    on open; here that was the first row's <select>. iOS Safari opens a select's
//    picker on the tap that GIVES it focus, so one arriving pre-focused swallowed the
//    first tap — the row did nothing until you touched another control and came back.
//
// 3. THE DECK'S OWN THEME IS SETTABLE HERE. The profile was `noTheme`, on the
//    reasoning that the top-bar palette picker owned theme on this surface — which
//    holds only while that picker is rendered, and it is hidden below `lg`. The row
//    has to exist, and it has to offer the Automatic stop that CLEARS `theme:`;
//    without it every option wrote a pin and there was no way back to following the
//    site palette.

test.beforeEach(async ({ context }) => {
	await context.route(/mermaid.*\.js($|\?)/, (route) =>
		route.fulfill({ contentType: 'text/javascript', body: 'window.mermaid={initialize(){},run(){},render(){return{svg:""}}};' }),
	);
	await context.route(/katex.*\.css($|\?)/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
	await context.route(/fonts\.googleapis|fonts\.gstatic/, (route) => route.fulfill({ contentType: 'text/css', body: '' }));
});

/** Every row control that sticks out past the panel's own content box, by row label. */
async function clippedRows(page: import('@playwright/test').Page): Promise<string[]> {
	return page.evaluate(() => {
		const host = document.querySelector('.deck-config');
		if (!host) return ['(no panel)'];
		const box = host.getBoundingClientRect();
		const pad = parseFloat(getComputedStyle(host).paddingRight) || 0;
		const out: string[] = [];
		for (const row of host.querySelectorAll('.db-pref-row, .db-or-switch')) {
			const control = row.querySelector('select, .db-switch, input');
			if (!control) continue;
			// A half-pixel of slack: sub-pixel layout rounding is not a clipped control.
			if (control.getBoundingClientRect().right > box.right - pad + 0.5) {
				out.push((row.querySelector('.db-pref-label') as HTMLElement | null)?.textContent ?? '(unlabeled)');
			}
		}
		return out;
	});
}

/** Open the sheet, after the island is live. `#pg-setup-trigger` ships in the SSR
 *  markup with no handler on it, so clicking before hydration is a silent no-op that
 *  reads as "the panel never rendered". `body[data-view]` is written by the island
 *  itself, so it is the signal that a click will land. */
async function openDeckSettings(page: import('@playwright/test').Page): Promise<void> {
	await expect(page.locator('body')).toHaveAttribute('data-view', /read|edit/);
	await page.locator('#pg-setup-trigger').click();
	await expect(page.locator('.deck-config .db-pref-row').first()).toBeVisible();
}

test('@mobile no Deck settings control is pushed outside the panel, at any width or text size', async ({ page }) => {
	// The exact matrix that failed. 320/16 and 390/18 each produced clipped rows before
	// the row was allowed to shrink and to stack; 414/16 passed then and must still.
	for (const { width, root } of [
		{ width: 320, root: 16 },
		{ width: 360, root: 18 },
		{ width: 390, root: 16 },
		{ width: 390, root: 18 },
		{ width: 390, root: 20 },
		{ width: 414, root: 16 },
	]) {
		await page.setViewportSize({ width, height: 844 });
		await page.goto('/playground/', { waitUntil: 'domcontentloaded' });
		await page.evaluate((px) => { document.documentElement.style.fontSize = `${px}px`; }, root);
		await openDeckSettings(page);

		expect(await clippedRows(page), `clipped at ${width}px / ${root}px root`).toEqual([]);

		// …and the panel does not scroll sideways, which is how a reader met this bug.
		const overflow = await page.evaluate(() => {
			const sheet = document.querySelector('[data-slot="sheet-content"]') as HTMLElement;
			return sheet.scrollWidth - sheet.clientWidth;
		});
		expect(overflow, `horizontal overflow at ${width}px / ${root}px root`).toBeLessThanOrEqual(1);
	}
});

test('@crosswidth opening Deck settings focuses the panel, never a control inside it', async ({ page }) => {
	await page.goto('/playground/', { waitUntil: 'domcontentloaded' });
	await openDeckSettings(page);
	// The assertion is about the TAG, not about which row happens to be first: any
	// form control here is one an errant first tap or keypress could change.
	const active = await page.evaluate(() => document.activeElement?.tagName ?? '(none)');
	expect(['SELECT', 'INPUT', 'TEXTAREA', 'BUTTON']).not.toContain(active);
	// Focus still lands INSIDE the sheet, so a keyboard reader tabs into the panel
	// rather than back through the page behind it.
	const inSheet = await page.evaluate(() => !!document.activeElement?.closest('[data-slot="sheet-content"]'));
	expect(inSheet, 'focus parked on the sheet itself').toBe(true);
});

test('@crosswidth the Theme row pins the deck’s own palette, and Automatic clears it', async ({ page }) => {
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	// The editor hydrates LAZILY (2026-07-19 defer-editor-hydration), so `.cm-content`
	// is absent for a while after the page is interactive — and this test reads the deck
	// source out of it. Waiting for the editor is what makes the assertion about the
	// panel's write rather than about the editor's arrival time.
	await expect(page.locator('.cm-content')).toBeVisible();
	await openDeckSettings(page);

	const theme = page.locator('.deck-config .db-pref-select[aria-label="Theme"]');
	await expect(theme, 'the Playground must carry a deck-theme row').toBeVisible();
	// Automatic is the first stop and names where an un-pinned deck actually lands.
	await expect(theme.locator('option').first()).toHaveText(/^Automatic — follow the site/);
	// The curated color-vision palettes are grouped exactly as the site header lists
	// them — same derivation, not a second private one.
	await expect(theme.locator('optgroup')).toHaveAttribute('label', /Accessibility/);

	// Read the source back a LINE AT A TIME. CodeMirror renders each line as its own
	// `.cm-line` element, so `.cm-content.textContent` concatenates them with no
	// separator — "---marp: truetheme: crepuscolo---" — and any newline-anchored match
	// silently returns nothing, which reads as "the panel never wrote" rather than as a
	// broken oracle. `innerText` would restore the breaks but depends on the pane being
	// rendered, which is not what this test should be asserting about.
	const deckSource = () => page.evaluate(() => [...document.querySelectorAll('.cm-content .cm-line')].map((l) => l.textContent).join('\n'));
	const frontMatter = async () => /^---\n([\s\S]*?)\n---/.exec(await deckSource())?.[1] ?? '';

	await theme.selectOption('crepuscolo');
	await expect.poll(frontMatter).toContain('theme: crepuscolo');

	// Back to Automatic drops the key — the deck follows the site palette again.
	await theme.selectOption('');
	await expect.poll(frontMatter).not.toContain('theme:');
});
