// Undo in a live session, two browsers, on the real Studio (HARD RULE #23): the Filo note's §6.2
// (engineering/decisions/2026-10-27-filo-undo-history.md). While a deck is shared, every undo goes
// to the session's Y.UndoManager, which holds only this browser's own changes. The Studio's own
// writes (a settings write, a Compose edit) reach the shared text with the null origin, which that
// manager tracks, so they are undoable too, by the person who made them and by nobody else.
//
// The session is real end to end except the relays: the real Tavola + Trystero transport, real
// WebRTC between two browser contexts, and an in-test Nostr relay (`live-relay.ts`) in place of
// the public ones, so it runs in CI without the network. tools/live-session-check.mjs drives the
// same flows over the public relays, on demand. Runs in all three engines.
import type { Browser, Page, TestInfo } from '@playwright/test';
import { savedDeck } from './compose-insert';
import { localRelay } from './live-relay';
import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

const DECK = ['<!-- _class: content -->\n\n# Live deck\n\nBody one.', '<!-- _class: content -->\n\n# Two\n\nBody two.', '<!-- _class: content -->\n\n# Three\n\nBody three.'].join('\n\n---\n\n');

/** The deck source this page holds: what the Studio last saved. */
const sourceOf = (page: Page) => savedDeck(page);

/** The undo chord as the page's platform binds it (studio-filo.ts `undoChord`). */
async function undoChord(page: Page): Promise<void> {
	const mac = await page.evaluate(() => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
	await page.keyboard.press(mac ? 'Meta+z' : 'Control+z');
}

type Pair = { host: Page; guest: Page; relayed: () => number };

/** Two browsers in one live session: the host starts it with DECK, the guest knocks, the host admits. */
async function liveSession(browser: Browser, info: TestInfo): Promise<Pair> {
	const relay = localRelay();
	const opts = { baseURL: info.project.use.baseURL, viewport: { width: 1440, height: 900 } };
	const hctx = await browser.newContext(opts);
	const gctx = await browser.newContext(opts);
	await relay.attach(hctx);
	await relay.attach(gctx);
	const host = await hctx.newPage();
	const guest = await gctx.newPage();

	await gotoStudio(host);
	await setEditorContent(host, DECK);
	await expect.poll(() => sourceOf(host)).toBe(DECK);
	await host.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click();
	await host.locator('#live-start-name').fill('Host');
	await host.getByRole('button', { name: 'Start live session' }).click();
	await expect(host.getByText('In this session (1/4)')).toBeVisible({ timeout: 30_000 });
	const link = await host.locator('input[aria-label="Invite link"]').inputValue();
	expect(link, 'witness: the panel shows an invite link').toContain('#live=');

	// The guest boots the Studio once for its seeded settings, then opens the link.
	await gotoStudio(guest);
	await guest.goto('about:blank');
	await guest.goto(link);
	await guest.locator('#live-lobby-name').fill('Guest', { timeout: 60_000 });
	await guest.getByRole('button', { name: 'Ask to join' }).click();
	await host.locator('button[aria-label="Admit Guest"]').click({ timeout: 30_000 });
	await guest.locator('[data-live-pill]').waitFor({ timeout: 30_000 });
	await expect.poll(() => sourceOf(guest), { message: 'the guest never received the deck', timeout: 30_000 }).toBe(DECK);
	return { host, guest, relayed: () => relay.events };
}

/** Put the caret at the end of slide `i`'s body in Compose, the way an author clicks there. */
async function caretInCompose(page: Page, i: number): Promise<void> {
	await page.locator('.cs-host .cs-slide').nth(i).locator('p').last().click();
	await page.keyboard.press('End');
}

async function openCompose(page: Page): Promise<void> {
	await page.getByRole('button', { name: 'Compose — rich editor', exact: true }).first().click();
	await page.locator('.cs-host .ProseMirror').waitFor();
	await page.locator('.cs-host .cs-slide').nth(2).waitFor();
}

/** Both pages hold `want` (the change crossed the session both ways). */
async function bothHold(pair: Pair, want: (s: string) => boolean, message: string): Promise<void> {
	await expect.poll(async () => want(await sourceOf(pair.host)), { message: `host: ${message}`, timeout: 20_000 }).toBe(true);
	await expect.poll(async () => want(await sourceOf(pair.guest)), { message: `guest: ${message}`, timeout: 20_000 }).toBe(true);
}

for (const tag of ['@gecko', '@webkit-tablet']) test.describe(`Filo in a live session ${tag}`, () => {
	// Two Studios boot and a session connects before the first step: more than the 60 s default.
	test.describe.configure({ timeout: 180_000 });

	test('a settings write is undone by the person who made it, and only theirs', async ({ browser }, info) => {
		const pair = await liveSession(browser, info);
		const { host, guest } = pair;
		expect(pair.relayed(), 'witness: the session signaled through the local relay').toBeGreaterThan(0);

		// The guest's own edit, in its editor: the host's undo must leave it alone.
		await guest.locator('.cm-content').first().click();
		await guest.keyboard.press('ControlOrMeta+End');
		await guest.keyboard.type('\nGuest line.');
		await bothHold(pair, (s) => s.includes('Guest line.'), 'the guest edit crossed');

		// The host renames the deck: a settings write, through the settings funnel to the shared text.
		host.once('dialog', (d) => d.accept('Renamed live'));
		await host.locator('header').getByRole('button', { name: /^Live deck/ }).first().click();
		await host.getByRole('menuitem', { name: /^Rename/ }).click();
		await bothHold(pair, (s) => s.includes('# Renamed live'), 'the rename crossed');

		// ⌘Z with focus in the settings panel: the session's undo takes back the rename only.
		await host.getByRole('button', { name: 'Deck scope' }).first().click();
		await host.getByRole('button', { name: 'Deck scope' }).first().focus();
		expect(await host.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'witness: focus is in the settings panel').toBe('Deck scope');
		await undoChord(host);
		await bothHold(pair, (s) => s.includes('# Live deck') && !s.includes('Renamed live'), 'the rename was not undone');
		await bothHold(pair, (s) => s.includes('Guest line.'), "the host's undo took the guest's edit");

		// The guest's undo takes its own edit, and never the host's rename back.
		await guest.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
		await undoChord(guest);
		await bothHold(pair, (s) => s === DECK, "the guest's undo did not restore the deck");
	});

	test("Compose's pill undoes each person's own edit, and only theirs", async ({ browser }, info) => {
		const pair = await liveSession(browser, info);
		const { host, guest } = pair;
		await openCompose(host);
		await openCompose(guest);

		await caretInCompose(host, 2);
		await host.keyboard.type(' HOSTPILL');
		await bothHold(pair, (s) => s.includes('Body three. HOSTPILL'), 'the host edit crossed');
		await caretInCompose(guest, 0);
		await guest.keyboard.type(' GUESTPILL');
		await bothHold(pair, (s) => s.includes('Body one. GUESTPILL') && s.includes('HOSTPILL'), 'the guest edit crossed');

		// The host's pill: its own edit goes on both sides, the guest's stays.
		await caretInCompose(host, 2);
		const hostUndo = host.locator('.cs-slide-active').getByRole('button', { name: 'Undo' });
		await expect(hostUndo, 'the pill offers Undo in a session').toBeEnabled();
		await hostUndo.click();
		await bothHold(pair, (s) => !s.includes('HOSTPILL') && s.includes('GUESTPILL'), "the host's pill undid the wrong edit");
		await expect(host.locator('.cs-host .cs-slide').nth(2), 'Compose shows the undo at once').not.toContainText('HOSTPILL');

		// The guest's pill: its own edit goes, and the deck is back where the session started.
		await caretInCompose(guest, 0);
		await guest.locator('.cs-slide-active').getByRole('button', { name: 'Undo' }).click();
		await bothHold(pair, (s) => s === DECK, "the guest's pill did not restore the deck");
		await expect(guest.locator('.cs-host .cs-slide').first()).not.toContainText('GUESTPILL');
	});
});
