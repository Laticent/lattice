// One-off Windows check of Lattice Studio (PR #2354) on a real WebView2.
// The page is read over WebView2's remote-debugging port; every key or click that tests
// the ENGINE's own behavior (shortcuts, context menu) is real OS input from win.ps1.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const OUT = path.resolve(process.argv[2] || 'wincheck-results');
fs.mkdirSync(OUT, { recursive: true });
const WIN = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), 'win.ps1');
const results = [];
const win = (...a) => execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', WIN, ...a], { encoding: 'utf8' }).trim();
const shot = (name) => { try { win('shot', path.join(OUT, `${name}.png`)); } catch (e) { console.log('shot failed', name, e.message); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function step(id, name, fn) {
  try {
    const detail = await fn();
    results.push({ id, name, pass: true, detail: detail ?? '' });
    console.log(`PASS ${id} ${name} ${detail ?? ''}`);
  } catch (e) {
    results.push({ id, name, pass: false, detail: String(e?.message || e).slice(0, 600) });
    console.log(`FAIL ${id} ${name} ${e?.message || e}`);
  }
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const studio = () => browser.contexts().flatMap((c) => c.pages()).find((p) => /tauri\.localhost/.test(p.url()));
let page;
for (let i = 0; i < 60 && !(page = studio()); i++) await sleep(1000);
ok(page, 'no Studio page over CDP');
const screenPoint = async (locator) => {
  const b = await locator.boundingBox();
  const dpr = await page.evaluate(() => window.devicePixelRatio);
  const [ox, oy] = win('origin').split(',').map(Number);
  return [Math.round(ox + (b.x + b.width / 2) * dpr), Math.round(oy + (b.y + b.height / 2) * dpr)];
};
const preview = () => page.locator('iframe').first();
const findBarCount = () => page.locator('.cm-studio-find, .cs-findbar').count();

await step('0.1', 'Studio boots in the app window', async () => {
  await page.getByRole('textbox', { name: 'Deck source' }).waitFor({ timeout: 60_000 });
  shot('01-boot');
  return `url=${page.url()} dpr=${await page.evaluate(() => devicePixelRatio)}`;
});
await step('0.2', 'Window list at start', async () => win('windows'));

await step('1.1', 'Real Ctrl+F from the preview opens the Studio find bar', async () => {
  const [x, y] = await screenPoint(preview());
  win('click', String(x), String(y));
  await sleep(500);
  win('keys', '^f');
  await sleep(1500);
  shot('02-ctrl-f');
  ok((await findBarCount()) === 1, 'no Studio find bar after Ctrl+F');
  win('keys', '{ESC}');
  await sleep(500);
  return 'find bar shown; screenshot 02';
});

await step('1.2', 'Real F5 and Ctrl+R do not reload', async () => {
  await page.evaluate(() => { window.__mark = 42; });
  win('keys', '{F5}'); await sleep(2500);
  win('keys', '^r'); await sleep(2500);
  const mark = await page.evaluate(() => window.__mark);
  shot('03-after-f5-ctrl-r');
  ok(mark === 42, `page reloaded (marker=${mark})`);
  return 'no reload';
});

await step('1.3', 'Real F12, Ctrl+Shift+I and Ctrl+Shift+J open no developer tools', async () => {
  const before = win('windows');
  win('keys', '{F12}'); await sleep(1500);
  win('keys', '^+i'); await sleep(1500);
  win('keys', '^+j'); await sleep(1500);
  const after = win('windows');
  shot('04-after-devtools-keys');
  ok(!/DevTools/i.test(after), `a DevTools window appeared:\n${after}`);
  return before === after ? 'window list unchanged' : `window list changed:\n${after}`;
});

await step('1.4', 'Real Ctrl+P opens the Print deck panel, not a print of the Studio', async () => {
  win('keys', '^p'); await sleep(2000);
  shot('05-ctrl-p');
  const printBtn = await page.getByRole('dialog').getByRole('button', { name: 'Print', exact: true }).count();
  ok(printBtn >= 1, 'Print deck panel not open');
  win('keys', '{ESC}'); await sleep(800);
  return 'Print deck panel open';
});

await step('1.5', 'Real Alt+Left and history.back() never leave the Studio', async () => {
  const url = page.url();
  win('keys', '%{LEFT}'); await sleep(1500);
  await page.evaluate(() => history.back()).catch(() => {}); await sleep(1500);
  ok(page.url() === url, `left the Studio: ${page.url()}`);
  return url;
});

await step('1.6', 'A page navigation to an outside site stays in the app and opens the default browser', async () => {
  const url = page.url();
  await page.evaluate(() => { location.href = 'https://example.com/lattice-wincheck-nav'; }).catch(() => {});
  await sleep(5000);
  ok(page.url() === url, `the main window navigated: ${page.url()}`);
  const procs = win('procs', 'lattice-wincheck-nav');
  ok(/example\.com/.test(procs), `no browser process for the URL; processes:\n${procs || '(none)'}`);
  return procs.split('\n')[0];
});

await step('2.1', 'Real right-click on the preview shows no engine menu', async () => {
  const [x, y] = await screenPoint(preview());
  win('click', String(x), String(y), 'right'); await sleep(1500);
  shot('06-rightclick-preview');
  win('keys', '{ESC}'); await sleep(500);
  return 'screenshot 06 (inspect: no Back/Reload/Inspect menu)';
});

await step('2.2', 'Real right-click in the editor shows only editing items', async () => {
  const [x, y] = await screenPoint(page.locator('.cm-content'));
  win('click', String(x), String(y), 'right'); await sleep(1500);
  shot('07-rightclick-editor');
  win('keys', '{ESC}'); await sleep(500);
  return 'screenshot 07 (inspect: Cut/Copy/Paste/Select all only)';
});

await step('3.1', 'Continue on GitHub opens the default browser; the app stays put', async () => {
  const url = page.url();
  await page.getByRole('button', { name: 'Send feedback' }).click();
  await page.getByPlaceholder(/One line/).fill('Windows check summary');
  await page.getByPlaceholder(/What were you doing/).fill('Windows check details');
  await page.getByRole('link', { name: 'Continue on GitHub' }).click();
  await sleep(6000);
  shot('08-continue-on-github');
  ok(page.url() === url, `the main window navigated: ${page.url()}`);
  const procs = win('procs', 'issues/new');
  ok(/github\.com/.test(procs), `no browser process for the GitHub URL; processes:\n${procs || '(none)'}`);
  return procs.split('\n')[0].slice(0, 200);
});

await step('4.1', 'Connect OpenRouter opens its own sign-in window; closing it resets Connect', async () => {
  await page.keyboard.press('Escape');
  await page.keyboard.press('Control+k');
  await page.keyboard.type('workspace');
  await page.keyboard.press('Enter');
  await page.getByRole('tab', { name: 'AI' }).click();
  await page.getByRole('button', { name: /Connect OpenRouter/ }).click();
  let list = '';
  for (let i = 0; i < 20; i++) { await sleep(1000); list = win('windows'); if (/Sign in - Lattice Studio/.test(list)) break; }
  shot('09-sign-in-window');
  ok(/Sign in - Lattice Studio/.test(list), `no sign-in window:\n${list}`);
  const signin = browser.contexts().flatMap((c) => c.pages()).find((p) => /openrouter\.ai/.test(p.url()));
  const signinUrl = signin ? signin.url() : '(no CDP target)';
  ok(page.url().includes('tauri.localhost'), `the main window moved: ${page.url()}`);
  win('close', 'Sign in - Lattice Studio');
  await sleep(2500);
  const back = await page.getByRole('button', { name: 'Connect OpenRouter (one click)' }).count();
  shot('10-sign-in-closed');
  ok(back === 1, 'Connect button did not come back after closing the window');
  return `sign-in page: ${signinUrl}`;
});

await step('5.1', 'Share > Markdown opens the Windows Save dialog and writes the file', async () => {
  await page.keyboard.press('Escape');
  const target = path.join(OUT, 'saved-deck.md');
  await page.getByRole('button', { name: 'Share', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: /^Markdown/ }).click();
  let list = '';
  for (let i = 0; i < 20; i++) { await sleep(1000); list = win('windows'); if (/\| Save As$|\| Save as$/m.test(list)) break; }
  shot('11-save-dialog');
  ok(/Save As|Save as/.test(list), `no Save dialog:\n${list}`);
  execFileSync('powershell', ['-NoProfile', '-Command', `Add-Type -AssemblyName System.Windows.Forms; Start-Sleep -Milliseconds 400; [System.Windows.Forms.SendKeys]::SendWait('${target.replace(/'/g, "''")}'); Start-Sleep -Milliseconds 300; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')`]);
  for (let i = 0; i < 10 && !fs.existsSync(target); i++) await sleep(1000);
  ok(fs.existsSync(target), 'file not written');
  const text = fs.readFileSync(target, 'utf8');
  ok(/_class:\s*title/.test(text), 'file is not the deck');
  return `${text.length} bytes`;
});

await step('6.1', 'Real Ctrl+F in Compose opens the Studio find bar', async () => {
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Compose/ }).first().click();
  await page.locator('.cs-host .ProseMirror').waitFor({ timeout: 15_000 });
  const [x, y] = await screenPoint(page.locator('.cs-host .ProseMirror'));
  win('click', String(x), String(y)); await sleep(500);
  win('keys', '^f'); await sleep(1500);
  shot('12-compose-ctrl-f');
  ok((await page.locator('.cs-findbar').count()) === 1, 'no Compose find bar');
  return 'Compose find bar shown';
});

await step('9.9', 'Window list at end', async () => win('windows'));
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed} pass, ${failed} fail`);
await browser.close().catch(() => {});
process.exit(0);
