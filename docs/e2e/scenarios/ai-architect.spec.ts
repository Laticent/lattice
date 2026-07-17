import type { APIRequestContext } from '@playwright/test';
import { disposeRelay, injectOpenRouter, LIVE_KEY, routeOpenRouterViaNode } from '../openrouter-live';
import { checkpointLabels, expect, gotoStudio, openArchitect, persistedSource, railButtons, setEditorContent, test, toastText } from '../studio-fixture';

// AI-assisted productivity, against a LIVE OpenRouter model. These scenarios
// close the honest-offline gap: with a key present the Architect must produce a
// REAL outcome — the deck source actually changes AND a History checkpoint is
// saved — never the silent floor. (A bad key degrades to advice/no-op with no
// error toast by design, so every oracle here asserts the change itself.)
//
// Gated on the OPEN_ROUTER_KEY env var (the issue's acceptance contract):
// keyless runs skip with a reason and the #691 honest-offline specs keep
// covering the no-key path. Mind the flip side: in a keyed environment a plain
// `npm run test:e2e` runs this tier too — real paid calls plus live-model
// nondeterminism (`--grep-invert ai-architect` for a deterministic-only run).
// Cost: three tests, one Haiku-tier completion each over a 2-slide deck —
// roughly a cent a run, with the Studio's own hard-stop budget cap armed as
// the runaway guard.
test.skip(!LIVE_KEY, 'OPEN_ROUTER_KEY not set — live AI scenarios skip; the no-key degradation is covered by architect/refine/workspace specs');

// The key must never reach artifacts: no trace, no video, no failure
// screenshots for this file (the config turns screenshots on at failure).
test.use({ trace: 'off', video: 'off', screenshot: 'off' });

// A live completion (plus the app's own render debounce) sets the clock here.
test.describe.configure({ timeout: 180_000 });

// A deliberately rewritable two-slide deck: slide 1 buries its lead in filler,
// so "Rewrite lead" has real work to do; the last line is long and redundant,
// so Shorten has real work to do. Small on purpose — the deck IS the prompt.
const WORDY = 'This paragraph is deliberately long and redundant and it repeats the same point over and over in far more words than the point ever needed.';
const DECK = [
	'<!-- _class: big-number -->\n\n`Quarterly result`\n\n- 42%\n  - of the pipeline came from partner referrals, which was an interesting operational detail among several others we noticed this quarter.',
	`<!-- _class: closing -->\n\n## The program earns its budget.\n\n\`The ask\`\n\n${WORDY}`,
].join('\n\n---\n\n');

let relay: APIRequestContext;

test.beforeEach(async ({ page }) => {
	relay = await routeOpenRouterViaNode(page);
	await injectOpenRouter(page, LIVE_KEY);
	await gotoStudio(page);
	await setEditorContent(page, DECK);
	await expect.poll(() => persistedSource(page)).toContain('partner referrals');
});

test.afterEach(async ({ page }) => {
	await disposeRelay(page, relay);
});

/** The live spend tally (tokens) — nonzero only if a real completion returned usage. */
function sessionTokens(page: import('@playwright/test').Page): Promise<number> {
	return page.evaluate(() => Number(window.sessionStorage.getItem('lattice-db-spend-session-tok') ?? '0'));
}

test('Architect "Rewrite lead" edits the deck source and checkpoints the undo path', async ({ page }) => {
	// Target slide 1 deterministically (the preview follows the caret after authoring).
	await railButtons(page).nth(0).click();
	const before = await persistedSource(page);

	await openArchitect(page);
	await page.getByRole('button', { name: 'Rewrite lead', exact: true }).click();

	// The applied-edit toast is the app's claim; require the outcome behind it.
	await expect(toastText(page)).toContainText('restore from History to undo', { timeout: 120_000 });
	await expect.poll(() => persistedSource(page)).not.toBe(before);

	// The undo path: an automatic pre-edit checkpoint reached version history.
	await expect.poll(() => checkpointLabels(page)).toContain('Before Rewrite lead');

	// And the spend tally moved — proof the LIVE API answered (the silent floor
	// records no usage), not a fabricated local edit.
	await expect.poll(() => sessionTokens(page)).toBeGreaterThan(0);
});

test('Chat: an instructed edit arrives as a diff and Apply lands it in the source', async ({ page }) => {
	await openArchitect(page);
	await page.getByRole('tab', { name: 'Chat' }).click();

	const input = page.getByRole('textbox', { name: 'Message the Architect' });
	await input.fill('Replace the h1/h2 heading of slide 2 with exactly "ATLAS ROADMAP". Change nothing else in the deck.');
	await page.getByRole('button', { name: 'Send' }).click();

	// The model proposes; nothing lands until the author applies the diff card.
	const apply = page.getByRole('button', { name: 'Apply', exact: true });
	await expect(apply).toBeVisible({ timeout: 120_000 });
	expect(await persistedSource(page)).not.toContain('ATLAS ROADMAP');

	await apply.click();
	await expect(toastText(page)).toContainText('Edit applied');
	await expect.poll(() => persistedSource(page)).toContain('ATLAS ROADMAP');
	await expect.poll(() => checkpointLabels(page)).toContain('Before AI chat edit');
});

test('Refine selection: Shorten rewrites the selected prose, undoably', async ({ page }) => {
	// Select the deliberately-wordy last line of the deck.
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.press('Shift+Home');

	await page.getByRole('button', { name: 'Refine selection' }).click();
	await page.getByRole('menuitem', { name: 'Shorten' }).click();

	await expect(toastText(page)).toContainText('Shorten applied', { timeout: 120_000 });

	// The selection was actually rewritten out of the source…
	await expect.poll(() => persistedSource(page)).not.toContain(WORDY);
	// …with the undo path in place: the pre-edit checkpoint, and a single ⌘Z
	// (the rewrite is one editor transaction) that restores the original text.
	// Re-focus the editor first — the closed Refine menu may hold focus.
	await expect.poll(() => checkpointLabels(page)).toContain('Before Shorten');
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+z');
	await expect.poll(() => persistedSource(page)).toContain(WORDY);
});
