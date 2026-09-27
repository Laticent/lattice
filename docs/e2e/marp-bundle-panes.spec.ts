import { expect, gotoStudio, railButtons, setEditorContent, test, toastText } from './studio-fixture';

// The Studio's own Export → Marp bundle on a panes deck. Marpit reads every HTML
// comment it does not know as a presenter note, so before `stripPaneMarkers` the
// bundle's deck carried `panes:` / `pane:` lines into the recipient's speaker notes.
// The CLI export is proven against real marp-cli; this is the SAME strip reached
// through the browser producer (`deck-export.js`), and the oracle is the DOWNLOADED
// ZIP: the deck inside it keeps both panes' content and carries no pane marker.
test.describe.configure({ timeout: 120_000 });

const DECK = [
	'<!-- _class: title -->\n\n# Pipeline review\n\n`Q3`',
	[
		'`Pipeline review · Q3`',
		'## EMEA carried the quarter while APAC held flat.',
		'<!-- panes: 35/65 -->',
		'<!-- pane: list -->',
		'- EMEA closed three late deals\n- APAC renewals slipped',
		'<!-- pane: table -->',
		'| Region | Q2 | Q3 |\n|---|---|---|\n| EMEA | 4.1 | 5.3 |\n| APAC | 2.8 | 2.8 |',
		'<!-- A real presenter note stays. -->',
	].join('\n\n'),
].join('\n\n---\n\n');

test('the Marp bundle drops a panes deck\'s markers and keeps its notes and content', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(2);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	const download = page.waitForEvent('download', { timeout: 60_000 });
	await page.getByRole('dialog').getByRole('button', { name: /^Marp bundle/ }).click();
	await page.getByRole('button', { name: /^Download bundle/ }).click();
	const d = await download;
	expect(d.suggestedFilename()).toMatch(/\.zip$/);
	await expect(toastText(page)).toContainText('Marp bundle ready.');

	const { default: JSZip } = await import('jszip');
	const fs = await import('node:fs');
	const zip = await JSZip.loadAsync(fs.readFileSync((await d.path()) as string));
	const name = Object.keys(zip.files).find((f) => f.endsWith('.md') && !/readme|agent/i.test(f));
	expect(name).toBeTruthy();
	const md = await zip.files[name as string].async('string');
	expect(md).not.toMatch(/<!--\s*panes?\s*:/);
	expect(md).toContain('<!-- markdownlint-capture -->');
	expect(md).toContain('EMEA closed three late deals');
	expect(md).toContain('| EMEA | 4.1 | 5.3 |');
	expect(md).toContain('<!-- A real presenter note stays. -->');
	await test.info().attach('studio-marp-bundle.zip', { path: (await d.path()) as string, contentType: 'application/zip' });
});
