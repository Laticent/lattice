import * as fs from 'node:fs';
import * as path from 'node:path';
import JSZip from 'jszip';
import { expect, gotoStudio, livePreview, persistedSource, setEditorContent, shareExport, slideCount, test } from './studio-fixture';

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

// ADMISSION IS DECK-WIDE, on the route that renders ONE slide (HARD RULE #25 inversion lens). Slide 1's
// `diagram` class loads Mermaid for the whole deck, so slide 2's plain fence must draw — but the live
// preview renders slide 2 ALONE (the slice route: a slide-local class needs no deck context), and a
// slice admitted on itself would mark the fence and show source. The spec records every render the
// page asks the engine for, so it proves the slice route ran and was handed the deck's admission,
// not merely that a figure appeared.
const TWO_SLIDES = `---
color-mode: light
---

<!-- _class: diagram -->

# One

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

---

# Two, a plain slide

\`\`\`mermaid
flowchart LR
  C[Deck-wide] --> D[Drawn]
\`\`\`
`;

test('a slide rendered alone takes the whole deck\'s admission (defaults: [])', async ({ page }) => {
	test.setTimeout(EVIDENCE ? 300_000 : 120_000);
	await gotoStudio(page);
	await setDefaults(page, []);
	await page.evaluate(() => {
		type PG = { render: (s: string, t: string, o?: { pluginDefaults?: string[] }) => unknown };
		const w = window as unknown as { LatticePlayground: PG; __admissionCalls: Array<{ alone: boolean; defaults: string[] | null }> };
		w.__admissionCalls = [];
		const real = w.LatticePlayground.render.bind(w.LatticePlayground);
		w.LatticePlayground.render = (s, t, o) => {
			w.__admissionCalls.push({ alone: s.includes('# Two') && !s.includes('# One'), defaults: o?.pluginDefaults ?? null });
			return real(s, t, o);
		};
	});
	await setEditorContent(page, TWO_SLIDES);
	await expect.poll(() => persistedSource(page)).toContain('# Two, a plain slide');
	const frame = livePreview(page);
	// The caret ends on slide 2, so the preview shows it — the slide the slice route renders alone.
	await expect(frame.locator('h1', { hasText: 'Two, a plain slide' }).first()).toBeAttached({ timeout: 30_000 });
	// Slide 2 alone: the fence is drawn, never marked.
	await expect(frame.locator('[data-lattice-figure] svg').first()).toBeAttached({ timeout: 30_000 });
	await expect(frame.locator('pre[data-lattice-off]')).toHaveCount(0);
	// …and it got there by the slice route, handed the deck's admission (Mermaid, by the class).
	const calls = await page.evaluate(() => (window as unknown as { __admissionCalls: Array<{ alone: boolean; defaults: string[] | null }> }).__admissionCalls);
	const slices = calls.filter((c) => c.alone);
	expect(slices.length, 'the preview never rendered slide 2 alone — the slice route did not run').toBeGreaterThan(0);
	for (const c of slices) expect(c.defaults).toContain('mermaid');
	if (EVIDENCE) {
		fs.mkdirSync(EVIDENCE, { recursive: true });
		await page.screenshot({ path: path.join(EVIDENCE, 'studio-preview-slice-deck-wide.png') });
	}
	await setDefaults(page, null);
});

// THE STUDIO'S OWN READERS follow the deck (followups.d/2509-p3, spec/LPM.md §3.2.1). The rail and the
// editor↔preview mapping read the boundary parser, not the engine; with math not loaded, a `---`
// inside `$$` is a slide break in the engine, so it must be one in the rail too — and a deck that
// lists math keeps the block whole. The Export-to-Marp bundle carries what the deck left off.
const MATH_DECK = (listed: boolean) => `---
color-mode: light${listed ? '\nplugins: [math]' : ''}
---

# Rail ${listed ? 'listed' : 'unlisted'}

$$
x

---

y
$$

---

# Last
`;

test('under defaults: [] the rail splits a `$$` block as the engine does; the Marp bundle records it', async ({ page }) => {
	test.setTimeout(EVIDENCE ? 300_000 : 180_000);
	await gotoStudio(page);
	await setDefaults(page, []);
	await setEditorContent(page, MATH_DECK(false));
	await expect.poll(() => persistedSource(page)).toContain('# Rail unlisted');
	// The engine, under the same host, renders three slides; the rail agrees.
	const engineSlides = await page.evaluate((src) => {
		const w = window as unknown as { LatticePlayground: { render: (s: string, t?: string, o?: { pluginDefaults?: string[] }) => { html: string }; pluginAdmission: (d: string) => string[] } };
		const pg = w.LatticePlayground;
		return (pg.render(src, 'indaco', { pluginDefaults: pg.pluginAdmission(src) }).html.match(/<section[\s>]/g) || []).length;
	}, MATH_DECK(false));
	expect(engineSlides).toBe(3);
	await expect.poll(() => slideCount(page), { timeout: 30_000 }).toBe(3);
	// The host changes its defaults with NO edit (the playground bundle loads late, so a real host
	// narrows after the deck is up): the rail follows anyway.
	await setDefaults(page, null);
	await expect.poll(() => slideCount(page), { timeout: 30_000 }).toBe(2);
	await setDefaults(page, []);
	await expect.poll(() => slideCount(page), { timeout: 30_000 }).toBe(3);

	// The Marp bundle's settings block names every plugin the deck did not load.
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const download = page.waitForEvent('download', { timeout: 180_000 });
	await shareExport(page, 'marp');
	const zipPath = await (await download).path();
	const zip = await JSZip.loadAsync(fs.readFileSync(zipPath as string));
	const md = await Object.values(zip.files).find((f) => /\.md$/.test(f.name) && !/README|AGENTS/i.test(f.name))!.async('string');
	expect(md).toContain('"pluginsOff":["anima","chart-family","function-plot","math","mermaid"]');
	await page.keyboard.press('Escape');

	// Listed, math loads: the `$$` block is whole again in the rail.
	await setEditorContent(page, MATH_DECK(true));
	await expect.poll(() => persistedSource(page)).toContain('# Rail listed');
	await expect.poll(() => slideCount(page), { timeout: 30_000 }).toBe(2);
	if (EVIDENCE) {
		fs.mkdirSync(EVIDENCE, { recursive: true });
		fs.writeFileSync(path.join(EVIDENCE, 'studio-marp-bundle.md'), md);
		await page.screenshot({ path: path.join(EVIDENCE, 'studio-rail-math-listed.png') });
	}
	await setDefaults(page, null);
});
