/**
 * THE ANDROID FILE-CHOOSER PROBE (PROBE=chooser, #3356). What Chrome on Android offers when the Studio's Library Import is
 * tapped. That input names no `accept` (a list grays a `.lattice` out on iOS: Library.tsx), and on an iPhone the owner's
 * screenshot showed Photo Library, Take Photo or Video and Choose Files still offered. This is the same question on Android,
 * in Chrome on an Android emulator, driven through adb: no WebDriver, no Chrome DevTools, only what a person sees and taps.
 *
 * It reads the screen with `uiautomator dump` (Chrome exposes a page's accessible names to it), taps an element at the
 * centre of its bounds, and judges what the system chooser lists. Two arms:
 *   - THE CONTROL: a page whose only input accepts `.pdf`. Chrome offers files there and no camera, so a reader that
 *     cannot tell a camera option from a files option fails here first. A probe that passes its control can fail.
 *   - THE STUDIO: Library, Import. It must offer the camera and a way to choose files (photos and videos are in the
 *     same chooser, or in the files picker it opens).
 * Each step waits for a signal (an element on screen) with a deadline, never a fixed sleep (HARD RULE #32). Every screen
 * read is kept under OUT: the XML dumps and a screenshot of each chooser.
 *
 *   ADB=adb BASE=http://10.0.2.2:4321 OUT=<dir> node docs/scripts/android/probe.mjs
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ADB = process.env.ADB || 'adb';
const BASE = (process.env.BASE || 'http://10.0.2.2:4321').replace(/\/$/, '');
const OUT = process.env.OUT || 'platform-suite-artifacts/android';
fs.mkdirSync(OUT, { recursive: true });

const adb = (...args) => execFileSync(ADB, args, { encoding: 'utf8', timeout: 60_000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let shot = 0;

/** Every node on screen: its text, its content-desc (a web element's accessible name), its class and its centre. */
function nodes() {
	adb('shell', 'uiautomator', 'dump', '/sdcard/ui.xml');
	const xml = adb('exec-out', 'cat', '/sdcard/ui.xml');
	const out = [];
	for (const m of xml.matchAll(/<node [^>]*?\/?>/g)) {
		const a = (k) => (m[0].match(new RegExp(`\\b${k}="([^"]*)"`)) || [])[1] || '';
		const b = a('bounds').match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
		if (!b) continue;
		out.push({ text: a('text'), desc: a('content-desc'), cls: a('class'), pkg: a('package'), id: a('resource-id'), x: (Number(b[1]) + Number(b[3])) >> 1, y: (Number(b[2]) + Number(b[4])) >> 1 });
	}
	return { xml, out };
}
const label = (n) => `${n.text} ${n.desc}`.trim();

/** Wait until a node whose text or name matches `re` is on screen; return it. A deadline, polled on the screen's own state. */
async function until(re, ms, what) {
	const t0 = Date.now();
	for (;;) {
		const last = nodes();
		const hit = last.out.find((n) => re.test(n.text) || re.test(n.desc));
		if (hit) return hit;
		// Chrome's own prompts (notifications, sign-in, a tip) sit over the page and come and go by version: dismiss them.
		// Only Chrome's native buttons carry a com.android.chrome:id/ resource id; a button inside the page has none, so this
		// can never tap the Studio's own UI.
		const prompt = last.out.find((n) => n.id.startsWith('com.android.chrome:id/') && /^(no,? thanks|not now|got it|dismiss|skip)$/i.test(n.text));
		if (prompt) {
			console.log(`  (dismissed Chrome's "${prompt.text}" prompt)`);
			tap(prompt);
		}
		if (Date.now() - t0 > ms) {
			fs.writeFileSync(path.join(OUT, `timeout-${++shot}.xml`), last.xml);
			throw new Error(`timed out after ${ms} ms waiting for ${what}`);
		}
		await sleep(500);
	}
}
const tap = (n) => adb('shell', 'input', 'tap', String(n.x), String(n.y));
const open = (url) => adb('shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main', '-d', url);

/** What the system chooser lists once it is on screen: the rows that are not Chrome's page. */
async function chooser(name) {
	// The chooser is the system's (or Chrome's own dialog), on top of the page: wait for any option that names a source.
	await until(/camera|files|browse|documents|photos|gallery|images|media|choose/i, 30_000, `${name}: the file chooser`);
	const { xml, out } = nodes();
	fs.writeFileSync(path.join(OUT, `${name}-chooser.xml`), xml);
	fs.writeFileSync(path.join(OUT, `${name}-chooser.png`), execFileSync(ADB, ['exec-out', 'screencap', '-p'], { timeout: 60_000 }));
	// The chooser's own rows: whatever is on screen that is not Chrome's page (the system chooser, the photo picker, Files).
	const options = [...new Set(out.filter((n) => n.pkg !== 'com.android.chrome').map(label).filter(Boolean))];
	const all = out.map(label).filter(Boolean);
	adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); // close it, and leave the page as it was
	return { options, all };
}

const steps = [];
const step = (name, pass, detail = '') => {
	steps.push({ name, pass: !!pass, detail: String(detail) });
	console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
const camera = (labels) => labels.some((l) => /camera|take (a )?photo|camcorder/i.test(l));
const files = (labels) => labels.some((l) => /\bfiles?\b|browse|documents|choose files/i.test(l));

let error = '';
try {
	// THE CONTROL: an input that accepts only `.pdf`.
	open(`${BASE}/__chooser-control.html`);
	tap(await until(/^Pick a PDF$/, 60_000, 'the control page'));
	const control = await chooser('control');
	step('control: a .pdf-only input offers files', files(control.all), control.options.join(' · '));
	step('control: a .pdf-only input offers no camera (so this probe can see one missing)', !camera(control.all), control.options.join(' · '));

	// THE STUDIO: Library, then Import, the way a person on a phone gets there (Menu, Library, Import files).
	open(`${BASE}/studio/`);
	tap(await until(/^Menu$/, 150_000, "the Studio's Menu button"));
	tap(await until(/^Library/, 30_000, 'the Library row'));
	tap(await until(/^Import files$/, 30_000, "the Library's Import button"));
	const studio = await chooser('studio');
	step("Library Import: Android offers the camera", camera(studio.all), studio.options.join(' · '));
	step('Library Import: Android offers a way to choose files (photos and videos among them)', files(studio.all), studio.options.join(' · '));
} catch (e) {
	error = String(e.message || e).slice(0, 300);
	step('the probe ran to the end', false, error);
}
fs.writeFileSync(path.join(OUT, 'result.json'), `${JSON.stringify({ ok: steps.length > 0 && steps.every((s) => s.pass), steps }, null, 2)}\n`);
process.exit(steps.length > 0 && steps.every((s) => s.pass) ? 0 : 1);
