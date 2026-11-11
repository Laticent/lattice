/**
 * Slide-metadata records on the real Studio preview (engineering/decisions/2026-10-17-meta-record.md §9 step 2,
 * HARD RULE #23): a deck written only in records (`<!-- {layout=cards, footer="…"} -->`) renders its layouts, its panes
 * and its stepping slide, and no record or note text reaches a slide. The engine path is the same one the CLI runs; this
 * pins that the Studio's own readers (the pane probe and page map, admission) and the browser bundle carry the door too.
 */
import { expect, gotoStudio, LIVE_PREVIEW, railButtons, setEditorContent, test } from './studio-fixture';

const DECK = `---
theme: indaco
---

<!-- {layout=list-steps, footer="Record footer"}
note: |
  A private speaker note that must not show.
reader: |
  A reader note that must not show either.
-->

## A record sets the layout.

1. First step.
2. Second step.

---

<!-- {layout=columns} -->

## Two panes from records.

<!-- {pane=list, footer="Pane footer"} -->
### Left

- One
- Two

<!-- {pane=list} -->
### Right

- Three
- Four

---

<!-- {layout=list-steps, focus-steps="item 1 | item 2"} -->

## Focus steps walk.

1. First.
2. Second.
`;

async function recordDeckRenders({ page }: { page: import('@playwright/test').Page }): Promise<void> {
	await gotoStudio(page);
	// A phone shows one pane at a time: write in Markdown source, then read in Preview (as chart-popup-dismiss does).
	const phone = (page.viewportSize()?.width ?? 1440) < 600;
	if (phone) await page.getByRole('button', { name: 'Markdown source' }).first().click();
	await setEditorContent(page, DECK);
	if (phone) await page.getByRole('button', { name: 'Preview', exact: true }).first().click();
	const frame = page.frameLocator(LIVE_PREVIEW);
	const rail = railButtons(page);
	await expect(rail).toHaveCount(3, { timeout: 20_000 });
	// The rail names each slide by the class its record sets (a scan that kept one field per comment named slide 1 `text`).
	await expect(rail.nth(0)).not.toHaveText(/text/);
	await expect(rail.nth(1)).toHaveText(/panes/);
	await expect(rail.nth(2)).not.toHaveText(/text/);
	// The preview shows the current slide; the rail picks it. Each slide is found by its own heading, so no assertion
	// can read the starter deck the editor held a moment ago.
	const slide = (heading: string) => frame.locator('section', { has: frame.locator('h2', { hasText: heading }) });
	const seen: string[] = [];
	const keep = async () => seen.push(await frame.locator('section').evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText).join('\n')));

	// Slide 1: the layout and the footer come from a record that also holds `note: |` and `reader: |` blocks.
	await rail.nth(0).click();
	const first = slide('A record sets the layout.').first();
	await expect(first).toBeVisible({ timeout: 20_000 });
	await expect(first).toHaveClass(/(^|\s)list-steps(\s|$)/);
	await expect(first).toHaveAttribute('data-footer', 'Record footer');
	await keep();

	// Slide 2: two panes from `{pane=list}` records, one of them mixed with a footer.
	await rail.nth(1).click();
	await expect(slide('Two panes from records.').first()).toBeVisible({ timeout: 20_000 });
	await expect(frame.locator('lat-pane.list')).toHaveCount(2);
	await keep();

	// Slide 3: focus steps from a record make one stepping slide, walked live (2026-11-09-steps-as-a-behavior.md), and keep
	// its layout.
	await rail.nth(2).click();
	const focus = frame.locator('section[data-steps="2"][data-step-kind="focus"]', { has: frame.locator('h2', { hasText: 'Focus steps walk.' }) }).first();
	await expect(focus).toBeVisible({ timeout: 20_000 });
	await expect(focus).toHaveClass(/(^|\s)list-steps(\s|$)/);
	await keep();

	// Nothing of a record reaches a slide: not its fields, not its notes.
	expect(seen.join('\n')).not.toMatch(/layout=|focus-steps|lat-meta|private speaker note|reader note/);
}

// The same check twice: untagged for the desktop project, tagged for the phone and the two other engines (each project
// selects by tag, playwright.config.ts).
test('a deck written in records renders its layouts, panes and stepping slide, with no record text on a slide', recordDeckRenders);
test('@mobile @webkit-phone @webkit-tablet @gecko a deck written in records renders the same on a phone, WebKit and Gecko', recordDeckRenders);
