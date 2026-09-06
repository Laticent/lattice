// Diagram flash bench — how many PAINTED FRAMES show raw Mermaid source?
//
// The instrument behind the "the fence flashes before the diagram" report. It exists
// because every other number available for this bug is a proxy: `data-mermaid-state`
// tells you when the runtime TAGGED a fence, not whether the browser had already
// painted it; a screenshot tells you what one moment looked like, not for how long.
//
// THE MEASUREMENT. A `requestAnimationFrame` callback runs immediately before the
// frame it belongs to is composited, so the state read there IS the state that frame
// paints. The sampler runs inside the live preview iframe and, on every frame,
// records whether a `<pre>` holding a ```mermaid fence is displayed and whether the
// rendered SVG is present. A run therefore reports, per slide navigation:
//
//   source   — frames painted showing raw Mermaid source (the flash)
//   blank    — frames painted showing an empty diagram slot (the wait)
//   diagram  — the frame the SVG first painted on
//   shift    — layout shift (the "jump") accumulated across the swap
//
// Frames, not only milliseconds, because a human perceives a wrong frame — and the
// same 150ms is 9 frames on this machine and 18 on a 120Hz one. Both are printed.
//
// WHY THE REAL STUDIO. The flash is a race between an `innerHTML` swap in the parent
// and a debounced MutationObserver inside a srcdoc iframe (HARD RULE #23): a jsdom
// harness has no frames to count and no compositor to lose the race to. This drives
// the built site at `/studio/`, types a deck into the real editor, and clicks the
// real preview rail.
//
// Usage (from docs/), against a built docs/dist:
//   npm run build:e2e && npm run bench:flash -- [flags]
//
//   --scenario nav|type   click between slides (default), or type on a diagram slide
//   --order 1,2,3,4       the navigation cycle; `--order 2,4` stays inside the diagram
//                         slides, which is what tells a realm rewrite from a patch
//   --cpu N               throttle the CPU N× through CDP (default 1)
//   --runs N              cycles (default 5) · --variant NAME · --json · --shots
//   --css FILE            inject a candidate stylesheet into the preview frame
//   --js FILE             inject a candidate script into the preview frame
//
// `--cpu` earns its place: the flash is a race, and a race measured only on an idle
// developer machine is measured at its most flattering. `--css` / `--js` apply at
// document-start — the same moment a rule shipped in `lattice.css` would — so a
// candidate can be priced without a rebuild. It is a stand-in for shipping, not
// shipping: cascade POSITION differs, so re-measure a winner from a real build.

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4321;
const BASE = `http://localhost:${PORT}`;

function parseArgs(argv) {
	const o = { runs: 5, json: false, variant: 'baseline', cpu: 1, shots: false, order: [1, 2, 3, 4], css: '', js: '', scenario: 'nav' };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--runs') o.runs = Number(argv[++i]);
		else if (a === '--json') o.json = true;
		else if (a === '--variant') o.variant = argv[++i];
		else if (a === '--cpu') o.cpu = Number(argv[++i]);
		else if (a === '--shots') o.shots = true;
		// The navigation cycle, 1-based slide numbers. The default crosses the
		// text↔diagram boundary every step; `--order 2,4` stays inside the diagram
		// slides, which is the case that tells a realm rewrite from a patch.
		else if (a === '--order') o.order = argv[++i].split(',').map(Number);
		// A CANDIDATE, injected into the preview frame at document-start so it applies to
		// the first paint — the same moment a rule shipped in `lattice.css` would. It is a
		// stand-in for shipping, not shipping: cascade POSITION differs (this lands last),
		// so a candidate that wins here is re-measured from a real build before it lands.
		else if (a === '--css') o.css = argv[++i];
		else if (a === '--js') o.js = argv[++i];
		// `nav` clicks between slides; `type` stays on a diagram slide and types into its
		// heading — the interaction an author spends the most time in, and a different race
		// (the preview re-renders on a keystroke debounce, into a resident document).
		else if (a === '--scenario') o.scenario = argv[++i];
		else throw new Error(`unknown arg: ${a}`);
	}
	return o;
}

// A deck that alternates a plain slide with a diagram slide, so every navigation
// crosses the boundary this bug lives on. Two DIFFERENT diagrams so the second visit
// to each is a warm cache hit and the first is cold — the two cases have completely
// different costs and averaging them hides both.
const DECK = `---
theme: lattice
palette: indaco
---

# Flash bench

The plain slide the navigation starts from.

---

<!-- _class: diagram -->

## Signals move from input to decision.

\`\`\`mermaid
flowchart LR
  A[Input] --> B[Process]
  B --> C{Decision}
  C -->|yes| D[Ship]
  C -->|no| E[Revise]
\`\`\`

---

## A second plain slide

Text between the two diagrams.

---

<!-- _class: diagram -->

## The second diagram.

\`\`\`mermaid
flowchart TB
  P[Plan] --> Q[Build]
  Q --> R[Measure]
  R --> P
\`\`\`
`;

// The per-frame sampler, installed in EVERY frame of the page (the parent no-ops —
// it has no `.lattice`). It re-arms itself across srcdoc rewrites because
// `addInitScript` runs on each new document.
function sampler() {
	if (window.top === window) return;
	const SRC = 'pre > code[class*="language-mermaid"], marp-pre > code[class*="language-mermaid"]';
	// A NEW document means the parent did a full srcdoc rewrite rather than a patch —
	// the single most expensive fact about a navigation, and invisible from the outside.
	const state = { frames: [], swaps: [], shift: 0, t0: performance.now(), doc: Math.random().toString(36).slice(2), marks: {}, origin: performance.timeOrigin };
	window.__flash = state;
	// The rAF sampler is installed FIRST and never behind anything that can throw. An
	// init script runs at document-start, where `document.documentElement` can still be
	// null — observing it there threw and killed the loop silently, leaving a state
	// object that looked installed and sampled nothing.
	// Is this element's INK actually on screen this frame? Walks to the root because
	// the three things that can hide the source live at three different levels: the
	// <code>'s own `visibility`, the <pre>'s `display`, and an ancestor's mid-transition
	// `opacity`. Reading only the <pre> scored a candidate that hides the <code> as no
	// better than baseline — the metric could not see its own fix.
	const inkVisible = (el) => {
		let n = el;
		let alpha = 1;
		while (n && n.nodeType === 1) {
			const cs = getComputedStyle(n);
			if (cs.display === 'none' || cs.visibility === 'hidden' || cs.contentVisibility === 'hidden') return 0;
			alpha *= Number(cs.opacity === '' ? 1 : cs.opacity);
			if (alpha <= 0.02) return 0;
			n = n.parentElement;
		}
		const r = el.getBoundingClientRect();
		if (r.width < 2 || r.height < 2) return 0;
		return alpha;
	};
	const tick = () => {
		try {
			const code = document.querySelector(SRC);
			const pre = code?.parentElement || null;
			// The fraction of full opacity the SOURCE TEXT is painted at this frame. A
			// cross-fade scores partial frames — which is the point of measuring alpha
			// rather than a boolean: 240ms at 30% is not the same insult as 80ms at 100%.
			const srcAlpha = code ? inkVisible(code) : 0;
			const slotPresent = !!pre;
			const svgEl = document.querySelector('.mermaid > svg, .mermaid-svg svg');
			// A frame the PARENT is hiding was never seen. The Studio reveals the preview
			// iframe by fading `opacity` from 0, so a frame painted behind that fade is not
			// a flash — counting it would credit the flash to a window nobody looked at.
			// `window.frameElement` is readable here because the srcdoc frame is same-origin.
			let shown = true;
			try {
				const fe = window.frameElement;
				if (fe) {
					const fcs = fe.ownerDocument.defaultView.getComputedStyle(fe);
					shown = fcs.display !== 'none' && fcs.visibility !== 'hidden' && Number(fcs.opacity) > 0.01;
				}
			} catch (_e) {}
			state.frames.push([Math.round(performance.now() * 10) / 10, shown ? Math.round(srcAlpha * 100) / 100 : 0, svgEl ? (inkVisible(svgEl) > 0 ? 1 : 0) : 0, slotPresent ? 1 : 0, shown ? 1 : 0]);
			if (state.frames.length > 4000) state.frames.splice(0, 2000);
		} catch (_e) {
			/* one bad frame must not end the sampling */
		}
		requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
	// Phase marks — the decomposition of the window, in this document's own clock.
	const mark = (k) => {
		if (state.marks[k] === undefined) state.marks[k] = performance.now();
	};
	const phase = () => {
		if (document.querySelector('.lattice')) mark('lattice');
		const code = document.querySelector(SRC);
		if (code) mark('fence');
		const pre = code?.parentElement;
		if (pre?.dataset?.mermaidState) mark('tagged');
		if (document.querySelector('.mermaid > svg, .mermaid-svg svg')) mark('svg');
		if (window.mermaid) mark('mermaidLib');
		try {
			const fe = window.frameElement;
			if (fe) {
				const fcs = fe.ownerDocument.defaultView.getComputedStyle(fe);
				if (fcs.display !== 'none' && fcs.visibility !== 'hidden' && Number(fcs.opacity) > 0.01) mark('shown');
			}
		} catch (_e) {}
		if (state.marks.svg === undefined) requestAnimationFrame(phase);
	};
	requestAnimationFrame(phase);
	// Layout shift inside the frame — the "jump" half of the report.
	try {
		new PerformanceObserver((list) => {
			for (const e of list.getEntries()) if (!e.hadRecentInput) state.shift += e.value;
		}).observe({ type: 'layout-shift', buffered: true });
	} catch (_e) {}
	// When did the parent swap the slide in? A childList mutation on `.lattice` is the swap.
	const armSwap = () => {
		const lattice = document.querySelector('.lattice');
		if (!lattice) return false;
		new MutationObserver(() => state.swaps.push(performance.now())).observe(lattice, { childList: true, subtree: true });
		return true;
	};
	const armWhenReady = () => {
		if (armSwap()) return;
		const root = document.documentElement;
		if (!root) {
			setTimeout(armWhenReady, 16);
			return;
		}
		const doc = new MutationObserver(() => {
			if (armSwap()) doc.disconnect();
		});
		doc.observe(root, { childList: true, subtree: true });
	};
	armWhenReady();
}

/** Frames painted between `from` and the first frame carrying the SVG. */
function scoreWindow(frames, from) {
	const win = frames.filter((f) => f[0] >= from);
	let source = 0;
	let sourceInk = 0;
	let blank = 0;
	let diagramAt = null;
	for (const [t, src, svg, slot] of win) {
		if (svg) {
			diagramAt = t;
			break;
		}
		if (src > 0.02) {
			source++;
			sourceInk += src;
		} else if (slot) blank++;
	}
	// `sourceInk` is frames weighted by how opaque the source was — a cross-fade's
	// half-visible frames count as half a frame of insult, not a whole one.
	return { source, sourceInk: Math.round(sourceInk * 10) / 10, blank, diagramMs: diagramAt === null ? null : Math.round(diagramAt - from) };
}

async function main() {
	const opts = parseArgs(process.argv.slice(2));
	const server = spawn(process.execPath, [join(DOCS, 'scripts', 'preview-e2e.mjs')], { cwd: DOCS, stdio: 'ignore' });
	const stop = () => {
		try {
			server.kill();
		} catch {}
	};
	process.on('exit', stop);
	// Wait for the server.
	for (let i = 0; i < 120; i++) {
		try {
			const r = await fetch(`${BASE}/studio/`);
			if (r.ok) break;
		} catch {}
		await new Promise((r) => setTimeout(r, 500));
	}

	const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
	const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
	await context.addInitScript(() => {
		try {
			const k = 'lattice-studio-settings';
			const cur = JSON.parse(localStorage.getItem(k) || '{}');
			localStorage.setItem(k, JSON.stringify({ ...cur, posture: 'craft' }));
		} catch {}
	});
	await context.addInitScript(sampler);
	if (opts.css) {
		const css = await readFile(opts.css, 'utf8');
		await context.addInitScript((text) => {
			if (window.top === window) return;
			const put = () => {
				if (!document.head && !document.documentElement) return setTimeout(put, 4);
				const el = document.createElement('style');
				el.id = 'flash-variant';
				el.textContent = text;
				(document.head || document.documentElement).appendChild(el);
			};
			put();
		}, css);
	}
	if (opts.js) {
		const js = await readFile(opts.js, 'utf8');
		await context.addInitScript((text) => {
			if (window.top === window) return;
			try {
				new Function(text)();
			} catch (e) {
				console.error('variant js failed', e);
			}
		}, js);
	}
	const page = await context.newPage();
	if (opts.cpu > 1) {
		const cdp = await context.newCDPSession(page);
		await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.cpu });
	}

	await page.goto(`${BASE}/studio/`, { waitUntil: 'domcontentloaded' });
	const frame = page.frameLocator('[aria-label="Live deck preview"] iframe.live');
	await frame.locator('.lattice').first().waitFor({ timeout: 60_000 });

	// Type the bench deck in.
	await page.getByLabel('Deck source').click();
	await page.keyboard.press('ControlOrMeta+a');
	await page.keyboard.press('Delete');
	await page.keyboard.insertText(DECK);
	await page.waitForTimeout(2500);

	const rail = page.getByRole('button', { name: /^Slide \d+/ });
	const railCount = await rail.count();

	const results = [];
	const shots = [];
	let lastDoc = null;
	// Slide indices are 1-based in the rail; our deck is [text, diagram, text, diagram].
	const order = [];
	for (let r = 0; r < opts.runs; r++) order.push(...opts.order);

	// In the `type` scenario every step is a keystroke on the SAME (diagram) slide, so
	// the target never changes and every sample is a re-render of a diagram.
	if (opts.scenario === 'type') {
		await rail.nth(1).click();
		await page.waitForTimeout(2500);
		await page.getByText('## Signals move from input to decision.').first().click();
		await page.keyboard.press('End');
		await page.waitForTimeout(600);
	}
	for (let i = 0; i < order.length; i++) {
		const target = opts.scenario === 'type' ? 2 : order[i];
		// Clear the sampler window, then act.
		await page
			.frameLocator('[aria-label="Live deck preview"] iframe.live')
			.locator('.lattice')
			.first()
			.evaluate(() => {
				const s = window.__flash;
				if (!s) return;
				s.frames.length = 0;
				s.swaps.length = 0;
				s.shift = 0;
			})
			.catch(() => null);
		if (opts.scenario === 'type') await page.keyboard.type('x');
		else if (railCount >= target) await rail.nth(target - 1).click();
		await page.waitForTimeout(1600);
		const sample = await page
			.frameLocator('[aria-label="Live deck preview"] iframe.live')
			.locator('.lattice')
			.first()
			.evaluate(() => {
				const s = window.__flash;
				const res = performance.getEntriesByType('resource').map((r) => [r.name.split('/').pop(), Math.round(r.startTime), Math.round(r.duration), r.transferSize || 0]);
				return s ? { frames: s.frames.slice(), swaps: s.swaps.slice(), shift: s.shift, doc: s.doc, marks: s.marks, res } : null;
			})
			.catch(() => null);
		if (!sample?.frames.length) {
			if (process.env.FLASH_DEBUG) console.error('no sample for target', target);
			continue;
		}
		const from = sample.swaps.length ? sample.swaps[0] : sample.frames[0][0];
		const score = scoreWindow(sample.frames, from);
		const isDiagram = opts.scenario === 'type' ? true : target % 2 === 0;
		const rewrite = sample.doc !== lastDoc;
		lastDoc = sample.doc;
		const m = sample.marks || {};
		const rel = (k) => (m[k] === undefined ? null : Math.round(m[k] - (m.lattice ?? 0)));
		if (process.env.FLASH_RES && isDiagram) console.error('res', target, JSON.stringify(sample.res));
		results.push({ run: Math.floor(i / opts.order.length), target, isDiagram, cold: isDiagram && i < opts.order.length, rewrite, ...score, phases: { lattice: m.lattice === undefined ? null : Math.round(m.lattice), shown: rel('shown'), tagged: rel('tagged'), svg: rel('svg') }, shift: Math.round(sample.shift * 10000) / 10000 });
		if (opts.shots && isDiagram) {
			for (const d of [0, 60, 140]) {
				await page.waitForTimeout(d ? 60 : 0);
				shots.push({ target, d, buf: await page.locator('[aria-label="Live deck preview"]').screenshot() });
			}
		}
	}

	await browser.close();
	stop();

	if (process.env.FLASH_DEBUG) console.error('results', results.length, 'rail', railCount);
	const diagrams = results.filter((r) => r.isDiagram);
	const cold = diagrams.filter((r) => r.cold);
	const warm = diagrams.filter((r) => !r.cold);
	const agg = (rows) => {
		if (!rows.length) return null;
		const med = (k) => {
			const v = rows.map((r) => r[k]).filter((x) => x !== null).sort((a, b) => a - b);
			return v.length ? v[Math.floor(v.length / 2)] : null;
		};
		const medPhase = (k) => {
			// Only a REWRITE has document phases; on a patch the marks belong to the
			// document the patch landed in, which was set up navigations ago.
			const v = rows.filter((r) => r.rewrite).map((r) => r.phases?.[k]).filter((x) => x !== null && x !== undefined).sort((a, b) => a - b);
			return v.length ? v[Math.floor(v.length / 2)] : null;
		};
		return { n: rows.length, sourceFrames: med('source'), sourceInk: med('sourceInk'), blankFrames: med('blank'), diagramMs: med('diagramMs'), shift: med('shift'), rewrites: rows.filter((r) => r.rewrite).length, phaseShown: medPhase('shown'), phaseTagged: medPhase('tagged'), phaseSvg: medPhase('svg') };
	};
	const out = { variant: opts.variant, cpu: opts.cpu, runs: opts.runs, cold: agg(cold), warm: agg(warm), all: agg(diagrams), samples: results };
	if (opts.shots) {
		const dir = join(DOCS, '..', '.scratch', 'flash-shots', opts.variant);
		await mkdir(dir, { recursive: true });
		for (const [i, s] of shots.entries()) await writeFile(join(dir, `${String(i).padStart(2, '0')}-slide${s.target}-${s.d}ms.png`), s.buf);
	}
	if (opts.json) {
		console.log(JSON.stringify(out, null, 2));
	} else {
		console.log(`\nvariant: ${opts.variant}   cpu×${opts.cpu}   runs: ${opts.runs}\n`);
		console.log('                 raw-source frames   (ink-weighted)   blank frames   time-to-diagram   layout shift');
		for (const [label, a] of [['cold (first visit)', out.cold], ['warm (cached)', out.warm]]) {
			if (!a) continue;
			console.log(`  ${label.padEnd(18)} ${String(a.sourceFrames).padStart(8)}       ${String(a.sourceInk).padStart(10)}      ${String(a.blankFrames).padStart(9)}    ${String(a.diagramMs === null ? 'never' : `${a.diagramMs}ms`).padStart(12)}   ${String(a.shift).padStart(10)}`);
		}
		console.log('\n  phases, from the frame document\'s own `.lattice` (ms):   full rewrites / visits');
		for (const [label, a] of [['cold (first visit)', out.cold], ['warm (cached)', out.warm]]) {
			if (!a) continue;
			console.log(`  ${label.padEnd(18)} shown +${a.phaseShown}   tagged +${a.phaseTagged}   svg +${a.phaseSvg}    ${a.rewrites}/${a.n}`);
		}
		console.log('');
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
