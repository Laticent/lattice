// Two real browsers in a Live session: does a viewer watching slide C stay on C when the host deletes B, or adds after B?
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', '..');
const { chromium } = await import(path.join(ROOT, 'docs', 'node_modules', 'playwright', 'index.mjs'));
const BASE = process.env.BASE ?? 'http://localhost:4399/studio/';
const OUT = path.join(process.env.TMPDIR ?? '/tmp', 'live-peer-ids') + '/'; // screenshots stay out of the evidence folder
mkdirSync(OUT, { recursive: true });
const proxy = process.env.HTTPS_PROXY;
const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const launch = () => chromium.launch({ ...(executablePath ? { executablePath } : {}), args: [...(proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=127.0.0.1;localhost'] : []), '--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const seed = () => localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'craft' }));
const t0 = Date.now(); const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const DECK = '---\ntheme: indaco\n---\n\n' + ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((t) => `# ${t}\n\nBody of ${t}.`).join('\n\n---\n\n') + '\n';

const hb = await launch();
const hctx = await hb.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
await hctx.addInitScript(seed);
const host = await hctx.newPage();
await host.goto(BASE, { waitUntil: 'networkidle' });
const ed = host.locator('.cm-content').first();
await ed.click(); await host.keyboard.press('Control+A'); await host.keyboard.press('Delete'); await host.keyboard.insertText(DECK);
await host.waitForTimeout(1000);
await host.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click({ timeout: 30000 });
await host.locator('#live-start-name').fill('Host');
await host.getByRole('button', { name: 'Start live session' }).click();
await host.waitForSelector('text=In this session (1/4)', { timeout: 30000 });
const link = (await host.evaluate(() => navigator.clipboard.readText()).catch(() => '')) || (await host.locator('input[aria-label="Invite link"]').inputValue());
log('host live');

// The viewer: a phone, preview pane only (no editor caret).
const gb = await launch();
const gctx = await gb.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
await gctx.addInitScript(seed);
const guest = await gctx.newPage();
await guest.goto(link, { waitUntil: 'networkidle' });
await guest.waitForSelector('#live-lobby-name', { timeout: 60000 });
await guest.locator('#live-lobby-name').fill('Viewer');
await guest.getByRole('button', { name: 'Ask to join' }).click();
await host.waitForSelector('button[aria-label="Admit Viewer"]', { timeout: 30000 });
await host.locator('button[aria-label="Admit Viewer"]').click();
await guest.waitForSelector('[data-live-pill]', { timeout: 30000 });
log('viewer admitted');
await guest.waitForFunction(() => document.body.innerText.includes('Charlie') || document.querySelectorAll('nav[aria-label="Slide navigator"] button').length >= 5, null, { timeout: 30000 });
await guest.keyboard.press('Escape').catch(() => {});

const where = (pg) => pg.evaluate(() => {
  const counter = (document.body.innerText.match(/Slide \d+ \/ \d+/) || [''])[0];
  const cur = document.querySelector('nav[aria-label="Slide navigator"] button[aria-current="true"]')?.getAttribute('aria-label') ?? '';
  const frames = [...document.querySelectorAll('iframe')];
  let heading = '';
  for (const f of frames) { try { const h = f.contentDocument?.querySelector('.lattice h1'); if (h && f.getBoundingClientRect().width > 200) { heading = h.textContent; break; } } catch {} }
  return { counter, cur, heading };
});
const goGuestTo = async (n) => {
  const pills = guest.locator('nav[aria-label="Slide navigator"] button');
  await pills.nth(n - 1).click();
  await guest.waitForTimeout(1200);
};
const hostPill = (n) => host.locator('nav[aria-label="Slide navigator"] button').nth(n - 1);

// Case 1: host deletes B while the viewer watches C.
await goGuestTo(3);
log(`viewer before delete: ${JSON.stringify(await where(guest))}`);
await guest.screenshot({ path: `${OUT}1-viewer-on-C.png` });
await hostPill(2).click(); await host.waitForTimeout(800);
await host.getByRole('button', { name: 'Delete slide', exact: true }).click();
await host.getByRole('button', { name: /^Confirm delete/ }).click();
await guest.waitForFunction(() => !document.querySelector('iframe') || !document.body.innerText.includes('/ 5'), null, { timeout: 20000 }).catch(() => {});
await guest.waitForTimeout(2500);
log(`host after delete: ${JSON.stringify(await where(host))}`);
log(`viewer after host deleted Bravo: ${JSON.stringify(await where(guest))}`);
await guest.screenshot({ path: `${OUT}2-viewer-after-delete.png` });

// Case 2: restore a 5-slide deck, viewer on C, host adds a blank slide after B.
await ed.click(); await host.keyboard.press('Control+A'); await host.keyboard.press('Delete'); await host.keyboard.insertText(DECK);
await host.waitForTimeout(2500);
await goGuestTo(3);
log(`viewer before add: ${JSON.stringify(await where(guest))}`);
await hostPill(2).click(); await host.waitForTimeout(800);
await host.locator('[data-new-slide="fab"]').click();
await host.locator('[data-demo="picker-blank"]').first().click({ timeout: 20000 });
await guest.waitForTimeout(3000);
log(`host after add: ${JSON.stringify(await where(host))}`);
log(`viewer after host added after Bravo: ${JSON.stringify(await where(guest))}`);
await guest.screenshot({ path: `${OUT}3-viewer-after-add.png` });
await hb.close(); await gb.close();
