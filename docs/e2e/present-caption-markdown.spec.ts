import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// An author's `say:` line is read as the words it says, on the real Present overlay
// (design/skills/speaker-notes.md, "A `say:` line is plain words"). The Q3 fixture's decision slide carried
// `**It costs more than the segment earns.**` into the caption band with its asterisks. The ONE
// kernel that strips it (lib/core/read-along-build.js `plainSay`) is unit-tested with the
// CLI and the bake; this pins the surface a presenter sees. No voice and no key: with the voice
// off, Present runs the estimate clock and still builds the caption band.
const DECK = `---
marp: true
theme: indaco
---

# Probe

---

## Our recommendation: exit SMB.

<!-- say: We did look hard at the fix. **It costs more than the segment earns.** -->
`;

test('a say: line with **bold** shows its words in the caption band, not its asterisks', async ({ page }, testInfo) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	const cc = dialog.getByRole('button', { name: 'Captions' });
	if ((await cc.getAttribute('aria-pressed')) !== 'true') await cc.click();
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText('2 / 2')).toBeVisible();
	await page.getByRole('button', { name: 'Play the presentation' }).click();
	const band = dialog.locator('.latt-cc-track');
	await expect(band).toContainText('It costs more than the segment earns.');
	await expect(band).not.toContainText('*');
	// The shot is taken with the emphasized sentence live, so it shows what the room reads.
	await expect(dialog.locator('[data-cue][data-state="now"]')).toContainText('It costs more', { timeout: 15000 });
	await page.screenshot({ path: testInfo.outputPath('present-caption.png') });
});
