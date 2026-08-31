#!/usr/bin/env node
/**
 * check-player-contrast — WCAG AA audit of an EXPORTED HTML PLAYER, in BOTH of its
 * scheme states, with every backdrop sampled from RENDERED PIXELS.
 *
 * Complements `tools/check-slide-contrast.js` rather than duplicating it (HARD RULE
 * #15) — and it reuses that file's `PROBE` verbatim, so the two can never disagree
 * about which runs exist, what ink they carry, or which AA threshold applies. What
 * this adds is three things that one structurally cannot do:
 *
 *   1. THE SURFACE. It drives the real `--player` export — the single HTML file a
 *      recipient actually opens — not the deck's plain render. The player ships its
 *      own dual-mode stylesheet, its own chrome, and a CSS prune; none of that is
 *      present in the render `check-slide-contrast` reads.
 *   2. BOTH SCHEMES. It scores the deck as exported AND after clicking `#lp-mode`.
 *      That split is the point: an "as exported" failure is in the PDF too (a deck
 *      or theme defect), while an "after the toggle" failure exists only in the
 *      player (a scheme defect, and one no static check can reach).
 *   3. PIXELS, NOT ANCESTORS. `check-slide-contrast` resolves a backdrop by climbing
 *      the ancestor chain through transparent paints — exact for flat fills, and
 *      openly documented as noise over a gradient or a photograph. This one makes
 *      every glyph transparent, screenshots the slide, and reads the pixels the
 *      glyphs were sitting on. A gradient, an image, a translucent overlay and a
 *      z-ordered rail all resolve correctly because they are simply *there*.
 *
 * Both tools should exist. This one is slower by orders of magnitude (a browser, a
 * screenshot per slide per scheme) and cannot be a per-PR gate; that one is fast
 * enough to gate invariants, which it does.
 *
 * WHAT IS EXCLUDED. The muted-chrome tier — running header, footer, pagination — is
 * WCAG-exempt by palette contract, and `check-slide-contrast.js` says so in its own
 * header ("the 'muted chrome' tier (footer, pagination) is WCAG-exempt by palette
 * contract and will always report"). `PROBE` resolves `--text-muted` and `--border`
 * per section and marks those runs `exempt`; they are reported in their own bucket
 * here, never counted as failures. Nothing else is excluded.
 *
 * KNOWN LIMITATIONS, inherited and added:
 *   · a pseudo-element has no rect in CSS, so its row keeps the MODELED backdrop
 *     (`rectIsOwner`) — a sample taken from the owner's box may land beside the
 *     pseudo rather than under it, and a wrong number is worse than a modeled one.
 *     THAT MODEL CAN STILL BE WRONG, and those rows are the ones to distrust first: 10 of
 *     the 285 oracle entries are pseudo-elements, and a spot audit found the `scene`
 *     play-control glyph (`button::before`, the ⏸) scored 1.00:1 while rendering as light
 *     gray on a dark circular button, plainly legible. The modeled backdrop misses a
 *     translucent control floating over a canvas. Treat a pseudo row as a lead, not a
 *     measurement, until someone has looked at the slide;
 *   · an occluded run is still scored, exactly as in `check-slide-contrast` — with
 *     one improvement: because the sample is taken from pixels, a run painted under
 *     an opaque sibling now reads against that sibling rather than against whatever
 *     the ancestor chain claimed;
 *   · text over a gradient gets its ratio from the MODAL sampled color, with the
 *     worst sampled color reported beside it, because one number cannot describe a
 *     ramp honestly.
 *
 * Usage:
 *   node tools/check-player-contrast.js examples/a11y.md      # one deck, full verdict
 *   node tools/check-player-contrast.js --json out.json examples/*.md
 *   node tools/check-player-contrast.js already-exported-player.html
 *   npm run contrast:player                                   # the corpus, vs the baseline
 *   npm run contrast:player:bless                             # re-record the baseline (ratchet-only)
 *   npm run contrast:player:bless -- --allow-loosen           # …and accept a WORSE ratio, with a reason
 *
 * A `.md` is exported with `--player` first; a `.html` is opened as given.
 *
 * WITHOUT `--baseline` it exits non-zero on any non-exempt sub-AA run — what a human
 * auditing one deck wants. WITH one it exits non-zero only on a finding that is NEW or has
 * got WORSE than the blessed record, which is what a scheduled sweep wants: the corpus
 * carries 283 known sub-AA runs (#1745), tracked there, and re-listing them every night is
 * how a reader learns to skim past the row that matters. NOT a per-PR gate — a full sweep
 * is ~24s per deck (16s export, 8s audit) and the pipeline half is already gated per-PR by
 * the real-surface test in `test/integration/export/html-player.test.js`.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const puppeteer = require('puppeteer');
const { PNG } = require('pngjs');
const { PROBE } = require('./check-slide-contrast.js');

const ROOT = path.join(__dirname, '..');
/** Grid points sampled per glyph box — see `sampleBackdrop`. */
const SAMPLE_POINTS = 24;
/** Where `--bless` writes and `--baseline` reads when neither is given a path. */
const DEFAULT_BASELINE = path.join(ROOT, 'test', 'oracle', 'player-contrast.json');

/** WCAG relative luminance / contrast, on 0–255 sRGB triples. */
const srgb = (c) => {
	const v = c / 255;
	return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
/** Source-over one translucent paint onto an opaque one. */
const over = (fg, bg, a) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
const ratio = (a, b) => {
	const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
	return (x + 0.05) / (y + 0.05);
};

/**
 * Every scratch directory this run made, so the run can take them away again.
 *
 * One directory per deck, each holding a player that is only read while the deck is being
 * audited. A full-corpus sweep is 135 of them; leaving them behind cost about 225 MB of
 * `/tmp` across four sweeps before anyone noticed. Cleared in the `main()` `finally` and
 * again on `exit`, because the exit handler is the only one that runs if the process is
 * killed mid-sweep.
 */
const TEMP_DIRS = [];

function cleanupTempDirs() {
	while (TEMP_DIRS.length) {
		// Best effort: a scratch directory that has already gone (a shared `/tmp` reaper, a
		// second cleanup pass) is not a reason to fail a sweep that otherwise succeeded.
		try {
			fs.rmSync(TEMP_DIRS.pop(), { recursive: true, force: true });
		} catch {}
	}
}

process.on('exit', cleanupTempDirs);

/**
 * Export a deck to a player if given markdown; pass a `.html` through untouched.
 *
 * The output path is `.html`, NOT `.pdf`. Both produce a byte-identical player — the
 * emulator writes the player beside whatever it was asked for — but a `.pdf` target also
 * encodes a PDF this tool never opens. Measured: no wall-clock difference (the cost is the
 * browser render, the dynamic-component bake and the CSS prune, which the player needs
 * either way), so this buys disk and honesty rather than time — about 50 MB of PDFs per
 * full sweep that nothing reads.
 */
function playerFor(input) {
	if (input.endsWith('.html')) return path.resolve(input);
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-player-contrast-'));
	TEMP_DIRS.push(dir);
	const out = path.join(dir, `${path.basename(input, '.md')}.html`);
	const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice-emulator.js'), input, out, '--quiet', '--player'], {
		cwd: ROOT,
		encoding: 'utf8',
		env: { ...process.env },
		timeout: 600000,
	});
	if (r.status !== 0) throw new Error(`export failed for ${input}: ${r.stderr || r.stdout}`);
	return out;
}

/**
 * Make every glyph in the document paint nothing, so a screenshot shows only what the
 * text was sitting ON.
 *
 * `fill` / `stroke` are erased ONLY on `text` / `tspan` / `textPath`, never globally, and
 * that scoping is the whole correctness of the sample inside an SVG. A blanket
 * `*{fill:transparent}` erases the SHAPES too — the boxes of an ER diagram, the wedges of a
 * pie, the bars of a chart — so the "backdrop" screenshotted is whatever sits behind the
 * erased geometry rather than the surface the glyphs are actually on. Measured on
 * `mermaid-sketch-labels` p5 after a toggle: white labels on hatched blue boxes sampled as
 * pure WHITE and scored 1.00:1, because the blue boxes had been erased along with the text.
 * Six confident, wrong rows on the first deck that exercised it.
 *
 * `color` alone is not enough. SVG text is painted by `fill`, the engine draws label
 * halos and chart ink through `stroke`, and `-webkit-text-fill-color` outranks `color`
 * where it is set. `text-shadow` has to go too or a blurred copy of the glyph tints the
 * very pixels being sampled. Applied to `::before`/`::after` as well, since this engine
 * puts real content there.
 */
const HIDE_INK = `*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;
	text-shadow:none!important;caret-color:transparent!important}
	text,tspan,textPath{fill:transparent!important;stroke:transparent!important}`;

/**
 * Sample a run's backdrop from a decoded screenshot.
 *
 * A GRID, not a center pixel. An inline run's box can extend past the paint behind it
 * (a `<code>` chip inside a paragraph, a label straddling a panel edge), and a center
 * sample would then report the neighbor's fill with full confidence. Sampling a spread
 * and taking the MODE gives the color the glyphs mostly sit on; the extremes are kept
 * so a gradient can be reported as a gradient instead of averaged into a number that
 * describes no pixel on screen.
 */
function sampleBackdrop(png, rect, dpr) {
	const at = (x, y) => {
		const px = Math.round(x * dpr);
		const py = Math.round(y * dpr);
		if (px < 0 || py < 0 || px >= png.width || py >= png.height) return null;
		const i = (png.width * py + px) << 2;
		return [png.data[i], png.data[i + 1], png.data[i + 2]];
	};
	const counts = new Map();
	const seen = [];
	const COLS = 6;
	const ROWS = 4;
	for (let r = 0; r < ROWS; r++) {
		for (let c = 0; c < COLS; c++) {
			// Inset by half a cell so the grid never lands on the box's own boundary, where a
			// one-pixel border would masquerade as the backdrop.
			const x = rect.x + (rect.w * (c + 0.5)) / COLS;
			const y = rect.y + (rect.h * (r + 0.5)) / ROWS;
			const px = at(x, y);
			if (!px) continue;
			seen.push(px);
			const key = px.join(',');
			counts.set(key, (counts.get(key) || 0) + 1);
		}
	}
	if (!seen.length) return null;
	const [modeKey] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
	const mode = modeKey.split(',').map(Number);
	return { mode, distinct: counts.size, samples: seen };
}

/** One scheme state of one player: every run, re-scored against sampled pixels. */
async function auditState(page, label) {
	const meta = await page.evaluate(() => ({
		slides: document.querySelectorAll('.lp-frame').length,
		dpr: window.devicePixelRatio,
	}));
	if (!meta.slides) throw new Error('no .lp-frame in the document — is this an exported player?');
	const rows = [];
	for (let i = 0; i < meta.slides; i++) {
		// Present view shows ONE frame; the rest are display:none, so PROBE skips them and
		// the screenshot contains exactly the slide being scored, at its full canvas size.
		await page.evaluate((n) => {
			const frames = [...document.querySelectorAll('.lp-frame')];
			for (let k = 0; k < frames.length; k++) frames[k].classList.toggle('lp-active', k === n);
			window.scrollTo(0, 0);
		}, i);
		// PER SLIDE, not once per page, and that is where the old oracle's instability lived.
		// Making a frame `lp-active` is what STARTS its scene: the runtime begins playing, the
		// play control flips to `⏸`, and its chrome fades to rest over a few hundred ms. The
		// bare 120ms sleep that used to be here sampled that fade at whatever instant it
		// happened to end — see `settle` for the measurements.
		await settle(page, 120);
		const slideRows = (await page.evaluate(PROBE)).filter((row) => row.rect && row.rect.w > 0 && row.rect.h > 0);
		if (!slideRows.length) continue;
		const handle = await page.addStyleTag({ content: HIDE_INK });
		await new Promise((r) => setTimeout(r, 60));
		const shot = await page.screenshot({ type: 'png' });
		await page.evaluate((el) => el.remove(), handle);
		// puppeteer 23 hands back a Uint8Array, not a Buffer, and pngjs reads with Buffer methods.
		const png = PNG.sync.read(Buffer.from(shot));
		for (const row of slideRows) {
			if (row.rectIsOwner) {
				rows.push({ ...row, state: label, sampled: false });
				continue;
			}
			const bg = sampleBackdrop(png, row.rect, meta.dpr);
			if (!bg) {
				rows.push({ ...row, state: label, sampled: false });
				continue;
			}
			// COMPOSITE THE INK OVER THE SAMPLED PIXEL, never over the modeled one. `PROBE`
			// hands back `fg` already flattened against the backdrop IT resolved, which is right
			// for that tool and wrong here: scoring an ink composited over backdrop A against
			// backdrop B describes no pixel on screen. It is not an edge case — the whole
			// `--on-*-secondary` / `-ghost` / `-watermark` ramp is `color-mix(… N%, transparent)`,
			// and that ramp is exactly what inks a panel's chrome.
			const fg = row.ink ? over(row.ink.rgb, bg.mode, row.ink.a) : row.fg;
			const worst = bg.samples.reduce(
				(lo, px) => Math.min(lo, ratio(row.ink ? over(row.ink.rgb, px, row.ink.a) : row.fg, px)),
				Number.POSITIVE_INFINITY,
			);
			rows.push({
				...row,
				state: label,
				sampled: true,
				fg,
				bg: bg.mode,
				r: +ratio(fg, bg.mode).toFixed(2),
				worst: +worst.toFixed(2),
				gradient: bg.distinct > 2,
				// PATTERNED, not merely uneven. A hatch, a dot screen or any of the
				// `--cat-N-texture` a11y fills is many distinct colors inside one glyph box, and
				// the MODE of a grid over it is whichever stripe the grid happened to land on —
				// not the field the eye integrates. Measured on `mermaid-sketch-labels` p5 after a
				// toggle: white labels on hatched blue boxes reported as pure white on pure white,
				// 1.00:1, on text that is legible-if-marginal in the render. Six such rows, and
				// they would have been the first thing the nightly ever said.
				//
				// Reported in its own bucket rather than scored, for the same reason
				// check-slide-contrast excludes a raster backdrop: a confident wrong number is
				// worse than an admitted gap. WCAG has no ratio for text on a pattern either.
				patterned: bg.distinct > SAMPLE_POINTS / 3,
			});
		}
	}
	return rows;
}

/**
 * Bring the page to a DETERMINISTIC frame before anything is measured.
 *
 * This tool used to `setTimeout` for 400ms and screenshot whatever it found. That is not a
 * settle, it is a guess, and it made the oracle load-sensitive: the same three `anima-scene`
 * pause controls were blessed at 3.20 / 3.19 / 3.20 and re-measured at 2.56 / 1.93 inside a
 * full 139-deck sweep (#1808). Re-run in ISOLATION on the shipped tree they read 2.55 / 2.56 /
 * 3.78 — so the instability was never really about load. It is that the run's own INK is
 * mid-animation: the `⏸` glyph reported `rgb(151,163,180)`, `rgb(146,160,179)` and
 * `rgb(114,131,155)` on three consecutive runs of one deck. `PROBE` reads ink from computed
 * style, and computed style during an animation is the interpolated value at whatever instant
 * the sleep happened to end. A busier machine simply widens the spread.
 *
 * So the fix is to stop sampling a moving target rather than to sleep longer:
 *
 *   · a FINITE animation is `finish()`ed — its resting state is the one a reader settles on,
 *     and it is what the fixed sleep was trying and failing to wait for;
 *   · an INFINITE one is paused at `currentTime = 0`. No frame of a loop is more "correct"
 *     than another, so the only property worth having is that every run picks the same one.
 *     A pulsing control is then measured at a fixed phase instead of a random one.
 *
 * `document.fonts.ready` is awaited first because a font swap changes glyph geometry, and the
 * backdrop sample is taken from the glyph's box. The two rAFs let the settled state paint
 * before the screenshot. The old sleep is kept AFTER all of that, as a floor for work this
 * cannot see (a JS-driven layout, a deferred component bake) — it is now a margin rather than
 * the mechanism.
 */
async function settle(page, floorMs) {
	// The floor comes FIRST, and that ordering is the whole fix. Settling once on load
	// pins nothing: the player's controls fade in on a transition the runtime starts
	// AFTER first paint, so a settle at t=0 finds an empty animation set, and the sleep
	// that follows lands the screenshot in the middle of a transition that began at
	// t=50ms. Sleep, then settle, then check whether settling started anything new.
	await new Promise((r) => setTimeout(r, floorMs));
	// A BOUNDED SETTLE WINDOW — and calling it that rather than a fixed-point detector is
	// the honest description, arrived at by instrumenting it rather than by reading it.
	//
	// The loop finishes/pauses whatever is live, waits a beat, and looks again. On this
	// corpus round 1 NEVER observes a running animation: round 0's pass has already
	// finished them, so the second round contributes a 120ms delay and no information.
	// Measured — the per-round running counts on every settle of `anima-scene` are [0,0]
	// or [n,0]. Removing the second round makes the oracle unstable again (3/1/3 findings
	// across three runs) and re-adding a bare 120ms sleep in its place makes it stable
	// again, which is what identifies the delay as the active ingredient.
	//
	// So what this buys is a window, roughly floor + 120ms, in which a transition that
	// starts late is given time to appear and be finished. A transition starting AFTER the
	// window is still sampled mid-flight and nothing warns — that is a real limit, not a
	// guarantee, and it is why this is described as a window. The corpus is deterministic
	// inside it; a future deck with a longer entrance delay would need the floor raised.
	//
	// Five rounds is the cap. Falling out of the loop without two quiet rounds means
	// something was still running at the last look, and that is what warns.
	let rounds = 0;
	let quiet = 0;
	for (; rounds < 5; rounds++) {
		const running = await page.evaluate(async () => {
			try {
				await document.fonts.ready;
			} catch {}
			const live = document.getAnimations();
			for (const a of live) {
				try {
					const end = a.effect?.getComputedTiming?.().endTime;
					if (Number.isFinite(end)) a.finish();
					else {
						a.pause();
						a.currentTime = 0;
					}
				} catch {
					// An animation can refuse `finish()` (an infinite iteration count reported
					// as a finite endTime by an older engine). Pausing it is still better than
					// leaving it running, and a throw must not lose the whole deck.
					try {
						a.pause();
					} catch {}
				}
			}
			await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
			// What matters is whether anything is STILL running after the pass, not how many
			// there were before it. Returning `live.length` never reaches zero — a paused
			// animation and a `fill: forwards` finished one both stay in `getAnimations()` —
			// so the loop below always ran its full five rounds, at 812ms per slide instead
			// of 120ms on any deck that holds an animation. Measured in Chromium; no deck in
			// the corpus holds one today — which was WRONG: three `anima-scene` slides hold a
			// finished animation, so those slides really did pay the full five rounds.
			return document.getAnimations().filter((a) => a.playState === 'running').length;
		});
		// TWO consecutive quiet rounds, not one, and the difference is measured rather than
		// defensive. Breaking on the first quiet round reintroduced the exact instability
		// this function exists to remove: the player's control fade starts on a delay, so
		// round 0 finds nothing running, exits, and the screenshot lands mid-fade again —
		// three runs of anima-scene went 3 / 2 / 3 findings. One round of silence only says
		// nothing is running NOW; the beat below is what gives a delayed transition time to
		// declare itself, and a second quiet round is what says none did.
		quiet = running ? 0 : quiet + 1;
		if (quiet >= 2) break;
		// A short beat, so a transition started BY the settle (or on its own delay) has
		// begun and is visible to `getAnimations()` on the next round rather than after the
		// screenshot.
		await new Promise((r) => setTimeout(r, 120));
	}
	// `rounds >= 5` was the first condition and it lies in the common case: the loop can
	// exhaust its rounds with the LAST look quiet (quiet === 1), and then it printed
	// "still animating" about a page that was not. The honest test is whether the window
	// ever closed.
	if (quiet < 2) {
		console.warn(`  !! still animating after ${rounds} settle rounds — this slide is sampled mid-flight`);
	}
	return rounds;
}

async function auditPlayer(browser, file) {
	const page = await browser.newPage();
	// A deliberate LIGHT system preference, so a `system` export is scored in a known
	// state rather than in whatever the host machine happens to prefer.
	await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
	await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
	await page.goto(`file://${path.resolve(file)}`, { waitUntil: 'networkidle0' });
	await settle(page, 400);
	const asExported = await auditState(page, 'as exported');
	const toggled = await page.evaluate(() => {
		const btn = document.getElementById('lp-mode');
		if (!btn) return null;
		btn.click();
		return document.documentElement.getAttribute('data-lp-scheme');
	});
	let after = [];
	if (toggled) {
		await settle(page, 300);
		after = await auditState(page, `after the toggle (${toggled})`);
	}
	await page.close();
	return [...asExported, ...after];
}

/**
 * The identity of a finding, stable across runs but blind to the ratio.
 *
 * Deck, scheme state, page, slide classes, tag and the run's own text — everything that says
 * WHICH run this is, and nothing that says how bad it is. The ratio is compared separately,
 * so a known row that gets WORSE is a regression while the same row unchanged is not news.
 * Text is included because two runs can share every other field on one slide; it is truncated
 * by `PROBE` already, so the key stays bounded.
 */
const findingKey = (row) => [row.deck, row.state, row.page, row.cls || '', row.tag, String(row.text)].join('|');

/**
 * Collapse rows to one per finding key, keeping the WORST ratio.
 *
 * A key can genuinely collide: `examples/kanban-chart-redesign.md` p5 carries two different
 * cards whose lane label is both the word "growth", so deck/state/page/class/tag/text names
 * them both. Keeping the worst is the conservative read of "this finding".
 *
 * SHARED BY BOTH PATHS ON PURPOSE, and that is the whole reason it is a function. `--bless`
 * used to build its map with `Object.fromEntries`, which keeps the LAST row for a duplicate
 * key, while the comparison kept the WORST — so the two "growth" cards blessed at 4.47 and
 * compared at 4.02, and the very first run against a fresh baseline reported a 0.45
 * regression that did not exist. A gate that cries wolf on its own baseline is worse than no
 * gate, and two collapse rules for one key is exactly how that happens.
 */
function collapse(rows) {
	const seen = new Map();
	for (const row of rows) {
		const key = findingKey(row);
		if (!seen.has(key) || row.r < seen.get(key).r) seen.set(key, row);
	}
	return seen;
}

/**
 * Compare a sweep against a blessed baseline and return only what MOVED.
 *
 * WHY A BASELINE AT ALL. A scheduled sweep that re-reports every known failure every night is
 * a wall of rows nobody reads, and this repo has already written down what that costs: a
 * reader who learns to skim past known-bogus rows is exactly the reader who skims past a real
 * one (`check-slide-contrast.js`, on its own exempt tier). The corpus carries 283 sub-AA runs
 * today (#1745) and they are tracked there, not here. So the nightly's question is not "how
 * many are there" but "did tonight add one, or make one worse".
 *
 * FIXED rows are reported too, and deliberately: they are the signal that the baseline is
 * stale and wants re-blessing, and without them a fix looks identical to a deck being skipped.
 *
 * @param {{deck: string}[]} rows every sub-AA run this sweep found
 * @param {Record<string, number>} baseline key → ratio, from a previous `--bless`
 */
function diffBaseline(rows, baseline) {
	const seen = collapse(rows);
	const added = [];
	const worse = [];
	for (const [key, row] of seen) {
		if (!(key in baseline)) added.push(row);
		// A 0.05 band, not equality: the backdrop is sampled from rendered pixels, so a
		// sub-pixel layout shift between runs can move a ratio in the third decimal without
		// anything having changed. Below that band this would cry wolf every night.
		else if (row.r < baseline[key] - 0.05) worse.push({ ...row, was: baseline[key] });
	}
	const fixed = Object.keys(baseline).filter((key) => !seen.has(key));
	return { added, worse, fixed, current: Object.fromEntries([...seen].map(([key, row]) => [key, row.r])) };
}

/**
 * The ratchet `--bless` had no notion of, expressed as a pure function so it is testable
 * rather than asserted in prose (the shape `tools/bless-palette-baselines.js` already uses
 * for the palette tables — HARD RULE #15).
 *
 * `--bless` used to write whatever tonight measured, in both directions. Writing a ratio
 * DOWN records that a surface got worse and files it as known, which is the one edit a
 * baseline must never make silently: the gate's whole question is "did tonight make
 * something worse", and a bless can answer it by moving the goalposts.
 *
 * That is not a hypothetical here. This tool samples RENDERED PIXELS, and its numbers are
 * load-sensitive: two `anima-scene` pause rows read 3.20 / 3.19 measured alone and
 * 2.56 / 1.93 inside a full 139-deck sweep (#1808). Blessing under load would have written
 * both down by more than a point, and the deck they belong to would then have had to
 * regress past 1.93 before anything complained. So a measurement BELOW the committed value
 * is held, printed, and left for a human — the nightly stays red, which is the correct
 * state for a finding nobody has explained.
 *
 * NO SLACK, unlike `diffBaseline`'s 0.05 band, and the asymmetry is deliberate. That band
 * exists so sub-pixel jitter does not cry wolf; holding the HIGHER of two numbers a few
 * thousandths apart costs nothing, because the same band absorbs it on the next comparison.
 * The 1e-9 is binary representation, not policy.
 *
 * @param {Map<string, {r: number}>} seen collapsed findings, key → worst row
 * @param {Record<string, number>} prior the committed baseline
 */
function blessRatchet(seen, prior, { allowLoosen = false } = {}) {
	const blessed = {};
	const held = [];
	const tightened = [];
	const added = [];
	for (const [key, row] of seen) {
		const was = prior[key];
		if (was === undefined) {
			added.push(key);
			blessed[key] = row.r;
		} else if (row.r >= was - 1e-9) {
			if (row.r > was + 1e-9) tightened.push(key);
			blessed[key] = row.r;
		} else {
			held.push({ key, was, now: row.r });
			blessed[key] = allowLoosen ? row.r : was;
		}
	}
	// A key the sweep no longer reports is a fixed finding, and dropping it is the point of
	// re-blessing. It is counted rather than silent, because a deck that failed to export
	// looks identical to a deck that got better.
	const dropped = Object.keys(prior).filter((k) => !seen.has(k));
	return { blessed, held, tightened, added, dropped };
}

function report(name, rows) {
	const failing = rows.filter((x) => !x.exempt && !x.patterned && x.r < x.need);
	const exempt = rows.filter((x) => x.exempt && x.r < x.need);
	const patterned = rows.filter((x) => !x.exempt && x.patterned && x.r < x.need);
	const byState = new Map();
	for (const row of failing) {
		if (!byState.has(row.state)) byState.set(row.state, []);
		byState.get(row.state).push(row);
	}
	const head =
		`${name} — ${rows.length} runs · ${failing.length} below AA` +
		`${exempt.length ? ` (+${exempt.length} muted-chrome, exempt)` : ''}` +
		`${patterned.length ? ` (+${patterned.length} over a patterned fill, not measurable)` : ''}`;
	console.log(`\n${'='.repeat(90)}\n${head}\n${'='.repeat(90)}`);
	for (const [state, list] of byState) {
		console.log(`\n  ── ${state} ── ${list.length} below AA`);
		for (const b of list.sort((p, q) => p.r - q.r)) {
			const flags = [b.gradient ? `gradient, worst ${b.worst}:1` : '', b.sampled ? '' : 'modeled backdrop', b.imgBackdrop ? 'image backdrop' : '']
				.filter(Boolean)
				.join(', ');
			console.log(
				`   p${String(b.page).padStart(2)} ${(b.cls || '').padEnd(26).slice(0, 26)} ${b.tag.padEnd(12)}` +
					` ${b.r.toFixed(2)}:1 (need ${b.need})  rgb(${b.fg}) on rgb(${b.bg})${flags ? `  [${flags}]` : ''}\n        "${b.text}"`,
			);
		}
	}
	return failing;
}

async function main() {
	const argv = process.argv.slice(2);
	let jsonOut = null;
	let baselinePath = null;
	let bless = false;
	let allowLoosen = false;
	let quiet = false;
	const inputs = [];
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--json') jsonOut = argv[++i];
		else if (argv[i] === '--baseline') baselinePath = argv[++i];
		else if (argv[i] === '--bless') bless = true;
		else if (argv[i] === '--allow-loosen') allowLoosen = true;
		else if (argv[i] === '--quiet') quiet = true;
		else inputs.push(argv[i]);
	}
	if (bless && !baselinePath) baselinePath = DEFAULT_BASELINE;
	if (!inputs.length) {
		console.error('usage: node tools/check-player-contrast.js [--json out.json] <deck.md|player.html> ...');
		process.exit(2);
	}
	const browser = await puppeteer.launch({
		executablePath: process.env.CHROME_PATH,
		args: ['--no-sandbox', '--font-render-hinting=none'],
	});
	const all = [];
	const findings = [];
	let failed = 0;
	try {
		for (const input of inputs) {
			let file;
			try {
				file = playerFor(input);
			} catch (err) {
				console.error(`\n!! ${input}: ${err.message}`);
				failed += 1;
				continue;
			}
			const rows = await auditPlayer(browser, file);
			const name = path.basename(input).replace(/\.(md|html)$/, '');
			const bad = quiet ? rows.filter((x) => !x.exempt && !x.patterned && x.r < x.need) : report(name, rows);
			failed += bad.length;
			for (const row of bad) findings.push({ ...row, deck: name });
			all.push({ deck: name, rows });
		}
	} finally {
		await browser.close();
		cleanupTempDirs();
	}
	if (jsonOut) fs.writeFileSync(jsonOut, `${JSON.stringify(all, null, '\t')}\n`);
	const runs = all.reduce((n, d) => n + d.rows.length, 0);
	console.log(`\n${'='.repeat(90)}\n${runs} runs across ${all.length} deck(s) · ${failed} below AA`);

	// No baseline asked for: the raw verdict, which is what a human running this by hand on
	// one deck wants.
	if (!baselinePath) {
		console.log('');
		process.exit(failed ? 1 : 0);
	}

	if (bless) {
		const prior = fs.existsSync(baselinePath) ? JSON.parse(fs.readFileSync(baselinePath, 'utf8')) : {};
		const { blessed, held, tightened, added: newKeys, dropped } = blessRatchet(collapse(findings), prior, { allowLoosen });
		fs.writeFileSync(baselinePath, `${JSON.stringify(blessed, null, '\t')}\n`);
		console.log(
			`blessed ${Object.keys(blessed).length} known finding(s) into ${path.relative(ROOT, baselinePath)}\n` +
				`  ${newKeys.length} new · ${tightened.length} improved · ${dropped.length} dropped (no longer reproduce) · ` +
				`${held.length} ${allowLoosen ? 'LOOSENED (--allow-loosen)' : 'held at the committed value'}`,
		);
		for (const h of held) {
			console.log(
				`  ${allowLoosen ? 'loosened' : 'held'}  ${h.key}  committed ${h.was.toFixed(2)} > measured ${h.now.toFixed(2)}` +
					`${allowLoosen ? '' : ' — NOT written down. Re-run to confirm it reproduces, then pass --allow-loosen with the reason.'}`,
			);
		}
		if (held.length && !allowLoosen) {
			console.log(
				'\n  A bless that writes a ratio DOWN records that a surface got worse and calls it known.\n' +
					'  This tool measures rendered pixels, and its numbers are load-sensitive — the same run\n' +
					'  reads differently alone and inside a full-corpus sweep (#1808) — so a quiet loosening is\n' +
					'  as likely to be the harness as the page. Those rows keep their committed value, which\n' +
					'  leaves the nightly RED until someone says why.\n',
			);
		}
		process.exit(0);
	}

	// An ABSENT baseline is not an empty one. Treating it as `{}` would report every known
	// finding in the corpus as NEW — a few hundred rows on the first run, which is both
	// useless and indistinguishable from a real regression. Say what is actually wrong, and
	// FAIL: a scheduled gate with no oracle is an assertion that rots quietly, which is the
	// failure `check:family-tiers` exists to remember (#1218).
	//
	// The baseline is blessed ON MAIN, not on a branch, and that is not laziness. It records
	// ratios, and ratios move with every theme and contrast change — three landed on main in
	// the hours this branch was open (#1738 widened the exempt ink set, #1723 re-curated seven
	// status trios, #1744 withdrew the 3:1 large-text allowance so every run is scored at 4.5).
	// A ~55-minute sweep blessed on a branch is stale before the branch merges, and a stale
	// baseline reports drift that is really just the branch being behind.
	if (!fs.existsSync(baselinePath)) {
		console.error(`\nno baseline at ${path.relative(ROOT, baselinePath)} — record one ON MAIN with \`npm run contrast:player:bless\` and commit it\n`);
		process.exit(2);
	}
	const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
	const { added, worse, fixed } = diffBaseline(findings, baseline);
	console.log(`baseline ${path.relative(ROOT, baselinePath)}: ${Object.keys(baseline).length} known · ${added.length} new · ${worse.length} worse · ${fixed.length} fixed\n`);
	for (const row of added) console.log(`  NEW    ${row.deck} p${row.page} ${row.cls || '—'} ${row.tag} ${row.r.toFixed(2)}:1 (need ${row.need})  "${row.text}"`);
	for (const row of worse) console.log(`  WORSE  ${row.deck} p${row.page} ${row.cls || '—'} ${row.tag} ${row.was.toFixed(2)} → ${row.r.toFixed(2)}:1  "${row.text}"`);
	if (fixed.length) console.log(`\n  ${fixed.length} baseline finding(s) no longer reproduce — re-bless with \`npm run contrast:player:bless\` once the fix has landed.`);
	console.log('');
	// FIXED rows do NOT fail. A sweep is only ever asked whether tonight made things worse.
	process.exit(added.length || worse.length ? 1 : 0);
}

module.exports = { sampleBackdrop, ratio, over, HIDE_INK, findingKey, collapse, diffBaseline, blessRatchet, DEFAULT_BASELINE };

if (require.main === module) main();
