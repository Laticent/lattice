/**
 * THE ANDROID FILE-CHOOSER PROBE. What Chrome on Android offers when the Studio's Library Import is tapped: the camera and
 * a way to choose photos, videos and files, whatever `accept` list Library.tsx gives that input (#3356 drops it so iOS
 * stops graying out a `.lattice`; on an iPhone the owner's screenshot showed Photo Library, Take Photo or Video and Choose
 * Files still offered). This is that question on Android, in Chrome on an Android emulator, driven through adb: no
 * WebDriver, no Chrome DevTools, only what a person sees and taps.
 *
 * It reads the screen with `uiautomator dump` (Chrome exposes a page's accessible names to it), taps an element at the
 * centre of its bounds, and judges what the system chooser lists. Two arms:
 *   - THE CONTROL: a page whose only input accepts application/pdf, read while Chrome lacks the camera permission. Chrome
 *     then opens Files with no camera, so a reader that cannot tell a camera option from a files option fails here
 *     first. A probe that passes its control can fail. (With the permission, this image's Chrome 113 offers Camera on
 *     every file input, a PDF-only one included, so the control cannot run with it.)
 *   - THE STUDIO: Library, Import. It must offer the camera (set by the permission this probe grants, so it guards the
 *     chooser, not Library.tsx), and a .lattice pushed to Downloads must be LISTED where its files row leads: the probe
 *     follows that row (one named for files, else the last non-camera row) and waits for the deck on screen. LISTED, not
 *     PICKABLE: Files lists the deck for the PDF-only control too, with the same enabled and clickable flags, so the dump
 *     cannot say whether picking it would hand the file to the page. That stays unverified here. A row's name proves nothing:
 *     on this image the chooser's only non-camera row is "Media", and it opens Files (run 45036251111).
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
let reopen = 0; // reopens since the last open(), at most two
let fresh = false; // true from an open() until the first element it waited for shows

/** Every node on screen: its text, its content-desc (a web element's accessible name), its class and its centre. */
// The dump goes to /data/local/tmp, not /sdcard: a file under /sdcard shows up in Files' Recent list, inside the chooser
// this probe reads. It is deleted before every dump, because `uiautomator dump` exits 0 when it fails ("ERROR: null root
// node returned by UiTestAutomationBridge"), and reading the file then would return the PREVIOUS screen. A failed dump is
// "no read": an empty screen, which every wait below polls again.
const DUMP = '/data/local/tmp/ui.xml';
function nodes() {
	adb('shell', 'rm', '-f', DUMP);
	const said = adb('shell', 'uiautomator', 'dump', DUMP);
	if (/ERROR/.test(said)) return { xml: `<!-- uiautomator: ${said.trim()} -->`, out: [] };
	let xml;
	try {
		xml = adb('exec-out', 'cat', DUMP);
	} catch {
		return { xml: '<!-- no dump -->', out: [] };
	}
	if (!xml.includes('<hierarchy')) return { xml, out: [] };
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
		if (hit) {
			fresh = false; // the page is up: from here a hidden address bar is a sheet or a scroll, never a reason to reload
			return hit;
		}
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
		if (opened && fresh && reopen < 2 && last.out.length && (!chromeUp || (!onUrl && Date.now() - openedAt > 10_000))) {
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
/** Wait for `re`, then until it sits still (the same centre on two reads in a row), then tap it. A sheet that is still
 *  sliding in moves its buttons; the ninth dispatch tapped Import files mid-slide and nothing opened. */
async function tapWhenStill(re, ms, what) {
	let a = await until(re, ms, what);
	for (let i = 0; i < 20; i++) {
		await sleep(250);
		const b = await until(re, ms, what);
		if (b.x === a.x && b.y === a.y) break;
		a = b;
	}
	tap(a);
	return a;
}
let opened = '';
/** Open a URL in Chrome and wait (-W) until Android says the activity launched; print what it said. */
let openedAt = 0;
function open(url) {
	if (url !== opened) reopen = 0; // a reopen of the same URL keeps its count; a new page gets its own two
	opened = url;
	openedAt = Date.now();
	fresh = true;
	const said = adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-n', 'com.android.chrome/com.google.android.apps.chrome.Main', '-d', url);
	console.log(`  open ${url}: ${said.match(/Status: \S+/)?.[0] || said.trim().split('\n').pop()}`);
}

/** Packages that are never the chooser: Chrome's own page, the launcher, the status bar. */
const NOT_CHOOSER = /^(com\.android\.chrome|com\.google\.android\.apps\.nexuslauncher|com\.android\.systemui)$/;

/** What the chooser lists once it is on screen. It is another app's window (the system chooser, Files, the photo picker),
 *  so it is found by PACKAGE, never by words: the sixth dispatch matched the page's own title ("Chooser control") and its
 *  "No file chosen", and passed a control with no chooser open. Only that app's rows are judged. */
async function chooser(name, { keepOpen = false } = {}) {
	const t0 = Date.now();
	let screen;
	for (;;) {
		screen = nodes();
		if (Date.now() - t0 > 30_000) {
			fs.writeFileSync(path.join(OUT, `${name}-no-chooser.xml`), screen.xml);
			throw new Error(`${name}: no chooser opened within 30000 ms (only ${[...new Set(screen.out.map((n) => n.pkg))].join(', ')} on screen)`);
		}
		// Android's permission prompt is not the chooser: Chrome asks for the camera only when the input offers it. Answer it
		// as a person would and keep waiting. run.sh grants the camera up front, so this should not show.
		const allow = screen.out.find((n) => n.pkg === 'com.google.android.permissioncontroller' && /^While using the app$/i.test(n.text));
		if (allow) {
			console.log(`  ${name}: Android asked for Chrome's camera permission (Chrome wants the camera for this input); allowing`);
			tap(allow);
			await sleep(500);
			continue;
		}
		if (screen.out.some((n) => n.pkg && !NOT_CHOOSER.test(n.pkg) && label(n))) break;
		await sleep(500);
	}
	fs.writeFileSync(path.join(OUT, `${name}-chooser.xml`), screen.xml);
	// Kept as a pointer only: under the emulator's software GPU, screencap can come back black. The XML is the record.
	fs.writeFileSync(path.join(OUT, `${name}-chooser.png`), execFileSync(ADB, ['exec-out', 'screencap', '-p'], { timeout: 60_000 }));
	const rows = screen.out.filter((n) => !NOT_CHOOSER.test(n.pkg));
	const options = [...new Set(rows.map(label).filter(Boolean))];
	console.log(`  ${name} chooser (${[...new Set(rows.map((n) => n.pkg))].join(', ')}): ${options.join(' · ')}`);
	if (!keepOpen) adb('shell', 'input', 'keyevent', 'KEYCODE_BACK'); // close it, and leave the page as it was
	// The files picker itself (DocumentsUI) is the files option when Chrome opens it directly, as it can for a PDF-only input.
	const pkgs = [...new Set(rows.map((n) => n.pkg))];
	if (pkgs.some((p) => /documentsui/.test(p))) options.push('[the Files app is open]');
	return { options, rows };
}

/** From an open chooser, follow the files route and wait for DECK on screen. Files opens on Recent; if the deck is not
 *  there, open the roots drawer once and pick Downloads. Bounded at 45 s; every screen it reads is saved. */
async function reachDeck(open) {
	const rows = open.rows.filter((n) => label(n));
	if (!open.options.includes('[the Files app is open]')) {
		const route = rows.find((n) => files([label(n)])) || [...rows].reverse().find((n) => !camera([label(n)]));
		if (!route) return { ok: false, detail: `no row to follow in: ${open.options.join(' · ')}` };
		console.log(`  following "${label(route)}"`);
		tap(route);
	}
	const t0 = Date.now();
	let drawer = false;
	let went = false;
	let last;
	while (Date.now() - t0 < 45_000) {
		last = nodes();
		if (last.out.some((n) => n.text === DECK || n.desc.includes(DECK))) {
			fs.writeFileSync(path.join(OUT, 'studio-deck.xml'), last.xml);
			adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
			return { ok: true, detail: `${DECK} listed by ${[...new Set(last.out.filter((n) => n.text === DECK).map((n) => n.pkg))].join(', ')}` };
		}
		const downloads = last.out.find((n) => /documentsui/.test(n.pkg) && /^Downloads$/.test(n.text));
		const roots = last.out.find((n) => /documentsui/.test(n.pkg) && /^Show roots$/.test(n.desc));
		if (downloads && drawer && !went) {
			went = true;
			tap(downloads);
		}
		else if (roots && !drawer && Date.now() - t0 > 5_000) {
			drawer = true;
			tap(roots);
		}
		await sleep(500);
	}
	fs.writeFileSync(path.join(OUT, 'studio-deck-missing.xml'), last?.xml || '');
	adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
	const seen = [...new Set((last?.out || []).map(label).filter(Boolean))].slice(0, 20);
	return { ok: false, detail: `not on screen within 45 s (${[...new Set((last?.out || []).map((n) => n.pkg))].join(', ')}): ${seen.join(' · ')}` };
}

const steps = [];
const step = (name, pass, detail = '') => {
	steps.push({ name, pass: !!pass, detail: String(detail) });
	console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
};
const camera = (labels) => labels.some((l) => /camera|take (a )?photo|camcorder/i.test(l));
// A row NAMED for files. Not "Media": the name does not say whether it leads to files or only to photos and videos. On this
// image it opens Files (run 45036251111), but Files also lists a "Media" app of its own, and other images and Chrome versions
// differ, so the name is never the proof.
// Whether a deck can be reached at all is the tap-through step below, which judges what opens, not what a row is called.
const files = (labels) => labels.some((l) => /\bfiles?\b|browse|documents|choose files|\[the Files app is open\]/i.test(l));
const DECK = 'chooser-probe.lattice';

let error = '';
try {
	// A deck in Downloads, for the tap-through: the question is whether a person can reach a .lattice from Import, and a
	// row's name cannot answer it. The media scan puts it in Files' Recent list.
	const local = path.join(OUT, DECK);
	fs.writeFileSync(local, 'PK\u0005\u0006' + '\u0000'.repeat(18)); // an empty zip, which is what a .lattice is
	adb('push', local, `/sdcard/Download/${DECK}`);
	adb('shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file:///sdcard/Download/${DECK}`);

	// THE CONTROL: an input that accepts only application/pdf, with Chrome NOT holding the camera permission. On this image
	// (Chrome 113) a Chrome that holds the camera offers Camera on every file input, a PDF-only one included (the tenth
	// dispatch), so the control could never see a camera go missing. Without the permission, Chrome leaves the camera
	// out and opens Files (the eighth dispatch). That is the absence this probe must be able to report.
	adb('shell', 'pm', 'revoke', 'com.android.chrome', 'android.permission.CAMERA');
	open(`${BASE}/__chooser-control.html`);
	await tapWhenStill(/^Pick a PDF\b/, 60_000, 'the control page');
	const control = await chooser('control');
	step('control: a PDF-only (application/pdf) input offers files', files(control.options), control.options.join(' · '));
	step('control: a PDF-only (application/pdf) input offers no camera (so this probe can see one missing)', !camera(control.options), control.options.join(' · '));

	// The camera back, as on a phone in use, so Android's chooser, not its permission prompt, is what the Studio arm reads.
	adb('shell', 'pm', 'grant', 'com.android.chrome', 'android.permission.CAMERA');

	// THE STUDIO: Library, then Import, the way a person on a phone gets there (Menu, Library, Import files).
	open(`${BASE}/studio/`);
	// The Studio warns on a device below its floor (the sixth dispatch: "This device reports 2 CPU cores") and offers Lite
	// mode. run.sh gives the emulator 4 cores; if the notice still shows, continue as a person would.
	const first = await until(/^(Menu|Continue anyway)$/, 150_000, "the Studio's Menu button");
	if (/Continue anyway/.test(label(first))) {
		console.log('  (the Studio showed its low-device notice: Continue anyway)');
		tap(first);
	}
	await tapWhenStill(/^Menu$/, 30_000, "the Studio's Menu button");
	await tapWhenStill(/^Library/, 30_000, 'the Library row');
	await tapWhenStill(/^Import files\b/, 30_000, "the Library's Import button");
	const studio = await chooser('studio', { keepOpen: true });
	// The camera half is set by this probe, not by Library.tsx: Chrome 113 holding the camera permission offers it on every
	// file input (the control above shows the reader can see it missing). It is kept because the owner's iPhone question was
	// "is the camera still offered", and a chooser that lost it would fail here.
	step('Library Import: Android offers the camera', camera(studio.options), studio.options.join(' · '));
	// THE TAP-THROUGH: open the row that should lead to files (one named for files, else the chooser's last non-camera row)
	// and look for the deck pushed above. This is the half that depends on the input Library.tsx renders.
	const reached = await reachDeck(studio);
	step(`Library Import: the files route lists a .lattice from Downloads (${DECK})`, reached.ok, reached.detail);
} catch (e) {
	error = String(e.message || e).slice(0, 300);
	step('the probe ran to the end', false, error);
}
fs.writeFileSync(path.join(OUT, 'result.json'), `${JSON.stringify({ ok: steps.length > 0 && steps.every((s) => s.pass), steps }, null, 2)}\n`);
process.exit(steps.length > 0 && steps.every((s) => s.pass) ? 0 : 1);
