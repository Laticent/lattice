/**
 * THE PRESENT MEMORY PROBE, the page half (PR #3148). run.mjs drives it in Mobile Safari in the iOS Simulator, and reads
 * the simulator's WebKit footprint on the Mac between its steps; probe.selftest.mjs runs the same steps in Playwright's
 * WebKit, where no footprint can be read. Each step is a global function that resolves to plain JSON:
 *
 *   latticePresentReceive(b64, i, n)   one piece of the `.lattice` fixture (present-memory.mjs), sent in pieces because a
 *                                      WebDriver call carries a string, not 25 MB of bytes
 *   latticePresentImport(title, n)     hand the bytes to the Studio's own "Import deck…" input, as a person picking the file
 *                                      does, and wait until the preview shows the deck
 *   latticePresentReady(n)             after a reload: the deck back from the browser's store, its first photo painted
 *   latticePresentOpen()               tap Present; time until the first slide's photo is painted
 *   latticePresentStep(k)              tap Next k times; time each step until the next slide's photo is painted
 *   latticePresentAlive()              the mark latticePresentOpen left: gone means the page reloaded under the probe
 *
 * A step is done when the reader could see it: the counter moved AND the presented slide's heading and photo are the new
 * ones. Plain browser JS on purpose: WebDriver's execute-script sends source text, not a module.
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

async function latticePresentReady() {
	const h = latticePresentHelpers();
	const t0 = Date.now();
	const doc = await h.until(() => {
		const d = h.preview();
		return d && /Present memory probe\.|Photo \d+\./.test(h.heading(d)) ? d : null;
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
	return { openMs: shownMs, total, heading: h.heading(doc), mark: window.__latticePresentMark };
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

// The steps are reached by name from source text (run.mjs's execute-script, probe.selftest.mjs's evaluate), never imported,
// so they are put on the page's global object here rather than left as declarations that look unused.
Object.assign(globalThis, { latticePresentReceive, latticePresentImport, latticePresentReady, latticePresentOpen, latticePresentStep, latticePresentAlive });
