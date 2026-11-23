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
 *     first. In that Files window it also looks for a deck that was never pushed, which must be reported missing: the
 *     failing arm of the Studio's listing step. A probe that passes its control can fail. (With the permission, this image's Chrome 113 offers Camera on
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
const PKG = process.env.CHROME_PKG || 'com.android.chrome'; // org.chromium.chrome for a Chromium snapshot
function nodes() {
	adb('shell', 'rm', '-f', DUMP);
	let said;
	try {
		said = adb('shell', 'uiautomator', 'dump', DUMP);
	} catch (e) {
		said = `ERROR: ${String(e.message).slice(0, 200)}`; // Android 17 can exit non-zero on a failed dump: still "no read"
	}
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
		out.push({ text: a('text'), desc: a('content-desc') || a('hint') /* Chrome 133 names a web element in hint */, cls: a('class'), pkg: a('package'), id: a('resource-id'), x: (Number(b[1]) + Number(b[3])) >> 1, y: (Number(b[2]) + Number(b[4])) >> 1 });
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
		const prompt = last.out.find((n) => n.id.startsWith(`${PKG}:id/`) && /^(no,? thanks|not now|got it|dismiss|skip)$/i.test(n.text));
		if (prompt) {
			console.log(`  (dismissed Chrome's "${prompt.text}" prompt)`);
			tap(prompt);
		}
		// Chrome is not on screen at all (the third dispatch found the home screen in front, just after boot): send the same
		// URL again, at most twice, and say so. It changes no verdict; a crash is in logcat, which run.sh keeps.
		// Or Chrome is on screen but not on the URL (the seventh dispatch found its New Tab page): after 10 s with no address
		// bar showing it, send it again too.
		const chromeUp = last.out.some((n) => n.pkg === PKG);
		const onUrl = last.out.some((n) => n.id === `${PKG}:id/url_bar` && opened.replace(/^https?:\/\//, '').startsWith(n.text.replace(/\/$/, '')) && n.text);
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

// WEB_VIA_CDP=1 (throwaway branch for #3356): Chromium 159 does not hand the page's accessibility tree to uiautomator, so
// page elements are found and clicked over Chrome's DevTools socket, with a user gesture, the way a tap activates them.
// Android's chooser is native UI and is still read with uiautomator, as before.
const VIA_CDP = process.env.WEB_VIA_CDP === '1';
let cdpPort = 0;
function cdpSocket() {
	if (cdpPort) return cdpPort;
	const unix = adb('shell', 'cat', '/proc/net/unix');
	const name = (unix.match(/@(chrome_devtools_remote\w*)/) || [])[1];
	if (!name) throw new Error(`no chrome_devtools_remote socket yet (${[...unix.matchAll(/@(\S*devtools\S*)/g)].map((m) => m[1]).join(', ') || 'none'})`);
	cdpPort = 9222;
	adb('forward', `tcp:${cdpPort}`, `localabstract:${name}`);
	console.log(`  (DevTools socket @${name} forwarded to tcp:${cdpPort})`);
	return cdpPort;
}
async function cdpSession(urlPrefix) {
	const port = cdpSocket();
	const pages = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
	const page = pages.find((p) => p.type === 'page' && p.url.startsWith(urlPrefix));
	if (!page) throw new Error(`no page at ${urlPrefix} (${pages.map((p) => p.url).join(', ')})`);
	const ws = new WebSocket(page.webSocketDebuggerUrl);
	await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error('devtools websocket failed')); });
	let id = 0;
	const waiting = new Map();
	ws.onmessage = (m) => { const d = JSON.parse(m.data); waiting.get(d.id)?.(d); };
	const send = (method, params = {}) => new Promise((r) => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
	return { send, close: () => ws.close() };
}
/** Press and release at the center of the first visible button, menu item or file input whose accessible name matches
 *  `source` (a regex source): real input events, so a pointerdown-driven menu opens and a file input gets its gesture. */
async function webClick(urlPrefix, source, ms, what) {
	const expr = `(() => { const re = new RegExp(${JSON.stringify(source)}); const name = (e) => (e.getAttribute('aria-label') || e.labels?.[0]?.textContent || e.textContent || '').trim();
		const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
		const els = [...document.querySelectorAll('button,[role=button],[role=menuitem],a,input[type=file]')].filter((e) => vis(e) && re.test(name(e)));
		if (!els.length) return { miss: [...document.querySelectorAll('button,[role=button],[role=menuitem]')].filter(vis).map(name).filter(Boolean).slice(0, 40).join(' | ') };
		const r = els[0].getBoundingClientRect(); return { name: name(els[0]), x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`;
	const t0 = Date.now();
	for (;;) {
		let why = '';
		try {
			const c = await cdpSession(urlPrefix);
			try {
				const read = async () => (await c.send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
				let v = await read();
				// Still, like tapWhenStill: a sheet sliding in moves its rows, and a press mid-slide lands on nothing.
				for (let i = 0; v?.name && i < 20; i++) {
					await sleep(250);
					const w = await read();
					if (w?.name && Math.abs(w.x - v.x) < 1 && Math.abs(w.y - v.y) < 1) break;
					v = w;
				}
				if (v?.name) {
					for (const type of ['mousePressed', 'mouseReleased']) await c.send('Input.dispatchMouseEvent', { type, x: v.x, y: v.y, button: 'left', clickCount: 1, pointerType: 'mouse' });
					return v.name;
				}
				why = v?.miss ? `visible: ${v.miss}` : '';
			} finally {
				c.close();
			}
		} catch (e) {
			why = e.message;
		}
		if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}${why ? ` (${why})` : ''}`);
		await sleep(500);
	}
}
let opened = '';
/** Open a URL in Chrome and wait (-W) until Android says the activity launched; print what it said. */
let openedAt = 0;
function open(url) {
	if (url !== opened) reopen = 0; // a reopen of the same URL keeps its count; a new page gets its own two
	opened = url;
	openedAt = Date.now();
	fresh = true;
	const said = adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-n', `${PKG}/com.google.android.apps.chrome.Main`, '-d', url);
	console.log(`  open ${url}: ${said.match(/Status: \S+/)?.[0] || said.trim().split('\n').pop()}`);
}

/** Packages that are never the chooser: Chrome's own page, the launcher, the status bar. */
const NOT_CHOOSER = new RegExp(`^(${PKG.replace(/\./g, '\\.')}|com\\.google\\.android\\.apps\\.nexuslauncher|com\\.android\\.systemui)$`);

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
async function reachDeck(open, deck = DECK, ms = 45_000) {
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
	while (Date.now() - t0 < ms) {
		last = nodes();
		if (last.out.some((n) => n.text === deck || n.desc.includes(deck))) {
			fs.writeFileSync(path.join(OUT, `deck-${deck}.xml`), last.xml);
			adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
			return { ok: true, detail: `${deck} listed by ${[...new Set(last.out.filter((n) => n.text === deck).map((n) => n.pkg))].join(', ')}` };
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
	fs.writeFileSync(path.join(OUT, `deck-${deck}-missing.xml`), last?.xml || '');
	adb('shell', 'input', 'keyevent', 'KEYCODE_BACK');
	const seen = [...new Set((last?.out || []).map(label).filter(Boolean))].slice(0, 20);
	return { ok: false, detail: `${deck} not on screen within ${ms / 1000} s (${[...new Set((last?.out || []).map((n) => n.pkg))].join(', ')}): ${seen.join(' · ')}` };
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
	// Android 17 mounts shared storage a while after boot completes: a push before then fails with an I/O error. Poll the
	// push itself, on a deadline (throwaway branch for #3356's current-Chrome evidence).
	for (let t0 = Date.now(); ; await sleep(2000)) {
		try {
			adb('push', local, `/sdcard/Download/${DECK}`);
			break;
		} catch (e) {
			if (Date.now() - t0 > 120_000) throw e;
		}
	}
	adb('shell', 'am', 'broadcast', '-a', 'android.intent.action.MEDIA_SCANNER_SCAN_FILE', '-d', `file:///sdcard/Download/${DECK}`);

	// THE CONTROL: an input that accepts only application/pdf, with Chrome NOT holding the camera permission. On this image
	// (Chrome 113) a Chrome that holds the camera offers Camera on every file input, a PDF-only one included (the tenth
	// dispatch), so the control could never see a camera go missing. Without the permission, Chrome leaves the camera
	// out and opens Files (the eighth dispatch). That is the absence this probe must be able to report.
	adb('shell', 'pm', 'revoke', PKG, 'android.permission.CAMERA');
	open(`${BASE}/__chooser-control.html`);
	if (VIA_CDP) console.log(`  clicked "${await webClick(`${BASE}/__chooser-control.html`, '^Pick a PDF', 60_000, 'the control page')}"`);
	else await tapWhenStill(/^Pick a PDF\b/, 60_000, 'the control page');
	const control = await chooser('control', { keepOpen: true });
	step('control: a PDF-only (application/pdf) input offers files', files(control.options), control.options.join(' · '));
	step('control: a PDF-only (application/pdf) input offers no camera (so this probe can see one missing)', !camera(control.options), control.options.join(' · '));
	// The failing arm of the Studio's listing step, on every run: the same reachDeck, in the same Files window, asked for a
	// deck that was never pushed. It must come back "not listed", or the listing step could never fail.
	const absent = await reachDeck(control, 'never-pushed.lattice', 15_000);
	step('control: a deck that is not in Downloads is reported missing (so the listing step can fail)', !absent.ok, absent.detail);

	// The camera back, as on a phone in use, so Android's chooser, not its permission prompt, is what the Studio arm reads.
	adb('shell', 'pm', 'grant', PKG, 'android.permission.CAMERA');

	// THE STUDIO: Library, then Import, the way a person on a phone gets there (Menu, Library, Import files).
	open(`${BASE}/studio/`);
	// The Studio warns on a device below its floor (the sixth dispatch: "This device reports 2 CPU cores") and offers Lite
	// mode. run.sh gives the emulator 4 cores; if the notice still shows, continue as a person would.
	if (VIA_CDP) {
		const S = `${BASE}/studio/`;
		const first = await webClick(S, '^(Menu|Continue anyway)$', 150_000, "the Studio's Menu button");
		console.log(`  clicked "${first}"`);
		if (/Continue anyway/.test(first)) {
			console.log('  (the Studio showed its low-device notice: Continue anyway)');
			await webClick(S, '^Menu$', 30_000, "the Studio's Menu button");
		}
		// The Studio paints an instant shell before React hydrates, and a press on the shell's Menu does nothing; a press
		// on a sheet still sliding in lands on nothing too. Walk Menu, Library, Import again until Import opens, on one deadline.
		for (const t0 = Date.now(); ; ) {
			try {
				await webClick(S, '^Library', 6_000, 'the Library row');
				console.log(`  clicked "${await webClick(S, '^Import files', 15_000, "the Library's Import button")}"`);
				break;
			} catch (e) {
				if (Date.now() - t0 > 150_000) throw e;
				console.log(`  (${String(e.message).slice(0, 80)}: walking Menu again)`);
				await webClick(S, '^Menu$', 30_000, "the Studio's Menu button");
			}
		}
	} else {
	const first = await until(/^(Menu|Continue anyway)$/, 150_000, "the Studio's Menu button");
	if (/Continue anyway/.test(label(first))) {
		console.log('  (the Studio showed its low-device notice: Continue anyway)');
		tap(first);
	}
	await tapWhenStill(/^Menu$/, 30_000, "the Studio's Menu button");
	await tapWhenStill(/^Library/, 30_000, 'the Library row');
	await tapWhenStill(/^Import files\b/, 30_000, "the Library's Import button");
	}
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
