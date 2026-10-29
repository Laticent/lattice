// Two real browsers in a Live session (2026-10-27-slide-structure-strip.md §7, on Filo): in Live, Filo hands ⌘Z to the
// binding's undo manager, which undoes only this browser's edits, and a strip op is a step of its own there.
// A. The host deletes a slide while a guest who can edit is in the room, the guest types in another slide, and the host
//    presses ⌘Z with focus on the strip: the slide comes back and the guest's typing stays. Redo and undo again.
// B. The host deletes a slide and taps Undo on the strip's note, with nothing changed since.
// C. The host deletes a slide, types, pauses, and Backspaces it away, so the deck reads as the delete left it. The note's
//    Undo is gone (it would undo the Backspace, not the delete), and ⌘Z walks back the Backspace, the typing, then the
//    delete, in order.
// D. The host deletes a slide and ends the session while the note is still up: the note's Undo goes, since undo moves
//    from the session's back to Filo's, where the same tap would undo something else.
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', '..');
const { chromium } = await import(path.join(ROOT, 'docs', 'node_modules', 'playwright', 'index.mjs'));
const BASE = process.env.BASE ?? 'http://localhost:4399/studio/';
const OUT = path.join(process.env.TMPDIR ?? '/tmp', 'live-undo') + '/';
mkdirSync(OUT, { recursive: true });
const proxy = process.env.HTTPS_PROXY;
const executablePath = existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;
const launch = () => chromium.launch({ ...(executablePath ? { executablePath } : {}), args: [...(proxy ? [`--proxy-server=${proxy}`, '--proxy-bypass-list=127.0.0.1;localhost'] : []), '--disable-features=WebRtcHideLocalIpsWithMdns', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const seed = () => localStorage.setItem('lattice-studio-settings', JSON.stringify({ posture: 'craft' }));
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
const DECK = '---\ntheme: indaco\n---\n\n' + ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo'].map((t) => `# ${t}\n\nBody of ${t}.`).join('\n\n---\n\n') + '\n';
const doc = (pg) => pg.locator('.cm-content').first().evaluate((el) => el.cmTile.root.view.state.doc.toString());
const headings = async (pg) => [...(await doc(pg)).matchAll(/^# (\w+)/gm)].map((m) => m[1]).join(' ');

const hb = await launch();
const hctx = await hb.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
await hctx.addInitScript(seed);
const host = await hctx.newPage();
await host.goto(BASE, { waitUntil: 'networkidle' });
const ed = host.locator('.cm-content').first();
await ed.click();
await host.keyboard.press('Control+A');
await host.keyboard.press('Delete');
await host.keyboard.insertText(DECK);
await host.waitForTimeout(1000);
await host.locator('nav[aria-label="Studio panels"] button[aria-label="Toggle Live"]').last().click({ timeout: 30000 });
await host.locator('#live-start-name').fill('Host');
await host.getByRole('button', { name: 'Start live session' }).click();
await host.waitForSelector('text=In this session (1/4)', { timeout: 30000 });
// The guest must be able to edit: set the link's role first.
await host.getByRole('button', { name: 'Link permission' }).click();
await host.getByRole('menuitem', { name: /Can edit/ }).click();
await host.waitForTimeout(500);
const link = await host.locator('input[aria-label="Invite link"]').inputValue();
log('host live, link can edit');

const gb = await launch();
const gctx = await gb.newContext({ viewport: { width: 1440, height: 900 } });
await gctx.addInitScript(seed);
const guest = await gctx.newPage();
await guest.goto(link, { waitUntil: 'networkidle' });
await guest.waitForSelector('#live-lobby-name', { timeout: 60000 });
await guest.locator('#live-lobby-name').fill('Guest');
await guest.getByRole('button', { name: 'Ask to join' }).click();
await host.waitForSelector('button[aria-label="Admit Guest"]', { timeout: 30000 });
await host.locator('button[aria-label="Admit Guest"]').click();
await guest.waitForSelector('[data-live-pill]', { timeout: 30000 });
await guest.waitForFunction(() => document.querySelector('.cm-content')?.textContent?.includes('Echo'), null, { timeout: 30000 });
await guest.keyboard.press('Escape').catch(() => {});
log(`guest admitted; guest sees: ${await headings(guest)}`);

// 1. Host deletes Bravo. Others are in the room, so the first tap asks.
await host.locator('nav[aria-label="Slide navigator"] button').nth(1).click();
await host.waitForTimeout(500);
await host.getByRole('button', { name: 'Delete slide' }).click();
const asked = await host.getByRole('button', { name: /^Confirm delete/ }).isVisible();
log(`first tap asked to confirm: ${asked}`);
await host.getByRole('button', { name: /^Confirm delete/ }).click();
await guest.waitForFunction(() => !document.querySelector('.cm-content')?.textContent?.includes('Body of Bravo'), null, { timeout: 20000 });
log(`after delete — host: ${await headings(host)} | guest: ${await headings(guest)}`);

// 2. The guest types in Echo, far from the join the delete left.
await guest.locator('.cm-content').first().evaluate((el) => {
	const v = el.cmTile.root.view;
	const at = v.state.doc.toString().indexOf('Body of Echo.') + 'Body of Echo.'.length;
	v.dispatch({ changes: { from: at, insert: ' Guest typed.' }, selection: { anchor: at + 13 }, userEvent: 'input.type' });
});
await host.waitForFunction(() => document.querySelector('.cm-content')?.textContent?.includes('Guest typed.'), null, { timeout: 20000 });
log('host has the guest’s typing');

// 3. The host undoes the delete from the strip: ⌘Z (Ctrl+Z) with focus on a strip control.
await host.getByRole('button', { name: 'Duplicate slide' }).focus();
await host.keyboard.press('Control+Z');
await guest.waitForFunction(() => document.querySelector('.cm-content')?.textContent?.includes('Body of Bravo'), null, { timeout: 20000 }).catch(() => {});
const hostDoc = await doc(host);
const guestDoc = await doc(guest);
log(`after Undo — host: ${await headings(host)} | guest: ${await headings(guest)}`);
log(`guest typing kept — host: ${hostDoc.includes('Guest typed.')} | guest: ${guestDoc.includes('Guest typed.')}; docs equal: ${hostDoc === guestDoc}`);
await host.screenshot({ path: `${OUT}host-after-undo.png` });

const pill = async (pg, name) => {
	const order = (await headings(pg)).split(' ');
	return pg.locator('nav[aria-label="Slide navigator"] button').nth(order.indexOf(name));
};
const strikeZ = async (pg, redo = false) => {
	await pg.getByRole('button', { name: 'Duplicate slide' }).focus();
	await pg.keyboard.press(redo ? 'Control+Shift+Z' : 'Control+Z');
	await pg.waitForTimeout(1200);
};
await strikeZ(host, true);
log(`A. after redo from the strip — host: ${await headings(host)} | guest: ${await headings(guest)}`);
await strikeZ(host);
log(`A. after ⌘Z again — host: ${await headings(host)} | guest: ${await headings(guest)} | guest typing kept: ${(await doc(guest)).includes('Guest typed.')}`);

// B. Delete Delta, then the note's Undo at once.
await (await pill(host, 'Delta')).click();
await host.waitForTimeout(500);
await host.getByRole('button', { name: 'Delete slide' }).click();
await host.getByRole('button', { name: /^Confirm delete/ }).click();
await guest.waitForFunction(() => !document.querySelector('.cm-content')?.textContent?.includes('Body of Delta'), null, { timeout: 20000 });
log(`B. note after delete: ${JSON.stringify(await host.locator('[data-strip-note]').innerText())}`);
await host.locator('[data-strip-note]').getByRole('button', { name: 'Undo' }).click();
await guest.waitForFunction(() => document.querySelector('.cm-content')?.textContent?.includes('Body of Delta'), null, { timeout: 20000 }).catch(() => {});
log(`B. after the note's Undo — host: ${await headings(host)} | guest: ${await headings(guest)}`);

// C. Delete Charlie, type and Backspace; the note's Undo goes; ⌘Z walks back in order.
await (await pill(host, 'Charlie')).click();
await host.waitForTimeout(500);
await host.getByRole('button', { name: 'Delete slide' }).click();
await host.getByRole('button', { name: /^Confirm delete/ }).click();
await guest.waitForFunction(() => !document.querySelector('.cm-content')?.textContent?.includes('Body of Charlie'), null, { timeout: 20000 });
const cBefore = await doc(host);
await host.locator('.cm-content').first().click();
await host.keyboard.press('Control+End');
await host.keyboard.type('x');
await host.waitForTimeout(800);
await host.keyboard.press('Backspace');
await host.waitForTimeout(800);
log(`C. deck reads as the delete left it: ${(await doc(host)) === cBefore} | note's Undo shown: ${await host.locator('[data-strip-note] button').count()}`);
const stray = async () => (await doc(host)).trimEnd().endsWith('x');
await strikeZ(host);
log(`C. ⌘Z 1 — host: ${await headings(host)} | stray x: ${await stray()}`);
await strikeZ(host);
log(`C. ⌘Z 2 — host: ${await headings(host)} | stray x: ${await stray()}`);
await strikeZ(host);
await guest.waitForFunction(() => document.querySelector('.cm-content')?.textContent?.includes('Body of Charlie'), null, { timeout: 20000 }).catch(() => {});
log(`C. ⌘Z 3 — host: ${await headings(host)} | guest: ${await headings(guest)} | stray x: ${await stray()}`);

// D. Delete, then end the session at once, inside the note's 6s.
await (await pill(host, 'Bravo')).click();
await host.waitForTimeout(400);
await host.getByRole('button', { name: 'Delete slide' }).click();
await host.getByRole('button', { name: /^Confirm delete/ }).click();
await host.locator('[data-strip-note]').getByRole('button', { name: 'Undo' }).waitFor();
log(`D. note's Undo shown while live: ${await host.locator('[data-strip-note] button').count()}`);
await host.getByRole('button', { name: 'Session options' }).first().click();
await host.getByRole('menuitem', { name: /End session for everyone/ }).click();
await host.getByRole('button', { name: 'End session', exact: true }).click();
await host.locator('[data-live-pill]').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {});
log(`D. after ending the session — note: ${JSON.stringify(await host.locator('[data-strip-note]').innerText().catch(() => '(gone)'))} | note's Undo shown: ${await host.locator('[data-strip-note] button').count()}`);

await hb.close();
await gb.close();
