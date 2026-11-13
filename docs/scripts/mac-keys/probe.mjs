// The completion-key probe (run.sh): does a REAL macOS keystroke open the Studio editor's completion menu?
// Each arm puts `---\ntheme: ` in the deck editor (the caret where the theme menu completes), brings the browser to
// the front, posts one key through the OS (keys.swift, CGEvent at the HID tap), and records whether the page saw a
// keydown and whether the menu opened. A synthetic Playwright Ctrl+Space and an OS-posted plain `a` are the controls:
// the first proves the page is set up, the second proves OS events reach the page at all.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { chromium } from 'playwright';

const URL = process.env.STUDIO_URL || 'http://localhost:4321/studio/';
const KEYS = process.env.KEYS_BIN;
const OUT = process.env.OUT || 'platform-suite-artifacts';
const keys = (...a) => JSON.parse(execFileSync(KEYS, a, { encoding: 'utf8' }).trim().split('\n').pop());

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => {
	localStorage.setItem('lattice-studio-settings', JSON.stringify({ editMode: 'source', posture: 'craft' }));
	window.__keys = [];
	document.addEventListener('keydown', (e) => window.__keys.push({ key: e.key, code: e.code, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey }), true);
});
await page.goto(URL, { waitUntil: 'networkidle' });
const ed = page.getByLabel('Deck source');
await ed.waitFor({ timeout: 90_000 });
const menu = page.locator('.cm-tooltip-autocomplete');
const menuOpen = async () => menu.waitFor({ timeout: 2000 }).then(() => true, () => false);

async function setup() {
	await ed.click();
	await page.keyboard.press('Meta+a');
	await page.keyboard.press('Delete');
	await page.keyboard.insertText('---\ntheme: ');
	await page.keyboard.press('Escape');
	await page.evaluate(() => { window.__keys = []; });
}

const results = { platform: await page.evaluate(() => navigator.platform), trusted: keys('trusted'), arms: [] };
async function arm(name, press) {
	await setup();
	const before = keys('sources').current;
	keys('activate');
	await page.waitForTimeout(300); // the window manager has no completion signal to wait on; this is a one-off probe
	await press();
	const open = await menuOpen();
	const seen = await page.evaluate(() => window.__keys);
	const after = keys('sources').current;
	const row = { name, menuOpened: open, keydownsSeen: seen, inputSourceBefore: before, inputSourceAfter: after };
	results.arms.push(row);
	console.log(JSON.stringify(row));
	await page.keyboard.press('Escape');
}
const os = (code, mods) => async () => keys('press', String(code), mods);

await arm('control: Playwright Ctrl+Space (synthetic)', async () => page.keyboard.press('Control+Space'));
await arm('control: OS plain a', os(0, 'none'));
results.sourcesDefault = keys('sources');
await arm('OS Ctrl-Space, default input sources', os(49, 'ctrl'));
await arm('OS Option-Esc, default input sources', os(53, 'alt'));
await arm('OS Option-`, default input sources', os(50, 'alt'));
await arm('OS Option-i, default input sources', os(34, 'alt'));
const second = results.sourcesDefault.enabled.includes('com.apple.keylayout.ABC') ? 'com.apple.keylayout.British' : 'com.apple.keylayout.ABC';
results.enableSecond = { id: second, ...keys('enable', second) };
await page.waitForTimeout(1000);
results.sourcesTwo = keys('sources');
await arm('OS Ctrl-Space, two input sources', os(49, 'ctrl'));
await arm('OS Option-Esc, two input sources', os(53, 'alt'));

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(`${OUT}/mac-completion-keys.json`, JSON.stringify(results, null, 2));
const lines = ['| arm | keydown reached page | menu opened | input source before → after |', '|---|---|---|---|'];
for (const a of results.arms) lines.push(`| ${a.name} | ${a.keydownsSeen.length ? a.keydownsSeen.map((k) => `${k.ctrl ? '⌃' : ''}${k.alt ? '⌥' : ''}${k.key}`).join(' ') : 'none'} | ${a.menuOpened} | ${a.inputSourceBefore} → ${a.inputSourceAfter} |`);
const summary = [`trusted: \`${JSON.stringify(results.trusted)}\``, `default sources: \`${JSON.stringify(results.sourcesDefault)}\``, `second source: \`${JSON.stringify(results.enableSecond)}\`, then \`${JSON.stringify(results.sourcesTwo)}\``, '', ...lines].join('\n');
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\n${summary}\n`);
console.log(summary);
await browser.close();
