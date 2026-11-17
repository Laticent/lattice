import fs from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// EVIDENCE for followups.d/3272-p2-overflow-marker-label-race.md, not a test of the suite. Copy it into docs/e2e/ to run
// (README.md beside it). It exports one deck's PDF from the Studio's Share sheet and keeps each file, so the last page's
// overflow-marker pill can be compared across runs.
const OUT = process.env.BYTES_OUT || '/tmp/overflow-marker-race';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMAAAABsCAIAAACzYCrFAAAA1klEQVR42u3SMQ0AAAgEsfcvEwEMKMADYWxSBZfLdMFZJMBAGAgDYSAwEAbCQBgIDISBMBAGAgNhIAyEgcBAGAgDYSAMBAbCQBgIA4GBMBAGwkBgIAyEgTAQGAgDYSAMhIHAQBgIA2EgMBAGwkAYCAyEgTAQBgIDYSAMhIHAQBgIA2EgDAQGwkAYCAOBgTAQBsJAYCAMhIEwEBgIA2EgDISBwEAYCANhIDAQBsJAGAgMhIEwEAYCA2EgDISBMBAYCANhIAwEBsJAGAgDgYEwEAbCQGAgPi0bG28SdoIc2AAAAABJRU5ErkJggg==';
const DECK = `---\ntitle: Byte check\nfinish: atrium\n---\n\n# Weights and emoji 🚀 ✅\n\nRegular, **bold**, *italic* and ***bold italic*** text.\n\n---\n\n## Math\n\nInline $e^{i\\pi} + 1 = 0$ and display:\n\n$$\\int_0^1 x^2\\,dx = \\tfrac13$$\n\n---\n\n## Icons\n\nStorage \`^{database, c3}\` and \`{S3, icon=bucket, c4}\` **done** *now*.\n\n---\n\n<!-- _class: content bleed -->\n\n## A photo\n\n![Day](${PNG})\n\n---\n\n## A second photo\n\n![Wide](sample:photo-wide.svg)\n`;

async function exportPdf(page: Page, name: string) {
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	const dialog = page.getByRole('dialog');
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^PDF/ }).click();
	const download = page.waitForEvent('download', { timeout: 240_000 });
	await dialog.getByRole('button', { name: /^Download PDF/ }).click();
	fs.copyFileSync((await (await download).path()) as string, `${OUT}/${name}`);
}

test('overflow marker race: export the PDF @crosswidth', async ({ page }) => {
	test.setTimeout(300_000);
	await page.setViewportSize({ width: 1440, height: 900 });
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	fs.mkdirSync(OUT, { recursive: true });
	await exportPdf(page, `${test.info().project.name}-r${test.info().repeatEachIndex}-deck.pdf`);
});
