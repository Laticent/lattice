/**
 * Integration: `dist/marp-kit` rendered by REAL marp-cli — the gate the kit shipped without.
 *
 * WHY THIS FILE EXISTS. Nothing in CI rendered the kit. Every defect found in
 * #1325 passed lint, `build:check` and ~4,900 unit tests, and every one of them
 * was visible on the first page of a PDF. The worst was silent: a deck with a
 * flowchart exported 13 slides as **14 pages**, the last one blank, because
 * Mermaid appends a `<div class="mermaidTooltip">` to `document.body` — outside
 * every `<section>`, `position:absolute` with no `top`/`left`, so it lands after
 * the last slide and pushes document height past the deck's own. Chrome spills
 * one more sheet. `lib/runtime/index.js` `pinMermaidTooltip` fixed it; nothing
 * stopped it coming back.
 *
 * So this renders the SHIPPED kit through the SHIPPED command, on the two routes
 * the kit's README tells a recipient to trust:
 *
 *   - `marp --pdf`  — drives real headless Chrome, so the runtime runs. This is
 *     where the page-count invariant lives, because a blank trailing page is a
 *     PRINT artifact and exists on no other surface.
 *   - `marp --html` + a real browser — the same DOM a recipient gets when they
 *     open the file, and the only place the runtime's work can be INSPECTED
 *     rather than inferred from a rasterized page.
 *
 * Neither is a stand-in for the other and neither is a synthetic harness
 * (HARD RULE #23): both drive the actual artifact through the actual tool.
 *
 * WHAT IT DELIBERATELY DOES NOT COVER. The marp-vscode PREVIEW pane. Whether
 * that webview executes the deck's `<script>` tags is UNVERIFIED and contested
 * (`engineering/gotchas.md` § "marp-vscode webview CSP"), and it cannot be
 * driven from a headless sandbox at all. A green run here says nothing about it.
 *
 * marp-cli is NOT a dependency of this project and is not becoming one — Marp is
 * an export TARGET, not a render path (HARD RULE #1). It is fetched on demand at
 * the SAME version range the export bundle pins, imported from
 * `lib/core/marp-bundle.js` rather than restated, so the gate and the artifact it
 * gates cannot ask for different tools.
 *
 * Slow tier: fetches marp-cli, then spawns Chromium three times (~40s warm).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const { MARP_CLI_RANGE } = require(path.join(ROOT, 'lib', 'core', 'marp-bundle.js'));

const KIT = path.join(ROOT, 'dist', 'marp-kit');
const DECK = 'Sample-Deck.md';
const MARP_PKG = `@marp-team/marp-cli@${MARP_CLI_RANGE}`;
const TIMEOUT = 300000;

/**
 * The kit deck's slide count, as a RATCHET rather than a fact about today.
 *
 * The load-bearing assertion is `pages === sections`, which is self-calibrating
 * — it reads both numbers from the render and cannot be fooled by counting the
 * source. This floor is the second half: `Sample-Deck.md` is the only fidelity
 * fixture the export boundary has, and a silent shrink would weaken the gate
 * while leaving it green. Trimming the deck is a legitimate edit; it just has to
 * be a deliberate one, which means moving this number.
 *
 * Do NOT re-derive it by grepping `_class:` in the deck — that returns 16. The
 * deck quotes `_class: kpi` in prose and shows a literal `<!-- _class: kpi -->`
 * as an example, so only a line-anchored match is right, and the DOM is righter
 * still. This test never counts the source at all.
 */
const MIN_SLIDES = 13;

/** Every marp-cli invocation: the browser Chromium needs, and where to find it. */
function marpEnv() {
	const env = { ...process.env };
	// marp-cli finds its own browser, but its search does not know about
	// puppeteer's cached download — which is the ONLY Chromium on a CI runner
	// (`npm ci` puts it in ~/.cache/puppeteer, which the integration job caches).
	// Point it at that one rather than hoping a system Chrome exists.
	if (!env.CHROME_PATH) {
		try {
			env.CHROME_PATH = require('puppeteer').executablePath();
		} catch {
			/* leave unset — marp-cli falls back to its own finder */
		}
	}
	return env;
}

/** `--no-sandbox` is not optional: CI runs as root, and a small /dev/shm hangs the render forever. */
const BROWSER_ARGS = '--browser-args=--no-sandbox --disable-dev-shm-usage';

function runMarp(args, cwd) {
	return spawnSync('npx', ['-y', MARP_PKG, ...args], {
		cwd,
		encoding: 'utf8',
		env: marpEnv(),
		timeout: TIMEOUT,
	});
}

describe('dist/marp-kit rendered by real marp-cli', () => {
	/**
	 * Set when marp-cli could not be FETCHED (offline / airgapped / blocked
	 * registry). A gate that hard-fails with no network is worse than no gate —
	 * it trains people to ignore it. A gate that skips SILENTLY is worse still,
	 * so the reason is printed, and the skip is scoped as tightly as it can be:
	 * it covers only "the tool could not be obtained". Once the preflight passes,
	 * every later failure is a real failure and is reported as one.
	 */
	let skipReason = null;
	let dir;
	let pdf;
	let browser;
	let page;

	before(async () => {
		const probe = runMarp(['--version'], ROOT);
		if (probe.status !== 0) {
			skipReason =
				`could not fetch ${MARP_PKG} (exit ${probe.status ?? 'timeout'}) — ` +
				'the kit render gate needs network access to the npm registry. ' +
				`stderr: ${String(probe.stderr || '').trim().slice(0, 400)}`;
			process.stderr.write(`\n[marp-kit-render] SKIPPED: ${skipReason}\n\n`);
			return;
		}

		// Render a COPY. The committed kit is a build artifact behind the ownership
		// gate (HARD RULE #2) and `build:check` byte-compares it — writing outputs
		// into it would make an unrelated gate go red.
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-marp-kit-'));
		fs.cpSync(KIT, dir, { recursive: true });

		const common = [DECK, '--config-file', 'marp.config.cjs', '--allow-local-files', BROWSER_ARGS];

		pdf = path.join(dir, 'out.pdf');
		const r1 = runMarp([...common, '--pdf', '-o', pdf], dir);
		assert.equal(r1.status, 0, `marp --pdf failed:\n${r1.stdout}\n${r1.stderr}`);

		const html = path.join(dir, 'out.html');
		const r2 = runMarp([...common, '--html', '-o', html], dir);
		assert.equal(r2.status, 0, `marp --html failed:\n${r2.stdout}\n${r2.stderr}`);

		browser = await require('puppeteer').launch({
			headless: 'new',
			args: ['--no-sandbox', '--disable-dev-shm-usage'],
		});
		page = await browser.newPage();
		await page.goto(require('node:url').pathToFileURL(html).href, { waitUntil: 'networkidle0' });
		await page.evaluate(() => document.fonts.ready);
		// Mermaid draws asynchronously and the tooltip pin runs on its completion.
		await page.waitForFunction(
			() => document.querySelector('[data-mermaid-state="rendered"]') !== null,
			{ timeout: 30000 },
		);
	}, { timeout: TIMEOUT });

	after(async () => {
		if (browser) await browser.close();
		if (dir) fs.rmSync(dir, { recursive: true, force: true });
	});

	/**
	 * THE regression. 13 slides must be 13 pages.
	 *
	 * Both numbers come from the render — `pdfinfo` for the sheets (poppler, the
	 * same toolchain the sibling raster tests use) and the live DOM for the
	 * slides — so the assertion cannot drift with the deck.
	 */
	test('the PDF has exactly one page per slide — no blank trailing sheet', { timeout: TIMEOUT }, async (t) => {
		if (skipReason) return t.skip(skipReason);

		const sections = await page.evaluate(() => document.querySelectorAll('section').length);
		const info = execFileSync('pdfinfo', [pdf], { encoding: 'utf8' });
		const pages = Number((info.match(/^Pages:\s*(\d+)/m) || [])[1]);

		assert.ok(sections >= MIN_SLIDES, `the kit deck still carries its ${MIN_SLIDES} fixture slides (found ${sections})`);
		assert.equal(
			pages,
			sections,
			`one PDF page per slide. Got ${pages} pages for ${sections} slides — ` +
				'a trailing blank page means something outside the <section>s is contributing ' +
				'scrollable overflow again (see the mermaidTooltip test below).',
		);
	});

	/**
	 * The MECHANISM behind that page count, asserted in both directions — because
	 * the two obvious fixes are each other's bug.
	 *
	 *  - Leave the tooltip `position:absolute` → it sits after the last slide, in
	 *    scrollable overflow, and print spills one more sheet.
	 *  - REMOVE the node → the extra sheet goes away and `click A "url" "tip"`
	 *    silently stops working everywhere, because Mermaid's `setupToolTips`
	 *    captured that exact node in a closure and its `mouseover` handler writes
	 *    into it. That regression shipped once already.
	 *
	 * `position:fixed` is the one answer that satisfies both, so the test pins
	 * both: the node is still there, AND it is out of the overflow.
	 *
	 * Mermaid is vendored at a committed version (`mermaid-v11.min.js`), so
	 * "no tooltip was created" is not something that can drift underneath this —
	 * it would take a deliberate vendor bump, which is exactly when someone
	 * should look here.
	 */
	test('the Mermaid tooltip is PINNED, not removed — the blank-page root cause', { timeout: TIMEOUT }, async (t) => {
		if (skipReason) return t.skip(skipReason);

		const tips = await page.evaluate(() =>
			[...document.querySelectorAll('body > .mermaidTooltip')].map((el) => ({
				position: getComputedStyle(el).position,
				inFlow: el.offsetParent !== null,
			})),
		);

		assert.ok(
			tips.length >= 1,
			'Mermaid still appends its body-level tooltip — if this fails, either the ' +
				'diagram did not draw, or pinMermaidTooltip went back to REMOVING the node ' +
				'(which kills `click` tooltips on every interactive surface).',
		);
		for (const tip of tips) {
			assert.equal(
				tip.position,
				'fixed',
				'body > .mermaidTooltip must be position:fixed — absolute puts it back in ' +
					'scrollable overflow after the last slide, which is the 14th blank page.',
			);
			assert.equal(tip.inFlow, false, 'a pinned tooltip has no offsetParent — it is out of the flow');
		}
	});

	/**
	 * The runtime actually EXECUTED. `.panel-left` / `.panel-right` exist in no
	 * static Marp render — `lib/transformers/split-panels.js` builds them on the
	 * live DOM, and the string appears in the rendered HTML only inside the
	 * inlined stylesheet. Finding the ELEMENTS, with real widths, is the proof.
	 */
	test('the split-panel transform ran — the runtime executed on a Marp-rendered DOM', { timeout: TIMEOUT }, async (t) => {
		if (skipReason) return t.skip(skipReason);

		const panels = await page.evaluate(() => {
			const l = document.querySelector('.panel-left');
			const r = document.querySelector('.panel-right');
			return {
				left: l ? l.getBoundingClientRect().width : null,
				right: r ? r.getBoundingClientRect().width : null,
			};
		});

		assert.ok(panels.left > 0, 'the runtime built .panel-left with a real width (found: ' + panels.left + ')');
		assert.ok(panels.right > 0, 'and .panel-right beside it (found: ' + panels.right + ')');
	});

	/**
	 * Cross-renderer math. Lattice typesets with KaTeX; marp-core uses MathJax.
	 * The layouts style both, and this is the only place that claim is tested
	 * against a real MathJax render — that the display equation exists, has a
	 * real box, and sits INSIDE its slide's grid rather than overflowing it.
	 */
	test('the display equation is typeset by MathJax and laid out inside the math slide', { timeout: TIMEOUT }, async (t) => {
		if (skipReason) return t.skip(skipReason);

		const math = await page.evaluate(() => {
			const el = document.querySelector('mjx-container[display="true"]');
			if (!el) return null;
			const sec = el.closest('section');
			const m = el.getBoundingClientRect();
			const s = sec.getBoundingClientRect();
			return {
				sectionClass: sec.className,
				sectionDisplay: getComputedStyle(sec).display,
				box: { w: m.width, h: m.height, top: m.top, bottom: m.bottom, left: m.left, right: m.right },
				slide: { top: s.top, bottom: s.bottom, left: s.left, right: s.right },
			};
		});

		assert.ok(math, 'marp-core typeset the $$…$$ block into an mjx-container');
		assert.match(math.sectionClass, /\bmath\b/, 'it landed on the math slide');
		assert.equal(math.sectionDisplay, 'grid', 'the math layout is a CSS grid (the slide styling applied)');
		assert.ok(math.box.w > 0 && math.box.h > 0, 'the equation has a real box, not a collapsed one');
		assert.ok(
			math.box.top >= math.slide.top && math.box.bottom <= math.slide.bottom,
			`the equation sits within the slide vertically (${math.box.top.toFixed(0)}–${math.box.bottom.toFixed(0)} inside ${math.slide.top.toFixed(0)}–${math.slide.bottom.toFixed(0)})`,
		);
		assert.ok(
			math.box.left >= math.slide.left && math.box.right <= math.slide.right,
			'and horizontally — an overflowing equation is clipped on the printed page',
		);
	});

	/**
	 * The kit's #1 silent failure mode, and the reason `Sample-Deck.md` exists at
	 * all: if the theme does not register, the deck renders UNSTYLED WITH NO
	 * ERROR. It takes only one thing going wrong — `marp.config.cjs` losing a
	 * `themeSet` entry, or `tools/minify-css.js` dropping the `@theme` directive
	 * comment a stock minifier strips.
	 *
	 * `--accent` is defined in `lattice.min.css` and re-declared by
	 * `cuoio.min.css`, so a value here means BOTH sheets registered and Marpit
	 * scoped them onto the slide. `data-theme` would not prove it — marp-core
	 * emits that attribute from the front matter whether or not the CSS resolved.
	 */
	test('both stylesheets registered — the deck is styled, not silently bare', { timeout: TIMEOUT }, async (t) => {
		if (skipReason) return t.skip(skipReason);

		const styling = await page.evaluate(() => {
			const sec = document.querySelector('section');
			const cs = getComputedStyle(sec);
			return {
				accent: cs.getPropertyValue('--accent').trim(),
				fsH1: cs.getPropertyValue('--fs-h1').trim(),
				bg: cs.backgroundColor,
			};
		});

		assert.ok(styling.accent, '--accent resolves on the slide → lattice.min.css + cuoio.min.css both registered and scoped');
		assert.ok(styling.fsH1, '--fs-h1 resolves → the typography scale came through');
		assert.notEqual(styling.bg, 'rgba(0, 0, 0, 0)', 'the slide has a painted background, not the transparent default');
	});

	/**
	 * The #1256 defect, on the kit's own terms: `lattice.css` references its faces
	 * `url(fonts/…)`-relative, so a kit missing `fonts/` degrades to system serif
	 * SILENTLY — every title slide subtly wrong and nothing in any log. The kit
	 * builder derives that folder from the export's own `fontAssetsFor()` walker
	 * precisely so it cannot happen; this is the assertion that the derivation
	 * arrived intact on a real render.
	 */
	test('the bundled faces load — a kit without fonts/ falls back to system serif silently', { timeout: TIMEOUT }, async (t) => {
		if (skipReason) return t.skip(skipReason);

		const fonts = await page.evaluate(() => ({
			outfit: document.fonts.check('1em Outfit'),
			playfair: document.fonts.check('1em "Playfair Display"'),
			h1: getComputedStyle(document.querySelector('h1')).fontFamily,
			errored: [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family),
		}));

		assert.ok(fonts.outfit, 'Outfit (body) loaded from fonts/');
		assert.ok(fonts.playfair, 'Playfair Display (display) loaded from fonts/');
		assert.deepEqual(fonts.errored, [], 'no bundled @font-face failed to fetch');
		assert.match(fonts.h1, /Playfair Display/, 'the title actually resolves to Playfair, not a serif fallback');
	});
});
