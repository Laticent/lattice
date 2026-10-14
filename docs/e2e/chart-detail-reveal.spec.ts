import { expect, test } from './studio-fixture';

// ── The chart mark-detail reveal, on the REAL Playground ────────────────────────
//
// Fourteen charts share one reveal path — an inert `<template class="chart-detail">`
// per mark, read by the parent-hosted layer in `docs/src/playground/chart-interact.js`
// and rendered by `docs/src/components/chart-detail-layer.tsx`. Until this file, NO
// test drove it on a browser: the tier was `chart-detail-layer.test.tsx` (jsdom, which
// has no hit-testing and no stacking) plus per-chart transform tests (strings, no
// pointer at all). Per HARD RULE #23 that left "hover a mark and the detail appears"
// resting entirely on a stand-in — and it was wrong in two independent ways at once,
// both found by driving this surface and neither visible to any existing gate:
//
//  1. THE CARD CAME UP EMPTY. `reveal()` builds the card from
//     `tpl.content.querySelectorAll('li')`. A template holding bare text yields none,
//     so body and meta come back empty and the layer falls back to `lean` — the
//     compact value-only tooltip a mark with NO authored detail gets. The heatmap's
//     per-cell annotation went in as bare text, so it read correctly in the PDF (the
//     speaker-note path has its own bare-text fallback) and silently vanished on every
//     live surface.
//  2. THE CARD SHUT ITSELF — BUT ONLY UNDER A MOVING POINTER. Radix renders
//     `PopoverContent` inside its own `[data-radix-popper-content-wrapper]`, which
//     keeps `pointer-events:auto` even though the content is `none`. The card opens
//     12.13px below the cursor (measured; it is `sideOffset={12}`), so a pointer that
//     arrives and STOPS is never inside the wrapper and the card stays open. What
//     fails is a sweep: the reveal fires mid-gesture, the wrapper is placed at that
//     earlier point, and the continuing motion carries the cursor into it — the
//     iframe gets `pointerleave` and the layer dismisses. Sweeping onto each mark,
//     7 of 9 heatmap cells closed the instant they opened.
//
//     THIS IS WHY THE HELPER BELOW SWEEPS. A single settled hover passes even with
//     the defect present, so a spec that moved straight to each mark and waited would
//     be green against the bug.
//
//     MUTATION PROOF, and its one soft edge: reverting the CSS rule at source turns
//     all three arms below red (three runs of three; arm 1 reports seven `NO CARD` of
//     nine). An independent run that left the rule in place and injected an
//     `!important` counter-rule at runtime saw the third arm survive. Arms 1 and 3 are
//     therefore the dependable proof of the CSS rule; arm 2's own durable subject is
//     the lift guard, which it asserts directly.
//
// Both are properties of the SHARED layer, so the funnel arm below is not decoration:
// it is the check that fixing the grid did not narrow the path the other members use.
// The funnel fails under mutation too — this was never a small-mark bug.

const SOURCE_KEY = 'lattice-docs-pg-source';

const HEATMAP = `---
marp: true
theme: indaco
---

<!-- _class: heatmap scale -->

\`Retention · 2026 cohorts\`

## A cell can carry its own explanation.

|  | M0 | M1 | M2 |
| --- | --: | --: | --: |
| Jan 2026 | 100 | 62 \`note="Onboarding changed mid-month; the dip is the change, not the cohort."\` | 48 |
| Feb 2026 | 100 | 58 | 44 |
| Mar 2026 | 100 | 71 \`note=First cohort on the new activation flow.\` | 59 |
`;

const FUNNEL = `---
marp: true
theme: indaco
---

<!-- _class: funnel -->

## The funnel narrows; the width is the story.

- Visitors \`12,000\`
  - Two-thirds arrive from inbound, not outbound
- Signups \`4,800\`
- Activated \`2,160\`
- Paid \`864\`
`;

async function openPlayground(page: import('@playwright/test').Page, deck: string, chartSel: string, view = 'edit') {
	await page.addInitScript(
		([k, s]) => {
			try {
				localStorage.setItem(k as string, s as string);
			} catch {
				/* a blocked store just means the draft does not seed */
			}
		},
		[SOURCE_KEY, deck],
	);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	// Narrow widths show ONE pane, the editor; Explore (the eye button) shows the draft's slides,
	// the way a tablet or phone user gets to them.
	if (view === 'read') await page.locator('button[data-pg-mode="read"]').click();
	const preview = page.frameLocator('iframe').first();
	await expect(preview.locator(chartSel)).toBeVisible({ timeout: 40_000 });
	// The chart re-fits after its first paint, so hovering the first painted box aims at
	// a rectangle that is about to move. This waits for the box to hold across two
	// consecutive animation frames — which is a WEAK settle, not a strong one: two
	// identical frames occur long before the preview's later re-fits, so this gate
	// clears almost immediately. It is deliberately the cheap half. The guarantee that
	// actually matters comes from `markPoint()` re-measuring the mark fresh inside
	// every `revealText()` call, so a late re-fit moves the target before it is read,
	// not after.
	await page.waitForFunction(
		(s) => {
			const d = (document.querySelector('iframe') as HTMLIFrameElement)?.contentDocument;
			const n = d?.querySelector(s);
			if (!n) return false;
			const w = window as unknown as { __lastBox?: string };
			const box = JSON.stringify(n.getBoundingClientRect());
			const settled = w.__lastBox === box;
			w.__lastBox = box;
			return settled;
		},
		chartSel,
		{ polling: 'raf', timeout: 30_000 },
	);
}

/**
 * The page-space quarter-point of one mark.
 *
 * NOTE THE MISSING SCALE FACTOR, and do not copy this helper to the Studio. The
 * Playground's `#preview` carries no `transform` (the fit agent scales the `.lattice`
 * sections INSIDE the srcdoc), so the frame's own scale is 1 and frame coordinates add
 * straight onto its page offset. The Studio's preview iframe IS transform-scaled
 * (~0.6 desktop, ~0.28 mobile — see chart-detail-layer.tsx), and there this would aim
 * at the wrong pixel; `chart-interact.js` divides by `g.S` for exactly that reason.
 */
async function markPoint(page: import('@playwright/test').Page, sel: string) {
	return page.evaluate((s) => {
		const fe = document.querySelector('iframe') as HTMLIFrameElement;
		const fb = fe.getBoundingClientRect();
		const n = fe.contentDocument?.querySelector(s);
		if (!n) return null;
		const b = n.getBoundingClientRect();
		return { x: fb.x + b.x + b.width * 0.25, y: fb.y + b.y + b.height * 0.3 };
	}, sel);
}

/** Hover `sel` and return the card's text once it has been PLACED — or null. */
async function revealText(page: import('@playwright/test').Page, sel: string) {
	const p = await markPoint(page, sel);
	if (!p) return null;
	// Park off the chart and wait for the previous card to be GONE — hovering the next
	// mark while one is still open is the sweep that exposed the wrapper defect, but it
	// makes the assertion below ambiguous about which card it read.
	await page.mouse.move(20, 20);
	await page.waitForFunction(() => !document.querySelector('[data-slot="popover-content"]'), undefined, {
		timeout: 10_000,
	});
	await page.mouse.move(p.x - 60, p.y - 60);
	await page.mouse.move(p.x, p.y, { steps: 14 });
	// The card has to be both PLACED and POPULATED: Radix parks it at -9999 until it has
	// measured, so reading it on sight returns an empty string and looks like a miss.
	const placed = await page
		.waitForFunction(
			() => {
				const n = document.querySelector('[data-slot="popover-content"]') as HTMLElement | null;
				return !!(n && n.getBoundingClientRect().x > 0 && n.innerText.trim());
			},
			undefined,
			{ timeout: 5_000 },
		)
		.catch(() => null);
	if (!placed) return null;
	// The card's text INCLUDING its shadow roots: the body and meta are drawn inside one so the
	// deck's own CSS styles them (chart-detail-layer.tsx `DeckHtml`), and `innerText` stops at a
	// shadow boundary.
	return page.evaluate(() => {
		const text = (n: Node): string => {
			if (n.nodeType === Node.TEXT_NODE) return n.textContent ?? '';
			const el = n as Element;
			const kids = [...(el.shadowRoot ? el.shadowRoot.childNodes : []), ...el.childNodes];
			const inner = kids.map(text).join('');
			return /^(DIV|P|LI|SECTION|UL|OL)$/.test(el.tagName ?? '') ? `\n${inner}\n` : inner;
		};
		return text(document.querySelector('[data-slot="popover-content"]') as HTMLElement)
			.replace(/[ \t]+/g, ' ')
			.split(/\n+/)
			.map((l) => l.trim())
			.filter(Boolean)
			.join(' | ');
	});
}

test('every heatmap cell holds its reveal, and an annotated one carries its prose', async ({ page }) => {
	await openPlayground(page, HEATMAP, '.heatmap-svg');

	// ANTI-VACUITY: the two annotations reached the frame as templates. Without this,
	// a heatmap that failed to parse would pass every "no card" assertion by default.
	await expect(page.frameLocator('#preview').locator('template.chart-detail')).toHaveCount(2);

	// All NINE crossings, not just the annotated pair. The wrapper-pointer defect was
	// invisible on a single-cell check: the cells that failed were the ones a sweep
	// reached with a card already open, which is what an author's pointer does.
	const seen: string[] = [];
	for (let i = 0; i < 9; i++) seen.push((await revealText(page, `rect[data-mark="${i}"]`)) ?? 'NO CARD');
	expect(seen.filter((t) => t === 'NO CARD')).toEqual([]);

	// The annotated cell gets the FULL card — label, value and the authored body.
	expect(seen[1]).toContain('Jan 2026 · M1');
	expect(seen[1]).toContain('62');
	expect(seen[1]).toContain('Onboarding changed mid-month');
	expect(seen[7]).toContain('First cohort on the new activation flow.');

	// A crossing nobody annotated gets the LEAN readout — value on hover, no card body.
	// The two depths are the family's contract (2026-06-21-chart-reveal-lean-tooltip):
	// if the plain cells ALSO read as full cards, the distinction has collapsed.
	expect(seen[4]).toContain('Feb 2026 · M1');
	expect(seen[4]).not.toContain('Onboarding');
	expect(seen[4]!.length).toBeLessThan(seen[1]!.length);
});

test('the open tile stays in its own row and column', async ({ page }) => {
	// A matrix reads by POSITION, so the reveal's centroid→hub nudge and its
	// `rotateX(7deg)` are both off for it — the same refusal the gantt makes for its
	// time axis. The emphasis is the dim plus `.chart-mark-active`, neither of which
	// moves anything. Asserted as "no inline transform", which is what the lift writes.
	await openPlayground(page, HEATMAP, '.heatmap-svg');
	expect(await revealText(page, 'rect[data-mark="1"]')).toContain('Onboarding');
	const moved = await page.evaluate(() => {
		const d = (document.querySelector('iframe') as HTMLIFrameElement).contentDocument!;
		const svg = d.querySelector('.heatmap-svg') as SVGElement;
		const cells = [...d.querySelectorAll('rect.heatmap-cell[data-mark]')] as SVGElement[];
		return { chart: svg.style.transform, tiles: cells.map((c) => c.style.transform).filter(Boolean) };
	});
	expect(moved.chart).toBe('');
	expect(moved.tiles).toEqual([]);
});

test('the shared reveal still works for a chart that authors its detail as a sublist', async ({ page }) => {
	// The control. Both fixes above live in the layer every chart shares, so this is
	// the arm that would catch one of them narrowing the path for the other thirteen.
	await openPlayground(page, FUNNEL, 'svg:not(.latt-a11y-defs)');
	const first = await revealText(page, '[data-mark="0"]');
	expect(first).toContain('Visitors');
	expect(first).toContain('Two-thirds arrive from inbound');
	expect(await revealText(page, '[data-mark="3"]')).toContain('Paid');
});

// ── A row's `>` description: rich, and drawn with the deck's own CSS ─────────────
//
// The owner's slide from #2690's preview test. An indented `>` under a bar row used to drop
// the row (the reader missed its value); it is now the row's description, the first detail
// entry, and it keeps its Markdown. The popover draws it inside a shadow root that adopts the
// frame's stylesheets and the slide's custom properties (chart-detail-layer.tsx `DeckHtml`), so
// a pill and a spark look as they do on the slide. At 1440, 820 and 390, with a shot of each.
const BAR_DESC = `---
marp: true
theme: indaco
---

<!-- _class: bar -->

## The European spelling draws the same bars.

- Germany \`1.234,5\`
  > Hi **bold** \`{LIVE, tag}\` \`~{1 3 2 5}\`
  > - we
  > - us
- France \`987,6\`
- Italy \`2.345,8\`
`;

test('a bar row\'s `>` description reveals as a rich card, drawn with the deck\'s CSS', async ({ page }, testInfo) => {
	// 1440: the two-pane editor. 820 and 390: Explore (`view=read`), the full-pane deck a tablet or
	// a phone shows, because the editor at those widths is one pane and the preview sits behind it.
	for (const [width, view] of [[1440, 'edit'], [820, 'read'], [390, 'read']] as const) {
		await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
		await openPlayground(page, BAR_DESC, 'svg:not(.latt-a11y-defs)', view);
		// ANTI-VACUITY: Germany's bar exists. Before the fix the quote dropped it.
		const bars = await page.evaluate(
			() =>
				(document.querySelector('iframe') as HTMLIFrameElement).contentDocument!.querySelectorAll(
					'[data-mark]:not(template)',
				).length,
		);
		expect(bars, `bars at ${width}`).toBe(3);
		const text = await revealText(page, '[data-mark="0"]');
		expect(text, `card at ${width}`).toContain('Germany');
		const card = await page.evaluate(() => {
			const hosts = [...document.querySelectorAll('[data-slot="popover-content"] div')].filter((d) => d.shadowRoot);
			const root = hosts[0]?.shadowRoot;
			if (!root) return null;
			const pill = root.querySelector('.lat-pill') as HTMLElement | null;
			const path = root.querySelector('.lat-spark path') as SVGElement | null;
			const spark = root.querySelector('.lat-spark svg') as SVGElement | null;
			const ps = pill ? getComputedStyle(pill) : null;
			return {
				text: root.textContent?.replace(/\s+/g, ' ').trim(),
				pillPainted: !!ps && ps.display === 'inline-block' && ps.borderTopStyle !== 'none',
				sparkStroked: !!path && getComputedStyle(path).fill === 'none',
				sparkW: spark ? spark.getBoundingClientRect().width : 0,
				items: root.querySelectorAll('li').length,
				sheets: root.adoptedStyleSheets.length,
			};
		});
		expect(card, `shadow root at ${width}`).not.toBeNull();
		expect(card!.sheets).toBe(1);
		expect(card!.text).toContain('Hi bold LIVE');
		expect(card!.items).toBe(2);
		expect(card!.pillPainted, `the pill takes the deck's styling at ${width}`).toBe(true);
		expect(card!.sparkStroked, `the spark is a stroked line, not a filled blob, at ${width}`).toBe(true);
		expect(card!.sparkW, 'the spark draws at a real size').toBeGreaterThan(8);
		await page.screenshot({ path: testInfo.outputPath(`bar-desc-${width}.png`) });
	}
});

// The red team's overlay: a description's inline style tried to paint a 9000px fixed link over
// the app. The card strips author `style`, and its light-DOM wrapper has paint containment that
// the adopted deck CSS cannot reach, so nothing in the card paints or takes a click outside it.
const BAR_OVERLAY = `---
theme: indaco
---

<!-- _class: bar -->

## A description cannot cover the page.

- Germany \`12\`
  > <a href="https://example.invalid" style="position:fixed;left:-3000px;top:-3000px;width:9000px;height:9000px;z-index:2147483647;background:red">Session expired</a>
- France \`9\`
`;

test('a description\'s inline style stays inside the card', async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await openPlayground(page, BAR_OVERLAY, 'svg:not(.latt-a11y-defs)', 'edit');
	const text = await revealText(page, '[data-mark="0"]');
	expect(text).toContain('Session expired');
	const probe = await page.evaluate(() => {
		const content = document.querySelector('[data-slot="popover-content"]') as HTMLElement;
		const host = [...content.querySelectorAll('div')].find((d) => d.shadowRoot)!;
		const link = host.shadowRoot!.querySelector('a') as HTMLElement;
		const box = content.getBoundingClientRect();
		// A point well outside the card: before the fix it hit the overlay.
		const far = document.elementFromPoint(5, 5);
		return {
			styled: link.hasAttribute('style'),
			position: getComputedStyle(link).position,
			farInCard: !!far && (content.contains(far) || far === host),
			cardW: box.width,
		};
	});
	expect(probe.styled, 'the author style is stripped').toBe(false);
	expect(probe.position).not.toBe('fixed');
	expect(probe.farInCard, 'nothing in the card covers the page').toBe(false);
	expect(probe.cardW).toBeLessThan(800);
});
