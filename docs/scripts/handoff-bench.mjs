// HAND-OFF BENCH — what a human actually sees between the instant shell and the live app.
//
// The Studio paints a static stand-in (`#studio-ssr-shell`, studio.astro) before React
// hydrates, then removes it when the live preview first renders. Two defects live in the
// seam between those two events, and NOTHING else in the repo can see either one:
//
//   * `studio-shell-parity` compares the two chromes as SETS of boxes, at rest. It answers
//     "does the shell draw the same controls in the same places", which is geometry, and it
//     is deliberately blind to WHEN. A shell that matches the app perfectly and then sits on
//     top of it for half a second passes it.
//   * `fouc-bench` asks whether a paint preceded its stylesheet. That is the frame BEFORE
//     this one; by the time the shell is up, the CSS is in.
//   * `first-paint-bench` measures how long the live preview takes to arrive. It is the
//     clock this bench reads, not a check on what is shown while it runs.
//
// So this samples EVERY ANIMATION FRAME and reports the two things a still cannot hold:
//
//   1. DEAD TIME — the window where the app's real chrome is painted and finished, and the
//      shell is still covering it. The shell is opaque and its chrome is muted, so this is
//      not a neutral wait: the visitor is looking at a dimmed stand-in of a UI that is ready.
//      The pulse they report is that window ending.
//   2. SHIFT — every tracked control's sub-pixel box, per frame, with the font and stylesheet
//      readiness of that same frame beside it. A shift whose frame is the frame a webfont
//      resolved is a `font-display: swap` reflow, and the correlation is the diagnosis.
//
// WHY A MODELED NETWORK. On localhost everything lands within a few ms of everything else and
// the whole seam collapses to one frame — the bug is real and the instrument reports zero. The
// shared host (`lib/modeled-host.mjs`) paces bytes and adds latency so the ordering is legible;
// the same host serves `fouc-bench`, so the two are comparable by construction.
//
// Usage (from docs/):
//   npm run build:e2e && node scripts/handoff-bench.mjs [--runs 3] [--width 1440]
//                       [--latency 200] [--kbps 1200] [--dist ./dist] [--json]
//
// `--dist` points at a second build (e.g. one made from `main`), so a BEFORE and an AFTER come
// off one instrument rather than two.
//
// Exit code is 1 when the median dead time exceeds --max-dead (default 120ms) or any tracked
// control moves more than --max-shift (default 1px) after the app's chrome has painted, so
// this reads as a check and not only as a report.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveModeled } from './lib/modeled-host.mjs';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
	// `cache: 'real'` because this bench asks whether a PRELOAD works, and that question is
	// unanswerable under `no-store` — see `lib/modeled-host.mjs`.
	const o = { runs: 3, width: 1440, height: 900, latency: 200, kbps: 1200, dist: join(DOCS, 'dist'), json: false, maxDead: 120, maxShift: 1, cache: 'real' };
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a === '--runs') o.runs = Number(argv[++i]);
		else if (a === '--width') o.width = Number(argv[++i]);
		else if (a === '--height') o.height = Number(argv[++i]);
		else if (a === '--latency') o.latency = Number(argv[++i]);
		else if (a === '--kbps') o.kbps = Number(argv[++i]);
		else if (a === '--dist') o.dist = argv[++i];
		else if (a === '--max-dead') o.maxDead = Number(argv[++i]);
		else if (a === '--max-shift') o.maxShift = Number(argv[++i]);
		else if (a === '--cache') o.cache = argv[++i];
		else if (a === '--json') o.json = true;
	}
	return o;
}

// The per-frame sampler, installed BEFORE any page script runs. It must be a single
// self-contained function: Playwright serializes it into the page.
//
// Tracked controls are named by the surface they belong to, because the shell and the app
// draw the SAME accessible names (that is the point of the shell) and an unscoped selector
// would silently follow whichever one happened to be in the DOM.
function sampler() {
	const TRACK = {
		'shell topbar': '#studio-ssr-shell .ssr-topbar',
		'shell preview-bar': '#studio-ssr-shell [data-slot="preview-bar"]',
		'shell Reader view': '#studio-ssr-shell [data-slot="preview-bar"] [aria-label="Reader view"]',
		'shell Preview label': '#studio-ssr-shell [data-slot="preview-bar"] > span:first-child',
		// THE NACRE BOX — the one thing that survives stage 1, and therefore the one thing
		// stage 1 could move. It is centered in `.ssr-stage` whenever no rect was seeded, so
		// anything that changes the stage's flow box re-centers it mid-load. Untracked, the
		// first draft of the fix (which REMOVED the shell's chrome, handing the stage the top
		// bar's 54px) would have reported a perfectly clean run.
		'shell slidebox': '#ssr-slidebox',
		'app header': 'header',
		'app preview-bar': '[data-studio-root] [data-slot="preview-bar"]',
		'app Reader view': '[data-studio-root] [data-slot="preview-bar"] [aria-label="Reader view"]',
		// The EDIT bar earns a row of its own: its controls are progressively ENABLED as the
		// deck and engine come up, so it is the band most likely to still be settling at the
		// moment stage 1 uncovers the chrome. Tracking the bar's own box catches a control
		// appearing inside it (the bar is content-sized), and the two named controls catch the
		// row reflowing around one.
		'app edit-bar': '[data-studio-root] [data-slot="edit-bar"]',
		'app Reshape': '[data-studio-root] [data-slot="edit-bar"] button[aria-label*="Reshape" i]',
		'app Markdown tab': '[data-studio-root] [data-slot="edit-bar"] button[aria-label*="Markdown" i]',
	};
	// The faces the shell's chrome paints with, as [family, weight] — matched against the
	// document's OWN FontFace set rather than asked of `document.fonts.check()`.
	//
	// `check()` is the obvious call and it is the wrong one here, in a way that reads as a
	// clean result: it returns TRUE when no matching `@font-face` is registered at all,
	// because the family then resolves to a system font and a system font is trivially
	// available. The Studio's faces arrive with a stylesheet that lands at ~840ms, so every
	// face `check()` was asked about reported "available at 220ms" — 600ms before the rules
	// that declare it existed. Reading `status === 'loaded'` off the real FontFace asks the
	// question that has the answer we want: has THIS declared face's file arrived.
	const FONTS = {
		'Outfit 600': ['Outfit', '600'],
		'Playfair 700': ['Playfair Display', '700'],
		'JetBrains Mono 400': ['JetBrains Mono', '400'],
		'JetBrains Mono 700': ['JetBrains Mono', '700'],
	};
	const faceLoaded = ([family, weight]) => {
		let seen = false;
		for (const f of document.fonts) {
			// `f.family` carries the quotes the stylesheet wrote, if any.
			if (f.family.replace(/^["']|["']$/g, '') !== family) continue;
			if (f.weight !== weight || f.style !== 'normal') continue;
			seen = true;
			if (f.status === 'loaded') return true;
		}
		// A face the document never declares stays unrecorded rather than reporting ready.
		return seen ? false : null;
	};
	const state = {
		frames: 0,
		events: [],
		boxes: {},
		matched: {},
		fonts: {},
		shell: { firstSeen: null, chromeRevealed: null, fadeStart: null, gone: null },
		app: { chromeAt: null },
	};
	window.__handoff = state;
	const rect = (el) => {
		const r = el.getBoundingClientRect();
		return [r.x, r.y, r.width, r.height];
	};
	const near = (a, b) => a && b && a.every((v, i) => Math.abs(v - b[i]) < 0.001);
	const push = (t, kind, what, detail) => state.events.push({ t: Math.round(t * 1000) / 1000, kind, what, ...detail });

	const frame = () => {
		const t = performance.now();
		state.frames++;
		// Fonts — record the first frame each face reports available.
		for (const [name, spec] of Object.entries(FONTS)) {
			if (state.fonts[name] == null && faceLoaded(spec) === true) {
				state.fonts[name] = t;
				push(t, 'font', name, {});
			}
		}
		// The shell: present, its opacity, and the frame it leaves.
		const shell = document.getElementById('studio-ssr-shell');
		if (shell) {
			if (state.shell.firstSeen == null && shell.getBoundingClientRect().height > 0) {
				state.shell.firstSeen = t;
				push(t, 'shell', 'first painted', {});
			}
			// STAGE 1: the shell's chrome and bands go to `opacity: 0` and its opaque ground
			// goes transparent, uncovering the app's real chrome, while the Nacre slide box
			// stays over the not-yet-live preview.
			//
			// BOTH HALVES ARE CHECKED — the marker AND the pixels. `data-handoff` is written on
			// the last line of `revealAppChrome` regardless of whether the elements it meant to
			// hide were found, so keying the milestone on the attribute alone would certify a
			// reveal that never happened and report a clean 0ms dead time for a shell still
			// sitting on top of the app. `revealed()` asks the question the visitor asks: is
			// any of this layer still painting.
			const revealed = () => {
				if (shell.dataset.handoff !== 'chrome') return false;
				if (Number(getComputedStyle(shell).opacity) === 0) return true;
				const bg = getComputedStyle(shell).backgroundColor;
				// An opaque ground still covering the app is not a reveal, whatever the chrome does.
				if (!/^rgba\(.*,\s*0\)$/.test(bg) && bg !== 'transparent') return false;
				for (const n of shell.querySelectorAll('.ssr-chrome, .ssr-band')) {
					const st = getComputedStyle(n);
					if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
					const r = n.getBoundingClientRect();
					if (r.width > 0 && r.height > 0) return false;
				}
				return true;
			};
			if (state.shell.chromeRevealed == null && revealed()) {
				state.shell.chromeRevealed = t;
				push(t, 'shell', 'chrome uncovered', {});
			}
			const op = Number(getComputedStyle(shell).opacity);
			if (state.shell.fadeStart == null && state.shell.firstSeen != null && op < 0.999) {
				state.shell.fadeStart = t;
				push(t, 'shell', 'fade begins', { opacity: op });
			}
		} else if (state.shell.firstSeen != null && state.shell.gone == null) {
			state.shell.gone = t;
			push(t, 'shell', 'removed', {});
		}
		// Boxes — sub-pixel, width AND height, appear / disappear / move.
		for (const [name, sel] of Object.entries(TRACK)) {
			const el = document.querySelector(sel);
			const prev = state.boxes[name];
			if (!el) {
				if (prev) {
					push(t, 'gone', name, {});
					state.boxes[name] = null;
				}
				continue;
			}
			const box = rect(el);
			// A collapsed element still answers `querySelector` while reporting a 0x0 box —
			// `display:none`, or a band the app took out of the DOM's flow. Treat that as the
			// control going away rather than as a 1440px "move", which would report a teardown
			// as the defect. Stage 1 does not currently produce this (it sets `opacity: 0` and
			// leaves every box intact, which is what keeps the e2e specs reading the shell), so
			// this guard is for the general case and not for the reveal.
			if (box[2] === 0 && box[3] === 0) {
				if (prev) {
					push(t, 'gone', name, {});
					state.boxes[name] = null;
				}
				continue;
			}
			state.matched[name] = true;
			if (!prev) {
				push(t, 'appear', name, { box });
			} else if (!near(prev, box)) {
				const d = box.map((v, i) => Math.round((v - prev[i]) * 1000) / 1000);
				push(t, 'move', name, { box, delta: d, worst: Math.max(...d.map(Math.abs)) });
			}
			state.boxes[name] = box;
		}
		// The app's chrome is "painted" the first frame its real header has a box. That is the
		// instant the shell stops standing in for anything the visitor cannot already see.
		if (state.app.chromeAt == null && state.boxes['app header'] && state.boxes['app header'][3] > 0) {
			state.app.chromeAt = t;
			push(t, 'app', 'chrome painted', {});
		}
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
}

/** One cold load, sampled per frame, held until the shell is gone and the page is quiet. */
async function sample(page, url) {
	await page.addInitScript(sampler);
	await page.goto(url, { waitUntil: 'load', timeout: 240000 });
	// Hold past the 8s dismissal backstop in StudioShell so a run where the engine never
	// signals is still a COMPLETE observation rather than a truncated one.
	await page
		.waitForFunction(() => window.__handoff?.shell.gone != null, null, { timeout: 60000 })
		.catch(() => {});
	await page.waitForTimeout(600);
	return page.evaluate(() => {
		const s = window.__handoff;
		const sheets = performance
			.getEntriesByType('resource')
			.filter((e) => e.initiatorType === 'link' && /\.css(?:$|\?)/.test(e.name))
			.map((e) => ({ name: e.name.split('/').pop(), at: Math.round(e.responseEnd) }))
			.sort((a, b) => a.at - b.at);
		const fontFiles = performance
			.getEntriesByType('resource')
			.filter((e) => /\.woff2(?:$|\?)/.test(e.name))
			.map((e) => ({ name: e.name.split('/').pop(), at: Math.round(e.responseEnd), via: e.initiatorType }))
			.sort((a, b) => a.at - b.at);
		return { ...s, sheets, fontFiles };
	});
}

// Mirrors the sampler's TRACK keys. Duplicated deliberately and asserted below: the sampler is
// serialized into the page and cannot export anything back, so this is the only way the node
// side can tell "did not move" from "was never found".
const TRACKED_NAMES = [
	'shell topbar',
	'shell preview-bar',
	'shell Reader view',
	'shell Preview label',
	'shell slidebox',
	'app header',
	'app preview-bar',
	'app Reader view',
	'app edit-bar',
	'app Reshape',
	'app Markdown tab',
];

const median = (xs) => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);
const ms = (v) => (v == null ? '    n/a' : `${String(Math.round(v)).padStart(5)}ms`);

async function main() {
	const o = parseArgs(process.argv.slice(2));
	const { server, port } = await serveModeled(o);
	const { chromium } = await import('@playwright/test');
	const browser = await chromium.launch();
	const runs = [];
	try {
		for (let i = 0; i < o.runs; i++) {
			// A FRESH context per run, with no storage: the shell's geometry seed replays a
			// persisted rect for a returning visitor, and a warm profile would measure a
			// different (easier) path than the one the report is about.
			const ctx = await browser.newContext({ viewport: { width: o.width, height: o.height }, serviceWorkers: 'block' });
			const page = await ctx.newPage();
			try {
				runs.push(await sample(page, `http://127.0.0.1:${port}/studio/`));
			} finally {
				await ctx.close();
			}
		}
	} finally {
		await browser.close();
		server.close();
	}

	// DEAD TIME is measured to the CHROME REVEAL, not to the shell's removal. The Nacre box
	// staying up over a preview that genuinely has not rendered is honest waiting; the app's
	// finished chrome sitting under a muted cover is not, and that is the window this budget
	// is about. A build with no stage-1 reveal has no `chromeRevealed`, so it falls back to
	// the fade — which is what that build actually makes the visitor wait for.
	const uncover = (r) => r.shell.chromeRevealed ?? r.shell.fadeStart;
	// NOT clamped at 0. A build that uncovers BEFORE the app's chrome paints is the opposite
	// failure — it shows the visitor a bare page for those frames — and `Math.max(0, …)` turned
	// exactly that into a clean `✓ DEAD TIME 0ms`, so the instrument could not tell "same paint"
	// from "uncovered 200ms too early". A negative is reported and fails.
	const deads = runs.filter((r) => r.app.chromeAt != null && uncover(r) != null).map((r) => uncover(r) - r.app.chromeAt);
	const dead = median(deads);
	// Shifts that a human can attribute to the hand-off: a tracked control moving AFTER the
	// app's chrome is up. Movement before that is the shell laying itself out, which is not
	// a shift — nothing was on screen to move.
	const shifts = runs.flatMap((r, run) =>
		r.events.filter((e) => e.kind === 'move' && r.app.chromeAt != null && e.t >= r.app.chromeAt && e.worst > o.maxShift).map((e) => ({ run, ...e })),
	);
	// THE FAILING SET IS THIS ONE, not `shifts` above. A control that moves once the shell has
	// PAINTED is visible to a human, whether or not React has mounted yet — the shell's chrome
	// is on screen from ~70ms and the JetBrains Mono swap that moved the Reader-view pill
	// 2.781px landed at ~200ms, a third of a second before the app's chrome existed. Keying the
	// exit code on `shifts` (post-app-chrome) alone was a FALSE PASS with the defect present:
	// against the pre-fix build it printed all six shift events and still reported that arm
	// clean, and would have gone on doing so if someone dropped the mono preload while stage 1
	// stayed healthy. Movement BEFORE the shell paints is genuinely invisible and stays out.
	const earlyShifts = runs.flatMap((r, run) =>
		r.events.filter((e) => e.kind === 'move' && r.shell.firstSeen != null && e.t >= r.shell.firstSeen && e.worst > o.maxShift).map((e) => ({ run, ...e })),
	);

	const report = {
		width: o.width,
		latency: o.latency,
		kbps: o.kbps,
		runs: runs.length,
		shellPainted: median(runs.map((r) => r.shell.firstSeen).filter((v) => v != null)),
		appChrome: median(runs.map((r) => r.app.chromeAt).filter((v) => v != null)),
		chromeRevealed: median(runs.map((r) => r.shell.chromeRevealed).filter((v) => v != null)),
		shellFadeStart: median(runs.map((r) => r.shell.fadeStart).filter((v) => v != null)),
		shellGone: median(runs.map((r) => r.shell.gone).filter((v) => v != null)),
		deadMs: dead,
		fonts: Object.fromEntries(Object.keys(runs[0]?.fonts || {}).map((k) => [k, median(runs.map((r) => r.fonts[k]).filter((v) => v != null))])),
		sheets: runs[0]?.sheets || [],
		fontFiles: runs[0]?.fontFiles || [],
		shifts,
		earlyShifts,
		// A SELECTOR THAT MATCHES NOTHING REPORTS NOTHING, which is indistinguishable from a
		// control that never moved — so the quiet result this bench exists to produce is also
		// exactly what a typo produces. Every tracked name must have bound to a real element
		// in at least one run, or the run is not evidence.
		neverMatched: Object.keys(runs[0]?.boxes ?? {})
			.concat(TRACKED_NAMES)
			.filter((n, i, a) => a.indexOf(n) === i)
			.filter((n) => !runs.some((r) => r.matched?.[n])),
	};

	const failDead = dead != null && (dead > o.maxDead || dead < 0);
	const failShift = earlyShifts.length > 0;
	const failTrack = report.neverMatched.length > 0;
	if (o.json) {
		process.stdout.write(`${JSON.stringify({ ...report, pass: !failDead && !failShift && !failTrack }, null, 2)}\n`);
	} else {
		const out = [];
		out.push(`handoff-bench /studio/ · ${o.width}px · ${o.kbps}kbps/${o.latency}ms · median of ${runs.length}`);
		out.push('');
		out.push(`  shell painted            ${ms(report.shellPainted)}`);
		out.push(`  app chrome painted       ${ms(report.appChrome)}`);
		out.push(`  shell chrome uncovered   ${ms(report.chromeRevealed)}   (stage 1)`);
		out.push(`  slide box fade begins    ${ms(report.shellFadeStart)}   (stage 2)`);
		out.push(`  shell removed            ${ms(report.shellGone)}`);
		out.push('');
		out.push(
			dead != null && dead < 0
				? `  ✗ UNCOVERED ${ms(-dead)} EARLY — the shell left before the app's chrome painted`
				: `  ${failDead ? '✗' : '✓'} DEAD TIME  ${ms(dead)}  (app ready, shell still covering it; budget ${o.maxDead}ms)`,
		);
		out.push('');
		out.push('  webfont available at:');
		for (const [k, v] of Object.entries(report.fonts)) out.push(`    ${k.padEnd(22)} ${ms(v)}`);
		out.push('');
		out.push('  stylesheets applied at:');
		for (const s of report.sheets) out.push(`    ${String(s.at).padStart(5)}ms  ${s.name}`);
		out.push('');
		if (earlyShifts.length) {
			out.push(`  ✗ shifts over ${o.maxShift}px once the shell was on screen (all runs):`);
			for (const s of earlyShifts.slice(0, 40)) out.push(`    ${String(Math.round(s.t)).padStart(5)}ms  run ${s.run}  ${s.what.padEnd(20)} Δ${JSON.stringify(s.delta)}`);
			if (earlyShifts.length > 40) out.push(`    … ${earlyShifts.length - 40} more`);
		} else {
			out.push(`  ✓ no tracked control moved more than ${o.maxShift}px once the shell was on screen`);
		}
		out.push('');
		out.push(shifts.length ? `  ✗ ${shifts.length} of those landed after the app's chrome painted — the app's own layout is still settling` : `  ✓ nothing moved after the app's chrome painted`);
		if (failTrack) out.push(`  ✗ NEVER MATCHED (a quiet result from these is not evidence): ${report.neverMatched.join(', ')}`);
		else out.push(`  ✓ all ${TRACKED_NAMES.length} tracked selectors bound to a real element`);
		process.stdout.write(`${out.join('\n')}\n`);
	}
	return failDead || failShift || failTrack ? 1 : 0;
}

main().then(
	(code) => process.exit(code),
	(err) => {
		process.stderr.write(`handoff-bench: ${err?.stack || err}\n`);
		process.exit(1);
	},
);
