import { CHROME, expect, gotoStudio, openArchitect, openChat, test } from './studio-fixture';

// The Coach and Chat panels. They are SEPARATE panels now (own toolbar icon, own
// drawer) — the Coach score card is deterministic (no model); Chat degrades honestly
// offline instead of fabricating a reply.

test.beforeEach(async ({ page }) => {
	await gotoStudio(page);
});

test('Coach and Chat are separate panels, mutually exclusive in the assistant slot', async ({ page }) => {
	// Each has its own activity-bar launcher — no tab to switch between them.
	await openArchitect(page); // the Coach
	await expect(page.getByText('Board readiness')).toBeVisible();

	await openChat(page); // opening Chat takes the assistant slot from the Coach
	await expect(page.getByRole('textbox', { name: 'Message the Architect' })).toBeVisible();
	await expect(page.getByText('Board readiness')).toHaveCount(0);

	await openArchitect(page); // and back
	await expect(page.getByText('Board readiness')).toBeVisible();
});

test('the Coach score card scores the seeded deck', async ({ page }) => {
	await openArchitect(page);
	await expect(page.getByText('Board readiness')).toBeVisible();
	// The REAL engine scorecard: an overall out of 100 and a per-dimension read
	// (Structure/Clarity are always-present categories). The toy 3-check heuristic
	// (Components valid / Opens with a title / Variety, scored / 10) was deleted.
	await expect(page.getByText(/\/ 100/)).toBeVisible();
	// Scope the per-dimension read to the Board readiness card. Bare
	// `getByText('Structure')` is a case-INSENSITIVE SUBSTRING match, so it also
	// caught the card's own disclaimer prose ("…authoring hygiene (structure,
	// clarity, contract)") and the "Structure" quick-read chip in the sibling
	// "Ask the deck" card — three matches, a strict-mode violation.
	const readiness = page.getByText('Board readiness').locator('..');
	await expect(readiness.getByText('Structure', { exact: true })).toBeVisible();
	await expect(readiness.getByText('Clarity', { exact: true })).toBeVisible();
});

test('offline chat degrades honestly and points to Workspace', async ({ page }) => {
	await page.getByRole('button', { name: CHROME.chat }).click();
	const input = page.getByRole('textbox', { name: 'Message the Architect' });
	await input.fill('Tighten slide two.');
	// Exact — "Send feedback" in the shared header also matches a loose "Send" (#1504).
	await page.getByRole('button', { name: 'Send', exact: true }).click();

	// The message was actually submitted (a user bubble rendered)…
	await expect(page.getByText('Tighten slide two.')).toBeVisible();
	// …and the reply is the honest degradation — an ephemeral notice, distinct from the
	// empty-thread placeholder, so this can only pass if the send path ran (never a
	// fabricated edit). "…Workspace → AI and I can answer…" is the notice wording.
	await expect(page.getByText(/Workspace → AI and I can answer/)).toBeVisible();
});

// ── A turn that fails belongs to the deck that asked (#1813) ───────────────────────────
//
// The Architect keeps a reply in flight across a deck switch on purpose — the survival
// contract. Only the `ok` branch checked which deck it belonged to, because that guard
// lives inside `commit`, which is what makes the three branches beside it read as
// finished code. So a turn started on deck-1 and finishing while deck-2 was on screen
// wrote its notice into deck-2's transcript and, on the `offline` branch, called
// `onConnect()` — popping the Workspace sheet over a deck that had asked for nothing.
//
// jsdom pins the branches (studio.chat-stream-commit.test.tsx). This is the REAL Studio,
// because "the sheet opens over the wrong deck" is a claim about a running shell and a
// unit test is a proxy for it (HARD RULE #23). Measured on the pre-fix build, this exact
// flow reported `notice in deck-2: true` / `Workspace popped: true` — and the sheet then
// covered the header, so the deck switcher could not even be reached.
//
// HOW THE TURN IS HELD OPEN, with nothing patched: `chatComplete`'s first await is
// `architectModel()`, a dynamic import of the `architect-model` chunk. Hold that request
// and the turn hangs exactly where a slow model would leave it. The chunk is
// modulepreloaded at page load, so the route must be installed before `goto` — and the
// hold is asserted below, because a Vite change that inlined the chunk would make this
// spec pass while testing nothing.
test('a turn ending offline paints on the deck that asked, not the one on screen (#1813)', async ({ page }) => {
	let release: () => void = () => {};
	const held = new Promise<void>((r) => {
		release = r;
	});
	let holding = true;
	let intercepted = false;
	await page.route(/architect-model\.[^/]*\.js/, async (route) => {
		intercepted = true;
		if (holding) await held;
		await route.continue();
	});

	await gotoStudio(page);

	// The Studio seeds several decks; deck ONE asks, deck TWO is where the author is
	// standing when the answer comes back.
	const switcher = page.locator('header').getByRole('button', { name: /slides$/ }).first();
	const goToDeck = async (name: RegExp) => {
		await switcher.click();
		await page.getByRole('menuitem', { name }).first().click();
	};
	const DECK_ONE = /^Markdown for the boardroom/;
	const DECK_TWO = /^Q3 Board Review/;

	await page.getByRole('button', { name: CHROME.chat }).click();
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill('Tighten slide two.');
	await page.getByRole('button', { name: 'Send', exact: true }).click();

	// Stop in place of Send IS the turn being in flight. Without it the hold did not take
	// and everything below would pass against a turn that already finished.
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
	expect(intercepted, 'the architect-model chunk was never requested — the turn was not actually held, so this test proves nothing').toBe(true);

	// The author walks away mid-turn.
	await goToDeck(DECK_TWO);
	await expect(switcher).toHaveText(/Q3 Board Review/);

	// …and the turn lands while deck-2 is on screen.
	holding = false;
	release();

	// The notice belongs to deck-1. Assert the WAIT resolved first (Stop is gone, so the
	// turn ended) — otherwise "no notice yet" is indistinguishable from "no notice ever".
	await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
	await expect(page.getByText(/and I can answer and edit your deck/), "deck-1's notice is showing in deck-2's transcript").toHaveCount(0);
	await expect(page.getByRole('dialog').filter({ hasText: 'Workspace' }), 'the Workspace sheet opened over a deck whose author asked for nothing').toHaveCount(0);

	// Not swallowed, though — waiting on the deck that asked.
	await goToDeck(DECK_ONE);
	await expect(page.getByText(/and I can answer and edit your deck/), 'the deck that asked was never told why nothing came back').toBeVisible();
});
