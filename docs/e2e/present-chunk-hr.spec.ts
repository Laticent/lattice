import { expect, gotoStudio, railButtons, setEditorContent, test } from './studio-fixture';

// #1551 — a preview frame holds ONE slide, or says why it cannot.
//
// The reported failure was silent content destruction. Paste a deck carrying its
// own `---` front-matter block below an existing one and four correct-in-isolation
// behaviors compose into a lost slide:
//
//   1. front matter is only front matter at offset 0, so the pasted block is
//      ordinary markdown — its opening `---` becomes a thematic break and its
//      closing one a setext underline under `header: "…"`, which is why the keys
//      render as an <h2> and the count shifts by one rather than two;
//   2. the engine therefore splits one more section than the Studio counts;
//   3. the counts disagree, `alignmentFailure` fires and `narrowToSlide` correctly
//      refuses to guess — the caller falls back to "render that one authored chunk
//      alone";
//   4. and THAT CHUNK STILL CONTAINS AN `hr`. Two sections went into a frame whose
//      CSS and scale transform assume exactly one, so the second — the author's
//      actual content — sat below the fold and never painted. Rail count, page
//      number and chunk all agreed with each other and disagreed with the render.
//
// Steps 1-3 each do their documented job; step 4 is the defect, and this spec is
// its oracle. It drives the REAL built Studio rather than a unit harness because
// the thing under test is what lands in the frame.

const PASTED_BELOW_FRONT_MATTER = `---
theme: indaco
paginate: true
---

---
marp: true
theme: indaco
paginate: true
header: "Pasted deck"
---

<!-- _class: quadrant -->

## A quadrant that should be reachable.

- Fast · Cheap
- Fast · Costly
- Slow · Cheap
- Slow · Costly

---

## An ordinary second slide.

Body text.
`;

/** Every frame in the page that is painting slide HTML. */
async function slideFrames(page: import('@playwright/test').Page) {
	const out: { name: string; sections: number }[] = [];
	for (const f of page.frames()) {
		const n = await f
			.evaluate(() => (document.querySelector('.lattice') ? document.querySelectorAll('section').length : -1))
			.catch(() => -1);
		if (n >= 0) out.push({ name: f.url().slice(0, 40), sections: n });
	}
	return out;
}

test('a preview frame never stacks two slides, and says so when it cannot show one (#1551)', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, PASTED_BELOW_FRONT_MATTER);
	await expect.poll(() => railButtons(page).count(), { timeout: 30_000 }).toBe(2);

	// Typing leaves the caret at the end of the deck, so Present would otherwise open
	// on the last slide — and slide 1 is the one that carries the stray block.
	await railButtons(page).nth(0).click();
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();

	const total = 2;
	for (let i = 0; i < total; i++) {
		if (i > 0) {
			await dialog.getByRole('button', { name: 'Next slide' }).click();
		}
		// Give the render (and, on slide 1, the refusal) time to settle.
		await page.waitForTimeout(1500);

		// THE INVARIANT, and the whole point: a frame holds ONE slide. Before the fix
		// slide 1 put two here and the second never painted. The guard now narrows to
		// the first section rather than refusing — refusing was a worse bug, because a
		// chunk expanding 1→N is usually legitimate (`split: headings` is the engine
		// default, `glossary: auto` appends a slide, `_focusSteps` expands), and an
		// error card over an ordinary deck is not an improvement on a stacked one.
		const frames = await slideFrames(page);
		expect(frames.length, `slide ${i + 1}: a slide frame should be present`).toBeGreaterThan(0);
		for (const f of frames) {
			expect(f.sections, `slide ${i + 1}: frame ${f.name} holds ${f.sections} sections`).toBe(1);
		}

		// …and it still RENDERS. The narrowing must leave a painted slide, not an empty
		// frame — asserting only "at most one section" would pass on a blank one, which
		// is the same silence the issue was filed about wearing a different hat.
		await expect(
			page.frameLocator('[aria-label="Presented slide"] iframe.live').locator('section').first(),
			`slide ${i + 1}: the narrowed frame must still paint a slide`,
		).toBeVisible();
	}
});
