/**
 * THE PRESENT MEMORY PROBE, the page half (PR #3148). run.mjs drives it in Mobile Safari in the iOS Simulator, and reads
 * the simulator's WebKit footprint on the Mac between its steps; probe.selftest.mjs runs the same steps in Playwright's
 * WebKit, where no footprint can be read. Each step is a global function that resolves to plain JSON:
 *
 *   latticePresentReceive(b64, i, n)   one piece of the `.lattice` fixture (present-memory.mjs), sent in pieces because a
 *                                      WebDriver call carries a string, not 25 MB of bytes
 *   latticePresentImport(title, n)     hand the bytes to the Studio's own "Import deck…" input, as a person picking the file
 *                                      does, and wait until the preview shows the deck
 *   latticePresentReady(title)         after a reload: the deck back from the browser's store, its title in the preview
 *   latticePresentOpen()               tap Present; time until the presented frame shows the first (title) slide, and read
 *                                      the width that slide is laid out at
 *   latticePresentStep(k)              tap Next k times; time each step until the presented slide is the next one and the
 *                                      photo it points at loads and decodes
 *   latticePresentAlive()              the mark latticePresentOpen left: gone means the page reloaded under the probe
 *   latticePresentWatchTurn()          (the landscape probe) record Present's layout through the turn that follows
 *   latticePresentGeometry()           (the landscape probe) the viewport, the density, the slide host's width and the
 *                                      slide's own width on screen, and the width the slide is laid out at, once
 *                                      Present has settled on a canvas
 *   latticePresentCaptions()           (the landscape probe, on a phone) press Play: the captions show over the slide,
 *                                      inside its frame, every line whole, the highlight walking; press Pause; the
 *                                      slide's size never changed
 *
 * A step is done when the counter moved, the presented frame's heading is the new slide's, and the photo URL that slide
 * shows decodes (read back through a fresh Image: it proves the URL the slide holds is a real picture, which a stand-in
 * left unrestored is not, not that the frame finished painting it). Plain browser JS on purpose: WebDriver's execute-script sends source text, not a module.
 */

function latticePresentHelpers() {
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
	const until = async (fn, ms, what) => {
		const t0 = Date.now();
		for (;;) {
			const v = fn();
			if (v) return v;
			if (Date.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
			await sleep(25);
		}
	};
	const visible = (el) => !!el && !el.closest('[inert]') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
	const docOf = (sel) => {
		try {
			return document.querySelector(sel)?.contentDocument || null;
		} catch {
			return null;
		}
	};
	/** The photo address a slide paints: its `<img>`, or the first `url(...)` in a background. */
	const photoOf = (doc) => {
		const sec = doc?.querySelector('section');
		if (!sec) return '';
		const img = sec.querySelector('img');
		if (img?.currentSrc || img?.src) return img.currentSrc || img.src;
		for (const el of [sec, ...sec.querySelectorAll('*')]) {
			const m = /url\(["']?([^"')]+)/.exec(getComputedStyle(el).backgroundImage || '');
			if (m) return m[1];
		}
		return '';
	};
	/** Resolves once the photo at `src` is decoded (a URL the slide already holds decodes from the browser's cache). */
	const decoded = (src) =>
		new Promise((resolve) => {
			const im = new Image();
			im.onload = () => (im.decode ? im.decode().then(() => resolve(true), () => resolve(true)) : resolve(true));
			im.onerror = () => resolve(false);
			im.src = src;
		});
	const heading = (doc) => doc?.querySelector('section h1, section h2')?.textContent?.trim() ?? '';
	const dialog = () => document.querySelector('[role="dialog"][aria-label="Present"]');
	const counter = () => {
		const m = /(\d+) \/ (\d+)/.exec(dialog()?.textContent || '');
		return m ? [Number(m[1]), Number(m[2])] : null;
	};
	const presented = () => docOf('[aria-label="Presented slide"] iframe.live');
	const preview = () => docOf('[aria-label="Live deck preview"] iframe.live');
	// `within` matters: the Studio behind Present has a "Next slide" of its own, which moves the preview, not Present.
	const button = (re, within = document) => [...within.querySelectorAll('button')].find((b) => visible(b) && (re.test(b.getAttribute('aria-label') || '') || re.test(b.textContent.trim())));
	return { sleep, until, visible, photoOf, decoded, heading, dialog, counter, presented, preview, button };
}

function latticePresentReceive(b64, i, n) {
	const bin = atob(b64);
	const part = new Uint8Array(bin.length);
	for (let k = 0; k < bin.length; k++) part[k] = bin.charCodeAt(k);
	if (i === 0) window.__latticePresentParts = [];
	window.__latticePresentParts[i] = part;
	return { got: window.__latticePresentParts.filter(Boolean).length, of: n };
}

async function latticePresentImport(title, slides) {
	const h = latticePresentHelpers();
	const result = { ua: navigator.userAgent, width: innerWidth, steps: [] };
	const parts = window.__latticePresentParts || [];
	const file = new File(parts, 'present-memory.lattice', { type: 'application/zip' });
	window.__latticePresentParts = null;
	// "Import deck…"'s input (StudioShell.tsx): hidden from the reader and the tab order. It names no `accept` on iOS, where
	// naming types grays out a `.lattice` in Files (deck-import-accept.ts), so it is found by those two marks.
	const input = await h.until(() => document.querySelector('input[type="file"][aria-hidden="true"][tabindex="-1"]'), 150000, 'the Studio\'s import input');
	const dt = new DataTransfer();
	dt.items.add(file);
	input.files = dt.files;
	input.dispatchEvent(new Event('change', { bubbles: true }));
	const t0 = Date.now();
	await h.until(() => h.heading(h.preview()) === `${title}.` || /Photo \d+\./.test(h.heading(h.preview())), 150000, `the preview to show "${title}"`);
	result.importMs = Date.now() - t0;
	result.bytes = file.size;
	result.slides = slides;
	return result;
}

async function latticePresentReady(title) {
	const h = latticePresentHelpers();
	const t0 = Date.now();
	const want = `${title || 'Present memory probe'}.`;
	const doc = await h.until(() => {
		const d = h.preview();
		return d && (h.heading(d) === want || /Photo \d+\./.test(h.heading(d))) ? d : null;
	}, 150000, 'the imported deck in the preview after the reload');
	return { readyMs: Date.now() - t0, heading: h.heading(doc), ua: navigator.userAgent, width: innerWidth };
}

async function latticePresentOpen() {
	const h = latticePresentHelpers();
	window.__latticePresentMark = `m${Date.now()}`;
	const present = await h.until(() => h.button(/^Present$/), 30000, 'the Present button');
	const t0 = Date.now();
	present.click();
	await h.until(() => h.dialog() && h.counter(), 30000, 'the Present dialog and its counter');
	// Present opens on the Studio's active slide, the first after an import or a reload: wait for its picture.
	const doc = await h.until(() => {
		const d = h.presented();
		return d && h.heading(d) ? d : null;
	}, 60000, 'the presented slide');
	const shownMs = Date.now() - t0;
	const [at, total] = h.counter();
	if (at !== 1) throw new Error(`Present opened on slide ${at}, not the first`);
	// The width the presented slide is laid out at, before the frame's scale (the 4K arm judges it).
	const sec = doc.querySelector('section');
	const box = sec ? getComputedStyle(sec).width : '';
	return { openMs: shownMs, total, heading: h.heading(doc), mark: window.__latticePresentMark, box };
}

async function latticePresentStep(k) {
	const h = latticePresentHelpers();
	const steps = [];
	for (let s = 0; s < k; s++) {
		const before = h.counter()[0];
		const want = `Photo ${before}.`; // slide 1 is the title, so slide n+1 is Photo n
		const next = await h.until(() => h.dialog() && h.button(/^Next slide$/, h.dialog()), 15000, 'Present\'s Next slide button');
		const t0 = Date.now();
		next.click();
		const doc = await h.until(() => {
			const c = h.counter();
			const d = h.presented();
			return c && c[0] === before + 1 && d && h.heading(d) === want ? d : null;
		}, 60000, `slide ${before + 1} ("${want}")`);
		const src = await h.until(() => h.photoOf(doc), 30000, `the photo on "${want}"`);
		const painted = await h.decoded(src);
		steps.push({ to: before + 1, ms: Date.now() - t0, photo: painted, scheme: src.split(':')[0] });
	}
	return { steps };
}

function latticePresentAlive() {
	return { mark: window.__latticePresentMark || null };
}

/**
 * Start recording what Present does through a turn, before the driver turns the device: every 50 ms, the slide host's
 * width, the viewport, and whether the rotation hold (`data-settling`, the cover) and the immersive layout are on.
 * latticePresentGeometry() stops it and reports the changes. Reported, never judged: it shows whether real iOS, like
 * Playwright's WebKit, leaves the slide a small uncovered box until the orientation `change` event arrives.
 */
function latticePresentWatchTurn() {
	const t0 = performance.now();
	const rows = [];
	let last = '';
	window.__latticeTurnSawHold = false;
	clearInterval(window.__latticeTurnWatch);
	window.__latticeTurnWatch = setInterval(() => {
		const d = document.querySelector('[role="dialog"][aria-label="Present"]');
		const host = [...(d?.querySelectorAll('*') || [])].find((el) => el.__latticeScreenCanvas && el.querySelector('iframe.live'));
		const hold = !!d?.hasAttribute('data-settling');
		if (hold) window.__latticeTurnSawHold = true;
		const v = `host ${host?.clientWidth ?? '-'} vw ${innerWidth}x${innerHeight}${hold ? ' hold' : ''}${d?.querySelector('[data-present-immersive]') ? ' immersive' : ''}`;
		if (v !== last && rows.length < 40) rows.push(`${Math.round(performance.now() - t0)}ms ${v}`);
		last = v;
		if (performance.now() - t0 > 30000) clearInterval(window.__latticeTurnWatch);
	}, 50);
	window.__latticeTurnRows = rows;
	return { watching: true };
}

async function latticePresentGeometry() {
	const h = latticePresentHelpers();
	// The host the renderer measured: the element single-slide-render.ts tagged with its screen-canvas record, inside
	// Present. Its clientWidth is the width screenCanvas() was given, so the verdict applies the rule to the same number.
	const host = () => [...(h.dialog()?.querySelectorAll('*') || [])].find((el) => el.__latticeScreenCanvas && el.querySelector('iframe.live'));
	const read = () => {
		const el = host();
		const fr = el?.querySelector('iframe.live');
		const sec = fr?.contentDocument?.querySelector('section');
		const r = fr?.getBoundingClientRect();
		return { innerW: innerWidth, innerH: innerHeight, dpr: devicePixelRatio, orientation: screen.orientation?.type || '', hostW: el?.clientWidth ?? 0, slideW: r ? Math.round(r.width) : 0, box: sec ? getComputedStyle(sec).width : '', canvas: el ? String(el.__latticeScreenCanvas.canvas) : '' };
	};
	// A turned phone re-lays Present out in steps (`data-settling`), and a resize that crosses the screen canvas line
	// re-renders the slide once after it settles (single-slide-render.ts scaleFrame). The settling mark can arrive AFTER
	// the turn's first frame, so its absence alone proved nothing (a self-test read a 100 px host mid-turn). Wait for the
	// layout to hold: no settling mark, a host of at least 100 px, and the same host, slide and canvas on two reads a
	// quarter-second apart, bounded at 20 s. A layout that never holds is returned as it is, and the verdict fails on it.
	// The signal is Present's own rotation hold: once it has come and gone, the layout is the turned one. In Playwright's
	// WebKit the hold arrives 0.6-0.8 s after the resize, and until then the slide is a 71-100 px box that holds still,
	// so "still for a moment" alone was not enough. Where the hold is never seen (a real device can finish it before
	// the driver's own landscape check returns), the layout must instead stay unchanged for 2 s. Bounded at 20 s.
	const key = (x) => `${x.hostW}|${x.slideW}|${x.box}|${x.innerW}x${x.innerH}`;
	let prev = read();
	let since = Date.now();
	let g = prev;
	for (const t0 = Date.now(); Date.now() - t0 < 20000; ) {
		await h.sleep(250);
		const x = read();
		if (key(x) !== key(prev)) since = Date.now();
		prev = x;
		const holding = !!h.dialog()?.hasAttribute('data-settling');
		const ready = x.hostW >= 100 && x.box && !holding && Date.now() - since >= (window.__latticeTurnSawHold ? 250 : 2000);
		if (ready) {
			g = x;
			break;
		}
		g = x;
	}
	clearInterval(window.__latticeTurnWatch);
	return { ...g, sawHold: !!window.__latticeTurnSawHold, turn: (window.__latticeTurnRows || []).join(' | ') };
}

async function latticePresentCaptions() {
	const h = latticePresentHelpers();
	const d = h.dialog();
	const frame = () => d.querySelector('[data-slide-frame]');
	const band = () => d.querySelector('.latt-cc-band[data-shown="1"]');
	const size = () => {
		const r = frame().getBoundingClientRect();
		return `${Math.round(r.width)}x${Math.round(r.height)}`;
	};
	const walked = (b) => b.querySelectorAll('.latt-cc-line[data-state="now"] [data-spoken="1"]').length + b.querySelectorAll('.latt-cc-line[data-state="read"]').length;
	const out = { frameBefore: size() };
	try {
		(await h.until(() => h.button(/^Play the presentation$/, d), 15000, 'Play')).click();
		await h.until(() => h.button(/^Pause$/, d), 15000, 'the transport to read Pause');
		const b = await h.until(band, 30000, 'the captions');
		await h.until(() => walked(b) > 1, 20000, 'the caption highlight to move past the first word');
		// The band fades in: wait for its height, not a duration.
		await h.until(() => b.getBoundingClientRect().height > 20, 10000, 'the caption band to take its height');
		const fr = frame().getBoundingClientRect();
		const cr = b.getBoundingClientRect();
		const cs = getComputedStyle(b);
		const inner = b.clientHeight - Number.parseFloat(cs.paddingTop) - Number.parseFloat(cs.paddingBottom);
		const track = b.querySelector('.latt-cc-track');
		Object.assign(out, {
			inside: cr.top >= fr.top - 1 && cr.bottom <= fr.bottom + 1 && cr.left >= fr.left - 1 && cr.right <= fr.right + 1,
			lit: walked(b),
			caption: (b.querySelector('.latt-cc-line[data-state="now"]')?.textContent || '').trim().slice(0, 60),
			lines: b.querySelectorAll('.latt-cc-line').length,
			bandH: Math.round(inner),
			trackH: track ? track.offsetHeight : 0,
			// The band over the slide sizes to its sentence (stage-chrome.js `.latt-cc-over .latt-cc-band`, height:auto):
			// a fixed band either clips a caption that wraps or leaves it adrift in empty space. Within 2 px of rounding.
			clipped: !track || Math.abs(inner - track.offsetHeight) > 2 || b.scrollHeight > b.clientHeight + 1,
		});
		h.button(/^Pause$/, d).click();
		await h.until(() => h.button(/^Play the presentation$/, d), 15000, 'the transport to read Play');
	} catch (e) {
		out.error = String(e.message || e).slice(0, 200);
	}
	out.frameAfter = size();
	out.resized = out.frameAfter !== out.frameBefore;
	return out;
}

// The steps are reached by name from source text (run.mjs's execute-script, probe.selftest.mjs's evaluate), never imported,
// so they are put on the page's global object here rather than left as declarations that look unused.
Object.assign(globalThis, { latticePresentReceive, latticePresentImport, latticePresentReady, latticePresentOpen, latticePresentStep, latticePresentAlive, latticePresentWatchTurn, latticePresentGeometry, latticePresentCaptions });
