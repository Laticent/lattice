import * as fs from 'node:fs';
import * as path from 'node:path';
import { CHROME, expect, gotoStudio, livePreview, openInspector, openSection, persistedSource, setEditorContent, shareExport, test } from './studio-fixture';

// ── The deck settings' Plugins tab, driven from the real Studio ─────────────────────
//
// What loads a plugin is decided per deck (lib/plugins/host-grammar.mjs `admitPlugins`,
// plugin-system §9 decisions 6 and 9): the default set, the deck's `plugins:` import list, or
// a slide class that requires it. The tab shows that answer for the open deck and writes the
// list. The unit tests pin the kernel and the component; this pins the two things only the real
// Studio has: the tab is REACHABLE at every width the Studio ships, and its checkbox writes the
// deck's front matter through the same path every other deck setting does (the persisted
// source), with the preview still drawing what the deck asks for.
//
// EVIDENCE MODE. With PLUGINS_EVIDENCE=<dir> the spec also saves what a reviewer needs to see
// without checking out the branch: the tab at each width, and a PDF export of the deck in light
// and dark. Off by default, so CI writes nothing.

const EVIDENCE = process.env.PLUGINS_EVIDENCE || '';

const DECK = (mode: string) => `---
color-mode: ${mode}
---

<!-- _class: diagram -->

# How a deck loads a plugin

\`\`\`mermaid
graph LR
  D[Default set] --> On[Plugin on]
  L[Import list] --> On
  C[Slide class] --> On
\`\`\`

---

# The area of a circle

The area is $A = \\pi r^2$, and its derivative is the circumference, $2 \\pi r$.
`;

/** Open deck settings at the current width, by whichever control this width has. */
async function openDeckSettings(page: import('@playwright/test').Page, width: number): Promise<void> {
	if (width >= 1200) {
		await openInspector(page);
	} else if (width > 500) {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.tabletMenu }).first().click();
		await page.locator('[role=menuitem],[role=menuitemradio],button,[role=button]').filter({ hasText: CHROME.deckSettingsAt.tabletItem }).first().click();
	} else {
		await page.getByRole('button', { name: CHROME.deckSettingsAt.mobileButton, exact: true }).first().click();
	}
	await openSection(page, CHROME.deckTab.plugins);
}

for (const [label, width, height] of [
	['desktop', 1440, 900],
	['tablet', 820, 1180],
	['mobile', 390, 844],
] as const) {
	test(`the Plugins tab shows why each plugin is on, and writes the deck's list, at ${label} (${width}px)`, async ({ page }) => {
		// The deck goes in at desktop width, where the editor is on screen, and the window then
		// shrinks: the phone layout keeps the editor behind its own tab.
		await gotoStudio(page);
		await setEditorContent(page, DECK('light'));
		await expect.poll(() => persistedSource(page)).toContain('# The area of a circle');
		await page.setViewportSize({ width, height });
		await openDeckSettings(page, width);

		const mermaid = page.locator('[data-plugin-row="mermaid"]');
		await expect(mermaid).toBeVisible({ timeout: 15_000 });
		// Every shipped plugin has a row, on by default; the diagram slide class needs Mermaid.
		for (const name of ['math', 'function-plot', 'mermaid', 'anima']) {
			await expect(page.locator(`[data-plugin-row="${name}"]`)).toContainText('On by default');
		}
		await expect(mermaid).toContainText('Needed by diagram slides');

		const sw = page.getByRole('checkbox', { name: /List Math in this deck/ });
		await expect(sw).toHaveAttribute('aria-checked', 'false');
		await sw.click();
		await expect(sw).toHaveAttribute('aria-checked', 'true');
		await expect.poll(() => persistedSource(page)).toContain('plugins: [math]');
		await expect(page.locator('[data-plugin-row="math"]')).toContainText('Listed in this deck');
		// Listing a default plugin changes nothing: the preview still typesets the math.
		await expect(livePreview(page).locator('.katex').first()).toBeAttached({ timeout: 30_000 });

		if (EVIDENCE) {
			fs.mkdirSync(EVIDENCE, { recursive: true });
			await page.screenshot({ path: path.join(EVIDENCE, `plugins-tab-${width}.png`) });
		}

		// …and unlisting removes the key rather than leaving `plugins: []` behind.
		await sw.click();
		await expect.poll(() => persistedSource(page)).not.toContain('plugins:');
	});
}

test('a Studio export of a deck that lists plugins draws them, light and dark', async ({ page }) => {
	test.skip(!EVIDENCE, 'evidence mode only (PLUGINS_EVIDENCE=<dir>)');
	test.setTimeout(400_000);
	await gotoStudio(page);
	for (const mode of ['light', 'dark']) {
		await setEditorContent(page, DECK(mode).replace('---\ncolor-mode', '---\nplugins: [math, mermaid]\ncolor-mode'));
		await expect.poll(() => persistedSource(page)).toContain('plugins: [math, mermaid]');
		await expect(livePreview(page).locator('.katex').first()).toBeAttached({ timeout: 30_000 });
		await page.getByRole('button', { name: 'Share', exact: true }).click();
		const download = page.waitForEvent('download', { timeout: 180_000 });
		await shareExport(page, 'pdf');
		await (await download).saveAs(path.join(EVIDENCE, `plugins-export-${mode}.pdf`));
		await page.keyboard.press('Escape');
	}
});
