import { CHROME, expect, gotoStudio, openArchitect, openChat, test } from './studio-fixture';

// The Coach and Chat panels. They are SEPARATE panels now (own toolbar icon, own
// drawer) — the Coach score card is deterministic (no model); Chat degrades honestly
// offline instead of fabricating a reply.

// SCOPED, not file-level. The #1813 case at the bottom installs a route before its own
// `goto`, so it cannot inherit a page that has already been to the Studio — and a
// `beforeEach` paint plus its own would put TWO cold first paints in one 60s slot, which
// `FIRST_PAINT_TIMEOUT`'s docblock in studio-fixture.ts says cannot both fit under the
// oversubscription its 45s budget was sized against (checker; the #1572 class).
test.describe('Coach and Chat panels', () => {
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
// and the turn hangs exactly where a slow model would leave it.
//
// The route must be installed before `goto`, but NOT because the chunk is modulepreloaded
// — it isn't; its vite preload-deps array is empty and `inject-modulepreload.mjs` doesn't
// cover it, and `build:e2e` doesn't run that script at all. It is because the SHELL fetches
// it at mount: `useArchitectStatus()` in StudioShell calls `architectModel()` long before
// anyone presses Send (checker corrected an earlier claim here).
//
// That is also why the hold has to be measured AT THE SEND. `intercepted`-ever is true from
// page load, so an assertion on it would be true in every run whether or not this turn was
// held — an anti-vacuity guard that cannot detect the thing it names.
test('a turn ending offline paints on the deck that asked, not the one on screen (#1813)', async ({ page }) => {
	let release: () => void = () => {};
	const held = new Promise<void>((r) => {
		release = r;
	});
	let holding = true;
	let heldNow = false;
	await page.route(/architect-model\.[^/]*\.js/, async (route) => {
		if (holding) {
			heldNow = true;
			await held;
			heldNow = false;
		}
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
	expect(heldNow, 'no architect-model request is being held at this moment — the turn is not actually blocked, so everything below would pass against a turn that already finished').toBe(true);

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

// ── And it is still there when the PANEL comes back, not just the deck (#1813 follow-on) ──
//
// The checker demonstrated this one on the real Studio, so it gets pinned on the real Studio.
// Guarding `onConnect()` on `mountedRef` was half right: `notice` was component state, so
// closing Chat mid-turn destroyed it, and with the shell action withheld too a turn that
// failed while the panel was shut said NOTHING, anywhere — on the very deck that asked. The
// `ok` branch never had the hole (`commit` calls `saveChat` unconditionally), so a FAILED
// turn was the only one that could vanish.
//
// One click reaches it, and it is this one: the Studio's assistant slot is mutually
// exclusive (StudioShell renders Coach OR Chat), so tapping Toggle Coach while you wait
// unmounts the chat panel.
test('a turn that fails while the panel is CLOSED is waiting when it reopens (#1813)', async ({ page }) => {
	let release: () => void = () => {};
	const held = new Promise<void>((r) => {
		release = r;
	});
	let holding = true;
	let heldNow = false;
	await page.route(/architect-model\.[^/]*\.js/, async (route) => {
		if (holding) {
			heldNow = true;
			await held;
			heldNow = false;
		}
		await route.continue();
	});

	await gotoStudio(page);
	await page.getByRole('button', { name: CHROME.chat }).click();
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill('Tighten slide two.');
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
	expect(heldNow, 'no architect-model request is being held — the turn is not blocked, so this proves nothing').toBe(true);

	// The author goes to read the scorecard while they wait. This UNMOUNTS the chat panel.
	await page.getByRole('button', { name: CHROME.coach }).click();
	await expect(page.getByText('Board readiness')).toBeVisible();
	await expect(page.getByRole('textbox', { name: 'Message the Architect' })).toHaveCount(0);

	holding = false;
	release();

	// The answer is waiting when they come back. Before the fix this was their own question
	// with nothing after it, and no explanation anywhere in the app.
	await page.getByRole('button', { name: CHROME.chat }).click();
	await expect(page.getByText('Tighten slide two.')).toBeVisible();
	await expect(page.getByText(/and I can answer and edit your deck/), 'the turn failed while the panel was shut and said nothing, anywhere').toBeVisible();

	// ONLY NOW the absence check. Asserted straight after `release()` it resolved ~7ms in,
	// against an outcome that was not observable for ~88ms — an absence assertion evaluated
	// before the thing it denies could exist (checker N3). The line above is the gate.
	await expect(page.getByRole('dialog').filter({ hasText: 'Workspace' }), 'a sheet opened over a shell whose chat panel was shut').toHaveCount(0);
});

// AND THE HARDER HALF: closed and REOPENED before the turn lands (checker N1). Parking the
// notice was not enough — a park only sampled at mount or on a deck change never reaches a
// panel that is already open on the same deck, so this flow still ended in silence. The
// store publishes now. This is the case that was still failing on the real Studio one round
// after the "fix", which is why it gets its own real-surface pin rather than a unit test.
test('a turn that fails after the panel closes AND reopens is not lost (#1813)', async ({ page }) => {
	let release: () => void = () => {};
	const held = new Promise<void>((r) => {
		release = r;
	});
	let holding = true;
	let heldNow = false;
	await page.route(/architect-model\.[^/]*\.js/, async (route) => {
		if (holding) {
			heldNow = true;
			await held;
			heldNow = false;
		}
		await route.continue();
	});

	await gotoStudio(page);
	await page.getByRole('button', { name: CHROME.chat }).click();
	await page.getByRole('textbox', { name: 'Message the Architect' }).fill('Tighten slide two.');
	await page.getByRole('button', { name: 'Send', exact: true }).click();
	await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
	expect(heldNow, 'no architect-model request is being held — the turn is not blocked, so this proves nothing').toBe(true);

	// Coach and straight back — a NEW panel instance, same deck, turn still in flight.
	await page.getByRole('button', { name: CHROME.coach }).click();
	await expect(page.getByText('Board readiness')).toBeVisible();
	await page.getByRole('button', { name: CHROME.chat }).click();
	await expect(page.getByText('Tighten slide two.')).toBeVisible();

	holding = false;
	release();

	// It has to arrive at the panel that is ALREADY OPEN — nothing will sample for it.
	await expect(page.getByText(/and I can answer and edit your deck/), 'the notice was parked but never reached the panel that was already open').toBeVisible();
	await expect(page.getByRole('dialog').filter({ hasText: 'Workspace' })).toHaveCount(0);
});
