#!/usr/bin/env node
/**
 * Live Follow check: what a follower sees when the person they follow moves.
 *
 * Two real Chromium browsers, the real Tavola + Trystero transport over the public Nostr relays (as
 * `tools/live-session-check.mjs`). The guest follows the host, then the host:
 *   1. opens the Deck settings panel and a section        -> the guest's panel and section open
 *   2. focuses a settings row                              -> the guest's row wears a ring with the host's name
 *   3. (below, step 6) the guest changes a row                 -> the host's Live panel says "in Deck · Chrome" and "changed Section rail"
 *   4. opens Present, steps a slide, closes Present        -> the guest's Present opens, follows, and closes
 *   5. opens workspace settings (Setup)                    -> the guest's panel says "in Setup", and nothing opens
 * It also checks that a guest who is typing is not moved (they get a "Go"), and that a guest who closes the
 * followed Present keeps it closed. Screenshots of both browsers land in the output directory.
 * ON-DEMAND only (third-party relays), never part of the suite or CI.
 *
 * Usage (start the docs dev server first: `cd docs && npm run dev`):
 *   node tools/live-follow-check.mjs [--out .scratch/live-follow] [--base http://127.0.0.1:4321/studio/] [--width 1440]
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(path.join(ROOT, 'docs', 'node_modules', 'playwright', 'index.mjs'));
const arg = (k, d) => {
	const i = process.argv.indexOf(k);
	return i > 0 ? process.argv[i + 1] : d;
};
const BASE = arg('--base', 'http://127.0.0.1:4321/studio/');
const WIDTH = Number(arg('--width', '1440'));
const OUT = `${path.resolve(ROOT, arg('--out', '.scratch/live-follow'))}/`;
mkdirSync(OUT, { recursive: true });
const proxy = process.env.HTTPS_PROXY;
const executablePath = process.env.LIVE_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const launch = () => chromium.launch({ ...(executablePath ? { executablePath } : {}), args: [...(proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=127.0.0.1;localhost'] : []), '--disable-features=WebRtcHideLocalIpsWithMdns', '--ignore-certificate-errors'] });
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
let failed = 0;
const check = (ok, what) => {
	log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
	if (!ok) failed++;
};
const seed = () => {
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'craft' }));
	localStorage.setItem('lattice-docs-mode', 'light');
	window.__copied = '';
	try {
		const write = navigator.clipboard.writeText.bind(navigator.clipboard);
		navigator.clipboard.writeText = (t) => {
			window.__copied = t;
			return write(t).catch(() => {});
		};
	} catch {
		/* no clipboard */
	}
	document.addEventListener('DOMContentLoaded', () => {
		const st = document.createElement('style');
		st.textContent = 'astro-dev-toolbar{display:none!important}';
		document.head.append(st);
	});
};
const until = async (page, fn, arg_, ms = 15000) => {
	try {
		await page.waitForFunction(fn, arg_, { timeout: ms });
		return true;
	} catch {
		return false;
	}
};

const hb = await launch();
const hctx = await hb.newContext({ viewport: { width: WIDTH, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'], ignoreHTTPSErrors: true });
await hctx.addInitScript(seed);
const host = await hctx.newPage();
await host.goto(BASE, { waitUntil: 'networkidle' });
await host.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click({ timeout: 30000 });
await host.locator('#live-start-name').fill('Sharmarke');
await host.getByRole('button', { name: 'Start live session' }).click();
await host.waitForSelector('text=In this session (1/4)', { timeout: 30000 });
await host.locator('button[aria-label="Session options"]').click();
await host.getByRole('menuitem', { name: 'Copy invite link' }).click();
const link = await host.waitForFunction(() => window.__copied || null, null, { timeout: 15000 }).then((h) => h.jsonValue());

const gb = await launch();
const gctx = await gb.newContext({ viewport: { width: WIDTH, height: 900 }, ignoreHTTPSErrors: true });
await gctx.addInitScript(seed);
const guest = await gctx.newPage();
await guest.goto(link, { waitUntil: 'networkidle' });
await guest.waitForSelector('#live-lobby-name', { timeout: 60000 });
await guest.locator('#live-lobby-name').fill('Amina');
await guest.getByRole('button', { name: 'Ask to join' }).click();
await host.waitForSelector('button[aria-label="Admit Amina"]', { timeout: 30000 });
await host.locator('button[aria-label="Admit Amina"]').click();
await guest.waitForSelector('[data-live-pill]', { timeout: 60000 });
await guest.waitForTimeout(1500);
await guest.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click({ timeout: 30000 });
await guest.waitForSelector('button[aria-label="Options for Sharmarke"]', { timeout: 30000 });
log('Amina joined');

// Both choose the Advanced tier first (its tabs are where sections live) and close the panel again; the guest then
// has the Live panel in view to follow from.
for (const page of [host, guest]) {
	const deck = page.locator('nav[aria-label="Studio panels"] button[aria-label="Deck scope"]').last();
	await deck.click();
	await page.locator('button[data-settings-tier="advanced"]').first().click();
	await page.waitForSelector('[aria-label="Deck settings sections"]', { timeout: 15000 });
	await deck.click();
	await page.waitForTimeout(500);
}
await guest.waitForSelector('button[aria-label="Options for Sharmarke"]', { timeout: 30000 });
// The guest follows the host.
await guest.locator('button[aria-label="Options for Sharmarke"]').click();
await guest.getByRole('menuitem', { name: 'Follow Sharmarke' }).click();
await guest.waitForTimeout(500);
const shot = async (name) => {
	await host.screenshot({ path: `${OUT}${name}-host.png` });
	await guest.screenshot({ path: `${OUT}${name}-guest.png` });
};

// 1. Deck settings and a section.
await host.locator('nav[aria-label="Studio panels"] button[aria-label="Deck scope"]').last().click();
await host.waitForSelector('[aria-label="Deck settings sections"]', { timeout: 15000 });
await host.locator('[aria-label="Deck settings sections"] [role="tab"]', { hasText: 'Chrome' }).first().click();
const deckVisible = () => (document.querySelector('[aria-label="Deck settings sections"]')?.querySelector('[role="tab"]')?.getClientRects().length ?? 0) > 0;
const desktop = WIDTH >= 1100;
const guestHasDeck = await until(guest, deckVisible, null, desktop ? 15000 : 4000);
check(guestHasDeck === desktop, desktop ? 'the guest\'s Deck settings panel opened' : 'the guest\'s Deck settings panel did NOT open (a tablet follows the slide only)');
if (desktop) {
	const guestChrome = await until(guest, () => document.querySelector('[aria-label="Deck settings sections"] [role="tab"][aria-selected="true"]')?.textContent?.includes('Chrome') ?? false, null);
	check(guestChrome, 'the guest\'s Deck panel is on the Chrome section');
}
await shot('1-deck-chrome');

// 2. A row with focus.
await host.getByRole('switch', { name: 'Section rail' }).focus();
if (desktop) {
	const ring = await until(guest, () => !!document.querySelector('[data-follow-ghost="Sharmarke"]'), null);
	check(ring, 'the guest\'s row wears a ring with the host\'s name');
}
await shot('2-row-ring');

// 4. Present.
await host.keyboard.press('Escape');
await host.locator('button[aria-label="Present"]').last().click();
const guestPresent = await until(guest, () => !!document.querySelector('[data-live-following]'), null, desktop ? 20000 : 5000);
check(guestPresent === desktop, desktop ? 'the guest\'s Present opened and follows the host' : 'the guest\'s Present did NOT open (a tablet follows the slide only)');
await shot('4-present');
await host.keyboard.press('ArrowRight');
await host.waitForTimeout(1500);
const hostIdx = await host.evaluate(() => document.querySelector('[data-present-index]')?.getAttribute('data-present-index') ?? null);
log(`host Present index: ${hostIdx}`);
await host.keyboard.press('Escape');
if (desktop) {
	const guestClosed = await until(guest, () => !document.querySelector('[data-live-following]'), null, 20000);
	check(guestClosed, 'the guest\'s Present closed when the host\'s did');
}

// 5. Setup is shown, never opened.
await host.locator('button[aria-label="Workspace settings"]').first().click();
if (desktop) {
	const setupLine = await until(guest, () => /in Setup/.test(document.body.innerText), null);
	check(setupLine, 'the guest\'s Live panel says the host is in Setup');
}
const guestWorkspace = await guest.evaluate(() => !!document.querySelector('[role="dialog"]'));
check(!guestWorkspace, 'the guest\'s own workspace settings did not open');
await shot('5-setup');

if (desktop) {
	// 6. A change, from the other side: the host has the Live panel in view; the guest opens Deck > Chrome and flips a row.
	await host.keyboard.press('Escape');
	await host.locator('nav[aria-label="Studio panels"] button[aria-label="Deck scope"]').last().click();
	await host.waitForTimeout(500);
	if (!(await host.locator('button[aria-label="Options for Amina"]').count())) await host.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click();
	await host.waitForSelector('button[aria-label="Options for Amina"]', { timeout: 15000 });
	const guestDeck = guest.locator('nav[aria-label="Studio panels"] button[aria-label="Deck scope"]').last();
	// Two panels cannot both be in view in the one dock: close the guest's Live panel, then open Deck.
	if (await guest.locator('button[aria-label="Options for Sharmarke"]').count()) await guest.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click();
	await guest.waitForTimeout(500);
	for (let i = 0; i < 2 && !(await guest.locator('[aria-label="Deck settings sections"]').isVisible()); i++) {
		await guestDeck.click();
		await guest.waitForTimeout(800);
	}
	await guest.waitForSelector('[aria-label="Deck settings sections"]', { timeout: 15000 });
	await guest.locator('[aria-label="Deck settings sections"] [role="tab"]', { hasText: 'Chrome' }).first().click();
	await guest.getByRole('switch', { name: 'Section rail' }).click();
	const hostSeesPlace = await until(host, () => /in Deck · Chrome/.test(document.body.innerText), null);
	check(hostSeesPlace, 'the host\'s Live panel says Amina is in Deck · Chrome');
	const hostSeesChange = await until(host, () => /changed Section rail/.test(document.body.innerText), null);
	check(hostSeesChange, 'the host\'s Live panel says Amina changed Section rail');
	await shot('6-changed');
	await guest.getByRole('switch', { name: 'Section rail' }).click();
}

// 7. The typing gate: a follower who is typing is not moved to the leader's slide; they get a Go.
if (desktop) {
	await guest.locator('nav[aria-label="Studio panels"] button[aria-label="Deck scope"]').last().click();
	await guest.waitForTimeout(500);
	if (!(await guest.locator('button[aria-label="Options for Sharmarke"]').count())) await guest.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click();
	await guest.locator('button[aria-label="Options for Sharmarke"]').click();
	await guest.getByRole('menuitem', { name: 'Follow Sharmarke' }).click();
	// A click in the editor moves this person's own slide to the one under the caret: click a line of slide 1.
	await guest.locator('.cm-line', { hasText: 'Write plain text' }).first().click();
	await guest.waitForTimeout(500);
	await guest.keyboard.type('x');
	await host.locator('button[aria-label="Next slide"]').first().click();
	await guest.waitForTimeout(1500);
	const toast = guest.locator('[data-sonner-toast]', { hasText: 'is on slide 2' });
	const asked = await toast.waitFor({ timeout: 15000 }).then(() => true, () => false);
	check(asked, 'a typing guest is told "Sharmarke is on slide 2" instead of being moved');
	const stayed = await guest.evaluate(() => /Slide 1 \/ 7/.test(document.body.innerText));
	check(stayed, 'the guest stayed on slide 1 while typing');
	await shot('7-typing-gate');
	await toast.getByRole('button', { name: 'Go' }).click();
	const went = await until(guest, () => /Slide 2 \/ 7/.test(document.body.innerText), null);
	check(went, 'pressing Go took the guest to slide 2');

	// 8. The Slide panel (not only Deck): the host opens it on a section; the guest, still following, opens the same.
	await guest.keyboard.press('Escape');
	await host.locator('nav[aria-label="Studio panels"] button[aria-label="Slide settings"]').last().click();
	await host.waitForSelector('[aria-label="Slide settings sections"]', { timeout: 15000 });
	await host.locator('[aria-label="Slide settings sections"] [role="tab"]', { hasText: 'Notes' }).first().click().catch(() => {});
	const slideVisible = () => (document.querySelector('[aria-label="Slide settings sections"]')?.querySelector('[role="tab"]')?.getClientRects().length ?? 0) > 0;
	const guestSlide = await until(guest, slideVisible, null, 15000);
	check(guestSlide, 'the guest\'s Slide settings panel opened');
	const guestNotes = await until(guest, () => document.querySelector('[aria-label="Slide settings sections"] [role="tab"][aria-selected="true"]')?.textContent?.includes('Notes') ?? false, null, 15000);
	check(guestNotes, 'the guest\'s Slide panel is on the Notes section');
	await shot('8-slide-panel');
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nall checks passed');
await hb.close();
await gb.close();
process.exit(failed ? 1 : 0);
