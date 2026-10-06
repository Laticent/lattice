#!/usr/bin/env node
/**
 * Live-session check: drives a REAL two-browser Live session in the Studio, end to end.
 *
 * Two separate headless Chromium processes, the real Tavola + Trystero transport, the public
 * Nostr relays and real WebRTC — no mocks. The host starts a session and copies the link; the
 * guest opens it, waits in the lobby, knocks; the host admits; both type in the editor and see
 * each other's edits and carets; the guest undoes only its own edit; chat crosses; the host
 * removes the guest, whose copy of the deck stays. Each step logs its elapsed time, and the
 * screenshots land in the output directory.
 *
 * It reaches third-party relays, so it is ON-DEMAND only and never part of the test suite or CI
 * (engineering/decisions/2026-10-06-studio-live-collaboration.md §8).
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
const launch = () => chromium.launch({ ...(executablePath ? { executablePath } : {}), args: [...(proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=127.0.0.1;localhost'] : []), '--disable-features=WebRtcHideLocalIpsWithMdns'] });
const seedFn = (m) => {
  localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'craft' }));
  localStorage.setItem('lattice-docs-mode', m);
  // Keep every RTCPeerConnection the page makes, so the check can report which network path the
  // connection actually took (host / srflx / relay) instead of only that it worked.
  const Native = window.RTCPeerConnection;
  window.__livePcs = [];
  // biome-ignore lint/complexity/useArrowFunction: it is called with `new`, which an arrow cannot be.
  window.RTCPeerConnection = function (...a) { const pc = new Native(...a); window.__livePcs.push(pc); return pc; };
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
const hctx = await hb.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'], ...video });
await hctx.addInitScript(seedFn, mode);
const host = await hctx.newPage();
host.on('pageerror', (e) => log(`host pageerror ${e.message}`));
await host.goto(BASE, { waitUntil: 'networkidle' });
await host.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click({ timeout: 30000 });
await host.locator('#live-start-name').fill('Sharmarke');
await host.getByRole('button', { name: 'Start live session' }).click();
await host.waitForSelector('text=In this session (1/4)', { timeout: 30000 });
const link = await host.evaluate(() => navigator.clipboard.readText());
log(`host live; link ${link.replace(/(#live=[^.]+)\.[^.]+\./, '$1.<secret>.')}`);
await host.screenshot({ path: `${OUT}real-host-start-${mode}.png` });

const gb = await launch();
const gctx = await gb.newContext({ viewport: { width: 1440, height: 900 }, ...video });
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
await host.screenshot({ path: `${OUT}real-host-live-${mode}.png` });
await guest.screenshot({ path: `${OUT}real-guest-live-${mode}.png` });

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
await host.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click();
await host.locator('button[aria-label="Session options"]').click();
await host.getByRole('menuitem', { name: /End session for everyone/ }).click();
await guest2.waitForFunction(() => !document.querySelector('[data-live-pill]'), null, { timeout: 15000 });
log('host ended the session and the guest left it');
await hctx.close();
await gctx.close();
await g2ctx.close();
await hb.close();
await gb.close();
log('done');
