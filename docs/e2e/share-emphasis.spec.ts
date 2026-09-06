import * as fs from 'node:fs';
import JSZip from 'jszip';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// THE TWO EXPORT ARTIFACTS, downloaded from the real Share sheet.
//
// `present-emphasis.spec.ts` drives the live overlay; this drives the two paths a recipient
// actually receives — the Studio's "Captions (.vtt)" download and the self-contained
// "Webpage (.html)" player. They are separate producers from Present, and one of them
// (`shareCaptions`) shipped unwired in the first cut of this feature precisely because nothing
// clicked it. No voice and no key: both artifacts carry the ESTIMATE track (HARD RULE #24).
//
// Same deck twice, differing only by `**`, so everything except the hold cancels.
test.setTimeout(300000); // two full engine exports per test, each rendering the deck

const DECK = (claim: string) => `---
marp: true
theme: indaco
---

# Probe

---

## Where the quarter turned.

Cost discipline held through the period. ${claim} and that single number moved the year. Pipeline coverage sits below target. Guidance is unchanged for now.
`;

async function download(page: import('@playwright/test').Page, md: string, row: RegExp, then?: RegExp): Promise<string> {
	await gotoStudio(page);
	await setEditorContent(page, md);
	await page.getByRole('button', { name: 'Share', exact: true }).click();
	await expect(page.getByRole('button', { name: row })).toBeVisible();
	if (then) {
		// The player row opens an options panel first; the export is the panel's own button, and
		// narration ships only when the author asks for it — captions ON, audio OFF (no key needed,
		// HARD RULE #24). A default export bakes no narration at all, so without this the artifact
		// carries nothing to assert on.
		await page.getByRole('button', { name: row }).click();
		const captions = page.getByRole('switch', { name: 'Include captions' });
		await expect(captions).toBeVisible();
		if ((await captions.getAttribute('aria-checked')) !== 'true') await captions.click();
		await expect(captions).toHaveAttribute('aria-checked', 'true');
		await expect(page.getByRole('button', { name: then })).toBeVisible();
	}
	const [dl] = await Promise.all([
		page.waitForEvent('download', { timeout: 180000 }),
		page.getByRole('button', { name: then ?? row }).click(),
	]);
	const p = await dl.path();
	expect(p, 'the Share row produced no file').toBeTruthy();
	const name = dl.suggestedFilename();
	// The captions row ships a ZIP (deck-level .vtt + per-slide parts); the player ships one .html.
	if (name.endsWith('.zip')) {
		const zip = await JSZip.loadAsync(fs.readFileSync(p as string));
		const deckVtt = Object.keys(zip.files).find((f) => /\.vtt$/.test(f) && !/\.\d+\.vtt$/.test(f));
		expect(deckVtt, `no deck-level .vtt in ${Object.keys(zip.files).join(', ')}`).toBeTruthy();
		return zip.file(deckVtt as string)!.async('string');
	}
	return fs.readFileSync(p as string, 'utf8');
}

/** Cue start times (ms) from a WebVTT body. */
function cueStarts(vtt: string): number[] {
	return [...vtt.matchAll(/^(\d\d):(\d\d):(\d\d)\.(\d\d\d) -->/gm)].map(
		(m) => Number(m[1]) * 3600000 + Number(m[2]) * 60000 + Number(m[3]) * 1000 + Number(m[4]),
	);
}

test('the Captions (.vtt) download carries the emphasis hold', async ({ page }) => {
	const plain = cueStarts(await download(page, DECK('Retention reached 118 percent'), /Captions/));
	const bold = cueStarts(await download(page, DECK('**Retention reached 118 percent**'), /Captions/));
	expect(plain.length).toBeGreaterThan(3);
	expect(bold.length).toBe(plain.length);

	// Index-free, because the deck-level .vtt concatenates every slide's cues and the emphasized
	// sentence's position is an artifact of the fixture, not of the feature. The claims that matter:
	// identical until the emphasized passage ends, then a single 250 ms step that never repeats.
	const deltas = bold.map((b, i) => b - plain[i]);
	const first = deltas.findIndex((d) => d !== 0);
	expect(first, `no cue moved — plain=${plain} bold=${bold}`).toBeGreaterThan(0);
	expect(deltas.slice(0, first).every((d) => d === 0)).toBe(true);
	// EXACTLY one hold, EXACTLY EMPHASIS_HOLD_MS, and it is a step rather than an accumulation.
	for (const d of deltas.slice(first)) expect(d, `deltas=${deltas}`).toBe(250);
});

test('the Webpage (.html) player bakes the emphasis hold into its gaps', async ({ page }) => {
	const gapsOf = (html: string) => [...html.matchAll(/"g":(\d+)/g)].map((m) => Number(m[1]));
	const plain = gapsOf(await download(page, DECK('Retention reached 118 percent'), /Webpage/, /Download webpage/));
	const bold = gapsOf(await download(page, DECK('**Retention reached 118 percent**'), /Webpage/, /Download webpage/));
	expect(plain.length).toBeGreaterThan(3);
	expect(bold.length).toBe(plain.length);
	const sum = (a: number[]) => a.reduce((n, x) => n + x, 0);
	expect(sum(bold) - sum(plain), `plain=${plain} bold=${bold}`).toBe(250);
});


// A CODA's hold lands HERE and nowhere else. The .vtt is derived from durationMs — the last cue's
// END — so it cannot carry silence after the final line, and checking it is what got this feature
// deleted once. The player holds the gap on every cue including the last, on purpose. Same deck
// twice, differing only by whether the closing quote is present.
const CODA_DECK = (coda: string) => `---
marp: true
theme: indaco
---

# Probe

---

## Where the quarter turned.

Cost discipline held through the period. Pipeline coverage sits below target.
${coda}
`;

test('the player holds a beat after the closing quote', async ({ page }) => {
	const gapsOf = (html: string) => [...html.matchAll(/"g":(\d+)/g)].map((m) => Number(m[1]));
	// Without the quote there is no coda at all; with it, the closing line is spoken AND weighted,
	// so the deck gains one hold — the extra sentence's own gap, plus the 250 ms emphasis hold.
	const none = gapsOf(await download(page, CODA_DECK(''), /Webpage/, /Download webpage/));
	const coda = gapsOf(await download(page, CODA_DECK('\n> Retention carries the year.\n'), /Webpage/, /Download webpage/));
	expect(coda.length, 'the coda should add one cue').toBe(none.length + 1);
	// The final cue is the coda, and its gap carries the emphasis hold rather than the bare
	// sentence pause. 415 = the sentence gap (165) + EMPHASIS_HOLD_MS (250).
	expect(coda[coda.length - 1], `gaps=${coda}`).toBe(415);
});
