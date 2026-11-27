/**
 * THE GALLERY REOPEN PROBE, run INSIDE the Studio page by WebDriver (run.mjs, PROBE=gallery-memory) on Mobile Safari in the
 * iOS Simulator, and by the Playwright self-test (probe.selftest.mjs) on WebKit. It checks #3441 on real Mobile Safari:
 * reopening the Add slide gallery rewrites no preview frame the pool already keeps.
 *
 * Why it matters on a phone: WebKit never frees a preview document. Before #3441 the preview pool
 * (docs/src/components/studio/preview-pool.tsx) handed a plain tile the one frame built for the Mermaid tile when its own
 * frames were busy, and the Mermaid tile then took a plain one back. Each swap is a full `srcdoc` write into a kept frame,
 * so a LITE device (ceiling 12) paid about two documents on every reopen, without limit.
 *
 * The steps are MR-3's (docs/e2e/gallery-preview-metamorphic.spec.ts), because a plain open and close does not hit the
 * leak: the pool has to be at its high-water mark first. `latticeGalleryInstall` counts every preview document the page
 * makes from then on (each `<iframe>` made, each `srcdoc` written) and every REWRITE (a `srcdoc` into a frame that already
 * held one), as docs/e2e/preview-documents.ts does. Installing it after the page loads is enough: the gallery's frames
 * are all made after it. `latticeGalleryCycle(i)` then opens the gallery through "New slide" → "New slide after", primes
 * the pool on the first cycle with a stepped walk to the bottom and back, flicks to the bottom, closes, and returns the
 * counts. The runner reads memory between cycles. The verdict, `galleryChecks` in gallery-memory.mjs, counts work, not
 * time (HARD RULE #32): no rewrite after the first close, and no per-open residue.
 *
 * The file defines globals for WebDriver's execute-script and Playwright's addScriptTag. Plain browser JS on purpose:
 * WebDriver's execute-script sends source text, not a module.
 */
const LATTICE_GALLERY_SCROLLER = 'div.overflow-y-auto.overscroll-contain';

// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
function latticeGalleryInstall() {
	const w = window;
	if (w.__latticeGalleryCounting) return { ok: true, already: true };
	w.__latticeGalleryCounting = true;
	w.__latticeDocs = 0;
	w.__latticeRewrites = 0;
	const written = new WeakSet();
	const note = (f) => {
		if (written.has(f)) w.__latticeRewrites++;
		else written.add(f);
	};
	// Frames that already hold a document when the counter starts (the Studio's own preview) count as written, so their
	// next srcdoc is a rewrite too; none of them is a gallery frame, and a slide edit is not part of this probe.
	for (const f of document.querySelectorAll('iframe')) written.add(f);
	const d = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'srcdoc');
	if (d?.set) {
		const set = d.set;
		Object.defineProperty(HTMLIFrameElement.prototype, 'srcdoc', {
			...d,
			set(v) {
				w.__latticeDocs++;
				note(this);
				set.call(this, v);
			},
		});
	}
	const setAttr = Element.prototype.setAttribute;
	Element.prototype.setAttribute = function (name, value) {
		if (this instanceof HTMLIFrameElement && String(name).toLowerCase() === 'srcdoc') {
			w.__latticeDocs++;
			note(this);
		}
		return setAttr.call(this, name, value);
	};
	const ce = Document.prototype.createElement;
	Document.prototype.createElement = function (tag, opts) {
		if (String(tag).toLowerCase() === 'iframe') w.__latticeDocs++;
		return ce.call(this, tag, opts);
	};
	return { ok: true, ua: navigator.userAgent, width: innerWidth, tier: document.documentElement.dataset.deviceTier || '' };
}

// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticeGalleryCycle(cycle) {
	const sel = LATTICE_GALLERY_SCROLLER;
	// One animation frame, or 100 ms if no frame comes: a page Safari stops painting (a simulator screen
	// that sleeps, a tab it puts in the background) delivers no frames, and an unbounded wait would hang
	// the probe until WebDriver's 360 s script limit, once per call.
	const frame = () =>
		new Promise((r) => {
			const t = setTimeout(r, 100);
			requestAnimationFrame(() => {
				clearTimeout(t);
				r();
			});
		});
	const frames = async (n) => {
		for (let i = 0; i < n; i++) await frame();
	};
	// Every wait polls a signal with a deadline (HARD RULE #32); the deadline is only there to fail by name.
	const until = async (fn, ms, what) => {
		const t0 = performance.now();
		for (;;) {
			const v = fn();
			if (v) return v;
			if (performance.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
			await frames(2);
		}
	};
	const scroller = () => document.querySelectorAll(sel)[0];
	const shown = () => {
		const sc = document.querySelector(sel);
		return !!sc && sc.getClientRects().length > 0;
	};
	const mounted = () => scroller()?.querySelectorAll('iframe.live').length ?? 0;
	const live = () => document.querySelectorAll('iframe.live').length;
	// Settled: the count unchanged across six reads 300 ms apart, as MR-3's `quiesced` polls. Memory and the window have no
	// "settled" event; stability is the signal.
	const quiesced = async (read, ms = 25000, reads = 5, gap = 300) => {
		let last = -1;
		let stable = 0;
		const t0 = performance.now();
		while (stable < reads) {
			if (performance.now() - t0 > ms) throw new Error('the preview window never stopped changing');
			await new Promise((r) => setTimeout(r, gap));
			const n = read();
			stable = n === last ? stable + 1 : 0;
			last = n;
		}
		return last;
	};
	const visibleButton = (name) =>
		[...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent || '').trim() === name && b.getClientRects().length > 0 && !b.closest('[inert]'));
	const jumpTo = (y) => {
		const el = scroller();
		if (el) el.scrollTop = y;
	};
	// REPORTED, never judged: the most preview tiles partly inside the scroller at one moment, and the scroll offset where
	// it happened. The pool's ceiling follows this count (preview-pool.tsx, `seen`), so it says which step of a cycle set
	// the pool's high-water mark.
	const peak = { n: 0, y: -1 };
	const peek = () => {
		const el = scroller();
		if (!el) return;
		const box = el.getBoundingClientRect();
		let n = 0;
		// A tile is a cell of a grid in the scroller, filled or not: what the pool's `seen` counts, not the frames it holds.
		const cells = [...el.querySelectorAll('*')].filter((g) => g.children.length > 1 && getComputedStyle(g).display === 'grid').flatMap((g) => [...g.children]);
		for (const tile of cells) {
			const r = tile.getBoundingClientRect();
			if (Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top) > 1 && Math.min(r.right, box.right) - Math.max(r.left, box.left) > 1) n++;
		}
		if (n > peak.n) {
			peak.n = n;
			peak.y = Math.round(el.scrollTop);
		}
	};
	const takePeak = () => {
		const out = `${peak.n}@${peak.y}`;
		peak.n = 0;
		peak.y = -1;
		return out;
	};
	try {
		const t0 = performance.now();
		// Open: the door splits into Before | After; After opens the gallery (2026-10-27-slide-structure-strip.md §5).
		// The FIRST open on a page is a cold start: the engine and the gallery's catalog load then, and on a freshly
		// booted simulator that took longer than 30 s (harness run 45965226985, iPad, LITE, cycle 1). So the first
		// cycle's waits get the cold-start bound run.mjs gives every probe (150 s, D3 on #3034); later ones stay short.
		// Each is a deadline on a signal, not a sleep (HARD RULE #32).
		const cold = cycle === 0 ? 150000 : 30000;
		(await until(() => visibleButton('New slide'), cold, 'the New slide button')).click();
		(await until(() => visibleButton('New slide after'), 10000, 'New slide after')).click();
		await until(shown, cold, 'the gallery');
		await until(() => mounted() > 1, cold, 'the gallery to mount a preview');
		if (cycle === 0) {
			// PRIME the pool to its high-water mark, as MR-3 does: a stepped walk rests on every row, so every tile shape
			// (Mermaid, a local component's CSS) gets its frame before the first close is counted.
			// The pool's ceiling follows the tiles PARTLY on screen, so its high-water mark is the most tiles any offset shows:
			// 16 at 1440x900, at 79 of 475 offsets 10 px apart (the first at 2100 px; 9 to 15 everywhere else). The walk
			// steps well under a row, and at each rest it waits for the pool to SETTLE, not for a number of frames: Mac
			// Safari had not run the pass within 8 frames, so its prime stopped at 13 and the pool reached 16 in cycle 4,
			// which counted as 6 new documents in 3 reopens (harness #3 on #3441, run 46014889905).
			const el = scroller();
			const bottom = el ? el.scrollHeight - el.clientHeight : 0;
			for (let y = 0; y <= bottom; y += 100) {
				jumpTo(y);
				await frames(2);
				await quiesced(mounted, 25000, 2, 150);
				peek();
			}
			jumpTo(bottom);
			jumpTo(0);
			await quiesced(mounted);
		}
		const primeSeen = cycle === 0 ? takePeak() : '';
		// A flick: a continuous frame-by-frame scroll to the bottom, the way a person flings the grid. It stops
		// at the bottom, when a step no longer moves the grid (a fractional scrollHeight can leave it 1 px
		// short for ever), or after 400 steps, whichever comes first.
		{
			const el = scroller();
			for (let n = 0; el && n < 400; n++) {
				const before = el.scrollTop;
				el.scrollTop += 260;
				if (el.scrollTop >= el.scrollHeight - el.clientHeight - 1 || el.scrollTop === before) break;
				await frame();
				peek();
			}
		}
		const opened = await quiesced(mounted);
		peek();
		const flickSeen = takePeak();
		// Close: Escape, which the sheet takes from the document; the sheet's Close button if Escape did not close it.
		const target = document.activeElement || document.body;
		target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
		const t1 = performance.now();
		while (shown() && performance.now() - t1 < 3000) await frames(2);
		let closedBy = 'Escape';
		if (shown()) {
			const dialog = scroller()?.closest('[role="dialog"]');
			const close = dialog && [...dialog.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Close');
			if (!close) throw new Error('Escape left the gallery open and it has no Close button');
			close.click();
			closedBy = 'Close';
		}
		await until(() => !shown(), 20000, 'the gallery to close');
		const closed = await quiesced(live);
		return {
			ok: true,
			cycle,
			opened,
			closed,
			closedBy,
			primeSeen,
			flickSeen,
			docs: window.__latticeDocs ?? 0,
			rewrites: window.__latticeRewrites ?? 0,
			tier: document.documentElement.dataset.deviceTier || '',
			ms: Math.round(performance.now() - t0),
		};
	} catch (e) {
		return { ok: false, cycle, error: String(e?.message || e), docs: window.__latticeDocs ?? 0, rewrites: window.__latticeRewrites ?? 0 };
	}
}

/**
 * (e) What a reopen SHOWS, MR-8's shape (docs/e2e/gallery-preview-metamorphic.spec.ts): open at the top, wait for every
 * tile on screen to show its slide, return to the top and close. The cycles above flick to the bottom before each close,
 * and the tiles there still hold their frames when the gallery reopens, so they cannot see a reopen that leaves the top
 * tiles blank: the pool deciding who gets a frame while the phone sheet is still sliding up (preview-pool.tsx, the pass
 * when the surface stops moving). The Blank tile draws no slide by design and is left out. Returns the labels of the
 * tiles on screen still showing no slide after 20 s, or an empty list.
 */
// biome-ignore lint/correctness/noUnusedVariables: a global for WebDriver's execute-script and Playwright's addScriptTag
async function latticeGalleryShows(open) {
	const sel = LATTICE_GALLERY_SCROLLER;
	const frame = () =>
		new Promise((r) => {
			const t = setTimeout(r, 100);
			requestAnimationFrame(() => {
				clearTimeout(t);
				r();
			});
		});
	const scroller = () => document.querySelectorAll(sel)[0];
	const shown = () => {
		const sc = document.querySelector(sel);
		return !!sc && sc.getClientRects().length > 0;
	};
	const until = async (fn, ms, what) => {
		const t0 = performance.now();
		for (;;) {
			const v = fn();
			if (v) return v;
			if (performance.now() - t0 > ms) throw new Error(`timed out after ${ms} ms waiting for ${what}`);
			await frame();
			await frame();
		}
	};
	const visibleButton = (name) =>
		[...document.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent || '').trim() === name && b.getClientRects().length > 0 && !b.closest('[inert]'));
	// The tiles on screen that show no slide: a pooled frame sits OVER its tile (same top-left), not inside it.
	const unpainted = () => {
		const sc = scroller();
		if (!sc) return ['(no gallery)'];
		const r = sc.getBoundingClientRect();
		const frames = [...document.querySelectorAll('iframe.live')];
		const out = [];
		for (const box of sc.querySelectorAll('.aspect-video')) {
			const b = box.getBoundingClientRect();
			if (b.bottom <= r.top || b.top >= r.bottom || b.height < 4) continue;
			const label = box.closest('[aria-label]')?.getAttribute('aria-label') || '';
			if (label.startsWith('Insert Blank')) continue;
			const fr = frames.find((f) => {
				const q = f.getBoundingClientRect();
				return q.width > 4 && Math.abs(q.top - b.top) < 3 && Math.abs(q.left - b.left) < 3;
			});
			let painted = false;
			try {
				painted = !!fr?.contentDocument?.querySelector('.lattice, section[data-lattice-slide]');
			} catch {
				painted = false;
			}
			if (!painted) out.push(label.split(' — ')[0] || '(unlabeled)');
		}
		return out;
	};
	try {
		(await until(() => visibleButton('New slide'), open === 0 ? 150000 : 30000, 'the New slide button')).click();
		(await until(() => visibleButton('New slide after'), 10000, 'New slide after')).click();
		await until(shown, 30000, 'the gallery');
		const sc = scroller();
		if (sc) sc.scrollTop = 0;
		const t0 = performance.now();
		let blank = unpainted();
		while (blank.length && performance.now() - t0 < 20000) {
			await frame();
			blank = unpainted();
		}
		const target = document.activeElement || document.body;
		target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
		const t1 = performance.now();
		while (shown() && performance.now() - t1 < 3000) await frame();
		if (shown()) {
			const dialog = scroller()?.closest('[role="dialog"]');
			const close = dialog && [...dialog.querySelectorAll('button')].find((b) => (b.textContent || '').trim() === 'Close');
			if (close) close.click();
		}
		await until(() => !shown(), 20000, 'the gallery to close');
		return { ok: true, open, blank };
	} catch (e) {
		return { ok: false, open, error: String(e?.message || e) };
	}
}

