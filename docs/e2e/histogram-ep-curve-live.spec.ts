import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// ── The `histogram` and `ep-curve` charts on the REAL surfaces ─────────────────
//
// The unit tests pin the strings: every band and point carries `data-mark`, a
// histogram band's detail sublist becomes a `<template class="chart-detail">`, and
// each narrator binds its sentences to `{ mark: i }` in the kernel's order. None of
// that proves a reader can HOVER a band and get its card, or that the Guide's pointer
// lands on the band or point it is reading (HARD RULE #23). These arms drive both on
// the Playground and the Studio's Present mode, as risk-matrix-live.spec.ts does.

test.describe.configure({ timeout: 180_000 });

const SOURCE_KEY = 'lattice-docs-pg-source';

const HISTOGRAM = `---
marp: true
theme: indaco
delivery: expressive
---

<!-- _class: histogram -->

\`[{Annual loss, $1M..$250M, log}, {Share of years}]\`

## Most years stay under $10M.

- Attritional \`$1M..$10M\` \`55%\`
  - Owner: the cedent's retention
- Working \`$10M..$50M\` \`30%\`
  - Owner: the working-layer treaty
- Mid \`$50M..$100M\` \`12%\`
  - Owner: the cat program
- Tail \`$100M..$250M\` \`3%\`
  - Owner: the top layer
`;

const BANDS = ['Attritional', 'Working', 'Mid', 'Tail'];
const OWNERS = ["the cedent's retention", 'the working-layer treaty', 'the cat program', 'the top layer'];

const EP = `---
marp: true
theme: indaco
delivery: expressive
---

<!-- _class: ep-curve -->

## A 1-in-100 year costs $410M.

- \`{10, $120M}\`
- \`{50, $300M}\`
- \`{100, $410M}\`
- \`{250, $560M}\`
`;

/** The page-space point the center of `sel` inside the Playground's unscaled preview frame. */
async function markPoint(page: import('@playwright/test').Page, sel: string, k = 0) {
	return page.evaluate(([s, i]) => {
		const fe = document.querySelector('iframe') as HTMLIFrameElement;
		const fb = fe.getBoundingClientRect();
		const n = fe.contentDocument?.querySelectorAll(s as string)[i as number];
		if (!n) return null;
		const b = n.getBoundingClientRect();
		return { x: fb.x + b.x + b.width * 0.5, y: fb.y + b.y + b.height * 0.5 };
	}, [sel, k] as const);
}

/** Sweep onto `sel` (a settled hover hides the wrapper-pointer defect) and read the card. */
async function revealText(page: import('@playwright/test').Page, sel: string, k = 0) {
	const p = await markPoint(page, sel, k);
	if (!p) return null;
	await page.mouse.move(20, 20);
	await page.waitForFunction(() => !document.querySelector('[data-slot="popover-content"]'), undefined, { timeout: 10_000 });
	await page.mouse.move(p.x - 60, p.y - 60);
	await page.mouse.move(p.x, p.y, { steps: 14 });
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

test('hovering each histogram band opens that band’s card', async ({ page }) => {
	await page.addInitScript(
		([k, s]) => {
			try {
				localStorage.setItem(k as string, s as string);
			} catch {
				/* a blocked store just means the draft does not seed */
			}
		},
		[SOURCE_KEY, HISTOGRAM],
	);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	const preview = page.frameLocator('iframe').first();
	await expect(preview.locator('.histogram-svg')).toBeVisible({ timeout: 40_000 });
	// ANTI-VACUITY: four bands, each with a detail sublist, so four templates.
	await expect(preview.locator('template.chart-detail')).toHaveCount(4);
	await expect(preview.locator('rect.histogram-band')).toHaveCount(4);
	await page.waitForFunction(
		() => {
			const n = (document.querySelector('iframe') as HTMLIFrameElement)?.contentDocument?.querySelector('.histogram-svg');
			if (!n) return false;
			const w = window as unknown as { __lastBox?: string };
			const box = JSON.stringify(n.getBoundingClientRect());
			const settled = w.__lastBox === box;
			w.__lastBox = box;
			return settled;
		},
		undefined,
		{ polling: 'raf', timeout: 30_000 },
	);
	for (const [i, name] of BANDS.entries()) {
		const text = await revealText(page, `rect.histogram-band[data-mark="${i}"]`);
		expect(text, `${name} opens a card`).not.toBeNull();
		expect(text).toContain(name);
		expect(text, `${name}'s card carries its own detail`).toContain(OWNERS[i]);
		for (const other of BANDS) if (other !== name) expect(text, `${name}'s card names no other band`).not.toContain(other);
	}
	await page.screenshot({ path: test.info().outputPath('histogram-card.png') });
});

/** Play `source` in Present with the Guide on, and record every ink stroke the Guide draws. */
async function playWithGuide(page: import('@playwright/test').Page, source: string, svgSel: string, marks: number) {
	await gotoStudio(page);
	await setEditorContent(page, source);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^Guide (on|off)/ }).click();
	await expect(page.locator('.vetrina-cursor')).toHaveCount(1);
	await expect
		.poll(
			async () =>
				page.evaluate((sel) => {
					const f = document.querySelector('[role="dialog"] [aria-label="Presented slide"] iframe.live') as HTMLIFrameElement | null;
					return f?.contentDocument?.querySelectorAll(sel).length ?? 0;
				}, svgSel),
			{ timeout: 30_000 },
		)
		.toBe(marks);
	await page.evaluate(() => {
		const w = window as unknown as { __ink: { kind: string; box: DOMRect }[] };
		w.__ink = [];
		new MutationObserver((records) => {
			for (const r of records) {
				for (const n of r.addedNodes) {
					if (!(n instanceof HTMLElement)) continue;
					for (const el of [n, ...n.querySelectorAll('[data-vt-cue]')]) {
						const kind = (el as HTMLElement).dataset?.vtCue;
						if (kind) queueMicrotask(() => w.__ink.push({ kind, box: el.getBoundingClientRect() }));
					}
				}
			}
		}).observe(document.body, { childList: true, subtree: true });
	});
	await dialog.getByRole('button', { name: 'Play the presentation' }).click();
}

/**
 * THE ORACLE: the marks whose center lies inside a stroke no larger than `maxW` x
 * `maxH` page pixels. The figure-wide bracket holds every center too, so a stroke
 * counts only when it is mark-sized: the pointer on one band or point, not on the chart.
 */
function readHits(page: import('@playwright/test').Page, markSel: string, maxW: number, maxH: number) {
	return page.evaluate(
		([sel, mw, mh]) => {
			const w = window as unknown as { __ink: { kind: string; box: DOMRect }[] };
			const found = new Set<string>();
			const frame = document.querySelector('[role="dialog"] [aria-label="Presented slide"] iframe.live') as HTMLIFrameElement | null;
			const doc = frame?.contentDocument;
			if (!frame || !doc) return [];
			const fr = frame.getBoundingClientRect();
			const S = frame.offsetWidth ? fr.width / frame.offsetWidth : 1;
			for (const { box } of w.__ink) {
				if (!box.width || !box.height || box.width > (mw as number) || box.height > (mh as number)) continue;
				for (const el of doc.querySelectorAll(sel as string)) {
					const m = el.getBoundingClientRect();
					const cx = fr.left + (m.left + m.width / 2) * S;
					const cy = fr.top + (m.top + m.height / 2) * S;
					if (cx > box.left && cx < box.right && cy > box.top && cy < box.bottom) found.add((el as SVGElement).dataset.mark ?? '');
				}
			}
			return [...found].sort();
		},
		[markSel, maxW, maxH] as const,
	);
}

test('the Guide’s ink lands on each histogram band as it reads it', async ({ page }) => {
	await playWithGuide(page, HISTOGRAM, '.histogram-svg rect.histogram-band', 4);
	// A band-sized stroke: no wider than half the plot, which the figure bracket is not.
	const hits = () => readHits(page, 'rect.histogram-band', 420, 420);
	// Bands are read in axis order, so once the last is inked every one before it was too.
	await expect.poll(hits, { timeout: 90_000, intervals: [150] }).toContain('3');
	await page.screenshot({ path: test.info().outputPath('histogram-guide.png') });
	expect(await hits(), 'the Guide inks each band as it reads it').toEqual(['0', '1', '2', '3']);
});

test('the Guide’s ink lands on each EP point as it reads it', async ({ page }) => {
	await playWithGuide(page, EP, '.ep-curve-svg circle.ep-dot', 4);
	// A point-sized stroke: a dot is a few pixels, so a stroke round one is small.
	const hits = () => readHits(page, 'circle.ep-dot', 120, 120);
	await expect.poll(hits, { timeout: 90_000, intervals: [150] }).toContain('3');
	await page.screenshot({ path: test.info().outputPath('ep-curve-guide.png') });
	expect(await hits(), 'the Guide inks each point as it reads it').toEqual(['0', '1', '2', '3']);
});
