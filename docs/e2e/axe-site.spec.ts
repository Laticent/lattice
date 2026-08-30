import fs from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test } from '@playwright/test';

/**
 * AXE — the WCAG rule set over the WEBSITE (`lattice.style`): the half of G10 that
 * was never closed.
 *
 * WHY THIS EXISTS. `test/integration/invariants/axe-a11y.test.js` runs axe over the two
 * SHIPPED DECK SHELLS — the export HTML and the standalone player. It says so in its own
 * docblock, and it is right to: those are the artifacts a deck becomes. But Lattice has
 * TWO execution environments, and the other one — the site, the component reference, the
 * Playground, the Studio — had no automated accessibility scan of any kind. The nearest
 * thing, `tools/check-shadcn-bridge-contrast.js`, grades TOKEN MATH: it mixes the bridge's
 * derived colors and scores the pairs. It passed, every palette, every mode, the whole
 * time the component reference was rendering its ACTIVE nav item as --accent ink on an
 * --accent pill — a 1:1 ratio, an invisible label — because the tokens were never the
 * problem. An unlayered `a { color: var(--accent) }` in `landing.css` beat the @layer-ed
 * Tailwind utility that was supposed to color it, and no amount of token arithmetic can
 * see a cascade. That is the gap this file closes: the rendered DOM, in a real browser,
 * at the widths and in the modes people actually use.
 *
 * THE `equalRatio` ARM, and why the budget is not just "violations". axe files an EXACT
 * 1:1 contrast as `incomplete`, not a violation — messageKey `equalRatio`, on the sound
 * theory that ink matching its ground is sometimes deliberate hiding. So the single worst
 * contrast defect on the site was invisible to a violations-only scan, which is a fair
 * description of how it survived. We enforce that one messageKey out of the incomplete
 * bucket and NOTHING else from it: the rest of `incomplete` on this site is `bgOverlap` /
 * `bgGradient` / `elmPartiallyObscured` — 800-odd nodes where axe genuinely cannot resolve
 * a background behind a gradient or an overlapping box. Those are unknowns, not defects,
 * and enforcing them would be a scoreboard.
 *
 * WIDTHS AND MODES. Routed to desktop (1440), tablet (820) and mobile (390) by the
 * `@a11y` tag, because the QUALITY BAR makes all three first-class — and because it is
 * load-bearing here, not ceremony: every `scrollable-region-focusable` finding on this
 * site exists ONLY at 390px, where a table or a code block starts to overflow. A
 * desktop-only scan reported those pages clean. Each route is scanned in BOTH color
 * modes in the same test, since contrast is the one class that differs between them
 * (all four original contrast defects were light-mode-only).
 *
 * WHAT THIS DOES NOT COVER, so the green is not read as more than it is:
 *   · ONE palette — whatever `cuoio` (the default) resolves to. 17 other palettes ship,
 *     and a rendered-DOM contrast defect in one of them would pass here. The token-side
 *     sweep over all of them is `tools/contrast-audit.js` + `theme-surface-aa.test.js`;
 *     between the two, what is NOT covered anywhere is a rendered cascade defect in a
 *     non-default palette.
 *   · TWELVE routes of ~88. The component reference alone is 61 pages built from one
 *     template, and this scans one of them.
 *   · The FIRST PAINT of each route only — no route is driven. Nothing here opens a
 *     Sheet, a Popover, a Command palette, the Studio's panels or its Fabricate flow,
 *     so every dialog, menu and transient surface on the site is unscanned. That is
 *     where most of the site's remaining `text-muted-foreground/70`-style alpha-diluted
 *     ink lives (30 occurrences at last count, 26 of them in the Studio).
 *   · KEYBOARD BEHAVIOR beyond what a static rule can see: focus order, focus-visible
 *     ring contrast, WCAG 2.2's 2.4.11 (focus not obscured) and 2.4.13 (focus appearance)
 *     are all outside axe's rule set and outside this file.
 *   · The engine render inside the Playground/Studio PREVIEW IFRAME (`frame-tested` is
 *     reported `incomplete` on those routes and left there) — that content is the deck,
 *     and the deck's own shells are gated by the engine-side axe test.
 */

const require = createRequire(import.meta.url);
const AXE_SRC = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/** The scanned routes: the marketing shell, the docs prose, the catalog, and both apps. */
const ROUTES = [
	'/',
	'/features/',
	'/comparison/',
	'/components/',
	'/components/anchor/title/',
	'/getting-started/',
	'/guides/authoring/',
	'/model/concepts/',
	'/spec/lfm/',
	'/story/',
	'/playground/',
	'/studio/',
];

/**
 * The signal that a route is ready to scan.
 *
 * `astro-island[ssr]`, NOT a landmark. The first version waited for `main.lx-ui` on
 * `/playground/` and called it "the honest hydrated marker" — it is not one. That island is
 * `client:load`, so Astro server-renders it: `<main class="lx-ui contents">` and its `<h1>`
 * are both in the static HTML before a line of React runs, and the guard returned
 * immediately on the shell. (It IS a real marker on `/studio/`, which is `client:only`.)
 * Astro stamps `ssr` on every un-hydrated island and removes it on mount — measured on
 * `/playground/`: 4 islands carry `ssr` in the served HTML, 0 do once hydration finishes.
 *
 * EAGER islands only. "No island still marked `ssr`" is too strong and hangs: the landing
 * page carries two `client:visible` islands (`StudioPreview`, `RestyleShowcase`) that sit
 * below the fold and correctly never hydrate in a 1440x900 window, so the wait timed out and
 * `/` went unscanned in both modes. `client:load` and `client:only` are the two directives
 * that promise to mount without user action — `/playground/` is the former, `/studio/` the
 * latter. `client:idle` is deliberately excluded too: it rides `requestIdleCallback`, which
 * a loaded machine can defer indefinitely.
 *
 * COVERAGE NOTE: it follows that a `client:visible` island is scanned in its SERVER-RENDERED
 * form, never its hydrated one. Two on the landing page today.
 */
const HYDRATED = () =>
	document.querySelectorAll('astro-island[ssr][client="load"], astro-island[ssr][client="only"]').length === 0;

/**
 * Wait for an element to STOP MOVING, not merely to be "visible".
 *
 * Playwright's `visible` means a non-empty box that is not `visibility:hidden`. It says
 * nothing about a running transform, and the Radix sheet slides in from `translateX(100%)`.
 * Measured on `/features/` at 390px: at the instant `waitFor({state:'visible'})` resolved,
 * the panel sat at **x = 386.6 in a 390px viewport** — 3.4px on screen — and settled to
 * x = 70 about a second later. axe snapshots geometry when `axe.run` starts and both
 * `color-contrast` and `target-size` need a node to overlap the viewport, so the scan
 * measured an off-screen sheet and found nothing.
 *
 * That made this test a FALSE GREEN, which is worse than no test: against a build carrying
 * all three menu defects it reported zero findings in 7 of 8 runs. The original comment
 * here read "wait for its content to be visible rather than for the animation's duration",
 * which is exactly the wrong instinct — visibility is not settle.
 *
 * Polling the box until it is stable across consecutive frames, rather than asserting
 * `transform: none`, so this keeps working if the animation is ever changed or removed.
 */
async function settled(locator: import('@playwright/test').Locator) {
	await locator.waitFor({ state: 'visible' });
	await locator.evaluate(
		(el) => new Promise<void>((resolve) => {
			let last = '';
			let stable = 0;
			const tick = () => {
				const r = el.getBoundingClientRect();
				const now = `${r.x},${r.y},${r.width},${r.height}`;
				if (now === last) {
					if (++stable >= 3) return resolve();
				} else {
					stable = 0;
					last = now;
				}
				requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		}),
	);
}

const AXE_RUN_OPTIONS = {
	runOnly: {
		type: 'tag',
		// WCAG 2.0/2.1/2.2 A + AA, plus axe's best-practice set — which is where
		// `landmark-one-main`, `region` and `page-has-heading-one` live, and those
		// three are what caught the Playground shipping with no main landmark and
		// no h1 at all.
		values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa', 'best-practice'],
	},
};

/**
 * Adjudicated exceptions. Each is a (rule, target-substring) pair that has been driven on
 * the real surface and found NOT to be a defect there. The suite asserts each entry still
 * matches something, so a stale sanction fails rather than rots.
 */
const SANCTIONED: Sanction[] = [
	{
		rule: 'scrollable-region-focusable',
		match: (t) => t.includes('.cm-scroller'),
		label: 'CodeMirror scroller (Studio editor)',
		// MEASURED false positive, not a waiver. axe's `focusable-content` check asks
		// whether a child is TABBABLE, and reads `element.tabIndex` to decide. Chrome
		// reports `tabIndex === -1` for a `contenteditable` div even though it is fully
		// in the tab order — so CodeMirror's `.cm-content` looks unreachable to the rule
		// and is not. Driven in a real browser on `/studio/`: Tab reaches `.cm-content`
		// in 18 presses from the top of the page, and 60 ArrowDowns then scroll
		// `.cm-scroller` from 0 to 658px. Both halves of the rule's intent are met.
		// Absent at 390 — the phone shell does not mount the editor pane.
		widths: [1440, 820],
	},
	{
		rule: 'landmark-unique',
		match: (t) => t.includes('expressive-code'),
		label: 'Expressive Code scrollable code block',
		// Expressive Code (Starlight's code-block renderer) marks a scrollable code block
		// `role="region"` — a genuinely good keyboard affordance — but supplies no
		// accessible name unless the block has a frame title, so a page with several
		// becomes several same-named landmarks. Third-party markup we do not author, and
		// `landmark-unique` is best-practice tier, not AA. Logged rather than fixed
		// (HARD RULE #18's pre-existing / off-path arm); the fix path is an Expressive
		// Code `postprocessRenderedBlock` plugin that names each block from its language
		// and index, which is its own change. Absent at 1440 — the blocks fit, so EC does
		// not make them regions.
		widths: [820, 390],
	},
];

type Sanction = {
	rule: string;
	match: (target: string) => boolean;
	label: string;
	widths: number[];
};

/**
 * The slice of axe's result shape this file reads. Deliberately narrow and local rather
 * than pulled from axe-core's own types: the only contract that matters here is the four
 * fields below, and a local shape keeps the `page.evaluate` boundary — where the value is
 * JSON, not an axe object — honest about what actually survives it.
 */
type AxeNode = {
	target: string[];
	failureSummary?: string;
	any?: { data?: { messageKey?: string } }[];
};
type AxeRule = { id: string; nodes: AxeNode[] };
type AxeResults = { violations: AxeRule[]; incomplete: AxeRule[] };

declare global {
	interface Window {
		axe: { run(context: Document, options: unknown): Promise<AxeResults> };
	}
}

type Finding = { rule: string; target: string; detail: string };

/**
 * Split axe's output into what we hold to be defects and what a sanction covers.
 * "Defects" = every violation, plus the ONE enforced `incomplete` case (see the header).
 */
function collect(results: AxeResults, hit: Set<string>, width: number, ariaHidden: Set<string> = new Set()): Finding[] {
	const raw: Finding[] = [];
	for (const v of results.violations) {
		for (const n of v.nodes) {
			raw.push({ rule: v.id, target: n.target.join(' '), detail: n.failureSummary ?? '' });
		}
	}
	for (const i of results.incomplete) {
		if (i.id !== 'color-contrast') continue;
		for (const n of i.nodes) {
			if (!n.any?.some((a) => a.data?.messageKey === 'equalRatio')) continue;
			// axe's own contrast filter already drops `display:none`, `visibility:hidden`,
			// zero-size, `opacity:0` and clip-based `sr-only` — verified, all four stay out of
			// this bucket. It does NOT drop `aria-hidden="true"`, which is a legitimate way to
			// hide decoration from assistive tech, and such an element painted in its own
			// ground color is not "an invisible label" — it is correctly invisible. Nothing
			// on the site does this today; without the guard the first one to appear fails
			// the build with the wrong diagnosis.
			if (ariaHidden.has(n.target.join(' '))) continue;
			raw.push({
				rule: 'color-contrast (equalRatio)',
				target: n.target.join(' '),
				detail: 'foreground equals background — an invisible label',
			});
		}
	}
	// A sanction exempts a finding ONLY at a width where it is declared. The first version
	// consulted `widths` for staleness and ignored it here, so a sanction could silently
	// SPREAD: `landmark-unique @ expressive-code` is declared at 820/390 because the blocks
	// only become scrollable regions there, and if a font or container change made it appear
	// at 1440 the exemption would have swallowed it with nothing failing. Staleness caught
	// disappearance and not growth; now both are covered.
	return raw.filter((f) => {
		const s = SANCTIONED.find(
			(x) => x.rule === f.rule && x.match(f.target) && x.widths.includes(width),
		);
		if (s) hit.add(s.label);
		return !s;
	});
}

/**
 * Run axe and resolve, in the same page, which `equalRatio` targets sit inside an
 * `aria-hidden="true"` subtree — see the guard in `collect()`. Done here rather than in the
 * test body so both the sweep and the menu scan get the same treatment.
 */
async function runAxe(page: import('@playwright/test').Page) {
	await page.evaluate(AXE_SRC);
	const results = await page.evaluate((o) => window.axe.run(document, o), AXE_RUN_OPTIONS);
	const eqTargets = results.incomplete
		.filter((i) => i.id === 'color-contrast')
		.flatMap((i) => i.nodes
			.filter((n) => n.any?.some((a) => a.data?.messageKey === 'equalRatio'))
			.map((n) => n.target.join(' ')));
	const hidden = eqTargets.length
		? await page.evaluate((sels) => sels.filter((sel) => {
			try {
				const el = document.querySelector(sel);
				return el ? !!el.closest('[aria-hidden="true"]') : false;
			} catch { return false; }
		}), eqTargets)
		: [];
	return { results, ariaHidden: new Set(hidden) };
}

/**
 * ONE test, not one per route. The stale-sanction check below needs to know what the
 * whole sweep saw, and Playwright's `fullyParallel` would otherwise scatter the routes
 * across workers with a fresh module (and so a fresh tally) in each. A single serial
 * sweep also makes a failure report every route at once, which is what you want from a
 * gate you are about to fix.
 */
test('@a11y the website has no axe findings at this width, in either color mode', async ({ page }, testInfo) => {
	testInfo.setTimeout(15 * 60 * 1000);
	const width = page.viewportSize()?.width ?? 0;
	const found: string[] = [];
	const hit = new Set<string>();

	for (const scheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		for (const route of ROUTES) {
			// A THROW MUST NOT DISCARD THE SWEEP. Every finding is asserted once, at the end,
			// so an exception mid-run used to abort with nothing reported — measured: a
			// `waitFor` timeout on route 11 threw away real findings from the 10 routes
			// already scanned, including the 1:1 label, and reported only the timeout. The
			// operator then reads "the gate is broken" instead of "the site has N defects",
			// and the stale-sanction check below never runs at all. A failed route is now a
			// finding in its own right and the sweep carries on.
			try {
				await page.goto(route, { waitUntil: 'networkidle' });
				// `networkidle` returns before React has mounted an island, and a scan of the
				// un-mounted shell is a scan of nothing. Bounded poll on a real signal.
				await page.waitForFunction(HYDRATED);
				const { results, ariaHidden } = await runAxe(page);
				for (const f of collect(results, hit, width, ariaHidden)) {
					found.push(`${scheme} ${width}px ${route}\n    ${f.rule} @ ${f.target}\n    ${f.detail.replace(/\n/g, ' | ').slice(0, 240)}`);
				}
			} catch (e) {
				found.push(`${scheme} ${width}px ${route}\n    SCAN FAILED — this route was not measured\n    ${String(e).split('\n')[0].slice(0, 200)}`);
			}
		}
	}

	// A sanction that no longer matches anything at a width where it is DECLARED to
	// appear is a claim about the site that has stopped being true. It should be
	// deleted, and until it is it silently widens the gate — so a stale entry fails
	// here exactly as a new violation would.
	const stale = SANCTIONED.filter((s) => s.widths.includes(width) && !hit.has(s.label)).map(
		(s) => `${s.rule} — ${s.label} (declared present at ${s.widths.join(', ')}px)`,
	);

	expect(found, `axe findings at ${width}px:\n  ${found.join('\n  ')}`).toEqual([]);
	expect(stale, `stale sanctions in axe-site.spec.ts — delete them:\n  ${stale.join('\n  ')}`).toEqual([]);

	// SELF-CHECK. A green sweep is only worth something if the sweep can go red, and the
	// cheap ways for it to stop working are silent: axe fails to evaluate, the run options
	// name a tag that matches no rules, `collect` filters everything away. So plant two
	// defects — one ordinary violation (a button whose only name is an empty string) and
	// one of the `equalRatio` incompletes this file exists to promote — and require the
	// same code path that just returned nothing to return both.
	// On a plain content page, not whatever the sweep happened to end on: the Studio's
	// shell is a fixed, overflow-hidden viewport, and an element appended past its bottom
	// edge is not visible, so axe skips it and the self-check tests nothing.
	await page.goto('/', { waitUntil: 'networkidle' });
	await page.evaluate(() => {
		const probe = document.createElement('div');
		probe.id = 'axe-self-check';
		probe.setAttribute('style', 'position:fixed;top:0;left:0;z-index:99999;background:#808080');
		probe.innerHTML =
			'<button type="button"></button>' +
			'<p style="color:#808080;background:#808080;font-size:14px;margin:0">invisible</p>';
		document.body.appendChild(probe);
	});
	const { results: selfCheck, ariaHidden: selfHidden } = await runAxe(page);
	const planted = collect(selfCheck, new Set<string>(), width, selfHidden).map((f) => f.rule);
	expect(planted, 'the axe sweep did not detect deliberately planted defects — it is not measuring anything').toEqual(
		expect.arrayContaining(['button-name', 'color-contrast (equalRatio)']),
	);
});

/**
 * The site menu, OPEN. A first-paint scan cannot see a closed dialog, and the gap is not
 * academic: driving this one Sheet open by hand found three real defects the sweep above
 * reported nothing about — the current row's label at 4.47:1, its description at 3.80:1
 * (--text-muted on the accent-soft ground, where it is sub-AA on 33 of 36 palette x mode
 * blocks), and a 16x16 close button under a FINE pointer, below WCAG 2.2's 2.5.8 minimum
 * of 24x24. `pointer-coarse` already grew that button to 44x44 for a phone; a 390px-wide
 * laptop window is the case it missed.
 *
 * One surface, not a systematic sweep of every transient. The Sheets, Popovers, Command
 * palette and Studio panels are still unscanned, and the gate's header says so.
 */
test('@a11y the site menu has no axe findings when open', async ({ page }, testInfo) => {
	testInfo.setTimeout(5 * 60 * 1000);
	const width = page.viewportSize()?.width ?? 0;
	const trigger = page.locator('button[aria-label="Menu"]').first();
	const found: string[] = [];

	for (const scheme of ['light', 'dark'] as const) {
		await page.emulateMedia({ colorScheme: scheme });
		await page.goto('/features/', { waitUntil: 'networkidle' });
		// The trigger EXISTS at every width and is merely hidden above tablet, so `attached`
		// is the signal that the header island has mounted; visibility is the question asked
		// next, not the thing being waited for.
		await trigger.waitFor({ state: 'attached' });
		if (!(await trigger.isVisible())) {
			// Not a silent skip: the trigger is hidden above the tablet breakpoint because
			// the nav is inline there, and asserting that keeps a future layout change from
			// turning this test into a no-op that still reports green.
			expect(width, 'the Menu trigger is hidden — that is only correct at desktop width').toBeGreaterThan(820);
			continue;
		}
		await trigger.click();
		// Settled, not merely visible — see `settled()`. This is the line that made the test
		// a false green.
		await settled(page.locator('[data-slot="sheet-content"]').first());
		const { results, ariaHidden } = await runAxe(page);
		for (const f of collect(results, new Set<string>(), width, ariaHidden)) {
			found.push(`${scheme} ${width}px menu-open\n    ${f.rule} @ ${f.target}\n    ${f.detail.replace(/\n/g, ' | ').slice(0, 240)}`);
		}
	}

	expect(found, `axe findings with the menu open at ${width}px:\n  ${found.join('\n  ')}`).toEqual([]);
});
