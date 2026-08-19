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
 * The per-route signal that the page is ready to be scanned. Both apps mount a React
 * island whose landmark does not exist in the server-rendered shell, so its presence is
 * the honest "hydrated" marker; everything else is static and is ready when its own
 * `<main>`/`<h1>` is parsed.
 */
const READY: Record<string, string> = {
	'/playground/': 'main.lx-ui',
	'/studio/': '#main-content',
};

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
function collect(results: AxeResults, hit: Set<string>): Finding[] {
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
			raw.push({
				rule: 'color-contrast (equalRatio)',
				target: n.target.join(' '),
				detail: 'foreground equals background — an invisible label',
			});
		}
	}
	return raw.filter((f) => {
		const s = SANCTIONED.find((x) => x.rule === f.rule && x.match(f.target));
		if (s) hit.add(s.label);
		return !s;
	});
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
			await page.goto(route, { waitUntil: 'networkidle' });
			// The apps hydrate an island after load, and `networkidle` returns before React
			// has mounted one — a scan of the un-mounted shell is a scan of nothing. So wait
			// on a signal that only exists once the island is in the DOM, bounded by the
			// project's own expect timeout, rather than on a guessed interval.
			await page.locator(READY[route] ?? 'main, #main-content, h1').first().waitFor({ state: 'attached' });
			await page.evaluate(AXE_SRC);
			const results = await page.evaluate((o) => window.axe.run(document, o), AXE_RUN_OPTIONS);
			for (const f of collect(results, hit)) {
				found.push(`${scheme} ${width}px ${route}\n    ${f.rule} @ ${f.target}\n    ${f.detail.replace(/\n/g, ' | ').slice(0, 240)}`);
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
	await page.evaluate(AXE_SRC);
	const selfCheck = await page.evaluate((o) => window.axe.run(document, o), AXE_RUN_OPTIONS);
	const planted = collect(selfCheck, new Set<string>()).map((f) => f.rule);
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
		// The Sheet animates in; wait for its content to be visible rather than for the
		// animation's duration.
		await page.locator('[data-slot="sheet-content"]').first().waitFor({ state: 'visible' });
		await page.evaluate(AXE_SRC);
		const results = await page.evaluate((o) => window.axe.run(document, o), AXE_RUN_OPTIONS);
		for (const f of collect(results, new Set<string>())) {
			found.push(`${scheme} ${width}px menu-open\n    ${f.rule} @ ${f.target}\n    ${f.detail.replace(/\n/g, ' | ').slice(0, 240)}`);
		}
	}

	expect(found, `axe findings with the menu open at ${width}px:\n  ${found.join('\n  ')}`).toEqual([]);
});
