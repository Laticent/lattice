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
let reopen = 0;

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
		// Chrome is not on screen at all (the third dispatch found the home screen in front, just after boot): send the same
		// URL again, at most twice, and say so. It changes no verdict; a crash is in logcat, which run.sh keeps.
		// Or Chrome is on screen but not on the URL (the seventh dispatch found its New Tab page): after 10 s with no address
		// bar showing it, send it again too.
		const chromeUp = last.out.some((n) => n.pkg === 'com.android.chrome');
		const onUrl = last.out.some((n) => n.id === 'com.android.chrome:id/url_bar' && opened.replace(/^https?:\/\//, '').startsWith(n.text.replace(/\/$/, '')) && n.text);
		if (opened && reopen < 2 && last.out.length && (!chromeUp || (!onUrl && Date.now() - openedAt > 10_000))) {
			reopen++;
			console.log(`  (${chromeUp ? "Chrome's address bar does not show it" : `Chrome is not on screen: ${[...new Set(last.out.map((n) => n.pkg))].join(', ')}`}; opening ${opened} again)`);
			open(opened);
		}
		if (Date.now() - t0 > ms) {
			fs.writeFileSync(path.join(OUT, `timeout-${++shot}.xml`), last.xml);
			throw new Error(`timed out after ${ms} ms waiting for ${what}`);
		}
		await sleep(500);
	}
}
const tap = (n) => adb('shell', 'input', 'tap', String(n.x), String(n.y));
let opened = '';
/** Open a URL in Chrome and wait (-W) until Android says the activity launched; print what it said. */
let openedAt = 0;
function open(url) {
	opened = url;
	openedAt = Date.now();
	const said = adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main', '-d', url);
	console.log(`  open ${url}: ${said.match(/Status: \S+/)?.[0] || said.trim().split('\n').pop()}`);
}

/** Packages that are never the chooser: Chrome's own page, the launcher, the status bar. */
const NOT_CHOOSER = /^(com\.android\.chrome|com\.google\.android\.apps\.nexuslauncher|com\.android\.systemui)$/;

/** What the chooser lists once it is on screen. It is another app's window (the system chooser, Files, the photo picker),
 *  so it is found by PACKAGE, never by words: the sixth dispatch matched the page's own title ("Chooser control") and its
 *  "No file chosen", and passed a control with no chooser open. Only that app's rows are judged. */
async function chooser(name) {
	const t0 = Date.now();
	let screen;
	for (;;) {
		screen = nodes();
		if (screen.out.some((n) => n.pkg && !NOT_CHOOSER.test(n.pkg) && label(n))) break;
		if (Date.now() - t0 > 30_000) {
			fs.writeFileSync(path.join(OUT, `${name}-no-chooser.xml`), screen.xml);
			throw new Error(`${name}: no chooser opened within 30000 ms (only ${[...new Set(screen.out.map((n) => n.pkg))].join(', ')} on screen)`);
		}
		await sleep(500);
	}
	fs.writeFileSync(path.join(OUT, `${name}-chooser.xml`), screen.xml);
	// Kept as a pointer only: under the emulator's software GPU, screencap can come back black. The XML is the record.
	fs.writeFileSync(path.join(OUT, `${name}-chooser.png`), execFileSync(ADB, ['exec-out', 'screencap', '-p'], { timeout: 60_000 }));
	const rows = screen.out.filter((n) => !NOT_CHOOSER.test(n.pkg));
	const options = [...new Set(rows.map(label).filter(Boolean))];
	console.log(`  ${name} chooser (${[...new Set(rows.map((n) => n.pkg))].join(', ')}): ${options.join(' · ')}`);
	adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); // close it, and leave the page as it was
	// The files picker itself (DocumentsUI) is the files option when Chrome opens it directly, as it can for a .pdf input.
	const pkgs = [...new Set(rows.map((n) => n.pkg))];
	if (pkgs.some((p) => /documentsui/.test(p))) options.push('[the Files app is open]');
	return { options };
}

const steps = [];
const step = (name, pass, detail = '') => {
	steps.push({ name, pass: !!pass, detail: String(detail) });
	console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
const camera = (labels) => labels.some((l) => /camera|take (a )?photo|camcorder/i.test(l));
const files = (labels) => labels.some((l) => /\bfiles?\b|browse|documents|choose files|\[the Files app is open\]/i.test(l));

let error = '';
try {
	// THE CONTROL: an input that accepts only `.pdf`.
	open(`${BASE}/__chooser-control.html`);
	tap(await until(/^Pick a PDF\b/, 60_000, 'the control page'));
	const control = await chooser('control');
	step('control: a .pdf-only input offers files', files(control.options), control.options.join(' · '));
	step('control: a .pdf-only input offers no camera (so this probe can see one missing)', !camera(control.options), control.options.join(' · '));

	// THE STUDIO: Library, then Import, the way a person on a phone gets there (Menu, Library, Import files).
	open(`${BASE}/studio/`);
	// The Studio warns on a device below its floor (the sixth dispatch: "This device reports 2 CPU cores") and offers Lite
	// mode. run.sh gives the emulator 4 cores; if the notice still shows, continue as a person would.
	const first = await until(/^(Menu|Continue anyway)$/, 150_000, "the Studio's Menu button");
	if (/Continue anyway/.test(label(first))) {
		console.log('  (the Studio showed its low-device notice: Continue anyway)');
		tap(first);
	}
	tap(await until(/^Menu$/, 30_000, "the Studio's Menu button"));
	tap(await until(/^Library/, 30_000, 'the Library row'));
	tap(await until(/^Import files\b/, 30_000, "the Library's Import button"));
	const studio = await chooser('studio');
	step("Library Import: Android offers the camera", camera(studio.options), studio.options.join(' · '));
	step('Library Import: Android offers a way to choose files (photos and videos among them)', files(studio.options), studio.options.join(' · '));
} catch (e) {
	error = String(e.message || e).slice(0, 300);
	step('the probe ran to the end', false, error);
}
fs.writeFileSync(path.join(OUT, 'result.json'), `${JSON.stringify({ ok: steps.length > 0 && steps.every((s) => s.pass), steps }, null, 2)}\n`);
process.exit(steps.length > 0 && steps.every((s) => s.pass) ? 0 : 1);
