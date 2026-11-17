// A `glossary: auto` deck must number its slides in the Studio preview as its PDF does.
//
// WHY THIS EXISTS. `glossary: auto` makes the render append a glossary slide the source does not
// hold, so the whole-deck render the preview takes for it has one section more than the editor
// counts. The alignment guard read that as "cannot tell which section is this slide", fell back to
// rendering the slide alone, and a lone slide numbers itself 1: stepping back through the Q3 fixture
// showed slide 2 as "1" while its PDF said 2 (followups.d/2436-p3-preview-page-number-glossary-auto.md).
// The glossary sits AFTER the authored slides, so section k is still slide k; `narrowToSlide` now
// judges alignment on the authored sections (`withoutAutoGlossary`).
//
// This drives the real Studio with the committed deck, steps it BOTH ways with the ‹ › buttons, and
// reads the painted slide's number, so a regression back to "1" cannot pass as a stale attribute.
// Not `@smoke`; nightly, like supplied-page-position.spec.ts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentSlide, expect, gotoStudio, slideCount, test } from './studio-fixture';

const DECK = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../examples/mobile-landscape.md'), 'utf8');
// The number the PDF prints on each authored slide: its position, or none where the slide opts out
// (a `no-pagination` class, or a component whose manifest drops the number: title, divider,
// closing). Read from the CLI's render of this deck.
const BODY = DECK.replace(/^---\n[\s\S]*?\n---\n/, '').split(/^---$/m);
const PDF_NUMBER = BODY.map((slide, i) => (/_class:[^\n]*\b(no-pagination|title|divider|closing)\b/.test(slide) ? '' : String(i + 1)));

test('a glossary: auto deck numbers every preview slide as its PDF does, stepping both ways', async ({ page }) => {
	await gotoStudio(page);
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+A');
	await page.keyboard.insertText(DECK);
	// The glossary is the PDF's last page, so it counts in the total the preview shares.
	await expect.poll(() => slideCount(page), { timeout: 20000 }).toBe(BODY.length);
	const authored = BODY.length;
	const total = String(authored + 1);

	const prev = page.getByRole('button', { name: 'Previous slide' }).first();
	const next = page.getByRole('button', { name: 'Next slide' }).first();
	type Shown = { n: string; tot: string; badge: string };
	// One read of the painted slide's number, its total and its badge. The preview swaps its document when a render lands,
	// and a read that meets the swap throws "Execution context was destroyed"; `expect.poll` does not retry a throw, so
	// that read counts as "not painted yet" (null) and the poll reads again. Any other error still fails the test.
	const numberShown = async (): Promise<Shown | null> => {
		try {
			return await currentSlide(page)
				.locator('section')
				.first()
				.evaluate((el) => ({
					n: el.getAttribute('data-lattice-pagination') ?? '',
					tot: el.getAttribute('data-lattice-pagination-total') ?? '',
					badge: (el.querySelector('.lat-pagination')?.textContent || '').trim(),
				}));
		} catch (e) {
			if (/Execution context was destroyed|Frame was detached/.test(String(e))) return null;
			throw e;
		}
	};
	// Wait until the painted slide carries `want`, and return that same read, so the total and the badge checked
	// after it come from the document that showed the number, never from a later swap.
	const settled = async (want: string): Promise<Shown> => {
		let last: Shown | null = null;
		await expect
			.poll(
				async () => {
					last = await numberShown();
					return last?.n;
				},
				{ timeout: 15000 },
			)
			.toBe(want);
		return last as unknown as Shown;
	};

	// The caret ends on the last slide after the paste. Walk back to the first, reading each.
	const back: string[] = [];
	for (let i = authored; i >= 1; i--) {
		const s = await settled(PDF_NUMBER[i - 1]);
		if (s.n) expect(s.tot).toBe(total);
		if (s.badge) expect(s.badge).toBe(PDF_NUMBER[i - 1]);
		back.push(s.n);
		if (i > 1) await prev.click();
	}
	// …and forward again to the end.
	const fwd: string[] = [];
	for (let i = 1; i <= authored; i++) {
		fwd.push((await settled(PDF_NUMBER[i - 1])).n);
		if (i < authored) await next.click();
	}
	expect(back).toEqual([...PDF_NUMBER].reverse());
	expect(fwd).toEqual(PDF_NUMBER);
	// Seven paginated slides, 2 through 8: a regression to "1" cannot pass by coincidence.
	expect(PDF_NUMBER.filter(Boolean)).toEqual(['2', '3', '4', '5', '6', '7', '8']);
});
