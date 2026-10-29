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
import type { Browser, BrowserContext, Page, TestInfo } from '@playwright/test';
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

// Each test's two contexts, closed after it: a live Studio left running would keep its peer
// connection and its relay routes alive and load every later test in the worker.
const open: BrowserContext[] = [];
const launched: Browser[] = [];
test.afterEach(async () => {
	await Promise.all(open.splice(0).map((c) => c.close()));
	await Promise.all(launched.splice(0).map((b) => b.close()));
});

/**
 * The browser the session runs in. On a GitHub runner two Firefox contexts never connected (the
 * probe of this spec failed in Gecko only, at the guest's lobby: "Nobody answered", and "WebRTC:
 * ICE failed" in the trace, 2026-10-29), while Chromium and WebKit did. Firefox hides local
 * addresses behind mDNS names and leaves loopback candidates out by default; its own browser with
 * both off gets candidates that always pair on one machine. The WebRTC path stays real; only which
 * candidates Firefox offers changes.
 */
async function sessionBrowser(browser: Browser): Promise<Browser> {
	const type = browser.browserType();
	if (type.name() !== 'firefox') return browser;
	const b = await type.launch({
		firefoxUserPrefs: {
			'media.peerconnection.ice.obfuscate_host_addresses': false,
			// Both peers are on this machine, so the loopback pair always works. Firefox leaves loopback
			// (and link-local) candidates out by default, and on a runner whose other interface it will
			// not use, that left no pair at all: "WebRTC: ICE failed" in the probe's trace, 2026-10-29.
			'media.peerconnection.ice.loopback': true,
			'media.peerconnection.ice.link_local': true,
		},
	});
	launched.push(b);
	return b;
}

/** An init script: log what every RTCPeerConnection the page makes does with ICE, as plain strings
 *  on `window.__ice`, written as it happens. A connection that failed is often closed (and replaced)
 *  by the time a test looks, and a closed one answers nothing (the third probe, 2026-10-29). */
function keepPeerConnections() {
	const Native = window.RTCPeerConnection;
	if (!Native) return;
	const log: string[] = [];
	(window as unknown as { __ice: string[] }).__ice = log;
	let n = 0;
	const kind = (c: string) => {
		const f = c.split(' ');
		const addr = f[4] ?? '';
		return `${f[7] ?? '?'}/${(f[2] ?? '?').toLowerCase()}/${addr.includes(':') ? 'v6' : addr.endsWith('.local') ? 'mdns' : /^127\./.test(addr) ? 'lo' : addr ? 'v4' : '?'}`;
	};
	// biome-ignore lint/complexity/useArrowFunction: it is called with `new`, which an arrow cannot be.
	const Spy = function (...a: ConstructorParameters<typeof RTCPeerConnection>) {
		const pc = new Native(...a);
		const id = ++n;
		log.push(`pc${id} new`);
		pc.addEventListener('icecandidate', (e) => log.push(`pc${id} local ${e.candidate?.candidate ? kind(e.candidate.candidate) : 'end'}`));
		pc.addEventListener('iceconnectionstatechange', () => log.push(`pc${id} ice ${pc.iceConnectionState}`));
		pc.addEventListener('icegatheringstatechange', () => log.push(`pc${id} gathering ${pc.iceGatheringState}`));
		const add = pc.addIceCandidate.bind(pc);
		pc.addIceCandidate = ((c?: RTCIceCandidateInit) => {
			log.push(`pc${id} remote ${c?.candidate ? kind(c.candidate) : 'end'}`);
			return add(c as RTCIceCandidateInit);
		}) as typeof pc.addIceCandidate;
		const setRemote = pc.setRemoteDescription.bind(pc);
		pc.setRemoteDescription = ((d: RTCSessionDescriptionInit) => {
			const cands = (d?.sdp ?? '').split(/\r?\n/).filter((l) => l.startsWith('a=candidate:')).map((l) => kind(l.slice(2)));
			log.push(`pc${id} remote ${d?.type} sdp [${cands.join(',') || 'no candidates'}]`);
			return setRemote(d);
		}) as typeof pc.setRemoteDescription;
		return pc;
	} as unknown as typeof RTCPeerConnection;
	Spy.prototype = Native.prototype;
	window.RTCPeerConnection = Spy;
}

/** What the page's peer connections did with ICE, from `keepPeerConnections`'s log. */
function iceReport(page: Page): Promise<string> {
	return page
		.evaluate(() => {
			const log = (window as unknown as { __ice?: string[] }).__ice ?? [];
			// The tail is what failed; a long run of retries would bury it.
			return log.length > 60 ? `${log.length} lines, last 60: ${log.slice(-60).join('; ')}` : log.join('; ') || 'no peer connections';
		})
		.catch((e) => `unreadable (${(e as Error).message})`);
}

/** Two browsers in one live session: the host starts it with DECK, the guest knocks, the host admits. */
async function liveSession(browser: Browser, info: TestInfo): Promise<Pair> {
	const relay = localRelay();
	// The project's own box: WebKit runs at the tablet box its project exists for.
	const opts = { baseURL: info.project.use.baseURL, viewport: info.project.use.viewport ?? { width: 1440, height: 900 } };
	const hctx = await browser.newContext(opts);
	const gctx = await browser.newContext(opts);
	open.push(hctx, gctx);
	await relay.attach(hctx);
	await relay.attach(gctx);
	// Keep every peer connection the pages make, so a failed connection can say why (below).
	for (const c of [hctx, gctx]) await c.addInitScript(keepPeerConnections);
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
	await guest
		.locator('#live-lobby-name')
		.fill('Guest', { timeout: 60_000 })
		.catch(async (e) => {
			// The guest never reached the host. Name what each side's ICE did, so a red run on a CI
			// runner explains itself instead of needing another round to find out.
			throw new Error(`${(e as Error).message}\n  host ICE: ${await iceReport(host)}\n  guest ICE: ${await iceReport(guest)}`);
		});
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

	test('a settings write is undone by the person who made it, past a newer edit of the other person', async ({ browser }, info) => {
		const pair = await liveSession(await sessionBrowser(browser), info);
		const { host, guest } = pair;
		expect(pair.relayed(), 'witness: the session signaled through the local relay').toBeGreaterThan(0);

		// The host renames the deck: a settings write, through the settings funnel to the shared text.
		host.once('dialog', (d) => d.accept('Renamed live'));
		await host.locator('header').getByRole('button', { name: /^Live deck/ }).first().click();
		await host.getByRole('menuitem', { name: /^Rename/ }).click();
		await bothHold(pair, (s) => s.includes('# Renamed live'), 'the rename crossed');

		// Then the guest edits, so the guest's change is the NEWEST in the deck: an undo that took
		// anyone's newest change would take this one. One insert, one transaction, so the undo
		// manager's 500 ms capture window cannot split it on a slow runner.
		await guest.locator('.cm-content').first().click();
		await guest.keyboard.press('ControlOrMeta+End');
		await guest.keyboard.insertText('\nGuest line.');
		await bothHold(pair, (s) => s.includes('Guest line.') && s.includes('# Renamed live'), 'the guest edit crossed');

		// The chord with focus on the Studio chrome (the Deck scope launcher, outside every editor):
		// the session's undo takes back the host's rename, and the guest's newer edit stays.
		const launcher = host.locator('nav[aria-label="Studio panels"]').getByRole('button', { name: 'Deck scope' }).first();
		await launcher.focus();
		expect(await host.evaluate(() => !!document.activeElement?.closest('nav[aria-label="Studio panels"]') && !document.activeElement?.closest('[data-filo-owned]')), 'witness: focus is on the chrome, outside every editor').toBe(true);
		await undoChord(host);
		await bothHold(pair, (s) => s.includes('# Live deck') && !s.includes('Renamed live') && s.includes('Guest line.'), "the host's undo took the wrong change");

		// The guest's undo takes its own edit, and never the host's rename back.
		await guest.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
		await undoChord(guest);
		await bothHold(pair, (s) => s === DECK, "the guest's undo did not restore the deck");
	});

		test("Compose's pill undoes each person's own edit, and only theirs", async ({ browser }, info) => {
		const pair = await liveSession(await sessionBrowser(browser), info);
		const { host, guest } = pair;
		await openCompose(host);
		await openCompose(guest);

		await caretInCompose(host, 2);
		await host.keyboard.insertText(' HOSTPILL');
		await bothHold(pair, (s) => s.includes('Body three. HOSTPILL'), 'the host edit crossed');
		await caretInCompose(guest, 0);
		await guest.keyboard.insertText(' GUESTPILL');
		await bothHold(pair, (s) => s.includes('Body one. GUESTPILL') && s.includes('HOSTPILL'), 'the guest edit crossed');

		// The host's pill: its own edit goes on both sides, the guest's stays.
		await caretInCompose(host, 2);
		const hostUndo = host.locator('.cs-slide-active').getByRole('button', { name: 'Undo' });
		await expect(hostUndo, 'the pill offers Undo in a session').toBeEnabled();
		await hostUndo.click();
		await bothHold(pair, (s) => !s.includes('HOSTPILL') && s.includes('GUESTPILL'), "the host's pill undid the wrong edit");
		await expect(host.locator('.cs-host .cs-slide').nth(2), 'Compose shows the undo at once').not.toContainText('HOSTPILL');

		// The host edits again, so the HOST's change is now the newest. The guest's pill takes the
		// guest's own edit, past it.
		await caretInCompose(host, 2);
		await host.keyboard.insertText(' HOSTAGAIN');
		await bothHold(pair, (s) => s.includes('HOSTAGAIN') && s.includes('GUESTPILL'), 'the second host edit crossed');
		await caretInCompose(guest, 0);
		await guest.locator('.cs-slide-active').getByRole('button', { name: 'Undo' }).click();
		await bothHold(pair, (s) => !s.includes('GUESTPILL') && s.includes('HOSTAGAIN'), "the guest's pill undid the wrong edit");
		await expect(guest.locator('.cs-host .cs-slide').first()).not.toContainText('GUESTPILL');

		// The host's pill once more, and the deck is back where the session started.
		await caretInCompose(host, 2);
		await host.locator('.cs-slide-active').getByRole('button', { name: 'Undo' }).click();
		await bothHold(pair, (s) => s === DECK, "the host's second undo did not restore the deck");
	});
});
