/**
 * THE PRESENT KEEP-ALIVE PROBE, the page half (PR #3333). run.mjs drives it in Mobile Safari in an iPhone iOS Simulator;
 * probe.selftest.mjs runs the same steps in Playwright's WebKit. It proves, on the surface the owner presents from, what
 * PR #3333 claims and jsdom cannot show:
 *
 *   latticeKeepalivePresentAt()   where the driver's real touch opens Present (a scripted click is no user gesture)
 *   latticeKeepaliveOpen()        Present is open; the screen wake lock is HELD (Present publishes it as `data-wake`)
 *   latticeKeepaliveImmersive()   press Fullscreen: on iPhone Safari it cannot go full screen, so Present turns on its
 *                                 immersive layout instead; wait until the chrome FADES; return where to tap the slide
 *   latticeKeepaliveShown()       after the driver's real touch tap: the chrome came back
 *   latticeKeepalivePlay()        press Play; the captions ride ON the slide, inside its frame, and their highlight walks
 *                                 the words (it used to freeze on word one while a voice was still being prepared)
 *   latticeKeepaliveNext()        press Next while playing: the next slide comes up and PLAYS on its own (continuous play
 *                                 survives navigation); the lock is still held
 *   latticeKeepaliveClose()       close Present: the narration stops with it
 *   latticeKeepaliveVoiceOn()     PR #3394: a phone that never picked a voice keeps `provider: ''` (it cannot run Kokoro).
 *                                 Reopen Present with the Voice ON and play: the live cue must move past cue 0, and
 *                                 preparing no voice must throw nothing (it threw `unknown key provider: ` and Present
 *                                 sat on its first cue)
 *   latticeKeepaliveArmErrors()   called once on load: records every uncaught `key provider` error from then on
 *
 * Every wait is for a state, with a bound (HARD RULE #32); no step judges a duration. Plain browser JS on purpose:
 * WebDriver's execute-script sends source text, not a module.
 */

function latticeKeepaliveHelpers() {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const until = async (fn, ms, what) => {
		const t0 = Date.now();
		for (;;) {
			const v = fn();
			if (v) return v;
			if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
			await sleep(50);
		}
	};
	const dialog = () => document.querySelector('[role="dialog"][aria-label="Present"]');
	const counter = () => {
		const m = /(\d+) \/ (\d+)/.exec(dialog()?.textContent || '');
		return m ? [Number(m[1]), Number(m[2])] : null;
	};
	const button = (label, within = dialog() || document) => [...within.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || '') === label);
	const opacity = (el) => (el ? Number(getComputedStyle(el).opacity) : -1);
	const top = () => dialog()?.querySelector('[data-present-chrome="top"]');
	const frame = () => dialog()?.querySelector('[data-slide-frame]');
	const band = () => frame()?.querySelector('[data-present-cc-over] .latt-cc-band[data-shown="1"]');
	/** How far the caption highlight has walked: the words lit on the line being read, plus every line already read. */
	const walked = () => {
		const b = band();
		if (!b) return { text: '', lit: 0 };
		const now = b.querySelector('.latt-cc-line[data-state="now"]');
		return { text: now?.textContent?.trim() || '', lit: b.querySelectorAll('.latt-cc-line[data-state="now"] [data-spoken="1"]').length + b.querySelectorAll('.latt-cc-line[data-state="read"]').length };
	};
	const playing = () => !!button('Pause');
	/** The Voice toggle in Present ("Voice on" / "Voice off"), and the voice the Studio has selected ('' = none). */
	const voiceToggle = () => [...(dialog()?.querySelectorAll('button') || [])].find((b) => /^Voice (on|off)/.test((b.getAttribute('aria-label') || b.textContent || '').trim()));
	const provider = () => {
		try {
			return JSON.parse(localStorage.getItem('lattice-studio-voice-selection') || '{}').provider ?? '';
		} catch {
			return 'unreadable';
		}
	};
	const visible = (el) => !!el && !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	/** The Studio's own Present button: the visible one (a phone keeps a second, hidden copy in another bar). */
	const presentButton = () => [...document.querySelectorAll('button')].find((b) => visible(b) && (b.textContent.trim() === 'Present' || b.getAttribute('aria-label') === 'Present'));
	/** The gesture layer behind the slide (the backdrop): its middle is the middle of the slide. */
	const backdrop = () => [...document.querySelectorAll('div[aria-hidden="true"].lx-ui.fixed')].find((d) => getComputedStyle(d).zIndex === '100');
	return { sleep, until, dialog, counter, button, opacity, top, frame, band, walked, playing, presentButton, backdrop, voiceToggle, provider };
}

/** Where to tap the Studio's Present button. The DRIVER taps it with a real touch: WebKit grants the screen wake lock only
 *  inside a user gesture, and a scripted click() is not one (the first iOS run, opened that way, was refused the lock). */
async function latticeKeepalivePresentAt() {
	const h = latticeKeepaliveHelpers();
	// The Studio has hydrated once its first render has run (sheet-focus-probe.js waits on the same signal). Before that the
	// header is the pre-paint skeleton, whose Present button has no handler: a click or a tap on it does nothing, which is
	// what failed runs 44774104460 and 44781213234 on a slow simulator.
	await h.until(() => window.__latticeRenderMetrics, 150000, "the Studio's first render");
	const b = await h.until(() => h.presentButton(), 30000, 'the Present button');
	b.scrollIntoView({ block: 'center' });
	const r = b.getBoundingClientRect();
	return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
}

/** Log what the page sees of the next touch (touchstart/touchend times), as tap-guard.mjs reads it. */
function latticeKeepaliveArmTap() {
	window.__kaTap = { events: [] };
	for (const type of ['touchstart', 'touchend', 'touchcancel', 'click'])
		window.addEventListener(type, (e) => window.__kaTap?.events.push({ type, t: e.timeStamp }), { capture: true });
	return true;
}

/** Did the tap open Present? Waits up to `ms`, then returns the touch log either way. */
async function latticeKeepaliveOpened(ms) {
	const h = latticeKeepaliveHelpers();
	const open = await h.until(() => h.dialog() && h.counter(), ms, 'Present').then(() => true, () => false);
	return { open, log: window.__kaTap || null };
}

async function latticeKeepaliveOpen() {
	const h = latticeKeepaliveHelpers();
	await h.until(() => h.dialog() && h.counter(), 30000, 'the Present dialog and its counter (after the tap on Present)');
	// The lock is asked for on open and arrives asynchronously; `unsupported` or `not held` after the wait is the finding.
	const wake = await h.until(() => (h.dialog()?.getAttribute('data-wake') === 'held' ? 'held' : null), 10000, 'the screen wake lock').catch(() => h.dialog()?.getAttribute('data-wake') || 'no attribute');
	return { ua: navigator.userAgent, width: innerWidth, total: h.counter()[1], wake, hasApi: 'wakeLock' in navigator, backdrop: !!h.backdrop() };
}

async function latticeKeepaliveImmersive() {
	const h = latticeKeepaliveHelpers();
	const full = await h.until(() => h.button('Fullscreen'), 15000, 'the Fullscreen button');
	// This step tests the REFUSED path: Present turns on its immersive layout when the browser will not go full screen.
	// A scripted click is no gesture of its own, but it inherits one while the last real tap is still recent, and this
	// Safari (26.5) then GRANTS real full screen (run 44804692039: fullscreenEnabled and fullscreenElement both true),
	// which Present rightly answers with no immersive layout. So wait for that activation to lapse; the request is then
	// refused every time, instead of by whichever way the timing fell.
	const activationLapsed = await h.until(() => (navigator.userActivation ? !navigator.userActivation.isActive : 'no API'), 15000, 'the last tap to stop counting as a gesture');
	full.click();
	// On a timeout, say what the page DID reach: a macOS run costs 40 minutes, so a bare "timed out" wastes one.
	const row = await h.until(() => h.dialog()?.querySelector('[data-present-immersive]'), 10000, 'the immersive layout').catch((e) => {
		const toast = [...document.querySelectorAll('[role="status"], [data-sonner-toast]')].map((t) => t.textContent.trim()).filter(Boolean).join(' / ');
		const seen = { dialog: !!h.dialog(), pressed: h.button('Fullscreen')?.getAttribute('aria-pressed'), fullscreenEnabled: !!(document.fullscreenEnabled || document.webkitFullscreenEnabled), fullscreenElement: !!(document.fullscreenElement || document.webkitFullscreenElement), viewport: `${innerWidth}x${innerHeight}`, toast: toast.slice(0, 160) };
		throw new Error(`${e.message}; saw ${JSON.stringify(seen)}`);
	});
	const realFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
	await h.until(() => h.opacity(h.top()) === 0, 15000, 'the chrome to fade');
	const r = h.frame().getBoundingClientRect();
	// The middle of the slide's upper half: clear of the captions and of the dock that will come back over the bottom.
	return { immersive: !!row, realFullscreen, activationLapsed, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * 0.3), frame: [Math.round(r.width), Math.round(r.height)] };
}

/** The lock after a real tap: Present re-asks from inside any tap while it is not held, so by now it must be held. */
async function latticeKeepaliveWake() {
	const h = latticeKeepaliveHelpers();
	return { wake: await h.until(() => (h.dialog()?.getAttribute('data-wake') === 'held' ? 'held' : null), 5000, 'the lock').catch(() => h.dialog()?.getAttribute('data-wake') || 'no attribute') };
}

async function latticeKeepaliveShown() {
	const h = latticeKeepaliveHelpers();
	const shown = await h.until(() => h.opacity(h.top()) === 1, 5000, 'the chrome to come back').catch(() => false);
	return { shown: !!shown, opacity: h.opacity(h.top()) };
}

async function latticeKeepalivePlay() {
	const h = latticeKeepaliveHelpers();
	h.button('Play the presentation').click();
	await h.until(() => h.playing(), 15000, 'the transport to read Pause');
	const b = await h.until(() => h.band(), 30000, 'the captions on the slide');
	const fr = h.frame().getBoundingClientRect();
	const cr = b.getBoundingClientRect();
	const inside = cr.top >= fr.top - 1 && cr.bottom <= fr.bottom + 1 && cr.left >= fr.left - 1 && cr.right <= fr.right + 1;
	const first = h.walked();
	const later = await h.until(() => {
		const w = h.walked();
		return w.lit > 1 || (w.text && w.text !== first.text) ? w : null;
	}, 20000, 'the caption highlight to move past the first word');
	const v = h.voiceToggle();
	return { inside, caption: later.text.slice(0, 60), lit: later.lit, fontPx: Number.parseFloat(getComputedStyle(b).fontSize), frameW: Math.round(fr.width), provider: h.provider(), voice: v ? v.getAttribute('aria-pressed') : 'no toggle' };
}

async function latticeKeepaliveNext() {
	const h = latticeKeepaliveHelpers();
	const [at] = h.counter();
	const before = h.walked().text;
	h.button('Next slide').click();
	await h.until(() => h.counter()?.[0] === at + 1, 15000, `slide ${at + 1}`);
	// The new slide speaks by itself after its arrival beat: its caption appears and its highlight walks.
	const w = await h.until(() => {
		const x = h.walked();
		return x.text && x.text !== before && x.lit > 1 ? x : null;
	}, 30000, 'the next slide to play on its own');
	return { from: at, to: h.counter()[0], still: h.playing(), caption: w.text.slice(0, 60), wake: h.dialog()?.getAttribute('data-wake') };
}

async function latticeKeepaliveClose() {
	const h = latticeKeepaliveHelpers();
	h.button('Exit present', document).click();
	await h.until(() => !h.dialog(), 10000, 'Present to close');
	// Reopened, the deck is not mid-delivery: nothing kept speaking while it was closed.
	await h.sleep(1500);
	(await h.until(() => h.presentButton(), 15000, 'the Present button')).click();
	await h.until(() => h.dialog() && h.counter(), 30000, 'Present to reopen');
	const stopped = !!h.button('Play the presentation') && !h.playing();
	h.button('Exit present', document).click();
	return { stopped };
}

function latticeKeepaliveArmErrors() {
	window.__kaErrors = [];
	const keep = (m) => /key provider/.test(String(m || '')) && window.__kaErrors.push(String(m).slice(0, 120));
	addEventListener('error', (e) => keep(e.message));
	addEventListener('unhandledrejection', (e) => keep(e.reason?.message || e.reason));
	return true;
}

/** PR #3394. Present reopened with the Voice ON, on a phone with no voice chosen: the read-along runs and nothing throws. */
async function latticeKeepaliveVoiceOn() {
	const h = latticeKeepaliveHelpers();
	const provider = h.provider();
	(await h.until(() => h.presentButton(), 15000, 'the Present button')).click();
	await h.until(() => h.dialog() && h.counter(), 30000, 'Present to reopen');
	const v = await h.until(() => h.voiceToggle(), 15000, 'the Voice toggle');
	if (v.getAttribute('aria-pressed') !== 'true') v.click();
	await h.until(() => h.voiceToggle()?.getAttribute('aria-pressed') === 'true', 5000, 'the Voice to read on');
	h.button('Play the presentation').click();
	await h.until(() => h.playing(), 15000, 'the transport to read Pause');
	// Reopened without Fullscreen, the captions are not on the slide (that is the immersive layout), so read the live cue:
	// the read-along clock moves it past cue 0. With the throw it never started, and Present sat on its first cue.
	const cue = () => Number(document.querySelector('[data-cue][data-state="now"]')?.getAttribute('data-cue') ?? -1);
	const reached = await h.until(() => (cue() > 0 ? cue() : null), 30000, 'the live cue to move past cue 0 with the Voice on');
	h.button('Exit present', document).click();
	return { provider, on: true, cue: reached, errors: (window.__kaErrors || []).slice(0, 3) };
}

/** The verdict, shared by run.mjs and probe.selftest.mjs. It judges states reached, never durations (HARD RULE #32). */
function latticeKeepaliveChecks(r, { realSafari }) {
	return [
		// WebKit grants the lock only inside a user gesture, and a slow simulator can stretch a tap past what counts as one. So
		// the claim is the product's: after a real tap (the one that opened Present, or the tap on the slide) the lock is held.
		{ name: 'Present holds a screen wake lock after a real tap', pass: (r.wakeAfterTap?.wake ?? r.open?.wake) === 'held', detail: `at open ${r.open?.wake}, after the slide tap ${r.wakeAfterTap?.wake ?? 'not read'}; navigator.wakeLock ${r.open?.hasApi ? 'present' : 'absent'}${r.taps ? `; Present opened by ${r.taps}` : ''}` },
		{ name: 'Fullscreen turns on the immersive layout, and its chrome fades', pass: r.immersive?.immersive === true, detail: `${realSafari ? 'real full screen ' + (r.immersive?.realFullscreen ? 'granted' : 'refused') : ''} slide ${r.immersive?.frame?.join('x')}` },
		{ name: 'a touch tap on the slide brings the chrome back', pass: r.shown?.shown === true, detail: `top bar opacity ${r.shown?.opacity}${r.slideTaps ? `; the slide tapped by ${r.slideTaps}` : ''}` },
		{ name: 'the captions ride inside the slide and their highlight walks the words', pass: r.play?.inside === true && r.play?.lit > 1, detail: `"${r.play?.caption}" ${r.play?.lit} lit, ${r.play?.fontPx}px on a ${r.play?.frameW}px slide` },
		{ name: 'Next while playing: the next slide plays on its own and the lock is still held', pass: r.next?.to === r.next?.from + 1 && r.next?.still === true && r.next?.wake === 'held', detail: `${r.next?.from} -> ${r.next?.to}, "${r.next?.caption}", wake ${r.next?.wake}` },
		{ name: 'closing Present stops the narration', pass: r.close?.stopped === true, detail: '' },
		// PR #3394. The premise (no voice chosen) is reported, not judged: a simulator that kept a voice would test less, not fail.
		{ name: 'with the Voice on and no voice chosen, the read-along moves past its first cue', pass: r.voiceOn?.on === true && r.voiceOn?.cue > 0, detail: `voice selected: ${JSON.stringify(r.voiceOn?.provider ?? r.play?.provider)}; first Play ran with Voice ${r.play?.voice}; live cue reached ${r.voiceOn?.cue}` },
		{ name: 'preparing no voice throws nothing', pass: Array.isArray(r.voiceOn?.errors) && r.voiceOn.errors.length === 0, detail: (r.voiceOn?.errors || ['not read']).join(' | ') },
	];
}

Object.assign(globalThis, { latticeKeepaliveWake, latticeKeepaliveArmTap, latticeKeepaliveOpened, latticeKeepalivePresentAt, latticeKeepaliveOpen, latticeKeepaliveImmersive, latticeKeepaliveShown, latticeKeepalivePlay, latticeKeepaliveNext, latticeKeepaliveClose, latticeKeepaliveArmErrors, latticeKeepaliveVoiceOn, latticeKeepaliveChecks });
