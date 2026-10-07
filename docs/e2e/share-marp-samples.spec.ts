import fs from 'node:fs';
import { expect, gotoStudio, openAddSlide, setEditorContent, shareExport, test, toastText } from './studio-fixture';

// THE STUDIO'S EXPORT TO MARP CARRIES `sample:` PICTURES, on the real Studio (HARD RULE #23).
//
// `sample:<name>` is how every template names Lattice's sample art
// (engineering/decisions/2026-10-07-sample-images.md). Marp cannot read the prefix, and this
// producer has no filesystem, so it used to ship the reference as written and drop a
// `logo: sample:…` outright. It now fetches each file from the site's staged `samples/` into
// the bundle's `assets/` (deck-export.js exportMarp). The deck here is the path a person
// takes: a sample logo in the front matter, then a team-profile slide from Add slide, whose
// template names two sample portraits. The oracle is the downloaded zip.

const DECK = `---
theme: indaco
logo: sample:logo-acme-mark.svg
---

# Quarterly review
`;

test('a Studio Marp export carries the deck’s sample pictures and names them in assets/', async ({ page }) => {
	test.slow();
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await openAddSlide(page);
	await page.getByPlaceholder(/Search \d+ slides/).fill('team-profile');
	await page.getByRole('button', { name: /^Insert team-profile/i }).first().click();
	await expect(toastText(page)).toContainText('Inserted');

	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const [file] = await Promise.all([page.waitForEvent('download'), shareExport(page, 'marp')]);
	const path = await file.path();
	const out = process.env.LATTICE_EVIDENCE_DIR;
	if (out) fs.copyFileSync(path, `${out}/${file.suggestedFilename()}`);

	const { default: JSZip } = await import('jszip');
	const zip = await JSZip.loadAsync(fs.readFileSync(path));
	const names = Object.keys(zip.files);
	for (const sample of ['logo-acme-mark.svg', 'portrait-ada.svg', 'portrait-marcus.svg']) {
		const entry = names.find((n) => n.endsWith(`/assets/${sample}`));
		expect(entry, `the bundle carries assets/${sample} (had: ${names.filter((n) => n.includes('assets/')).join(', ')})`).toBeTruthy();
		expect(await zip.file(entry ?? '')?.async('string'), `assets/${sample} is the picture, not an error page`).toMatch(/<svg/);
	}
	const deck = names.find((n) => /\/[^/]+\.md$/.test(n) && !/README|AGENTS/.test(n));
	const md = (await zip.file(deck ?? '')?.async('string')) ?? '';
	expect(md, 'no `sample:` reference is left for Marp to miss').not.toContain('sample:');
	expect(md).toContain('![](assets/portrait-ada.svg)');
	// Twice: once in Marp's front matter, once in the baked block the runtime reads.
	expect(md.match(/logo: assets\/logo-acme-mark\.svg/g)?.length).toBe(2);
});
