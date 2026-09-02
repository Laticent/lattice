import { currentSlide, expect, gotoStudio, railButtons, setEditorContent, test } from '../studio-fixture';

// Journey: author → present. One continuous flow — draft a deck from scratch,
// enter Present, walk to the LAST slide, and read it aloud. The oracle is the end
// state (full traversal + the right register on screen), not any single control:
// it passes only if drafting, Present navigation and narration resolution all
// worked in sequence.

// The authored deck: three slides, valid shipped components (title / big-number /
// closing — HARD RULE #6 contracts), with a speaker note on the LAST slide so the
// traversal oracle and the register oracle land on the same slide.
// The PRIVATE register — the presenter's talk track. Never spoken, never captioned.
const NOTE = 'Close on the ask and pause for questions.';
// The PUBLIC register — the last slide's own prose, which is what read-aloud speaks instead.
const SPOKEN = 'Approve the Atlas budget and we ship Q1.';
const DECK = [
	'<!-- _class: title -->\n\n# Atlas expansion plan\n\n`Growth · FY27`\n\nThree markets, one playbook.',
	'<!-- _class: big-number -->\n\n`The headline`\n\n- 3\n  - new markets entered with the same core platform.',
	`<!-- _class: closing -->\n\n## ${SPOKEN}\n\n\`The ask\`\n\n<!-- note: ${NOTE} -->`,
].join('\n\n---\n\n');

test('draft a deck, present it, and the last slide speaks its prose — never its note', async ({ page }) => {
	await gotoStudio(page);

	// Author the deck (replaces the seeded source wholesale). The preview follows
	// the caret to the last edited slide, so jump back to slide 1 for the run.
	await setEditorContent(page, DECK);
	await expect(railButtons(page)).toHaveCount(3);
	await railButtons(page).nth(0).click();
	await expect(currentSlide(page)).toContainText('Atlas expansion plan');

	// Enter Present.
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByText('1 / 3', { exact: true })).toBeVisible();

	// Traverse to the last slide.
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await expect(dialog.getByText('3 / 3', { exact: true })).toBeVisible();

	// The ONE Play (present redesign S3) starts read-aloud, and its teleprompter caption reads
	// the slide's OWN PROSE — never the speaker note.
	//
	// THIS ORACLE USED TO ASSERT THE OPPOSITE, and it was wrong from the day it landed. It
	// waited for the NOTE in the caption, on the claim that a note is "the real talk track".
	// `narration-resolve.ts` — added in the same commit — deliberately removes that rung:
	// "THE SPEAKER NOTE IS NOT A RUNG", because a note above the chart facts and the projection
	// meant any slide carrying one narrated the note instead of its own content, on the live
	// crawl, the `.vtt` sidecars AND the audio baked into a shared deck. That collapsed two
	// channels `design/skills/speaker-notes.md` opens by demanding stay apart ("none bleeding
	// into the others"; "a caption must never carry a private remark"). So the spec waited 15s
	// for text the code is built to keep out, and timed out every run.
	//
	// What it pins now is that separation itself, which nothing else exercises end to end: the
	// PUBLIC register is spoken, and the PRIVATE one is not. The caption renders its line twice
	// — a scoped `role=status` live region and the aria-hidden visual crawl — so `.first()`
	// targets the live region.
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
	await expect(dialog.getByText(SPOKEN).first()).toBeVisible();
	// Asserted at the moment read-aloud is demonstrably running and captioning (the line above),
	// so this is a real absence rather than a matcher that resolved before anything happened.
	// The note is not merely missing from the deck: `page.getByText(NOTE)` finds it in the
	// editor source behind the dialog — it reaches the author, and stops there.
	await expect(dialog.getByText(NOTE)).toHaveCount(0);
	await expect(page.getByText(NOTE)).toHaveCount(1);

	// And the journey exits cleanly.
	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
});
