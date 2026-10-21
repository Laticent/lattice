#!/usr/bin/env node
/**
 * Live knock-toast check: the host's "wants to join" toast closes the moment the knock is admitted from the panel.
 *
 * Two real Chromium browsers, the real Tavola + Trystero transport over the public Nostr relays (as
 * `tools/live-session-check.mjs`). The guest knocks; the host's toast "Amina wants to join · Admit" shows; the host
 * admits from the Live panel (not the toast); the toast must be gone at once. Screenshots before and after land in
 * the output directory. ON-DEMAND only (third-party relays), never part of the suite or CI.
 *
 * Usage (start the docs dev server first: `cd docs && npm run dev`):
 *   node tools/live-knock-toast-check.mjs [--out .scratch/live-knock-toast] [--base http://127.0.0.1:4321/studio/]
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
const OUT = `${path.resolve(ROOT, arg('--out', '.scratch/live-knock-toast'))}/`;
mkdirSync(OUT, { recursive: true });
const proxy = process.env.HTTPS_PROXY;
const executablePath = process.env.LIVE_CHROMIUM ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const launch = () => chromium.launch({ ...(executablePath ? { executablePath } : {}), args: [...(proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=127.0.0.1;localhost'] : []), '--disable-features=WebRtcHideLocalIpsWithMdns'] });
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
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

const hb = await launch();
const hctx = await hb.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
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
const gctx = await gb.newContext({ viewport: { width: 1440, height: 900 } });
await gctx.addInitScript(seed);
const guest = await gctx.newPage();
await guest.goto(link, { waitUntil: 'networkidle' });
await guest.waitForSelector('#live-lobby-name', { timeout: 60000 });
await guest.locator('#live-lobby-name').fill('Amina');
await guest.getByRole('button', { name: 'Ask to join' }).click();
await host.waitForSelector('button[aria-label="Admit Amina"]', { timeout: 30000 });

const toast = host.locator('[data-sonner-toast]', { hasText: 'Amina wants to join' });
await toast.waitFor({ timeout: 10000 });
log('toast shown: "Amina wants to join"');
await host.waitForTimeout(700);
await host.screenshot({ path: `${OUT}toast-shown.png` });

// Admit from the panel row, not from the toast.
await host.locator('[data-live-panel] button[aria-label="Admit Amina"]').click();
await guest.waitForSelector('[data-live-pill]', { timeout: 30000 });
const t1 = Date.now();
await toast.waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
const gone = (await toast.count()) === 0;
log(`toast gone ${Date.now() - t1} ms after the guest was bound: ${gone}`);
await host.waitForTimeout(500);
await host.screenshot({ path: `${OUT}toast-gone.png` });
if (!gone) {
	console.log('FAIL: the toast is still on screen after the panel admit');
	process.exitCode = 1;
}
await hb.close();
await gb.close();
console.log(process.exitCode ? 'RESULT: FAIL' : 'RESULT: PASS');
