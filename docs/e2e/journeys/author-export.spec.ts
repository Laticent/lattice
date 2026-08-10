import { currentSlide, expect, gotoStudio, railButtons, setEditorContent, shareExport, test, toastText } from '../studio-fixture';

// Journey: author → export. Draft a deck, then hand it off through Share. The
// oracle is the ARTIFACT: a real browser download (the exporter's Blob anchor)
// plus the "ready" toast — never a silent no-op. PDF exercises the full image
// pipeline (engine render of every slide → 2× raster → PDF bytes); Markdown
// exercises the source handoff with the theme embedded.

// The download wait needs real room: the config's 60s test timeout also pays
// for beforeEach (goto + authoring + the Share dialog), and the PDF raster is
// the slowest client-side pipeline the suite drives.
test.describe.configure({ timeout: 120_000 });

const DECK = [
	'<!-- _class: title -->\n\n# Atlas expansion plan\n\n`Growth · FY27`\n\nThree markets, one playbook.',
	'<!-- _class: big-number -->\n\n`The headline`\n\n- 3\n  - new markets entered with the same core platform.',
	'<!-- _class: closing -->\n\n## Approve the Atlas budget and we ship Q1.\n\n`The ask`',
].join('\n\n---\n\n');

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(3);
	// The preview follows the caret to the last edited slide — return to slide 1.
	await railButtons(page).nth(0).click();
	await expect(currentSlide(page)).toContainText('Atlas expansion plan');
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
});

test('a drafted deck exports to a PDF artifact', async ({ page }) => {
	// The download is the artifact; the toast is the app's own claim. Require BOTH
	// so a fabricated toast or a stray download can't pass alone.
	const download = page.waitForEvent('download', { timeout: 60_000 });
	await shareExport(page, 'pdf');
	const d = await download;
	expect(d.suggestedFilename()).toMatch(/\.pdf$/);
	await expect(toastText(page)).toContainText('PDF ready.');
	// The default workspace setting is LOSSLESS: page images embed as PNG
	// (Flate), never JPEG (DCT) — the fast format is strictly opt-in below.
	const fs = await import('node:fs');
	const bytes = fs.readFileSync((await d.path()) as string).toString('latin1');
	expect(bytes.includes('/DCTDecode')).toBe(false);
});

test('the Workspace "Fast (JPEG)" preference switches the PDF page images to DCT', async ({ page }) => {
	// Flip the persisted workspace setting exactly the way the General tab
	// writes it, then assert on the ARTIFACT: the exported PDF's page images
	// are JPEG (DCTDecode) instead of PNG (Flate).
	await page.evaluate(() => {
		const KEY = 'lattice-studio-settings';
		const cur = JSON.parse(window.localStorage.getItem(KEY) || '{}');
		window.localStorage.setItem(KEY, JSON.stringify({ ...cur, pdfPages: 'jpeg' }));
	});
	const download = page.waitForEvent('download', { timeout: 60_000 });
	await shareExport(page, 'pdf');
	const d = await download;
	expect(d.suggestedFilename()).toMatch(/\.pdf$/);
	await expect(toastText(page)).toContainText('PDF ready.');
	const fs = await import('node:fs');
	const bytes = fs.readFileSync((await d.path()) as string).toString('latin1');
	expect(bytes.includes('/DCTDecode')).toBe(true);
});

test('a drafted deck exports its Markdown source', async ({ page }) => {
	const download = page.waitForEvent('download');
	await shareExport(page, 'markdown');
	expect((await download).suggestedFilename()).toMatch(/\.md$/);
	await expect(toastText(page)).toContainText('Markdown ready.');
});

// The Marp bundle's pre-export step. The bundle renders through the browser RUNTIME
// inside marp-cli, so before the overflow-marker setting it inherited the runtime's
// AUTHORING treatment and a recipient got a red QA ring and "FIX ME" tags on any
// clipped slide. The level now travels with the artifact, and this is the surface an
// author actually chooses it on — so the oracle is the DOWNLOADED ZIP: unzip the
// deck and read the export-settings block the runtime will read.
async function markerInBundle(zipPath: string): Promise<string | null> {
	const { default: JSZip } = await import('jszip');
	const fs = await import('node:fs');
	const zip = await JSZip.loadAsync(fs.readFileSync(zipPath));
	const deck = Object.keys(zip.files).find((f) => f.endsWith('.md'));
	if (!deck) return null;
	const md = await zip.files[deck].async('string');
	const m = md.match(/<script type="application\/lattice-export-settings">([\s\S]*?)<\/script>/);
	return m ? (JSON.parse(m[1]).overflowMarker ?? null) : null;
}

test('the Marp bundle exports at the workspace default overflow marker', async ({ page }) => {
	const download = page.waitForEvent('download', { timeout: 60_000 });
	await page.getByRole('dialog').getByRole('button', { name: /^Marp bundle/ }).click();
	// The options step, not a straight-to-download row.
	await expect(page.getByRole('heading', { name: 'Export Marp bundle' })).toBeVisible();
	await page.getByRole('button', { name: /^Download bundle/ }).click();
	const d = await download;
	expect(d.suggestedFilename()).toMatch(/\.zip$/);
	await expect(toastText(page)).toContainText('Marp bundle ready.');
	expect(await markerInBundle((await d.path()) as string)).toBe('reader');
});

test('the Marp options step overrides the marker for THIS export only', async ({ page }) => {
	const download = page.waitForEvent('download', { timeout: 60_000 });
	await page.getByRole('dialog').getByRole('button', { name: /^Marp bundle/ }).click();
	await page.getByRole('button', { name: /^For me/ }).click();
	// The panel says so out loud — a per-export pick must not read as a settings change.
	await expect(page.getByText(/This export only/)).toBeVisible();
	await page.getByRole('button', { name: /^Download bundle/ }).click();
	const d = await download;
	expect(await markerInBundle((await d.path()) as string)).toBe('author');
	// …and the workspace default is untouched.
	const stored = await page.evaluate(() => JSON.parse(window.localStorage.getItem('lattice-studio-settings') || '{}').overflowMarker);
	expect(stored === undefined || stored === 'reader').toBe(true);
});

test('the Workspace overflow-marker preference is what the step starts from', async ({ page }) => {
	await page.evaluate(() => {
		const KEY = 'lattice-studio-settings';
		const cur = JSON.parse(window.localStorage.getItem(KEY) || '{}');
		window.localStorage.setItem(KEY, JSON.stringify({ ...cur, overflowMarker: 'off' }));
	});
	const download = page.waitForEvent('download', { timeout: 60_000 });
	await page.getByRole('dialog').getByRole('button', { name: /^Marp bundle/ }).click();
	await expect(page.getByRole('button', { name: /^No marker/ })).toHaveAttribute('aria-pressed', 'true');
	await page.getByRole('button', { name: /^Download bundle/ }).click();
	expect(await markerInBundle((await (await download).path()) as string)).toBe('off');
});
