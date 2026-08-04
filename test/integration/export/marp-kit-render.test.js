/**
 * Integration: Lattice's two Marp hand-off artifacts, rendered by REAL marp-cli.
 *
 * WHY THIS FILE EXISTS. Nothing in CI rendered either of them. Every defect found
 * in #1325 passed lint, `build:check` and ~4,900 unit tests, and every one of them
 * was visible on the first page of a PDF. The worst was silent: a deck with a
 * flowchart exported 13 slides as **14 pages**, the last one blank, because
 * Mermaid appends a `<div class="mermaidTooltip">` to `document.body` — outside
 * every `<section>`, `position:absolute` with no `top`/`left`, so it lands after
 * the last slide and pushes document height past the deck's own. Chrome spills
 * one more sheet. `lib/runtime/index.js` `pinMermaidTooltip` fixed it; nothing
 * stopped it coming back.
 *
 * TWO FIXTURES, BECAUSE THEY ARE TWO GENERATORS. The kit and the Export-to-Marp
 * bundle share their ASSET list by construction (`build-marp-kit.js` imports
 * `STATIC_ASSETS` + `fontAssetsFor()` from `lib/core/marp-bundle.js`), but they do
 * NOT share the machinery that has actually broken:
 *
 *   - two independently authored marp configs — `build-marp-kit.js` `marpConfig()`
 *     against `lib/core/marp-bundle.js` `MARP_CONFIG_CJS`;
 *   - `withRuntimeScripts()`, the baked front-matter block and the per-deck
 *     `themeSet` generation exist ONLY in the bundle.
 *
 * That second list is where all four defects in the 2026-07-29 post-mortem lived.
 * Gating only the kit would have tested the twin of the risky generator and left
 * the original untested — while reading, to anyone skimming, as "CI renders our
 * Marp export." So the same assertions run over both.
 *
 * Each artifact is driven on the two routes its own README tells a recipient to
 * trust:
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
 * (`engineering/gotchas.md` § "Does the marp-vscode webview execute `<script>`?"),
 * and it cannot be driven from a headless sandbox at all. A green run here says
 * nothing about it.
 *
 * marp-cli is NOT a dependency of this project and is not becoming one — Marp is
 * an export TARGET, not a render path (HARD RULE #1). It is fetched on demand at
 * the SAME version range the export bundle pins, imported from
 * `lib/core/marp-bundle.js` rather than restated, so the gate and the artifacts it
 * gates cannot ask for different tools.
 *
 * Slow tier: fetches marp-cli, then spawns Chromium four times (~19s warm).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const { MARP_CLI_RANGE } = require(path.join(ROOT, 'lib', 'core', 'marp-bundle.js'));
const { pageCount } = require(path.join(ROOT, 'test', 'helpers', 'pdf.js'));

const DECK = 'Sample-Deck.md';
const KIT = path.join(ROOT, 'dist', 'marp-kit');
const SOURCE_DECK = path.join(ROOT, 'kit', DECK);
const EXPORT_CLI = path.join(ROOT, 'tools', 'export-marp.js');
const MARP_PKG = `@marp-team/marp-cli@${MARP_CLI_RANGE}`;
const TIMEOUT = 300000;

/**
 * Renders land in `.scratch/` — gitignored, the repo's sanctioned home for
 * throwaway output, and a STABLE path rather than a random `mkdtemp` one. That is
 * deliberate: a gate whose whole selling point is "every one of these defects was
 * visible on the first page of a PDF" must leave the PDF behind when it goes red.
 * CI uploads this directory on failure (`.github/workflows/ci.yml`).
 */
const OUT_ROOT = path.join(ROOT, '.scratch', 'marp-render');

/**
 * The deck's slide count, as a RATCHET rather than a fact about today.
 *
 * The load-bearing assertion is `pages === sections`, which is self-calibrating —
 * it reads both numbers from the render and cannot be fooled by counting the
 * source. This floor is the second half: `Sample-Deck.md` is the only fidelity
 * fixture the export boundary has, and a silent shrink would weaken the gate while
 * leaving it green. Trimming the deck is a legitimate edit; it just has to be a
 * deliberate one, which means moving this number.
 *
 * Do NOT re-derive it by grepping `_class:` in the deck — that returns 16. The
 * deck quotes `_class: kpi` in prose and shows a literal `<!-- _class: kpi -->` as
 * an example, so only a line-anchored match is right, and the DOM is righter
 * still. This test never counts the source at all.
 */
const MIN_SLIDES = 13;

/**
 * Text that must survive to the RASTERIZED page.
 *
 * First and last slide catch a blank sheet at either end. The third is the one
 * that earned its place: a red team broke this gate with a print-only rule
 * (`@media print{section.diagram svg{display:none}}`) that left the screen DOM
 * untouched and emptied the flowchart slide in the PDF — and every DOM assertion
 * here runs against the `--html` route, so all of them stayed green. Mermaid
 * draws its node labels as real text, so they land in the PDF's text layer;
 * probing for one is a cheap net for "a middle slide lost its content in print."
 */
const FIRST_PAGE_TEXT = 'Markdown in. Boardroom out.';
const LAST_PAGE_TEXT = 'Now change something.';
const DIAGRAM_PAGE_TEXT = 'Marp parses';

/** Every marp-cli invocation: the browser Chromium needs, and where to find it. */
function marpEnv() {
	const env = { ...process.env };
	// This fetches and RUNS registry content on the PR critical path, so it runs it
	// with lifecycle scripts off. Verified end to end on a cold cache: the version
	// probe and a full 13-page PDF render both work with this set. It does not make
	// an unpinned range reproducible — see ensureMarp() — it just stops an install
	// hook from executing in a job with the repo checked out.
	env.npm_config_ignore_scripts = 'true';
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

/**
 * NO `--browser-args`. That flag does not exist in marp-cli — `--help` lists only
 * `--browser`, `--browser-path`, `--browser-protocol`, `--browser-timeout`, and
 * yargs silently swallows the unknown option. An earlier revision of this file
 * passed `--browser-args=--no-sandbox --disable-dev-shm-usage` with a comment
 * calling it mandatory; a deliberately bogus value renders byte-identically, so
 * it was doing nothing. marp-cli adds `--no-sandbox` ITSELF when it detects uid 0
 * (`puppeteerArgs()` in its launcher), which is why the renders worked. Verified
 * here by rendering as root with no flags at all: 13 pages, exit 0.
 *
 * `--disable-dev-shm-usage` genuinely cannot be passed through marp-cli; if a
 * small `/dev/shm` ever bites, the lever is Chromium's own env or a bigger shm,
 * not an option marp-cli does not read.
 */
function runMarp(args, cwd, timeout = TIMEOUT) {
	return spawnSync('npx', ['-y', MARP_PKG, ...args], {
		cwd,
		encoding: 'utf8',
		env: marpEnv(),
		timeout,
	});
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Can marp-cli be fetched? Memoized — both fixtures ask, it should cost one probe.
 *
 * THE SKIP IS LOCAL-ONLY, AND THAT IS THE WHOLE DESIGN. A gate that hard-fails on
 * a laptop with no network trains people to ignore it; a gate that SKIPS in CI is
 * not a gate at all, it is a decoration that reports green. `# skipped 6` at the
 * end of a several-hundred-line TAP stream is not a signal anyone reads. So:
 * retry, then skip off-CI and **throw on CI**.
 *
 * The resolved version is captured and reported in every failure message. Without
 * it a red gate cannot be triaged as "marp-cli moved under us" versus "we broke
 * it" — `MARP_CLI_RANGE` is a RANGE, deliberately (it is what the kit's README
 * tells recipients to run, so gating an exact pin would gate something nobody
 * uses), which means the tool genuinely can move on a PR that changed nothing.
 */
let preflight = null;
async function ensureMarp() {
	if (preflight) return preflight;
	let last = null;
	for (let attempt = 1; attempt <= 3; attempt++) {
		// A SHORT per-attempt budget, not the hook's whole 300s. Three attempts
		// against a silently-dropping network (SYN timeouts — the realistic CI
		// failure, not the fast ECONNREFUSED that is easy to test) must still fit
		// inside `before()`, or the diagnosis below is replaced by an opaque hook
		// timeout.
		const probe = runMarp(['--version'], ROOT, 60000);
		if (probe.status === 0) {
			preflight = { ok: true, version: String(probe.stdout || '').trim() };
			return preflight;
		}
		last = probe;
		if (attempt < 3) await sleep(2000 * attempt);
	}
	const reason =
		`could not fetch ${MARP_PKG} after 3 attempts (exit ${last.status ?? 'timeout/ENOENT'}). ` +
		`stderr: ${String(last.stderr || '').trim().slice(0, 400)}`;
	// On CI a missing tool is a FAILED gate, not an absent one.
	if (process.env.CI) {
		throw new Error(
			`[marp-kit-render] ${reason}\n` +
				'Refusing to skip on CI — a gate that self-skips is a gate that reports green ' +
				'while covering nothing. Fix the registry access or remove the suite deliberately.',
		);
	}
	process.stderr.write(`\n[marp-kit-render] SKIPPED (not CI): ${reason}\n\n`);
	preflight = { ok: false, reason };
	return preflight;
}

/**
 * The two artifacts. `stage()` materializes one into `dir` and returns the folder
 * that actually holds the deck.
 */
const FIXTURES = [
	{
		slug: 'kit',
		label: 'dist/marp-kit — the copy-and-go kit',
		stage(dir) {
			// A COPY. The committed kit is a build artifact behind the ownership gate
			// (HARD RULE #2) and `build:check` byte-compares it — writing renders into
			// it would make an unrelated gate go red.
			fs.cpSync(KIT, dir, { recursive: true });
			return dir;
		},
	},
	{
		slug: 'bundle',
		label: 'Export-to-Marp bundle — tools/export-marp.js',
		stage(dir) {
			const out = path.join(dir, 'export');
			const r = spawnSync(process.execPath, [EXPORT_CLI, SOURCE_DECK, out, 'cuoio'], {
				cwd: ROOT,
				encoding: 'utf8',
				timeout: TIMEOUT,
			});
			assert.equal(r.status, 0, `export-marp failed:\n${r.stdout}\n${r.stderr}`);
			// The exporter names the folder after the deck; read it rather than
			// restating the slug rule.
			const dirs = fs.readdirSync(out, { withFileTypes: true }).filter((e) => e.isDirectory());
			assert.equal(dirs.length, 1, `expected one exported bundle folder, got ${dirs.length}`);
			return path.join(out, dirs[0].name);
		},
	},
];

for (const fixture of FIXTURES) {
	describe(`${fixture.label} — rendered by real marp-cli`, () => {
		let skipReason = null;
		let deckDir;
		let pdf;
		let browser;
		let page;
		/** Uncaught exceptions from the runtime. The six named assertions cannot see these. */
		const pageErrors = [];

		before(async () => {
			const pre = await ensureMarp();
			if (!pre.ok) {
				skipReason = pre.reason;
				return;
			}

			deckDir = fixture.stage(
				(() => {
					const d = path.join(OUT_ROOT, fixture.slug);
					fs.rmSync(d, { recursive: true, force: true });
					fs.mkdirSync(d, { recursive: true });
					return d;
				})(),
			);
			process.stderr.write(
				`[marp-kit-render] ${fixture.slug}: marp-cli ${pre.version}, renders kept in ${deckDir}\n`,
			);

			const common = [DECK, '--config-file', 'marp.config.cjs', '--allow-local-files'];
			const ctx = `[${fixture.slug} · marp-cli ${pre.version}]`;

			pdf = path.join(deckDir, 'out.pdf');
			const r1 = runMarp([...common, '--pdf', '-o', pdf], deckDir);
			assert.equal(r1.status, 0, `${ctx} marp --pdf failed:\n${r1.stdout}\n${r1.stderr}`);

			const html = path.join(deckDir, 'out.html');
			const r2 = runMarp([...common, '--html', '-o', html], deckDir);
			assert.equal(r2.status, 0, `${ctx} marp --html failed:\n${r2.stdout}\n${r2.stderr}`);

			browser = await require('puppeteer').launch({
				headless: 'new',
				args: ['--no-sandbox', '--disable-dev-shm-usage'],
			});
			page = await browser.newPage();
			// NOT console errors: the kit's runtime probes for a sibling `<deck>.md` to
			// recover front matter and legitimately 404s on it (the bundle bakes the
			// block instead, so it never asks). An uncaught EXCEPTION is different —
			// a runtime that builds the split panel and then throws on a later slide
			// passes every other assertion in this file.
			page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
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
			// The renders are deliberately NOT deleted — see OUT_ROOT. `.scratch/` is
			// gitignored and `npm run clean:scratch` reaps it.
		});

		/**
		 * THE regression. 13 slides must be 13 pages, and the last page must be a
		 * real slide rather than a blank sheet.
		 *
		 * Both numbers come from the render — `pdfinfo` for the sheets (poppler, the
		 * same toolchain the sibling raster tests use) and the live DOM for the
		 * slides — so the assertion cannot drift with the deck. The text check is the
		 * independent half: a count alone is satisfied by thirteen blank pages, and
		 * the specific bug this gate exists for appends an EMPTY sheet, which a
		 * last-page text probe catches even if the count assertion were ever loosened.
		 */
		test('one PDF page per slide, and the last page is a real slide', { timeout: TIMEOUT }, async (t) => {
			if (skipReason) return t.skip(skipReason);

			const sections = await page.evaluate(() => document.querySelectorAll('section').length);
			const pages = pageCount(pdf); // test/helpers/pdf.js — guards a missing file + an unparseable pdfinfo

			assert.ok(sections >= MIN_SLIDES, `the deck still carries its ${MIN_SLIDES} fixture slides (found ${sections})`);
			assert.equal(
				pages,
				sections,
				`one PDF page per slide. Got ${pages} pages for ${sections} slides — a trailing ` +
					'blank page means something outside the <section>s is contributing scrollable ' +
					'overflow again (see the mermaidTooltip test below).',
			);

			const text = execFileSync('pdftotext', ['-q', pdf, '-'], { encoding: 'utf8' });
			const firstText = execFileSync('pdftotext', ['-q', '-f', '1', '-l', '1', pdf, '-'], { encoding: 'utf8' });
			const lastText = execFileSync('pdftotext', ['-q', '-f', String(pages), '-l', String(pages), pdf, '-'], { encoding: 'utf8' });
			assert.ok(firstText.includes(FIRST_PAGE_TEXT), `page 1 carries its heading — the PDF has real text, not blank sheets (got: ${JSON.stringify(firstText.slice(0, 120))})`);
			assert.ok(lastText.includes(LAST_PAGE_TEXT), `the LAST page is the closing slide, not an empty sheet (got: ${JSON.stringify(lastText.slice(0, 120))})`);
			assert.ok(
				text.includes(DIAGRAM_PAGE_TEXT),
				`the flowchart's node labels reached the PRINTED page — a print-only regression ` +
					`(a stray @media print rule, a runtime that finishes after Chrome snapshots) empties ` +
					'a slide in the PDF while every DOM assertion here, which runs against --html, stays green.',
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
		 * Mermaid is vendored at a committed version (`mermaid-v11.min.js`), so "no
		 * tooltip was created" is not something that can drift underneath this — it
		 * would take a deliberate vendor bump, which is exactly when someone should
		 * look here.
		 */
		test('the Mermaid tooltip is PINNED, not removed — the blank-page root cause', { timeout: TIMEOUT }, async (t) => {
			if (skipReason) return t.skip(skipReason);

			const tips = await page.evaluate(() =>
				[...document.querySelectorAll('body > .mermaidTooltip')].map((el) => ({
					position: getComputedStyle(el).position,
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

			assert.ok(panels.left > 0, `the runtime built .panel-left with a real width (found: ${panels.left})`);
			assert.ok(panels.right > 0, `and .panel-right beside it (found: ${panels.right})`);
		});

		/**
		 * …and did not blow up doing it. Every other assertion here samples ONE
		 * construct; a runtime that builds the split panel, draws Mermaid, then throws
		 * while building slide 9's chart satisfies all of them.
		 */
		test('the runtime threw no uncaught exception anywhere in the deck', { timeout: TIMEOUT }, async (t) => {
			if (skipReason) return t.skip(skipReason);
			assert.deepEqual(pageErrors, [], `lattice-runtime raised uncaught errors on a Marp-rendered deck:\n${pageErrors.join('\n')}`);
		});

		/**
		 * Cross-renderer math. Lattice typesets with KaTeX; marp-core uses MathJax.
		 * The layouts style both, and this is the only place that claim is tested
		 * against a real MathJax render — that the display equation exists, has a real
		 * box, and sits INSIDE its slide's grid rather than overflowing it.
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
			// Not styling-in-general (the token test below covers that) — this is the
			// COMPONENT-level rule reaching a Marp render, which is the #1256 defect
			// class: Marpit's scoper cannot resolve a leading `:is(section…)`, and ~835
			// rules matched nothing until `distributeLeadingIs` ran at build time. If
			// the math layout is ever legitimately re-authored off grid, update this —
			// but check the scoper first.
			assert.equal(math.sectionDisplay, 'grid', 'the math component rule reached the slide (Marpit scoped it)');
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
		 * The #1 silent failure mode, and the reason `Sample-Deck.md` exists at all:
		 * if the theme does not register, the deck renders UNSTYLED WITH NO ERROR. It
		 * takes only one thing going wrong — a `themeSet` entry lost from either
		 * generator's config, or `tools/minify-css.js` dropping the `@theme` directive
		 * comment a stock minifier strips.
		 *
		 * TWO SHEETS, TWO PROBES — and it has to be two, which an earlier revision got
		 * wrong. That version asserted `--accent` and documented it as proving "BOTH
		 * sheets registered." It does not: the engine bundle and the palette each
		 * declare `--accent` independently, so it resolves from the palette ALONE.
		 * Both a red team and an independent checker broke it the same way — drop
		 * `lattice.min.css` from `themeSet` (exactly the failure this test names) and
		 * the deck renders in Times New Roman on a transparent background while
		 * `--accent` still answers. The assertion the change marketed as load-bearing
		 * was the one a mutation walked straight through.
		 *
		 * So: `--fs-h1` is declared ONLY in the engine bundle, `--accent` is what the
		 * palette supplies. One each, and the pair actually means what the name says.
		 * `data-theme` would prove neither — marp-core emits that attribute from the
		 * front matter whether or not any CSS resolved.
		 */
		test('both stylesheets registered — the deck is styled, not silently bare', { timeout: TIMEOUT }, async (t) => {
			if (skipReason) return t.skip(skipReason);

			const styling = await page.evaluate(() => {
				const cs = getComputedStyle(document.querySelector('section'));
				return {
					accent: cs.getPropertyValue('--accent').trim(),
					fsH1: cs.getPropertyValue('--fs-h1').trim(),
					bg: cs.backgroundColor,
				};
			});

			assert.ok(styling.fsH1, '--fs-h1 resolves — declared ONLY in the engine bundle, so this is the proof lattice CSS registered and Marpit scoped it');
			assert.ok(styling.accent, '--accent resolves — the palette registered too');
			assert.notEqual(styling.bg, 'rgba(0, 0, 0, 0)', 'the slide has a painted background, not the transparent default');
		});

		/**
		 * The #1256 defect: the engine stylesheet references its faces
		 * `url(fonts/…)`-relative, so an artifact missing `fonts/` degrades to system
		 * serif SILENTLY — every title slide subtly wrong and nothing in any log.
		 *
		 * THERE ARE TWO WAYS TO LOSE THE FONTS, and they need different probes.
		 *
		 * 1. **The FILES go missing** (`fonts/` not copied). Confirmed by deleting it
		 *    from a scratch copy: `check()` flips to false and all 37 faces report
		 *    `status: 'error'`.
		 * 2. **The `@font-face` RULES go missing** — a stock minifier eating them,
		 *    which is the threat `tools/minify-css.js` exists to prevent. Here
		 *    `check()` is USELESS: it returns **true** when nothing matches, because
		 *    the family falls back to a system font. A red team broke the first
		 *    version of this test exactly that way — it deleted all 37 rules and every
		 *    assertion passed. `document.fonts.size` is the probe that fires: no
		 *    rules, no faces, nothing to error.
		 *
		 * A third assertion was dropped outright: matching
		 * `getComputedStyle(h1).fontFamily` against /Playfair Display/ passes with
		 * `fonts/` deleted, because computed `font-family` is the DECLARED list, never
		 * the resolved face. It read like coverage and was a tautology.
		 */
		test('the bundled faces load — losing them falls back to system serif silently', { timeout: TIMEOUT }, async (t) => {
			if (skipReason) return t.skip(skipReason);

			const fonts = await page.evaluate(() => ({
				declared: document.fonts.size,
				outfit: document.fonts.check('1em Outfit'),
				playfair: document.fonts.check('1em "Playfair Display"'),
				errored: [...document.fonts].filter((f) => f.status === 'error').map((f) => f.family),
			}));

			assert.ok(
				fonts.declared >= 30,
				`the stylesheet still declares its @font-face rules (found ${fonts.declared}, expected ~37) — ` +
					'a minifier that strips them degrades the deck to system fonts, and fonts.check() ' +
					'cannot see it because an unmatched family silently falls back',
			);
			assert.ok(fonts.outfit, 'Outfit (body) loaded from fonts/');
			assert.ok(fonts.playfair, 'Playfair Display (display) loaded from fonts/');
			assert.deepEqual(fonts.errored, [], 'no bundled @font-face failed to fetch');
		});
	});
}
