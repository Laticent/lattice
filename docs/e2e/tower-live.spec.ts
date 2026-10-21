import { expect, gotoStudio, setEditorContent, test } from './studio-fixture';

// ── The `tower` chart on the REAL surfaces (#2714) ──────────────────────────────
//
// The kernel's unit tests pin the strings: every share carries `data-mark="<layer>"`,
// each layer has a `<template class="chart-detail">`, and the narrator binds its
// sentences to `{ mark: i }` in the kernel's order. None of that proves a reader can
// HOVER a layer and get its card, or that the Guide's pointer lands on the band it is
// talking about (HARD RULE #23). These two arms drive both, on the Playground and the
// Studio's Present mode, the surfaces a broker's audience actually sees.

test.describe.configure({ timeout: 180_000 });

const SOURCE_KEY = 'lattice-docs-pg-source';

const TOWER = `---
marp: true
theme: indaco
delivery: expressive
---

<!-- _class: tower -->

\`Property catastrophe program · 2027\`

## Three reinsurers carry $310M above a $50M retention.

- Layer 3 \`$200M xs $160M\`
  - Acme Re \`30%\`
  - Globex Re \`25%\`
- Layer 2 \`$70M xs $90M\`
  - Acme Re \`40%\`
  - Vantage Re \`60%\`
- Layer 1 \`$40M xs $50M\`
  - Globex Re \`60%\`
  - Acme Re \`40%\`
- Retention \`$50M\`
`;

/** The page-space point a quarter into `sel` inside the Playground's unscaled preview frame. */
async function markPoint(page: import('@playwright/test').Page, sel: string, k = 0) {
	return page.evaluate(([s, i]) => {
		const fe = document.querySelector('iframe') as HTMLIFrameElement;
		const fb = fe.getBoundingClientRect();
		const n = fe.contentDocument?.querySelectorAll(s as string)[i as number];
		if (!n) return null;
		const b = n.getBoundingClientRect();
		return { x: fb.x + b.x + b.width * 0.25, y: fb.y + b.y + b.height * 0.3 };
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

test('hovering any share of a layer opens that layer’s card with its placement', async ({ page }) => {
	await page.addInitScript(
		([k, s]) => {
			try {
				localStorage.setItem(k as string, s as string);
			} catch {
				/* a blocked store just means the draft does not seed */
			}
		},
		[SOURCE_KEY, TOWER],
	);
	await page.goto('/playground/?view=edit', { waitUntil: 'domcontentloaded' });
	const preview = page.frameLocator('iframe').first();
	await expect(preview.locator('.tower-svg')).toBeVisible({ timeout: 40_000 });
	// ANTI-VACUITY: three placed layers, three templates; a tower that failed to parse
	// would otherwise pass every "no card" check below by default.
	await expect(preview.locator('template.chart-detail')).toHaveCount(3);
	// The chart re-fits after its first paint: wait for its box to hold across two frames
	// before aiming at a share (the reveal spec's settle; `markPoint` re-measures anyway).
	await page.waitForFunction(
		() => {
			const n = (document.querySelector('iframe') as HTMLIFrameElement)?.contentDocument?.querySelector('.tower-svg');
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

	// Layer index in the kernel's order: 0 = Retention, 1 = Layer 1, … 3 = Layer 3.
	const cards: Record<string, string | null> = {};
	for (const [i, label] of [[1, 'Layer 1'], [2, 'Layer 2'], [3, 'Layer 3']] as const) {
		const shares = await preview.locator(`rect.tower-share[data-mark="${i}"]`).count();
		expect(shares, `${label} draws its shares`).toBeGreaterThan(1);
		for (let k = 0; k < shares; k++) {
			const text = await revealText(page, `rect.tower-share[data-mark="${i}"]`, k);
			cards[`${label}#${k}`] = text;
		}
	}
	for (const [key, text] of Object.entries(cards)) expect(text, `${key} opens a card`).not.toBeNull();
	expect(cards['Layer 3#0']).toContain('Layer 3');
	expect(cards['Layer 3#0']).toMatch(/Acme Re 30%/);
	expect(cards['Layer 3#0']).toMatch(/Open 45%/);
	expect(cards['Layer 1#0']).toMatch(/Globex Re 60%/);
	await page.screenshot({ path: test.info().outputPath('tower-card.png') });
});

test('the Guide’s ink lands on the tower’s layers as it reads them', async ({ page }) => {
	await gotoStudio(page);
	await setEditorContent(page, TOWER);
	await page.getByRole('button', { name: 'Present', exact: true }).click();
	const dialog = page.getByRole('dialog', { name: 'Present' });
	await expect(dialog).toBeVisible();
	await dialog.getByRole('button', { name: /^Guide (on|off)/ }).click();
	await expect(page.locator('.vetrina-cursor')).toHaveCount(1);
	await expect
		.poll(
			async () =>
				page.evaluate(() => {
					const f = document.querySelector('[role="dialog"] [aria-label="Presented slide"] iframe.live') as HTMLIFrameElement | null;
					return f?.contentDocument?.querySelectorAll('.tower-svg [data-mark]').length ?? 0;
				}),
			{ timeout: 30_000 },
		)
		.toBeGreaterThan(0);

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

	// THE ORACLE: a layer-sized stroke lands on a placed layer's band (data-mark 1..3). Read
	// from Node in short rounds, so the screenshot is taken the moment one has landed.
	const readHits = () =>
		page.evaluate(() => {
			const w = window as unknown as { __ink: { kind: string; box: DOMRect }[] };
			const found = new Set<string>();
			const overlaps = (a: DOMRect, b: { l: number; t: number; r: number; b: number }) => a.left < b.r && a.right > b.l && a.top < b.b && a.bottom > b.t;
			const frame = document.querySelector('[role="dialog"] [aria-label="Presented slide"] iframe.live') as HTMLIFrameElement | null;
			const doc = frame?.contentDocument;
			if (!frame || !doc) return [];
			const fr = frame.getBoundingClientRect();
			const S = frame.offsetWidth ? fr.width / frame.offsetWidth : 1;
			const out = (r: DOMRect) => ({ l: fr.left + r.left * S, t: fr.top + r.top * S, r: fr.left + (r.left + r.width) * S, b: fr.top + (r.top + r.height) * S });
			for (const { box } of w.__ink) {
				if (!box.width || !box.height) continue;
				for (const mark of ['1', '2', '3']) {
					for (const el of doc.querySelectorAll(`rect.tower-share[data-mark="${mark}"]`)) {
						const band = out(el.getBoundingClientRect());
						// A stroke ON one layer, not the figure-wide frame bracket: the bracket
						// overlaps every band, so counting it would pass with the pointer never
						// once on a layer. No taller than two bands is a layer-sized stroke.
						// Its CENTER inside the band: a stroke round the band below touches this
						// band's edge, and an edge overlap counted the retention's outline as Layer 1.
						const cy = box.top + box.height / 2;
						if (overlaps(box, band) && cy > band.t && cy < band.b && box.height <= (band.b - band.t) * 2.2) found.add(mark);
					}
				}
			}
			return [...found].sort();
		});
	// Polled, not slept: the top layer is the narration's last, so once it is inked the
	// screenshot shows the pointer on a layer, and the full set must then have landed.
	await expect.poll(readHits, { timeout: 90_000, intervals: [150] }).toContain('3');
	await page.screenshot({ path: test.info().outputPath('tower-guide-layer.png') });
	const hits = await readHits();
	await page.screenshot({ path: test.info().outputPath('tower-guide.png') });
	expect(hits, 'the Guide inks each placed layer as it reads it').toEqual(['1', '2', '3']);
});
