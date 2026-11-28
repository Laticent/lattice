// Probe: does every slide's coda (key insight, note, source line) reach a real VS Code preview as the engine draws it?
//
// `readSlides` is the one projection, run in the marp-vscode preview frame here and in a Chromium page over the engine's
// own `.html` render by tools/vscode-harness/coda-engine-read.mjs, so both sides are read by the same code. Per slide:
// the key insight's text, the note's text, the source line's text, whether the coda cell sits inside the slide, and
// whether every authored beat's words are still somewhere on the slide (raw or drawn).
//
//   node tools/vscode-harness/coda-engine-read.mjs <deck.md> > .scratch/expect.json
//   PROBE_LEVEL=disable PROBE_EXPECT=.scratch/expect.json PROBE_OUT=.scratch/shots \
//     node tools/vscode-preview-probe.mjs --host desktop --level disable --edits 0 --deck <deck.md> \
//       --probe tools/vscode-harness/probes/coda-parity.mjs --out .scratch/vscode
//
// Pass, runtime on (`disable`): the runtime ran, the preview has the engine's slide count, and on every slide the three
// beats read exactly as on the engine and the coda cell sits inside the slide. Pass, runtime off (`strict`): the runtime
// did not run, the kit's notice shows, and every beat the engine drew still has its words on the slide (nothing lost,
// drawn raw). PROBE_OUT, when set, gets one screenshot of the preview per slide.
import fs from 'node:fs';
import path from 'node:path';

export function readSlides() {
	const text = (el) => (el ? el.textContent.replace(/\s+/g, ' ').trim() : null);
	const inside = (a, b) => a.top >= b.top - 1 && a.bottom <= b.bottom + 1 && a.left >= b.left - 1 && a.right <= b.right + 1;
	return [...document.querySelectorAll('section')]
		.filter((s) => !s.closest('section section') && s.parentElement?.closest('section') == null)
		.map((s, i) => {
			// Every coda cell on the slide: a split run's folded page can carry the insight and the note in a cell each.
			const cells = [...s.querySelectorAll('.cell-coda')];
			const sr = s.getBoundingClientRect();
			const inCell = (sel) => cells.map((c) => c.querySelector(sel)).find(Boolean);
			const insight = inCell('blockquote');
			const note = inCell('.below-note:not(.is-annotation)') || s.querySelector('figcaption .below-note:not(.is-annotation), .below-note:not(.is-annotation)');
			const source = inCell('.below-note.is-annotation') || s.querySelector('.below-note.is-annotation');
			return {
				i: i + 1,
				cls: (s.getAttribute('data-class') || s.className || '').replace(/\s+/g, ' ').trim(),
				head: text(s.querySelector('h1, h2')),
				insight: text(insight),
				note: text(note),
				source: text(source),
				codaInside: cells.length ? cells.every((c) => inside(c.getBoundingClientRect(), sr)) : null,
				all: text(s),
			};
		});
}

const live = async (page) => {
	for (const f of page.frames()) {
		try {
			if (await f.evaluate(() => document.body?.classList.contains('marp-vscode'))) return f;
		} catch {
			/* detached */
		}
	}
	return null;
};

/** Run `fn(frame)` on the live preview frame, finding it again when VS Code re-creates it mid-read (bounded, ~10 s). */
async function onLive(page, fallback, sleep, fn) {
	let last;
	for (let i = 0; i < 20; i++) {
		const f = (await live(page)) || fallback;
		try {
			return await fn(f);
		} catch (e) {
			last = e;
			await sleep(500);
		}
	}
	throw last;
}

export async function probe({ page, frame, sleep }) {
	const level = process.env.PROBE_LEVEL || 'disable';
	const expect = process.env.PROBE_EXPECT ? JSON.parse(fs.readFileSync(process.env.PROBE_EXPECT, 'utf8')) : null;
	const ev = (fn, arg) => onLive(page, frame, sleep, (f) => f.evaluate(fn, arg));
	// With the runtime allowed, wait for it to stamp the page (a 120-slide deck takes seconds), bounded at about 60 s.
	let runtime = false;
	for (let i = 0; i < (level === 'disable' ? 120 : 1) && !runtime; i++) {
		runtime = await ev(() => document.documentElement.hasAttribute('data-lattice-runtime'));
		if (!runtime && level === 'disable') await sleep(500);
	}
	await sleep(2500); // the runtime's late passes (figure captions, fit) after it stamps the page; and the notice's fade-in
	const notice = await ev(() => {
		const b = getComputedStyle(document.body, '::before');
		return b.content && b.content !== 'none' ? b.opacity : null;
	});
	const slides = await ev(readSlides);
	const out = process.env.PROBE_OUT;
	if (out) {
		fs.mkdirSync(out, { recursive: true });
		const n = slides.length;
		for (let k = 0; k < n; k++) {
			await onLive(page, frame, sleep, (f) =>
				f.evaluate((idx) => {
					const all = [...document.querySelectorAll('section')].filter((s) => s.parentElement?.closest('section') == null);
					all[idx]?.scrollIntoView({ block: 'center' });
				}, k),
			);
			await sleep(500);
			// The whole window, VS Code's own chrome included: the artifact shows which surface it came from.
			await page.screenshot({ path: path.join(out, `slide-${String(k + 1).padStart(2, '0')}.png`) });
		}
	}
	// Pair each engine slide with its preview slide. Same count: by position. Otherwise (the engine split a slide Marp
	// keeps whole) by heading, in order, so one split run cannot shift every later pair.
	const pairs = [];
	if (expect && expect.length === slides.length) {
		for (let k = 0; k < expect.length; k++) pairs.push([expect[k], slides[k]]);
	} else if (expect) {
		let from = 0;
		for (const e of expect) {
			const k = slides.findIndex((v, idx) => idx >= from && v.head === e.head);
			if (k >= 0) from = k + (e.head ? 1 : 0);
			pairs.push([e, k >= 0 ? slides[k] : null]);
		}
	}
	// Hand back only once the preview frame holds still for a second: scrolling it for the screenshots can make VS Code
	// re-create it, and the harness reads its own state from the frame right after this returns.
	for (let i = 0; i < 20; i++) {
		const a = await live(page);
		await sleep(1000);
		if (a && a === (await live(page)) && (await a.evaluate(() => true).catch(() => false))) break;
	}
	const mismatches = [];
	if (expect && expect.length !== slides.length) mismatches.push({ note: 'slide counts differ; paired by heading', engine: expect.length, vscode: slides.length });
	for (const [e, v] of pairs) {
		if (!v) {
			if (e.insight || e.note || e.source) mismatches.push({ slide: e.i, cls: e.cls, unpaired: true });
			continue;
		}
		for (const beat of ['insight', 'note', 'source']) {
			if (!e[beat]) continue;
			if (level === 'disable' ? v[beat] !== e[beat] : !v.all.includes(e[beat])) mismatches.push({ slide: e.i, vs: v.i, cls: e.cls, beat, engine: e[beat], vscode: v[beat] });
		}
		if (level === 'disable') {
			for (const beat of ['insight', 'note', 'source']) if (!e[beat] && v[beat] && expect.length === slides.length) mismatches.push({ slide: e.i, cls: e.cls, beat, engine: null, vscode: v[beat] });
			if (v.codaInside === false) mismatches.push({ slide: e.i, vs: v.i, cls: e.cls, clipped: true });
		}
	}
	const countsDiffer = !!expect && expect.length !== slides.length;
	const beats = (list) => ({
		insight: list.filter((s) => s.insight).length,
		note: list.filter((s) => s.note).length,
		source: list.filter((s) => s.source).length,
	});
	const pass = level === 'disable'
		? runtime && !notice && !!expect && mismatches.length === (countsDiffer ? 1 : 0)
		: !runtime && notice === '1' && !!expect && mismatches.length === (countsDiffer ? 1 : 0);
	return {
		level,
		pass,
		runtime,
		notice,
		slides: slides.length,
		vscodeBeats: beats(slides),
		engineBeats: expect ? beats(expect) : null,
		mismatches,
		perSlide: slides.map(({ all, ...s }) => s),
	};
}
