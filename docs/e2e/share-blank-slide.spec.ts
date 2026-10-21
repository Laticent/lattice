import * as fs from 'node:fs';
import JSZip from 'jszip';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// THE SHARE EXPORT ON A DECK WITH A BLANK SLIDE, from the real Share sheet.
//
// `---` twice in a row is a slide the engine renders. When the Studio's splitter dropped it, the captions export
// held one source slide fewer than rendered sections, so the chart narration stood down for the WHOLE deck (a
// length mismatch means a chart's facts could bind to the wrong slide) and a chart slide was captioned with its
// heading alone. Now the lists line up, so a chart after a blank slide speaks its computed facts. No voice and no
// key: the captions carry the estimate track (HARD RULE #24).
test.setTimeout(240000);

const DECK = `---
marp: true
theme: indaco
---

# Probe

---

---

<!-- _class: funnel -->

## Most signals die early.

- Signals logged \`12,000\`
- Triaged \`4,800\`
- Scored \`2,160\`
- Surfaced \`864\`
`;

test('a chart after a blank slide is captioned with its computed facts in the Captions (.vtt) download', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('button', { name: /Captions/ })).toBeVisible();
	const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 180000 }), page.getByRole('button', { name: /Captions/ }).click()]);
	const zip = await JSZip.loadAsync(fs.readFileSync((await dl.path()) as string));
	const deckVtt = Object.keys(zip.files).find((f) => /\.vtt$/.test(f) && !/\.\d+\.vtt$/.test(f));
	expect(deckVtt, `no deck-level .vtt in ${Object.keys(zip.files).join(', ')}`).toBeTruthy();
	// The cues carry word timings (`<00:00:01.235>`) between the words; read the words alone.
	const vtt = (await zip.file(deckVtt as string)!.async('string')).replace(/<[\d:.]+>/g, '');
	// narrateChart's computed facts (the funnel's stage-over-stage share), which exist only in the chart narration.
	expect(vtt, 'the chart was captioned with its heading only: the narration stood down').toContain('percent of the prior stage');
	expect(vtt).toContain('Probe');
});
