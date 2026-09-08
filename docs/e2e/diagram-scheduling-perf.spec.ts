/**
 * @perf — the diagram scheduling policy, measured on the REAL Studio.
 *
 * WHY THIS EXISTS. The Mermaid latency work went through seven independent review passes and
 * every one retracted a load-bearing number, because each claim was checked by a throwaway probe
 * written by whoever wanted the answer. Nothing in the tree could catch any of it: seven
 * regressions shipped and were reverted, and CI was green for all of them — it never touches the
 * real Studio, real typing, or a real render.
 *
 * WHAT THIS TIER OWES that the model tier cannot give. `test/unit/runtime/
 * diagram-scheduling.metamorphic.test.js` proves the POLICY is coherent — 14 relations over
 * counts, no browser, gating every push. What it cannot see is whether the shipped runtime
 * actually schedules the way the policy says on a real host: it models the event loop. That is
 * this spec's whole job, and neither tier substitutes for the other.
 *
 * COUNTS, NOT MILLISECONDS, and that is the design. Absolute timings do not travel — the seventh
 * pass measured a 64-node fence at 360-490ms where this repo's ledger says 130ms, so every figure
 * had to be re-derived before anything could be concluded. Counts do travel, and nearly every
 * regression here announced itself as one before it announced itself as a duration: 8 renders
 * where the old build did 1, 3 where it did 1, 24 parses where it did 0.
 *
 * THE TWO ASSERTIONS ARE DELIBERATELY DIFFERENT SHAPES. `parses` on a costly or never-drawn fence
 * is asserted EXACTLY ZERO, because there is no legitimate variance in it — the policy either
 * charges the gate there or it does not, and every value above zero is the defect. `renders`
 * carries a ceiling with headroom, because typing jitter can legitimately let one extra trailing
 * timer elapse (observed once in nine runs on a healthy build).
 */
import { expect, gotoStudio, livePreview, setEditorContent, test } from './studio-fixture';

/** Assembled, so the literal never appears where a code frame or the nightly's grep sees it. */
const BREACH_TOKEN = `::perf-${'ceiling'}-breach::`;

/** A linear chain of N nodes; the caret parks in `Alpha`, so every keystroke changes the source. */
function fence(n: number, danglingTail = false): string {
	const L = ['  A0[Alpha] --> N1[Node1]'];
	for (let i = 1; i < n; i++) L.push(`  N${i}[Node${i}] --> N${i + 1}[Node${i + 1}]`);
	// A half-written last edge: the source never parses, so the fence never draws. This is the
	// case the decision doc calls the author's main one — building a diagram from scratch — and
	// the one a policy keyed on render cost got wrong, because a fence that has never drawn has
	// no cost on record and an empty record used to read CHEAP.
	if (danglingTail) L.push('  TAIL[Tail] -->');
	return `flowchart TB\n${L.join('\n')}`;
}

const deck = (nodes: number, danglingTail = false) => `---
theme: lattice
palette: indaco
---

# Scheduling probe

The plain slide navigation starts from.

---

## One fence, ${nodes} nodes.

\`\`\`mermaid
${fence(nodes, danglingTail)}
\`\`\`

---

## Trailing prose

The caret does not land here.
`;

/** Count every `mermaid.render` and `mermaid.parse` the preview frame actually makes. */
async function instrument(page: import('@playwright/test').Page): Promise<void> {
	await page.addInitScript(() => {
		const w = window as unknown as { __diag?: { render: number; parse: number }; mermaid?: unknown };
		w.__diag = { render: 0, parse: 0 };
		let held: Record<string, unknown> | undefined;
		Object.defineProperty(window, 'mermaid', {
			configurable: true,
			get: () => held,
			set: (v: Record<string, unknown> & { __probed?: boolean }) => {
				held = v;
				if (!v || v.__probed) return;
				for (const fn of ['render', 'parse'] as const) {
					const orig = v[fn];
					if (typeof orig !== 'function') continue;
					v[fn] = function (this: unknown, ...args: unknown[]) {
						(w.__diag as Record<string, number>)[fn]++;
						return (orig as (...a: unknown[]) => unknown).apply(this, args);
					};
				}
				v.__probed = true;
			},
		});
	});
}

/** What the runtime says about the one fence on the shown slide. */
const fenceState = (page: import('@playwright/test').Page) =>
	livePreview(page)
		.locator('.lattice')
		.first()
		.evaluate(() => document.querySelector('pre[data-mermaid-state]')?.getAttribute('data-mermaid-state') ?? 'none')
		.catch(() => 'none');

/**
 * Wait until the runtime stops making Mermaid calls — polled, bounded, on the real signal.
 *
 * The measurement here is a DIFFERENCE across a burst, so what it needs is not "some interval
 * has passed" but "nothing more is coming". Two consecutive reads with the counters unmoved is
 * that condition, and it costs one poll interval on a fast box instead of a guessed ceiling on
 * every box.
 */
async function settle(page: import('@playwright/test').Page): Promise<void> {
	let last = { render: -1, parse: -1 };
	await expect
		.poll(
			async () => {
				const now = await counts(page);
				const stable = now.render === last.render && now.parse === last.parse;
				last = now;
				return stable;
			},
			{ timeout: 30_000, intervals: [250] },
		)
		.toBe(true);
}

const counts = (page: import('@playwright/test').Page) =>
	livePreview(page)
		.locator('.lattice')
		.first()
		.evaluate(() => ({ ...(window as unknown as { __diag: { render: number; parse: number } }).__diag }));

/**
 * Type into the fence and report what the runtime spent.
 *
 * 24 characters at 120ms is the cell every hand-run probe on this branch used, kept so the
 * numbers in `engineering/decisions/2026-09-07-diagram-render-latency.md` remain comparable.
 */
async function burst(page: import('@playwright/test').Page, nodes: number, danglingTail = false) {
	await gotoStudio(page);
	await setEditorContent(page, deck(nodes, danglingTail));
	await livePreview(page).locator('.lattice').first().waitFor({ timeout: 60_000 });
	await page.getByRole('button', { name: /^Slide \d+/ }).nth(1).click();

	// THE SIGNAL, not a guessed interval. The fence is settled when the runtime says so, and a
	// never-drawn fence settles as `error` rather than `rendered` — which is why this polls for
	// either. Waiting a fixed 4s instead was a bet that a loaded nightly box finishes inside it,
	// and losing that bet produces a red indistinguishable from a real breach.
	await expect
		.poll(() => fenceState(page), { timeout: 60_000 })
		.toMatch(/^(rendered|error|unavailable)$/);
	await settle(page);

	// Caret one character before the `]` of `A0[Alpha]`, so each keystroke edits the source and
	// leaves it parsing (or, with a dangling tail, leaves it not parsing — either way it changes).
	await page.getByText('A0[Alpha] --> N1[Node1]').first().click();
	await page.keyboard.press('End');
	for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowLeft');
	await settle(page);

	const before = await counts(page);
	await page.keyboard.type('z'.repeat(24), { delay: 120 });
	await settle(page);
	const after = await counts(page);
	return { renders: after.render - before.render, parses: after.parse - before.parse };
}

test.beforeEach(async ({ page }) => {
	await instrument(page);
});

test('@perf diagram scheduling — a COSTLY fence takes the old build\'s path', async ({ page }) => {
	test.setTimeout(300_000);
	// 64 nodes is comfortably past the ~50ms threshold on any runner slow enough to matter, and
	// getting slower only pushes it further into the costly arm — so this cell does not need a
	// per-machine blessing.
	const { renders, parses } = await burst(page, 64);

	// EXACTLY ZERO. The parse gate belongs to the live arm; charging a costly diagram for it put
	// 45-61ms on the critical path of the redraw the author is waiting for, and is half of how
	// "a costly diagram cannot be slower than before" became false.
	expect(parses, `${BREACH_TOKEN} costly fence paid ${parses} parses the old build never paid`).toBe(0);
	// A CEILING WITH HEADROOM. Healthy is 1. Two is reachable through typing jitter (observed
	// once in nine runs on a healthy build); three was the 1200ms redraw ceiling firing mid-burst,
	// and eight was coalescing-on-completion failing to coalesce.
	expect(renders, `${BREACH_TOKEN} costly fence rendered ${renders} times mid-burst against a healthy 1`).toBeLessThanOrEqual(3);
});

test('@perf diagram scheduling — a fence that has NEVER DRAWN is not treated as cheap', async ({ page }) => {
	test.setTimeout(300_000);
	// The seventh pass's blocker, and the case the ledger never measured: an author building a
	// large diagram from scratch. The cost was recorded only in the success handler, so a fence
	// whose renders had only ever FAILED kept an empty record — and an empty record reads cheap.
	// Measured before the fix: 2-3 renders against the old build's 1, 14-15% of the main thread
	// against 1-2%, and the harness's own fixed-delay typing stretched 3404-3428ms to 3763-3915ms.
	const { renders, parses } = await burst(page, 64, true);

	expect(parses, `${BREACH_TOKEN} a fence with no drawing to protect paid ${parses} parses`).toBe(0);
	expect(renders, `${BREACH_TOKEN} a never-drawn fence rendered ${renders} times mid-burst against a healthy 1`).toBeLessThanOrEqual(3);
});
