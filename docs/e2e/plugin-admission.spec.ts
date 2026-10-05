import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect, gotoStudio, livePreview, persistedSource, setEditorContent, shareExport, test } from './studio-fixture';

// ── A deck that does not load a plugin draws none of it in the real Studio ─────────────
//
// spec/LPM.md §3.2.1: the engine marks the code fence of a plugin the deck did not load
// (`<pre data-lattice-off="mermaid">`), and the runtime's pass skips it. The unit tests pin the
// marker and the selectors over jsdom; this pins what only the real Studio has — its preview frame
// runs the real runtime with the real Mermaid library, and its PDF export captures that frame. The
// Studio ships on the default set (every plugin), so the spec narrows it through the playground
// bundle's host door, `LatticePlayground.setPluginDefaults`, and restores it after.
//
// EVIDENCE MODE. With ADMISSION_EVIDENCE=<dir> the spec also saves the preview and a PDF export
// with and without the plugin admitted. Off by default, so CI writes nothing.

const EVIDENCE = process.env.ADMISSION_EVIDENCE || '';

const DECK = (title: string) => `---
color-mode: light
---

# ${title}

\`\`\`mermaid
flowchart LR
  A[Deck] --> B{Loaded?}
  B -- yes --> C[Drawn]
  B -- no --> D[Source]
\`\`\`
`;

async function setDefaults(page: import('@playwright/test').Page, names: string[] | null): Promise<void> {
	await page.waitForFunction(() => typeof (window as unknown as { LatticePlayground?: { setPluginDefaults?: unknown } }).LatticePlayground?.setPluginDefaults === 'function');
	await page.evaluate((n) => (window as unknown as { LatticePlayground: { setPluginDefaults: (x: string[] | null) => void } }).LatticePlayground.setPluginDefaults(n), names);
}

for (const [label, defaults] of [
	['admitted (default set)', null],
	['not admitted (defaults: [])', []],
] as const) {
	test(`the Studio preview and export with Mermaid ${label}`, async ({ page }) => {
		test.setTimeout(EVIDENCE ? 300_000 : 120_000);
		await gotoStudio(page);
		await setDefaults(page, defaults === null ? null : [...defaults]);
		// A title per case, so the render cache never hands one case the other's markup.
		const title = defaults === null ? 'Mermaid admitted' : 'Mermaid not admitted';
		await setEditorContent(page, DECK(title));
		await expect.poll(() => persistedSource(page)).toContain(`# ${title}`);
		const frame = livePreview(page);
		await expect(frame.locator('h1', { hasText: title }).first()).toBeAttached({ timeout: 30_000 });
		if (defaults === null) {
			await expect(frame.locator('[data-lattice-figure] svg').first()).toBeAttached({ timeout: 30_000 });
			await expect(frame.locator('pre[data-lattice-off]')).toHaveCount(0);
		} else {
			const pre = frame.locator('pre[data-lattice-off="mermaid"]').first();
			await expect(pre).toBeVisible({ timeout: 30_000 });
			// The runtime has booted in this frame and its pass has had a frame to act (it tags every
			// fence it adopts synchronously at boot and on each mutation) — then prove it did not.
			await expect.poll(() => frame.locator('body').evaluate(() => !!(window as unknown as { __llLatticeRuntimeLoaded?: boolean }).__llLatticeRuntimeLoaded), { timeout: 30_000 }).toBe(true);
			await frame.locator('body').evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
			await expect(pre).not.toHaveAttribute('data-lattice-settle', /.*/);
			await expect(frame.locator('[data-lattice-figure]')).toHaveCount(0);
			await expect(pre.locator('code')).toContainText('flowchart LR');
		}
		if (EVIDENCE) {
			fs.mkdirSync(EVIDENCE, { recursive: true });
			const slug = defaults === null ? 'admitted' : 'not-admitted';
			await page.screenshot({ path: path.join(EVIDENCE, `studio-preview-${slug}.png`) });
			await page.getByRole('button', { name: 'Share', exact: true }).click();
			const download = page.waitForEvent('download', { timeout: 180_000 });
			await shareExport(page, 'pdf');
			await (await download).saveAs(path.join(EVIDENCE, `studio-export-${slug}.pdf`));
			await page.keyboard.press('Escape');
		}
		await setDefaults(page, null);
	});
}
