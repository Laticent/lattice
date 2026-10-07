#!/usr/bin/env node
/**
 * Live-session check: drives a REAL two-browser Live session in the Studio, end to end.
 *
 * Two separate headless Chromium processes, the real Tavola + Trystero transport, the public
 * Nostr relays and real WebRTC — no mocks. The host starts a session and copies the link; the
 * guest opens it, waits in the lobby, knocks; the host admits; both type in the editor and see
 * each other's edits and carets; the guest undoes only its own edit; chat crosses; the host
 * removes the guest, whose copy of the deck stays; a second guest joins, both sides reload; then the
 * host's tab closes and the second guest takes over as host after the grace period, lets a third
 * person in, and ends the session. Each step logs its elapsed time, and the
 * screenshots land in the output directory.
 *
 * It reaches third-party relays, so it is ON-DEMAND only and never part of the test suite or CI
 * (engineering/decisions/2026-10-06-studio-live-collaboration.md §8).
 *
 * Keep the output as the run's evidence: `node tools/live-session-check.mjs light | tee <out>/check.log`.
 *
 * Usage (start the docs dev server first: `cd docs && npm run dev`):
 *   node tools/live-session-check.mjs [light|dark] [--out .scratch/live-check] [--base http://127.0.0.1:4321/studio/] [--video]
 *
 * `--video` records each browser to a .webm in the output directory (the walkthrough evidence).
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(path.join(ROOT, 'docs', 'node_modules', 'playwright', 'index.mjs'));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://127.0.0.1:4321/studio/');
const OUT = `${path.resolve(ROOT, arg('--out', '.scratch/live-check'))}/`;
mkdirSync(OUT, { recursive: true });
const proxy = process.env.HTTPS_PROXY;
// The cloud sandbox ships Chromium at /opt/pw-browsers; elsewhere Playwright finds its own.
const executablePath = process.env.LIVE_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const launch = () => chromium.launch({ ...(executablePath ? { executablePath } : {}), args: [...(proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=127.0.0.1;localhost'] : []), '--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const seedFn = (m) => {
  localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'craft' }));
  localStorage.setItem('lattice-docs-mode', m);
  // Keep every RTCPeerConnection the page makes, so the check can report which network path the
  // connection actually took (host / srflx / relay) instead of only that it worked.
  const Native = window.RTCPeerConnection;
  window.__livePcs = [];
  // `__rtcBlocked` stands in for a phone losing its network: a connection made meanwhile finds no
  // route (no ICE servers, relay-only), so it fails the way it would offline, and the library retries.
  // biome-ignore lint/complexity/useArrowFunction: it is called with `new`, which an arrow cannot be.
  window.RTCPeerConnection = function (...a) { if (window.__rtcBlocked) a[0] = { ...(a[0] ?? {}), iceServers: [], iceTransportPolicy: 'relay' }; const pc = new Native(...a); window.__livePcs.push(pc); return pc; };
  window.RTCPeerConnection.prototype = Native.prototype;
};
/** The candidate types of every connected pair on `page`, e.g. ["srflx→srflx (udp)"]. */
const pathsOf = (page) => page.evaluate(async () => {
  const out = [];
  for (const pc of window.__livePcs ?? []) {
    if (pc.connectionState !== 'connected') continue;
    const stats = [...(await pc.getStats()).values()];
    const byId = new Map(stats.map((s) => [s.id, s]));
    const pair = stats.find((s) => s.type === 'candidate-pair' && s.state === 'succeeded' && s.nominated);
    if (!pair) continue;
    const l = byId.get(pair.localCandidateId);
    const r = byId.get(pair.remoteCandidateId);
    out.push(`${l?.candidateType}→${r?.candidateType} (${l?.protocol})`);
  }
  return out;
});
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const mode = process.argv[2] === 'dark' ? 'dark' : 'light';
const video = process.argv.includes('--video') ? { recordVideo: { dir: OUT, size: { width: 1440, height: 900 } } } : {};

const hb = await launch();
const hctx = await hb.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write', 'microphone'], ...video });
await hctx.addInitScript(seedFn, mode);
const host = await hctx.newPage();
host.on('pageerror', (e) => log(`host pageerror ${e.message}`));
await host.goto(BASE, { waitUntil: 'networkidle' });
await host.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click({ timeout: 30000 });
await host.locator('#live-start-name').fill('Sharmarke');
await host.getByRole('button', { name: 'Start live session' }).click();
await host.waitForSelector('text=In this session (1/4)', { timeout: 30000 });
// The clipboard read in headless Chromium sometimes comes back empty; the panel shows the same link.
const link = (await host.evaluate(() => navigator.clipboard.readText()).catch(() => '')) || (await host.locator('input[aria-label="Invite link"]').inputValue());
log(`host live; link ${link.replace(/(#live=[^.]+)\.[^.]+\./, '$1.<secret>.')}`);
await host.screenshot({ path: `${OUT}real-host-start-${mode}.png` });

const gb = await launch();
const gctx = await gb.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'], ...video });
await gctx.addInitScript(seedFn, mode);
const guest = await gctx.newPage();
guest.on('pageerror', (e) => log(`guest pageerror ${e.message}`));
const tOpen = Date.now();
await guest.goto(link, { waitUntil: 'networkidle' });
await guest.waitForSelector('#live-lobby-name', { timeout: 60000 });
log(`guest lobby ready after ${Date.now() - tOpen} ms; url now ${guest.url()}`);
await guest.locator('#live-lobby-name').fill('Amina');
await guest.screenshot({ path: `${OUT}real-lobby-${mode}.png` });
await guest.getByRole('button', { name: 'Ask to join' }).click();
await host.waitForSelector('button[aria-label="Admit Amina"]', { timeout: 30000 });
log('host sees the knock');
await host.screenshot({ path: `${OUT}real-knock-${mode}.png` });
await host.locator('button[aria-label="Admit Amina"]').click();
await guest.waitForSelector('[data-live-pill]', { timeout: 30000 });
log(`guest admitted and bound after ${Date.now() - tOpen} ms from opening the link`);
log(`network path (guest's connections): ${JSON.stringify(await pathsOf(guest))}`);
await guest.waitForTimeout(1500);

// Guest types in the editor; the host must see it.
const gEditor = guest.locator('.cm-content').first();
await gEditor.click();
await guest.keyboard.press('Control+Home');
await guest.keyboard.type('<!-- hello from Amina -->\n');
await host.waitForFunction(() => document.querySelector('.cm-content')?.textContent?.includes('hello from Amina'), null, { timeout: 15000 });
log('host editor shows the guest edit');
// Host types; the guest must see it.
const hEditor = host.locator('.cm-content').first();
await hEditor.click();
await host.keyboard.press('Control+Home');
await host.keyboard.type('<!-- reply from Sharmarke -->\n');
await guest.waitForFunction(() => document.querySelector('.cm-content')?.textContent?.includes('reply from Sharmarke'), null, { timeout: 15000 });
log('guest editor shows the host edit');
log(`guest sees ${await guest.locator('.cm-ySelectionCaret').count()} remote caret(s); host sees ${await host.locator('.cm-ySelectionCaret').count()}`);
// Undo on the guest must undo only the guest's own edit.
await gEditor.click();
for (let i = 0; i < 12; i++) {
  await guest.keyboard.press('Control+z');
  await guest.waitForTimeout(150);
  if (!(await guest.evaluate(() => document.querySelector('.cm-content')?.textContent ?? '')).includes('hello from Amina')) break;
}
await guest.waitForTimeout(800);
log('guest top lines after undo: ' + JSON.stringify((await guest.evaluate(() => [...document.querySelectorAll('.cm-line')].slice(0, 3).map((l) => l.textContent))).join(' | ')));
const gText = await guest.evaluate(() => document.querySelector('.cm-content')?.textContent ?? '');
log(`guest undo: own edit gone=${!gText.includes('hello from Amina')} host edit kept=${gText.includes('reply from Sharmarke')}`);
await guest.waitForTimeout(800);
await host.waitForFunction(() => !document.querySelector('.cm-content')?.textContent?.includes('hello from Amina'), null, { timeout: 10000 });
log('the guest undo reached the host too');

// Chat.
await guest.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click();
await guest.locator('textarea[aria-label="Message everyone"]').fill('Can we cut slide 5?');
await guest.keyboard.press('Enter');
await host.waitForSelector('text=Can we cut', { timeout: 15000 });
log('host sees the chat message');
const carets = await host.locator('.cm-ySelectionCaret').count();
log(`host sees ${carets} remote caret(s)`);
// The panel's own readout (what the owner screenshots on two real devices): it must agree with stats.
await host.waitForSelector('[data-live-link]', { timeout: 15000 });
const readout = (page) => page.locator('[data-live-link]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
log(`panel connection readout: host=${JSON.stringify(await readout(host))} guest=${JSON.stringify(await readout(guest))}`);
await host.locator('button[aria-label="Options for Amina"]').click();
await host.waitForSelector('[data-live-link-detail]');
await host.waitForTimeout(400);
await host.screenshot({ path: `${OUT}real-connection-${mode}.png` });
await host.keyboard.press('Escape');
await host.screenshot({ path: `${OUT}real-host-live-${mode}.png` });
await guest.screenshot({ path: `${OUT}real-guest-live-${mode}.png` });

// Audio (S4), with Chromium's fake microphone (a periodic beep): both join, each hears the other,
// the speaking ring follows the beep, mute stops it, and the bitrate is measured.
const panel = (page) => page.locator('[data-live-panel]');
await panel(guest).getByRole('button', { name: 'Join with audio' }).click();
await panel(host).getByRole('button', { name: 'Join with audio' }).click();
await host.waitForSelector('[data-live-call]', { timeout: 20000 });
await guest.waitForSelector('audio[data-live-audio]', { state: 'attached', timeout: 20000 });
await host.waitForSelector('audio[data-live-audio]', { state: 'attached', timeout: 20000 });
log(`audio: both in the call; playing elements host=${await host.locator('audio[data-live-audio]').count()} guest=${await guest.locator('audio[data-live-audio]').count()}`);
// The ring on the OTHER person's row: a remote stream measured here, not this page's own microphone.
const ringOn = (page, name) => page.waitForFunction((n) => [...document.querySelectorAll('[data-live-panel] li[data-live-speaking="true"]')].some((li) => li.textContent?.includes(n) && !li.textContent.includes('(you)')), name, { timeout: 15000 }).then(() => true, () => false);
log(`speaking ring on the other person's row: host sees Amina's=${await ringOn(host, 'Amina')} guest sees Sharmarke's=${await ringOn(guest, 'Sharmarke')}`);
const micOf = (page, name) => page.evaluate((n) => [...document.querySelectorAll('[data-live-panel] li')].find((li) => li.textContent?.includes(n) && !li.textContent.includes('(you)'))?.querySelector('[aria-label="Mic on"], [aria-label="Muted"]')?.getAttribute('aria-label') ?? 'not on the call', name);
log(`tab title while on air: ${JSON.stringify(await host.title())}`);
await host.screenshot({ path: `${OUT}real-call-host-${mode}.png` });
await guest.screenshot({ path: `${OUT}real-call-guest-${mode}.png` });
const audioBytes = (page) => page.evaluate(async () => {
  let sent = 0;
  for (const pc of window.__livePcs ?? []) for (const st of (await pc.getStats()).values()) if (st.type === 'outbound-rtp' && st.kind === 'audio') sent += st.bytesSent;
  return sent;
});
const b0 = await audioBytes(host);
await host.waitForTimeout(10000);
const b1 = await audioBytes(host);
log(`audio bitrate, host to guest: ${(((b1 - b0) * 8) / 10 / 1000).toFixed(1)} kbit/s (${(((b1 - b0) / 10) * 3600 / 1e6).toFixed(1)} MB per hour per stream, payload + RTP headers)`);
log(`before mute, the host shows Amina's mic as: ${await micOf(host, 'Amina')}`);
await panel(guest).getByRole('button', { name: 'Mute', exact: true }).click();
await host.waitForFunction(() => [...document.querySelectorAll('[data-live-panel] li')].some((li) => li.textContent?.includes('Amina') && li.querySelector('[aria-label="Muted"]')), null, { timeout: 15000 });
log(`guest muted; the host now shows Amina's mic as: ${await micOf(host, 'Amina')}`);
await guest.getByRole('button', { name: 'Call options' }).click();
await guest.getByRole('menuitem', { name: /Leave audio/ }).click();
await host.getByRole('button', { name: 'Call options' }).click();
await host.getByRole('menuitem', { name: /Leave audio/ }).click();
log('both left the call');

// Remove the guest.
await host.locator('button[aria-label="Options for Amina"]').click();
await host.getByRole('menuitem', { name: /Remove from session/ }).click();
await guest.waitForFunction(() => !document.querySelector('[data-live-pill]'), null, { timeout: 15000 });
log('guest removed; its deck copy stays: ' + (await guest.evaluate(() => document.querySelector('.cm-content')?.textContent?.includes('reply from Sharmarke'))));

// A second guest, then the host RELOADS: the session must resume with the guest still in, and
// then the host's End must reach the guest (red-team finding 2).
const g2ctx = await gb.newContext({ viewport: { width: 1440, height: 900 } });
await g2ctx.addInitScript(seedFn, mode);
const guest2 = await g2ctx.newPage();
await guest2.goto(link, { waitUntil: 'networkidle' });
await guest2.waitForSelector('#live-lobby-name', { timeout: 60000 });
await guest2.locator('#live-lobby-name').fill('Chen');
await guest2.getByRole('button', { name: 'Ask to join' }).click();
await host.waitForSelector('button[aria-label="Admit Chen"]', { timeout: 30000 });
await host.locator('button[aria-label="Admit Chen"]').click();
await guest2.waitForSelector('[data-live-pill]', { timeout: 30000 });
log('second guest in');
// No secret at rest: the link's secret must not appear in either browser's storage (CodeQL).
const secret = link.split('#live=')[1].split('.')[1];
const leaks = async (page) => page.evaluate((sec) => [localStorage, sessionStorage].some((st) => Object.keys(st).some((k) => (st.getItem(k) ?? '').includes(sec))), secret);
log(`secret in storage: host=${await leaks(host)} guest=${await leaks(guest2)}`);
if ((await leaks(host)) || (await leaks(guest2))) throw new Error('the link secret is stored in the clear');
const tReload = Date.now();
await host.reload({ waitUntil: 'networkidle' });
await host.waitForSelector('[data-live-pill]', { timeout: 60000 });
await host.waitForFunction(() => document.querySelector('[data-live-pill] button')?.getAttribute('aria-label')?.includes('Chen'), null, { timeout: 60000 });
log(`host reloaded and the session resumed with Chen in, after ${Date.now() - tReload} ms`);
await host.locator('.cm-content').first().click();
await host.keyboard.press('Control+Home');
await host.keyboard.type('<!-- after reload -->\n');
await guest2.waitForFunction(() => document.querySelector('.cm-content')?.textContent?.includes('after reload'), null, { timeout: 20000 });
log('guest sees the reloaded host typing');
const tGuestReload = Date.now();
await guest2.reload({ waitUntil: 'networkidle' });
await guest2.waitForSelector('[data-live-pill]', { timeout: 60000 });
log(`guest reloaded and rejoined without a knock, after ${Date.now() - tGuestReload} ms`);
// Regency: the host's network drops (its connections close, and no new one can form), so Chen, the
// heir, hosts; a line is written meanwhile; the network comes back and the host takes the session
// back, with the line.
await host.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click();
await host.waitForSelector('[data-live-heir]', { timeout: 30000 });
await host.evaluate(() => { window.__rtcBlocked = true; for (const pc of window.__livePcs ?? []) pc.close(); });
const tDrop = Date.now();
await guest2.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click();
await guest2.waitForSelector('input[aria-label="Invite link"]', { timeout: 90000 });
log(`regency: host's network down; Chen hosts ${Date.now() - tDrop} ms later`);
await guest2.locator('textarea[aria-label="Message everyone"]').fill('said during the regency');
await guest2.keyboard.press('Enter');
await guest2.waitForTimeout(1000);
await host.evaluate(() => { window.__rtcBlocked = false; });
const tBack = Date.now();
await guest2.waitForFunction(() => !document.querySelector('input[aria-label="Invite link"]') && document.body.textContent.includes('no longer hosting'), null, { timeout: 150000 });
await host.waitForSelector('text=said during the regency', { timeout: 30000 });
log(`regency: the host is back and hosting ${Date.now() - tBack} ms after its network returned, with the regency's chat line`);
await host.screenshot({ path: `${OUT}real-reclaim-host-${mode}.png` });
await guest2.screenshot({ path: `${OUT}real-reclaim-guest-${mode}.png` });
await guest2.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click();

// Host handoff: the host's tab closes for good. Chen is the heir (the first editor); after the grace
// period Chen hosts, and a newcomer can knock and be let in by Chen.
await guest2.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click();
await guest2.waitForSelector('[data-live-panel]', { timeout: 15000 });
const tClose = Date.now();
await hctx.close();
await guest2.waitForSelector('[data-live-away-note]', { timeout: 30000 });
log(`host tab closed; Chen sees: ${JSON.stringify(await guest2.locator('[data-live-away-note]').textContent())}`);
await guest2.screenshot({ path: `${OUT}real-host-away-${mode}.png` });
await guest2.waitForSelector('input[aria-label="Invite link"]', { timeout: 60000 });
log(`Chen hosts now, ${Date.now() - tClose} ms after the host's tab closed`);
await guest2.screenshot({ path: `${OUT}real-took-over-${mode}.png` });
const g3ctx = await gb.newContext({ viewport: { width: 1440, height: 900 } });
await g3ctx.addInitScript(seedFn, mode);
const guest3 = await g3ctx.newPage();
await guest3.goto(link, { waitUntil: 'networkidle' });
await guest3.waitForSelector('#live-lobby-name', { timeout: 60000 });
await guest3.locator('#live-lobby-name').fill('Dana');
await guest3.getByRole('button', { name: 'Ask to join' }).click();
await guest2.waitForSelector('button[aria-label="Admit Dana"]', { timeout: 30000 });
await guest2.locator('button[aria-label="Admit Dana"]').click();
await guest3.waitForSelector('[data-live-pill]', { timeout: 30000 });
await guest2.locator('.cm-content').first().click();
await guest2.keyboard.press('Control+Home');
await guest2.keyboard.type('<!-- Chen hosting -->\n');
await guest3.waitForFunction(() => document.querySelector('.cm-content')?.textContent?.includes('Chen hosting'), null, { timeout: 20000 });
log('a newcomer knocked at the new host, was let in, and sees its edits');
await guest2.locator('button[aria-label="Session options"]').click();
await guest2.getByRole('menuitem', { name: /End session for everyone/ }).click();
await guest3.waitForFunction(() => !document.querySelector('[data-live-pill]'), null, { timeout: 15000 });
log('the new host ended the session and the newcomer left it');
await g3ctx.close();
await gctx.close();
await g2ctx.close();
await hb.close();
await gb.close();
log('done');
