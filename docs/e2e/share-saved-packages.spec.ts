import fs from 'node:fs';
import { CHROME, expect, gotoStudio, livePreview, setEditorContent, shareExport, test } from './studio-fixture';

// A SAVED THEME AND COMPONENT SURVIVE THE SOURCE HANDOFFS, on the real Studio (HARD
// RULE #23). 2026-09-23-portable-packages.md §1 found three ways they didn't:
//
//   1. The Markdown export passed an EMPTY component list, so a saved component's
//      slides arrived unstyled.
//   2. The Marp bundle looked for a saved theme among the site's shipped themes,
//      found nothing, and shipped the deck in `indaco` without a word.
//   3. A theme saved under a shipped name (`indaco`) re-skinned every deck that
//      says `theme: indaco`.
//
// The unit suites pin each function. This drives the path a person uses: Fabricate
// saves into the real IndexedDB store, the real Share sheet runs the real exporters,
// and the oracle is the downloaded file.

type Page = Parameters<typeof gotoStudio>[0];

async function openFabricate(page: Page) {
	await page.getByRole('button', { name: CHROME.workspaceLauncher }).click();
	await page.getByRole('menuitem', { name: /Fabricate/ }).click();
	await expect(page.getByRole('button', { name: 'Back to Compose' })).toBeVisible();
}

async function retype(page: Page, label: string, text: string) {
	await page.getByRole('textbox', { name: label }).click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.type(text);
}

const COMPONENT = 'probe-box';
const THEME = 'probe-brand';
const DECK = `---
theme: ${THEME}
---

<!-- _class: ${COMPONENT} -->

## Boxed

A saved component in a saved theme.
`;

async function download(page: Page, format: 'markdown' | 'marp' | 'lattice'): Promise<string> {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const [file] = await Promise.all([page.waitForEvent('download'), shareExport(page, format)]);
	const path = await file.path();
	const out = process.env.LATTICE_EVIDENCE_DIR;
	if (out) fs.copyFileSync(path, `${out}/${file.suggestedFilename()}`);
	await page.keyboard.press('Escape');
	return path;
}

/** Fabricate saves a theme and a component into the real store, and the deck uses both. */
async function saveProbes(page: Page) {
	await gotoStudio(page);
	await openFabricate(page);

	await page.getByRole('textbox', { name: 'Theme name' }).fill(THEME);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(/Saved .*theme library/).first()).toBeVisible();

	await page.getByRole('button', { name: 'Component', exact: true }).click();
	await page.getByRole('textbox', { name: 'Component name' }).fill(COMPONENT);
	await retype(page, 'Component skeleton', `<!-- _class: ${COMPONENT} -->\n\n## Boxed\n\nBody.`);
	await retype(page, 'Component CSS', `section.${COMPONENT} { outline: 3px solid var(--accent); }\nsection.${COMPONENT} h2 { color: var(--accent); }`);
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(new RegExp(`Saved .*${COMPONENT}`)).first()).toBeVisible();

	await page.getByRole('button', { name: 'Back to Compose' }).click();
	await setEditorContent(page, DECK);
}

test('a saved theme and component ride in the Markdown and Marp exports', async ({ page }) => {
	test.slow();
	await saveProbes(page);

	const md = fs.readFileSync(await download(page, 'markdown'), 'utf8');
	expect(md, 'the Markdown export embeds the saved component').toContain(`section.${COMPONENT} h2`);
	expect(md, 'the Markdown export embeds the saved theme').toContain(`@theme ${THEME}`);

	const { default: JSZip } = await import('jszip');
	const zip = await JSZip.loadAsync(fs.readFileSync(await download(page, 'marp')));
	const names = Object.keys(zip.files);
	const theme = names.find((n) => n.endsWith(`/themes/${THEME}.css`));
	expect(theme, `the Marp bundle carries themes/${THEME}.css (had: ${names.filter((n) => n.includes('themes/')).join(', ')})`).toBeTruthy();
	expect(names.some((n) => n.endsWith('/themes/indaco.css')), 'no silent indaco fallback').toBe(false);
	const deck = names.find((n) => /\/[^/]+\.md$/.test(n) && !/README|AGENTS/.test(n));
	expect(await zip.file(deck ?? '')?.async('string'), 'the Marp deck embeds the saved component').toContain(`section.${COMPONENT} h2`);
});

// §4: a `.lattice` project carries the saved packages the deck uses, and opening it in a
// Studio that has never seen them adds them to that Library and renders the deck with them.
// The second profile is a fresh browser context: its own IndexedDB, so nothing leaks across.
test('a .lattice project carries its saved theme and component to another Studio', async ({ page, browser }) => {
	test.slow();
	await saveProbes(page);
	// What the deck renders with, read inside the preview: the theme's accent and the outline
	// the component's rule sets. The origin is the reference the other Studio must match.
	const rendered = (pg: Page) =>
		livePreview(pg)
			.locator(`section.${COMPONENT}`)
			.first()
			.evaluate((s) => {
				const probe = document.createElement('i');
				probe.style.color = 'var(--accent)';
				s.append(probe);
				const accent = getComputedStyle(probe).color;
				probe.remove();
				return { accent, outline: getComputedStyle(s).outlineStyle };
			});
	const origin = await rendered(page);
	expect(origin.outline, 'the saved component renders at the origin').toBe('solid');
	const file = await download(page, 'lattice');
	const { default: JSZip } = await import('jszip');
	const zip = await JSZip.loadAsync(fs.readFileSync(file));
	const names = Object.keys(zip.files);
	expect(names, 'the project carries the theme package').toContain(`packages/theme/${THEME}/${THEME}.css`);
	expect(names, 'the project carries the component package').toContain(`packages/component/${COMPONENT}/${COMPONENT}.styles.css`);

	const other = await browser.newContext({ baseURL: new URL(page.url()).origin, acceptDownloads: true });
	try {
		const p2 = await other.newPage();
		await gotoStudio(p2);
		// The arm that lets the accent check fail: before the import, the other Studio's
		// accent (its site palette) is not the saved theme's.
		const before = await livePreview(p2).locator('section').first().evaluate((s) => {
			const probe = document.createElement('i');
			probe.style.color = 'var(--accent)';
			s.append(probe);
			const accent = getComputedStyle(probe).color;
			probe.remove();
			return accent;
		});
		expect(before).not.toBe(origin.accent);
		// By name: Playwright's download path has no extension, and the Studio picks the reader by it.
		await p2.locator('input[type="file"][accept*=".lattice"]').setInputFiles({ name: 'probe.lattice', mimeType: 'application/zip', buffer: fs.readFileSync(file) });
		await expect(p2.getByText(/Added the deck's 1 theme\(s\) \+ 1 component\(s\) to your Library/).first()).toBeVisible({ timeout: 30_000 });
		// The oracle is the render. The component's rule outlines the section (nothing else in the engine sets `outline`); the
		// theme's accent must match the origin's, and it is not the site palette's (the
		// other Studio falls back to that when the deck's theme is unknown).
		await expect(livePreview(p2).locator(`section.${COMPONENT}`).first()).toBeVisible({ timeout: 40_000 });
		await expect.poll(() => rendered(p2)).toEqual(origin);
	} finally {
		await other.close();
	}
});

test('a theme saved under a shipped name is stored as <name>-custom', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await openFabricate(page);
	await page.getByRole('textbox', { name: 'Theme name' }).fill('indaco');
	await page.getByRole('button', { name: 'Save', exact: true }).click();
	await expect(page.getByText(/“indaco” is a shipped theme, so this saved as “indaco-custom”/).first()).toBeVisible();

	// A LATER session typing the same shipped name must meet the duplicate guard, not
	// overwrite the first theme: the guard asks about `indaco-custom`, the name the store uses.
	await page.reload();
	await gotoStudio(page);
	await openFabricate(page);
	await page.getByRole('textbox', { name: 'Theme name' }).fill('indaco');
	await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
});
